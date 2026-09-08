import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../ConvexClientProvider";
import {
  HaylouRT3Client,
  isWebBluetoothSupported,
  type AppCategory,
  type RT3Sample,
  type RT3Telemetry,
} from "../lib/haylou-bluetooth/HaylouRT3Client";
import { EMPTY_READING, type VitalsReading } from "./useVitals";

export type WatchPhase = "idle" | "scanning" | "connecting" | "connected" | "error";

export interface WatchStatus {
  supported: boolean;
  phase: WatchPhase;
  deviceName: string | null;
  battery: number | null;
  bpm: number | null;
  /** força do sinal BLE (dBm) — null quando indisponível */
  rssi: number | null;
  error: string | null;
}

export interface SendNotificationOptions {
  vibrate?: boolean;
  category?: AppCategory;
  title?: string;
}

export interface WatchController {
  status: WatchStatus;
  /** Última leitura REAL do relógio (nulls enquanto desconectado). */
  reading: VitalsReading;
  /** Histórico de BPM real para o sparkline (janela deslizante). */
  history: number[];
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Envia notificação universal (categoria + título + texto) via BLE e registra no Convex. */
  sendNotification: (text: string, options?: SendNotificationOptions) => Promise<boolean>;
}

const INITIAL: WatchStatus = {
  supported: false,
  phase: "idle",
  deviceName: null,
  battery: null,
  bpm: null,
  rssi: null,
  error: null,
};

const DEVICE_ID = "haylou-rt3-ls16";
const PERSIST_EVERY_MS = 2000;
const HISTORY_LEN = 96;
/** Limiar de emergência real (BPM em repouso) que autoriza a IA a agir sozinha. */
export const EMERGENCY_BPM = 150;

/**
 * Gerencia o ciclo de vida da conexão Web Bluetooth com o HAYLOU RT3 (LS16)
 * e liga a telemetria ao Convex. NENHUM dado é gerado aqui: a biometria
 * exibida no dashboard e persistida no banco vem somente dos pacotes reais
 * transmitidos pelo relógio via BLE (Heart Rate 0x180D, Battery 0x180F,
 * Blood Pressure 0x1810 e demais características notificáveis).
 */
export function useBluetoothWatch(): WatchController {
  const insertBiometric = useMutation(api.biometrics.insert);
  const updateBattery = useMutation(api.devices.updateBattery);
  const insertNotification = useMutation(api.notifications.insert);

  const [status, setStatus] = useState<WatchStatus>(() => ({
    ...INITIAL,
    supported: isWebBluetoothSupported(),
  }));
  const [reading, setReading] = useState<VitalsReading>(EMPTY_READING);
  const [history, setHistory] = useState<number[]>([]);

  // handlers atuais — as callbacks do cliente BLE sempre despacham pelo ref,
  // evitando closures velhas e duplicação de cliente em re-renders.
  const handlersRef = useRef({
    onSample: (_s: RT3Sample) => {},
    onTelemetry: (_t: RT3Telemetry) => {},
    onBattery: (_level: number) => {},
    onRssi: (_rssi: number) => {},
    onDisconnected: () => {},
  });

  const lastPersistRef = useRef(0);
  const clientRef = useRef<HaylouRT3Client | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new HaylouRT3Client({
      onSample: (s) => handlersRef.current.onSample(s),
      onTelemetry: (t) => handlersRef.current.onTelemetry(t),
      onBattery: (l) => handlersRef.current.onBattery(l),
      onRssi: (r) => handlersRef.current.onRssi(r),
      onDisconnected: () => handlersRef.current.onDisconnected(),
      onError: (m) => setStatus((prev) => ({ ...prev, error: m })),
    });
  }

  /** Persiste a leitura atual no Convex respeitando o throttle anti-redundância. */
  const persist = useCallback(
    (fields: {
      bpm: number;
      spo2?: number;
      stress?: number;
      steps?: number;
      distanceMeters?: number;
      calories?: number;
      cadence?: number;
      sleepPhase?: string;
      sportMode?: string;
      systolic?: number;
      diastolic?: number;
      rssi?: number;
      battery?: number;
      ts: number;
    }) => {
      const now = Date.now();
      if (now - lastPersistRef.current < PERSIST_EVERY_MS) return;
      lastPersistRef.current = now;
      void insertBiometric({
        deviceId: DEVICE_ID,
        bpm: fields.bpm,
        spo2: fields.spo2,
        stress: fields.stress,
        steps: fields.steps,
        distanceMeters: fields.distanceMeters,
        calories: fields.calories,
        cadence: fields.cadence,
        sleepPhase: fields.sleepPhase,
        sportMode: fields.sportMode,
        systolic: fields.systolic,
        diastolic: fields.diastolic,
        rssi: fields.rssi,
        battery: fields.battery,
        timestamp: fields.ts,
      }).catch(() => {});
    },
    [insertBiometric],
  );

  handlersRef.current.onSample = (sample: RT3Sample) => {
    setStatus((prev) => ({
      ...prev,
      phase: "connected",
      bpm: sample.bpm,
      battery: sample.battery ?? prev.battery,
      error: null,
    }));
    // atualiza o painel apenas com a leitura real do pacote BLE
    setReading({
      bpm: sample.bpm,
      spo2: sample.spo2 ?? null,
      stress: sample.stress ?? null,
      steps: sample.steps ?? null,
      calories: sample.calories ?? null,
      anomaly: sample.bpm >= EMERGENCY_BPM,
      ts: sample.ts,
    });
    setHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), sample.bpm]);
    persist({ ...sample, bpm: sample.bpm });
  };

  // telemetria de sensores que não são HR (BP, SpO2/estresse/sono/passos
  // decodificados pelo parser do firmware) — mescla na leitura e persiste
  handlersRef.current.onTelemetry = (t: RT3Telemetry) => {
    setReading((prev) => ({
      ...prev,
      spo2: t.spo2 ?? prev.spo2,
      stress: t.stress ?? prev.stress,
      steps: t.steps ?? prev.steps,
      calories: t.calories ?? prev.calories,
      ts: t.ts,
    }));
    const battery = t.battery;
    if (battery != null) {
      setStatus((prev) => ({ ...prev, battery }));
    }
    const rssi = t.rssi;
    if (rssi != null) {
      setStatus((prev) => ({ ...prev, rssi }));
    }
    const current = reading;
    const bpm = current.bpm;
    if (bpm == null) return; // sem batimento recente não há leitura completa para persistir
    persist({
      bpm,
      spo2: t.spo2,
      stress: t.stress,
      steps: t.steps,
      distanceMeters: t.distanceMeters,
      calories: t.calories,
      cadence: t.cadence,
      sleepPhase: t.sleepPhase,
      sportMode: t.sportMode,
      systolic: t.bloodPressure?.systolic,
      diastolic: t.bloodPressure?.diastolic,
      rssi: t.rssi,
      battery: t.battery,
      ts: t.ts,
    });
  };

  handlersRef.current.onBattery = (level: number) => {
    setStatus((prev) => ({ ...prev, battery: level }));
    void updateBattery({ battery: level }).catch(() => {});
  };

  handlersRef.current.onRssi = (rssi: number) => {
    setStatus((prev) => ({ ...prev, rssi }));
  };

  handlersRef.current.onDisconnected = () => {
    setStatus((prev) => ({
      ...prev,
      phase: "idle",
      bpm: null,
      battery: null,
      rssi: null,
      error: "Conexão BLE perdida — o relógio desconectou.",
    }));
    // sem dados reais: zera o painel (nenhuma medição é exibida ou gravada)
    setReading(EMPTY_READING);
    setHistory([]);
  };

  const connect = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    if (client.isConnected) return;
    setStatus((prev) => ({ ...prev, phase: "scanning", error: null }));
    try {
      await client.connect();
      setStatus((prev) => ({
        ...prev,
        phase: "connected",
        deviceName: client.deviceName,
        error: null,
      }));
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "Falha ao conectar com o relógio",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setStatus((prev) => ({
      ...prev,
      phase: "idle",
      bpm: null,
      battery: null,
      rssi: null,
      error: null,
    }));
    setReading(EMPTY_READING);
    setHistory([]);
  }, []);

  const sendNotification = useCallback(
    async (text: string, options?: SendNotificationOptions): Promise<boolean> => {
      const client = clientRef.current;
      const category: AppCategory = options?.category ?? "ai";
      const vibrate = options?.vibrate ?? true;
      let ok = false;
      if (client?.isConnected) {
        try {
          await client.sendNotification({
            category,
            title: options?.title,
            text,
            vibrationMs: vibrate ? undefined : [],
          });
          ok = true;
        } catch {
          ok = false;
        }
      }
      void insertNotification({
        deviceId: DEVICE_ID,
        category,
        title: options?.title,
        message: text,
        status: ok ? "sent" : "failed",
        vibrationPattern: vibrate ? "categoria" : "nenhum",
      }).catch(() => {});
      return ok;
    },
    [insertNotification],
  );

  // encerra a conexão BLE ao desmontar o app
  useEffect(() => {
    return () => clientRef.current?.disconnect();
  }, []);

  return { status, reading, history, connect, disconnect, sendNotification };
}
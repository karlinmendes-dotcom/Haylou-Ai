import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../ConvexClientProvider";
import {
  HaylouRT3Client,
  isWebBluetoothSupported,
  type RT3Sample,
} from "../lib/haylou-bluetooth/HaylouRT3Client";
import { EMPTY_READING, type VitalsReading } from "./useVitals";

export type WatchPhase = "idle" | "scanning" | "connecting" | "connected" | "error";

export interface WatchStatus {
  supported: boolean;
  phase: WatchPhase;
  deviceName: string | null;
  battery: number | null;
  bpm: number | null;
  error: string | null;
}

export interface WatchController {
  status: WatchStatus;
  /** Última leitura REAL do relógio (nulls enquanto desconectado). */
  reading: VitalsReading;
  /** Histórico de BPM real para o sparkline (janela deslizante). */
  history: number[];
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Envia notificação para a tela AMOLED via BLE e registra no Convex. */
  sendNotification: (text: string, vibrate?: boolean) => Promise<boolean>;
}

const INITIAL: WatchStatus = {
  supported: false,
  phase: "idle",
  deviceName: null,
  battery: null,
  bpm: null,
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
 * transmitidos pelo relógio via BLE (Heart Rate Service 0x180D).
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
    onBattery: (_level: number) => {},
    onDisconnected: () => {},
  });

  const lastPersistRef = useRef(0);
  const clientRef = useRef<HaylouRT3Client | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new HaylouRT3Client({
      onSample: (s) => handlersRef.current.onSample(s),
      onBattery: (l) => handlersRef.current.onBattery(l),
      onDisconnected: () => handlersRef.current.onDisconnected(),
      onError: (m) => setStatus((prev) => ({ ...prev, error: m })),
    });
  }

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
      steps: null, // pedômetro não é lido neste serviço GATT
      calories: null,
      anomaly: sample.bpm >= EMERGENCY_BPM,
      ts: sample.ts,
    });
    setHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), sample.bpm]);

    const now = Date.now();
    if (now - lastPersistRef.current < PERSIST_EVERY_MS) return;
    lastPersistRef.current = now;
    void insertBiometric({
      deviceId: DEVICE_ID,
      bpm: sample.bpm,
      spo2: sample.spo2,
      battery: sample.battery,
      timestamp: sample.ts,
    }).catch(() => {});
  };

  handlersRef.current.onBattery = (level: number) => {
    setStatus((prev) => ({ ...prev, battery: level }));
    void updateBattery({ battery: level }).catch(() => {});
  };

  handlersRef.current.onDisconnected = () => {
    setStatus((prev) => ({
      ...prev,
      phase: "idle",
      bpm: null,
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
    setStatus((prev) => ({ ...prev, phase: "idle", bpm: null, battery: null, error: null }));
    setReading(EMPTY_READING);
    setHistory([]);
  }, []);

  const sendNotification = useCallback(
    async (text: string, vibrate = true): Promise<boolean> => {
      const client = clientRef.current;
      let ok = false;
      if (client?.isConnected) {
        try {
          await client.sendNotification(text, vibrate ? [200, 100, 200] : []);
          ok = true;
        } catch {
          ok = false;
        }
      }
      const pattern = vibrate ? "200-100-200" : "nenhum";
      void insertNotification({
        deviceId: DEVICE_ID,
        message: text,
        status: ok ? "sent" : "failed",
        vibrationPattern: pattern,
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
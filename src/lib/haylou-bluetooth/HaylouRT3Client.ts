/**
 * Cliente Web Bluetooth para o smartwatch HAYLOU Solar Plus RT3 (LS16).
 *
 * Usa a Web Bluetooth API nativa do navegador (Chrome/Edge/Android):
 *  - Pareamento por filtro de nome ("Haylou…") ou pelo serviço GATT padrão
 *    de frequência cardíaca;
 *  - BPM em tempo real via Heart Rate Service (0x180D / 0x2A37);
 *  - Bateria via Battery Service (0x180F / 0x2A19);
 *  - Envio de notificação (texto + vibração) para a tela AMOLED: tenta
 *    gravar o payload numa característica gravável do relógio. O protocolo
 *    proprietário do RT3 usado pelo Gadgetbridge pode ser plugado aqui
 *    trocando apenas o formato do payload em `encodePayload`.
 *
 * Cada leitura dispara os callbacks — a camada do Convex (hook
 * `useBluetoothWatch`) é quem persiste os dados no banco.
 */

export interface RT3Sample {
  bpm: number;
  spo2?: number;
  stress?: number;
  battery?: number;
  ts: number;
}

export interface RT3Callbacks {
  onSample?: (sample: RT3Sample) => void;
  onBattery?: (level: number) => void;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
}

const HEART_RATE_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HEART_RATE_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb";
const BATTERY_SERVICE = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL = "00002a19-0000-1000-8000-00805f9b34fb";

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class HaylouRT3Client {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private hrChar: BluetoothRemoteGATTCharacteristic | null = null;
  private batChar: BluetoothRemoteGATTCharacteristic | null = null;

  private readonly onSample?: (sample: RT3Sample) => void;
  private readonly onBattery?: (level: number) => void;
  private readonly onDisconnected?: () => void;
  private readonly onError?: (message: string) => void;

  constructor(callbacks: RT3Callbacks = {}) {
    this.onSample = callbacks.onSample;
    this.onBattery = callbacks.onBattery;
    this.onDisconnected = callbacks.onDisconnected;
    this.onError = callbacks.onError;
  }

  get isConnected(): boolean {
    return this.server?.connected === true;
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  /**
   * Abre o seletor de dispositivos e pareia com o relógio.
   * O filtro aceita o nome exibido pelo RT3 (prefixo "Haylou…") ou qualquer
   * dispositivo que exponha o serviço GATT padrão de frequência cardíaca.
   */
  async connect(): Promise<void> {
    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth não está disponível neste navegador");
    }
    if (this.isConnected) return;

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth!.requestDevice({
        filters: [
          { namePrefix: "Haylou" },
          { services: [HEART_RATE_SERVICE] },
        ],
        optionalServices: [BATTERY_SERVICE, HEART_RATE_SERVICE],
      });
    } catch (err) {
      // usuário cancelou o seletor ou nenhum dispositivo encontrado
      throw new Error("Pareamento cancelado ou nenhum relógio encontrado");
    }

    this.device = device;
    device.addEventListener("gattserverdisconnected", this.handleDisconnected);

    try {
      this.server = await device.gatt!.connect();
    } catch (err) {
      this.onError?.("Falha ao estabelecer o link GATT com o relógio");
      throw err;
    }

    await this.setupHeartRate();
    await this.readBattery();
  }

  disconnect(): void {
    if (this.server?.connected) {
      try {
        this.server.disconnect();
      } catch {
        // já desconectado
      }
    }
    this.cleanup();
  }

  /**
   * Envia uma notificação (texto + padrão de vibração) para a tela AMOLED.
   * Descobre a primeira característica gravável exposta pelo relógio e grava
   * o payload codificado. O protocolo proprietário do RT3 pode ser plugado
   * aqui sobrescrevendo `encodePayload`.
   */
  async sendNotification(text: string, vibrationMs: number[] = [200, 100, 200]): Promise<void> {
    if (!this.server) throw new Error("Relógio não conectado");
    const target = await this.findWritableCharacteristic();
    if (!target) {
      throw new Error("Nenhuma característica gravável exposta pelo relógio");
    }
    await target.writeValue(this.encodePayload(text, vibrationMs));
  }

  // ------------------------------------------------------------------ GATT

  private async setupHeartRate(): Promise<void> {
    if (!this.server) return;
    const svc = await this.server.getPrimaryService(HEART_RATE_SERVICE);
    const char = await svc.getCharacteristic(HEART_RATE_MEASUREMENT);
    this.hrChar = char;
    char.addEventListener("characteristicvaluechanged", this.handleHrValue);
    await char.startNotifications();
  }

  private async readBattery(): Promise<void> {
    if (!this.server) return;
    try {
      const svc = await this.server.getPrimaryService(BATTERY_SERVICE);
      const char = await svc.getCharacteristic(BATTERY_LEVEL);
      this.batChar = char;
      char.addEventListener("characteristicvaluechanged", this.handleBatteryValue);
      const dv = await char.readValue();
      this.onBattery?.(dv.getUint8(0));
      await char.startNotifications();
    } catch {
      // nem todo relógio expõe o serviço de bateria padrão — segue sem ele
    }
  }

  /** Procura, entre os serviços acessíveis, uma característica gravável. */
  private async findWritableCharacteristic(): Promise<BluetoothRemoteGATTCharacteristic | null> {
    if (!this.server) return null;
    try {
      const services = await this.server.getPrimaryServices();
      for (const svc of services) {
        const chars = await svc.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) return c;
        }
      }
    } catch {
      // serviços sem acesso são ignorados
    }
    return null;
  }

  /**
   * Codifica texto + vibração para gravação no relógio.
   * Formato JSON compacto — troque aqui pelo protocolo do firmware (ex. o
   * descrito no Gadgetbridge para a família Haylou) quando disponível.
   */
  private encodePayload(text: string, vibrationMs: number[]): Uint8Array {
    return new TextEncoder().encode(
      JSON.stringify({ type: "notification", text, vibration: vibrationMs }),
    );
  }

  // ------------------------------------------------------------------ Dados

  /** parse do Measurement do Heart Rate Profile (0x2A37). */
  private readonly handleHrValue = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv) return;
    const flags = dv.getUint8(0);
    const bpm = flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
    if (bpm === 0) return;
    this.onSample?.({ bpm, ts: Date.now() });
  };

  private readonly handleBatteryValue = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv) return;
    this.onBattery?.(dv.getUint8(0));
  };

  private readonly handleDisconnected = () => {
    this.cleanup();
    this.onDisconnected?.();
  };

  private cleanup(): void {
    if (this.hrChar) {
      this.hrChar.removeEventListener("characteristicvaluechanged", this.handleHrValue);
      this.hrChar = null;
    }
    if (this.batChar) {
      this.batChar.removeEventListener("characteristicvaluechanged", this.handleBatteryValue);
      this.batChar = null;
    }
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnected);
      this.device = null;
    }
    this.server = null;
  }
}
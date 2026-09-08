/**
 * Cliente Web Bluetooth para o smartwatch HAYLOU Solar Plus RT3 (LS16).
 *
 * Ponte universal entre o navegador (Web/PWA) e o relógio:
 *
 * 1) NOTIFICAÇÕES (Web -> Relógio)
 *    - Tipagem de categorias cobrindo apps de mensagem, redes sociais,
 *      chamadas/VoIP, bancos/fintechs, produtividade e o assistente de IA;
 *    - Envio preferencial pelo perfil padrão Alert Notification Service
 *      (0x1811 / New Alert 0x2A46), aceito pela maioria dos wearables;
 *    - Fallback: descoberta da primeira característica gravável e gravação
 *      do payload JSON (texto + vibração + categoria). O protocolo
 *      proprietário do RT3 usado no Gadgetbridge pode ser plugado aqui
 *      substituindo `encodePayload`.
 *
 * 2) TELEMETRIA (Relógio -> Web -> Convex)
 *    - Assinaturas GATT: Heart Rate (0x180D/0x2A37), Battery (0x180F/0x2A19),
 *      Blood Pressure (0x1810/0x2A35) e varredura de TODAS as características
 *      com notificação expostas pelo relógio (`onRawPacket`), para que o
 *      parser específico do firmware decode SpO2, estresse, sono, passos,
 *      distância, cadência, modos de esporte e eventos de botão/coroa;
 *    - RSSI do sinal BLE via `watchAdvertisements` quando o navegador suporta.
 *
 * Cada leitura dispara callbacks — a camada do Convex (hook
 * `useBluetoothWatch`) é quem persiste os dados no banco.
 */

// ---------------------------------------------------------------------------
// Categorias universais de notificação (sistema operacional / apps)
// ---------------------------------------------------------------------------

export type AppCategory =
  // Mensagens & comunicação
  | "whatsapp"
  | "whatsapp_business"
  | "telegram"
  | "signal"
  | "sms"
  | "mms"
  | "messenger"
  | "discord"
  | "slack"
  | "teams"
  | "google_chat"
  // Redes sociais & mídia
  | "instagram"
  | "facebook"
  | "tiktok"
  | "x"
  | "linkedin"
  | "pinterest"
  | "threads"
  | "youtube"
  | "twitch"
  // Chamadas & telefonia
  | "call"
  | "voip"
  | "voicemail"
  // Finanças & bancos
  | "bank"
  | "wallet"
  | "broker"
  | "fintech"
  | "pix"
  // Utilitários & produtividade
  | "calendar"
  | "reminder"
  | "alarm"
  | "email"
  | "tasks"
  | "navigation"
  // Assistente de IA (respostas acionadas manualmente)
  | "ai";

export interface CategoryMeta {
  label: string;
  icon: string;
  /** CategoryID do perfil ANS (0x1811) — 0x09 = Instant Message, etc. */
  ansCategoryId: number;
  /** Padrão de vibração sugerido (ms on/off/on). */
  vibrationMs: number[];
}

/**
 * Mapa de categorias: rótulo, ícone, ID ANS e vibração sugerida.
 * A lista cobre mensageiros, redes sociais, chamadas, finanças,
 * produtividade e IA — o payload final é formatado pelo relógio conforme
 * o protocolo usado no `encodePayload`.
 */
export const NOTIFICATION_CATEGORIES: Record<AppCategory, CategoryMeta> = {
  // Mensagens & comunicação
  whatsapp: { label: "WhatsApp", icon: "💬", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  whatsapp_business: { label: "WhatsApp Business", icon: "💼", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  telegram: { label: "Telegram", icon: "✈️", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  signal: { label: "Signal", icon: "🔒", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  sms: { label: "SMS", icon: "📱", ansCategoryId: 0x05, vibrationMs: [150, 100, 150] },
  mms: { label: "MMS", icon: "📎", ansCategoryId: 0x05, vibrationMs: [150, 100, 150] },
  messenger: { label: "Messenger", icon: "💬", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  discord: { label: "Discord", icon: "🎮", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  slack: { label: "Slack", icon: "🧵", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  teams: { label: "Microsoft Teams", icon: "👥", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  google_chat: { label: "Google Chat", icon: "💭", ansCategoryId: 0x09, vibrationMs: [150, 100, 150] },
  // Redes sociais & mídia
  instagram: { label: "Instagram", icon: "📸", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  facebook: { label: "Facebook", icon: "👍", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  tiktok: { label: "TikTok", icon: "🎵", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  x: { label: "X (Twitter)", icon: "🐦", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  linkedin: { label: "LinkedIn", icon: "💼", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  pinterest: { label: "Pinterest", icon: "📌", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  threads: { label: "Threads", icon: "🧵", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  youtube: { label: "YouTube", icon: "▶️", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  twitch: { label: "Twitch", icon: "🎮", ansCategoryId: 0x02, vibrationMs: [120, 80, 120] },
  // Chamadas & telefonia
  call: { label: "Ligação", icon: "📞", ansCategoryId: 0x03, vibrationMs: [300, 150, 300] },
  voip: { label: "Chamada VoIP", icon: "📱", ansCategoryId: 0x03, vibrationMs: [300, 150, 300] },
  voicemail: { label: "Correio de voz", icon: "📼", ansCategoryId: 0x06, vibrationMs: [300, 150, 300] },
  // Finanças & bancos
  bank: { label: "Banco", icon: "🏦", ansCategoryId: 0x08, vibrationMs: [200, 100, 200, 100, 200] },
  wallet: { label: "Carteira digital", icon: "👛", ansCategoryId: 0x08, vibrationMs: [200, 100, 200, 100, 200] },
  broker: { label: "Corretora", icon: "📈", ansCategoryId: 0x08, vibrationMs: [200, 100, 200, 100, 200] },
  fintech: { label: "Fintech", icon: "💳", ansCategoryId: 0x08, vibrationMs: [200, 100, 200, 100, 200] },
  pix: { label: "Pix / Transação", icon: "⚡", ansCategoryId: 0x08, vibrationMs: [200, 100, 200, 100, 200] },
  // Utilitários & produtividade
  calendar: { label: "Calendário", icon: "📅", ansCategoryId: 0x07, vibrationMs: [120, 80, 120] },
  reminder: { label: "Lembrete", icon: "⏰", ansCategoryId: 0x07, vibrationMs: [120, 80, 120] },
  alarm: { label: "Alarme", icon: "🔔", ansCategoryId: 0x07, vibrationMs: [400, 200, 400] },
  email: { label: "E-mail", icon: "✉️", ansCategoryId: 0x01, vibrationMs: [120, 80, 120] },
  tasks: { label: "Tarefas", icon: "✅", ansCategoryId: 0x07, vibrationMs: [120, 80, 120] },
  navigation: { label: "Navegação/GPS", icon: "🧭", ansCategoryId: 0x07, vibrationMs: [200, 120, 200] },
  // Assistente de IA (manual)
  ai: { label: "Assistente IA", icon: "✨", ansCategoryId: 0x08, vibrationMs: [150, 100, 150] },
};

export const DEFAULT_CATEGORY: AppCategory = "ai";

// ---------------------------------------------------------------------------
// Tipos de telemetria
// ---------------------------------------------------------------------------

export interface RT3Sample {
  /** batimentos por minuto (Heart Rate 0x2A37) */
  bpm: number;
  /** oxigenação (%, 1 casa) — quando o firmware expuser */
  spo2?: number;
  /** estresse 0–100 — quando o firmware expuser */
  stress?: number;
  /** passos acumulados (pedômetro) — quando o firmware expuser */
  steps?: number;
  /** distância em metros — quando o firmware expuser */
  distanceMeters?: number;
  /** gasto calórico — quando o firmware expuser */
  calories?: number;
  /** cadência/ritmo (passos por minuto) — quando o firmware expuser */
  cadence?: number;
  /** fase de sono — quando o firmware expuser */
  sleepPhase?: "awake" | "light" | "deep" | "rem";
  /** modo de esporte ativo (caminhada, corrida, ciclismo…) */
  sportMode?: string;
  /** pressão arterial estimada (Blood Pressure 0x2A35) */
  bloodPressure?: { systolic: number; diastolic: number; unit: "mmHg" | "kPa" };
  /** nível de bateria (0x2A19) */
  battery?: number;
  /** força do sinal BLE em dBm (watchAdvertisements) */
  rssi?: number;
  ts: number;
}

/**
 * Telemetria NÃO cardíaca vinda de outros sensores/pacotes (BP, e demais
 * campos decodificados pelo parser específico do firmware).
 */
export interface RT3Telemetry {
  spo2?: number;
  stress?: number;
  steps?: number;
  distanceMeters?: number;
  calories?: number;
  cadence?: number;
  sleepPhase?: RT3Sample["sleepPhase"];
  sportMode?: string;
  bloodPressure?: RT3Sample["bloodPressure"];
  battery?: number;
  rssi?: number;
  ts: number;
}

export interface RT3Callbacks {
  onSample?: (sample: RT3Sample) => void;
  /** telemetria de sensores que não são frequência cardíaca */
  onTelemetry?: (telemetry: RT3Telemetry) => void;
  onBattery?: (level: number) => void;
  onRssi?: (rssi: number) => void;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
  /**
   * Pacotes brutos de QUALQUER característica notificável exposta pelo
   * relógio — é aqui que o parser específico do firmware (protocolo
   * proprietário Haylou do Gadgetbridge) decodifica SpO2, estresse, sono,
   * passos, modos de esporte e eventos de botão/coroa.
   */
  onRawPacket?: (uuid: string, data: DataView) => void;
}

export interface RT3Notification {
  category: AppCategory;
  /** título curto (remetente/assunto) */
  title?: string;
  /** corpo da mensagem */
  text: string;
  /** padrão de vibração em ms — vazio desativa a vibração */
  vibrationMs?: number[];
}

// ---------------------------------------------------------------------------
// UUIDs GATT
// ---------------------------------------------------------------------------

const UUID = (hex: string) => `0000${hex}-0000-1000-8000-00805f9b34fb`;

const HEART_RATE_SERVICE = UUID("180d");
const HEART_RATE_MEASUREMENT = UUID("2a37");
const BATTERY_SERVICE = UUID("180f");
const BATTERY_LEVEL = UUID("2a19");
const BLOOD_PRESSURE_SERVICE = UUID("1810");
const BLOOD_PRESSURE_MEASUREMENT = UUID("2a35");
const ALERT_NOTIFICATION_SERVICE = UUID("1811");
const ANS_NEW_ALERT = UUID("2a46");
const ANS_SUPPORTED_NEW_ALERT_CATEGORY = UUID("2a47");

/** limite de segurança para escrita em uma única característica */
const MAX_PACKET_BYTES = 180;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export class HaylouRT3Client {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private hrChar: BluetoothRemoteGATTCharacteristic | null = null;
  private batChar: BluetoothRemoteGATTCharacteristic | null = null;
  private bpChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ansNewAlertChar: BluetoothRemoteGATTCharacteristic | null = null;
  /** características notificáveis descobertas (telemetria bruta) */
  private rawChars: BluetoothRemoteGATTCharacteristic[] = [];

  private readonly onSample?: (sample: RT3Sample) => void;
  private readonly onTelemetry?: (telemetry: RT3Telemetry) => void;
  private readonly onBattery?: (level: number) => void;
  private readonly onRssi?: (rssi: number) => void;
  private readonly onDisconnected?: () => void;
  private readonly onError?: (message: string) => void;
  private readonly onRawPacket?: (uuid: string, data: DataView) => void;

  constructor(callbacks: RT3Callbacks = {}) {
    this.onSample = callbacks.onSample;
    this.onTelemetry = callbacks.onTelemetry;
    this.onBattery = callbacks.onBattery;
    this.onRssi = callbacks.onRssi;
    this.onDisconnected = callbacks.onDisconnected;
    this.onError = callbacks.onError;
    this.onRawPacket = callbacks.onRawPacket;
  }

  get isConnected(): boolean {
    return this.server?.connected === true;
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  /**
   * Abre o seletor de dispositivos e pareia com o relógio.
   *
   * `mode`:
   *  - "smart" (padrão): filtra por nomes conhecidos do Haylou ("Haylou…",
   *    "LS16", "RT3") ou pelo serviço GATT padrão de frequência cardíaca.
   *  - "any": lista QUALQUER dispositivo BLE próximo (acceptAllDevices) —
   *    usado quando o relógio não anuncia nome/serviço reconhecível, o
   *    usuário escolhe o relógio manualmente na lista.
   *
   * Cada etapa de assinatura GATT é opcional: se o relógio não expuser um
   * serviço (ex.: HR padrão 0x180D inexistente nos Haylou proprietários),
   * a conexão continua mesmo assim com o que ele oferece.
   */
  async connect(mode: "smart" | "any" = "smart"): Promise<void> {
    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth não está disponível neste navegador");
    }
    if (this.isConnected) return;

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth!.requestDevice({
        filters:
          mode === "smart"
            ? [
                { namePrefix: "Haylou" },
                { namePrefix: "LS16" },
                { namePrefix: "RT3" },
                { namePrefix: "Solar" },
                { services: [HEART_RATE_SERVICE] },
              ]
            : undefined,
        acceptAllDevices: mode === "any",
        optionalServices: [
          HEART_RATE_SERVICE,
          BATTERY_SERVICE,
          BLOOD_PRESSURE_SERVICE,
          ALERT_NOTIFICATION_SERVICE,
        ],
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        throw new Error(
          "Permissão de Bluetooth/Localização negada. No Android, ative a Localização e o Bluetooth nas configurações e tente de novo.",
        );
      }
      throw new Error(
        "Nenhum relógio encontrado na busca. Verifique se o relógio está ligado e perto, se ele não está pareado com outro celular e tente de novo. Dica: em Configurações > Bluetooth do celular, esqueça o pareamento antigo do relógio antes de parear pelo site.",
      );
    }

    this.device = device;
    device.addEventListener("gattserverdisconnected", this.handleDisconnected);

    try {
      this.server = await device.gatt!.connect();
    } catch (err) {
      this.onError?.(
        "O pareamento foi aceito, mas a conexão GATT falhou. Esqueça o relógio em Configurações > Bluetooth do celular e tente parear de novo pelo site.",
      );
      throw err;
    }

    // etapas opcionais: nenhuma falha derruba a conexão inteira
    await Promise.allSettled([
      this.setupHeartRate(),
      this.readBattery(),
      this.setupAlertNotification(),
      this.setupBloodPressure(),
      this.subscribeRawTelemetry(),
    ]);
    this.setupRssi();
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
   * Envia uma notificação universal (categoria + título + texto + vibração)
   * para a tela AMOLED:
   *  1. tenta o perfil padrão ANS (0x1811, New Alert 0x2A46);
   *  2. fallback: primeira característica gravável exposta, com o payload
   *     JSON (trocável pelo protocolo proprietário do RT3).
   */
  async sendNotification(n: RT3Notification): Promise<void> {
    if (!this.server) throw new Error("Relógio não conectado");
    const meta = NOTIFICATION_CATEGORIES[n.category];
    const vibration = n.vibrationMs ?? meta.vibrationMs;
    const text = n.title ? `${n.title}\n${n.text}` : n.text;

    if (await this.writeAnsiNewAlert(meta.ansCategoryId, text)) return;

    const target = await this.findWritableCharacteristic();
    if (!target) {
      throw new Error("Nenhuma característica gravável exposta pelo relógio");
    }
    await target.writeValue(this.encodePayload(n.category, n.title, n.text, vibration));
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

  /** Assinatura do Alert Notification Service (notificações universais). */
  private async setupAlertNotification(): Promise<void> {
    if (!this.server) return;
    try {
      const svc = await this.server.getPrimaryService(ALERT_NOTIFICATION_SERVICE);
      const newAlert = await svc.getCharacteristic(ANS_NEW_ALERT);
      this.ansNewAlertChar = newAlert;
      // garante acesso de escrita ao New Alert (0x2A46)
      const supported = await svc.getCharacteristic(ANS_SUPPORTED_NEW_ALERT_CATEGORY);
      void supported; // leitura opcional — mantém o perfil acessível
    } catch {
      // relógio sem ANS — usa o fallback de característica gravável
    }
  }

  /** Blood Pressure Measurement (0x2A35) — pressão arterial estimada. */
  private async setupBloodPressure(): Promise<void> {
    if (!this.server) return;
    try {
      const svc = await this.server.getPrimaryService(BLOOD_PRESSURE_SERVICE);
      const char = await svc.getCharacteristic(BLOOD_PRESSURE_MEASUREMENT);
      this.bpChar = char;
      char.addEventListener("characteristicvaluechanged", this.handleBpValue);
      await char.startNotifications();
    } catch {
      // nem todo modelo expõe BP — segue sem ele
    }
  }

  /**
   * Varre TODAS as características notificáveis expostas pelo relógio e
   * repassa qualquer pacote ao callback `onRawPacket` (telemetria bruta:
   * SpO2, estresse, sono, passos, modos de esporte, botões/coroa…).
   */
  private async subscribeRawTelemetry(): Promise<void> {
    if (!this.server) return;
    try {
      const services = await this.server.getPrimaryServices();
      for (const svc of services) {
        let chars: BluetoothRemoteGATTCharacteristic[] = [];
        try {
          chars = await svc.getCharacteristics();
        } catch {
          continue; // serviço sem acesso liberado — ignorado
        }
        for (const c of chars) {
          if (!c.properties.notify && !c.properties.indicate) continue;
          // os canais já dedicados são tratados pelos parsers específicos
          if (c === this.hrChar || c === this.batChar || c === this.bpChar) continue;
          c.addEventListener("characteristicvaluechanged", this.handleRawValue);
          this.rawChars.push(c);
          try {
            await c.startNotifications();
          } catch {
            // característica sem CCCD utilizável — segue para a próxima
          }
        }
      }
    } catch {
      // descoberta de serviços sem acesso é ignorada
    }
  }

  /**
   * Força do sinal BLE (RSSI) via watchAdvertisements.
   * Suportado no Chrome/Edge com o dispositivo conectado; quando o
   * navegador não oferece, o RSSI simplesmente permanece null.
   */
  private setupRssi(): void {
    if (!this.device || typeof this.device.watchAdvertisements !== "function") return;
    this.device
      .watchAdvertisements()
      .then(() => {
        this.device?.addEventListener("advertisementreceived", this.handleAdvertisement);
      })
      .catch(() => {
        // watchAdvertisements indisponível para este dispositivo — RSSI fica null
      });
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
   * Escreve no New Alert (0x2A46) do perfil ANS:
   *   [CategoryID (1) | AlertCount (1) | Text (N)].
   * Resolve true quando a característica ANS existe e a escrita teve sucesso.
   */
  private async writeAnsiNewAlert(categoryId: number, text: string): Promise<boolean> {
    const char = this.ansNewAlertChar;
    if (!char || !char.properties.write) return false;
    try {
      const body = new TextEncoder().encode(text.slice(0, 40)); // texto curto p/ MTU
      const payload = new Uint8Array(2 + body.length);
      payload[0] = categoryId;
      payload[1] = 1; // 1 nova notificação
      payload.set(body, 2);
      await char.writeValue(payload);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Codifica o payload de notificação do protocolo proprietário do RT3
   * (JSON compacto com categoria, título, texto e vibração). Troque aqui
   * pela codificação binária documentada no Gadgetbridge para a família
   * Haylou quando disponível — o restante do fluxo permanece o mesmo.
   */
  private encodePayload(
    category: AppCategory,
    title: string | undefined,
    text: string,
    vibrationMs: number[],
  ): Uint8Array {
    const raw = JSON.stringify({
      type: "notification",
      category,
      title: title ?? "",
      text,
      vibration: vibrationMs,
    });
    const bytes = new TextEncoder().encode(raw);
    return bytes.slice(0, MAX_PACKET_BYTES);
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

  /**
   * parse do Blood Pressure Measurement (0x2A35):
   * flags bit0 → unidade (0 = mmHg, 1 = kPa); bit4 → Sistólica/Diastólica.
   */
  private readonly handleBpValue = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv) return;
    const flags = dv.getUint8(0);
    const unit = flags & 0x01 ? "kPa" : "mmHg";
    if (!(flags & 0x10) || dv.byteLength < 5) return; // sem par sistólica/diastólica
    const systolic = dv.getUint16(1, true);
    const diastolic = dv.getUint16(3, true);
    if (systolic === 0) return;
    this.onTelemetry?.({
      bloodPressure: { systolic, diastolic, unit },
      ts: Date.now(),
    });
  };

  /** Repassa qualquer pacote bruto de uma característica notificável. */
  private readonly handleRawValue = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv || !this.onRawPacket) return;
    this.onRawPacket(char.uuid, dv);
  };

  private readonly handleAdvertisement = (ev: Event) => {
    const adv = ev as BluetoothAdvertisementReceivedEvent;
    if (typeof adv.rssi === "number") this.onRssi?.(adv.rssi);
  };

  private readonly handleDisconnected = () => {
    this.cleanup();
    this.onDisconnected?.();
  };

  private cleanup(): void {
    const remove = (c: BluetoothRemoteGATTCharacteristic | null, fn: (e: Event) => void) => {
      if (c) c.removeEventListener("characteristicvaluechanged", fn);
    };
    remove(this.hrChar, this.handleHrValue);
    remove(this.batChar, this.handleBatteryValue);
    remove(this.bpChar, this.handleBpValue);
    for (const c of this.rawChars) {
      c.removeEventListener("characteristicvaluechanged", this.handleRawValue);
    }
    this.rawChars = [];
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnected);
      this.device.removeEventListener("advertisementreceived", this.handleAdvertisement);
      this.device = null;
    }
    this.hrChar = null;
    this.batChar = null;
    this.bpChar = null;
    this.ansNewAlertChar = null;
    this.server = null;
  }
}
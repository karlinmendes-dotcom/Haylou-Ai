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
  /** Código de tipo do protocolo GloryFit (enviado no pacote 0xC5). */
  gloryFitCode: number;
  /** Padrão de vibração sugerido (ms on/off/on). */
  vibrationMs: number[];
}

/**
 * Mapa de categorias: rótulo, ícone, ID ANS e vibração sugerida.
 * A lista cobre mensageiros, redes sociais, chamadas, finanças,
 * produtividade e IA — o payload final é formatado pelo relógio conforme
 * o protocolo usado no `encodePayload`.
 */
/** Códigos de tipo do protocolo GloryFit (GloryFitNotificationType do Gadgetbridge). */
const GF_TYPE = {
  CALL: 0,
  QQ: 1,
  WECHAT: 2,
  SMS: 3,
  UNKNOWN_APP: 4,
  FACEBOOK: 5,
  TWITTER: 6,
  WHATSAPP: 7,
  SKYPE: 8,
  FACEBOOK_MESSENGER: 9,
  HANGOUTS: 10,
  LINE: 11,
  LINKEDIN: 12,
  INSTAGRAM: 13,
  VIBER: 14,
  KAKAO_TALK: 15,
  VK: 16,
  SNAPCHAT: 17,
  EMAIL: 19,
  TUMBLR: 21,
  PINTEREST: 22,
  YOUTUBE: 23,
  TELEGRAM: 24,
  NO_ICON: 25,
} as const;

export const NOTIFICATION_CATEGORIES: Record<AppCategory, CategoryMeta> = {
  // Mensagens & comunicação
  whatsapp: { label: "WhatsApp", icon: "💬", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.WHATSAPP, vibrationMs: [150, 100, 150] },
  whatsapp_business: { label: "WhatsApp Business", icon: "💼", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.WHATSAPP, vibrationMs: [150, 100, 150] },
  telegram: { label: "Telegram", icon: "✈️", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.TELEGRAM, vibrationMs: [150, 100, 150] },
  signal: { label: "Signal", icon: "🔒", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.WECHAT, vibrationMs: [150, 100, 150] },
  sms: { label: "SMS", icon: "📱", ansCategoryId: 0x05, gloryFitCode: GF_TYPE.SMS, vibrationMs: [150, 100, 150] },
  mms: { label: "MMS", icon: "📎", ansCategoryId: 0x05, gloryFitCode: GF_TYPE.SMS, vibrationMs: [150, 100, 150] },
  messenger: { label: "Messenger", icon: "💬", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.FACEBOOK_MESSENGER, vibrationMs: [150, 100, 150] },
  discord: { label: "Discord", icon: "🎮", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.VIBER, vibrationMs: [150, 100, 150] },
  slack: { label: "Slack", icon: "🧵", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [150, 100, 150] },
  teams: { label: "Microsoft Teams", icon: "👥", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [150, 100, 150] },
  google_chat: { label: "Google Chat", icon: "💭", ansCategoryId: 0x09, gloryFitCode: GF_TYPE.HANGOUTS, vibrationMs: [150, 100, 150] },
  // Redes sociais & mídia
  instagram: { label: "Instagram", icon: "📸", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.INSTAGRAM, vibrationMs: [120, 80, 120] },
  facebook: { label: "Facebook", icon: "👍", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.FACEBOOK, vibrationMs: [120, 80, 120] },
  tiktok: { label: "TikTok", icon: "🎵", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  x: { label: "X (Twitter)", icon: "🐦", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.TWITTER, vibrationMs: [120, 80, 120] },
  linkedin: { label: "LinkedIn", icon: "💼", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.LINKEDIN, vibrationMs: [120, 80, 120] },
  pinterest: { label: "Pinterest", icon: "📌", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.PINTEREST, vibrationMs: [120, 80, 120] },
  threads: { label: "Threads", icon: "🧵", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  youtube: { label: "YouTube", icon: "▶️", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.YOUTUBE, vibrationMs: [120, 80, 120] },
  twitch: { label: "Twitch", icon: "🎮", ansCategoryId: 0x02, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  // Chamadas & telefonia
  call: { label: "Ligação", icon: "📞", ansCategoryId: 0x03, gloryFitCode: GF_TYPE.CALL, vibrationMs: [300, 150, 300] },
  voip: { label: "Chamada VoIP", icon: "📱", ansCategoryId: 0x03, gloryFitCode: GF_TYPE.CALL, vibrationMs: [300, 150, 300] },
  voicemail: { label: "Correio de voz", icon: "📼", ansCategoryId: 0x06, gloryFitCode: GF_TYPE.CALL, vibrationMs: [300, 150, 300] },
  // Finanças & bancos
  bank: { label: "Banco", icon: "🏦", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 100, 200, 100, 200] },
  wallet: { label: "Carteira digital", icon: "👛", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 100, 200, 100, 200] },
  broker: { label: "Corretora", icon: "📈", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 100, 200, 100, 200] },
  fintech: { label: "Fintech", icon: "💳", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 100, 200, 100, 200] },
  pix: { label: "Pix / Transação", icon: "⚡", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 100, 200, 100, 200] },
  // Utilitários & produtividade
  calendar: { label: "Calendário", icon: "📅", ansCategoryId: 0x07, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  reminder: { label: "Lembrete", icon: "⏰", ansCategoryId: 0x07, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  alarm: { label: "Alarme", icon: "🔔", ansCategoryId: 0x07, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [400, 200, 400] },
  email: { label: "E-mail", icon: "✉️", ansCategoryId: 0x01, gloryFitCode: GF_TYPE.EMAIL, vibrationMs: [120, 80, 120] },
  tasks: { label: "Tarefas", icon: "✅", ansCategoryId: 0x07, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [120, 80, 120] },
  navigation: { label: "Navegação/GPS", icon: "🧭", ansCategoryId: 0x07, gloryFitCode: GF_TYPE.UNKNOWN_APP, vibrationMs: [200, 120, 200] },
  // Assistente de IA (manual)
  ai: { label: "Assistente IA", icon: "✨", ansCategoryId: 0x08, gloryFitCode: GF_TYPE.NO_ICON, vibrationMs: [150, 100, 150] },
};

export const DEFAULT_CATEGORY: AppCategory = "ai";

// ---------------------------------------------------------------------------
// Tipos de telemetria
// ---------------------------------------------------------------------------

/** Modos de esporte suportados pelo firmware (exibição/contexto da IA). */
export type SportMode =
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "free"
  | "other";

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
  /** duração do sono em minutos (somente a última sessão) — quando o firmware expuser */
  sleepDurationMin?: number;
  /** postura/equilíbrio estimado — quando o firmware expuser */
  posture?: "sitting" | "standing" | "lying" | "active";
  /** modo de esporte ativo (caminhada, corrida, ciclismo…) */
  sportMode?: SportMode;
  /** pressão arterial estimada (Blood Pressure 0x2A35) */
  bloodPressure?: { systolic: number; diastolic: number; unit: "mmHg" | "kPa" };
  /** nível de bateria (0x2A19) */
  battery?: number;
  /** força do sinal BLE em dBm (watchAdvertisements) */
  rssi?: number;
  ts: number;
}

/** Eventos de hardware capturados do relógio (cliques/coroa), quando o parser decodifica. */
export interface RT3HardwareEvent {
  kind: "button" | "crown" | "other";
  action: "press" | "long_press" | "double_press" | "turn" | "unknown";
  /** incremento da coroa rotativa, quando aplicável */
  delta?: number;
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
  sleepDurationMin?: number;
  posture?: RT3Sample["posture"];
  sportMode?: RT3Sample["sportMode"];
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
  /** Eventos de hardware (botão/coroa) já decodificados pelo parser. */
  onHardwareEvent?: (event: RT3HardwareEvent) => void;
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
const GENERIC_ACCESS_SERVICE = UUID("1800");
const DEVICE_INFORMATION_SERVICE = UUID("180a");
/** Serviço UART-like comum nos relógios Haylou/GloryFit (FFE0/FFE1). */
const HAYLOU_SERVICE = UUID("ffe0");
const HAYLOU_WRITE_CHAR = UUID("ffe1");
/**
 * Protocolo proprietário GLORYFIT — o mesmo usado pelo HAYLOU RT3 (LS16).
 * Extraído do Gadgetbridge (GloryFitSupport.kt):
 *   - 0x55FF: serviço de comandos (CMD)
 *   - 0x56FF: serviço de dados (DATA)
 */
const GLORYFIT_CMD_SERVICE = UUID("55ff");
const GLORYFIT_CMD_WRITE = UUID("33f1");
const GLORYFIT_CMD_READ = UUID("33f2");
const GLORYFIT_DATA_SERVICE = UUID("56ff");
const GLORYFIT_DATA_WRITE = UUID("34f1");
const GLORYFIT_DATA_READ = UUID("34f2");

// comandos do protocolo GloryFit (Gadgetbridge)
const GF_CMD_VERSION = 0xa1;
const GF_CMD_BATTERY = 0xa2;
const GF_CMD_DATE_TIME = 0xa3;
const GF_CMD_NOTIFICATION = 0xc5;
const GF_CMD_SMS_QUICK_REPLY = 0x52;
const GF_CMD_STEPS = 0xb2;
const GF_CMD_HEART_RATE = 0xf7;
const GF_CMD_SPO2 = 0x34;
const GF_CMD_ACTION = 0xd1;
const GF_CMD_VIBRATE = 0xab;
const GF_FETCH_START = 0xfa;
const GF_FETCH_DATA = 0x07;
const GF_FETCH_END = 0xfd;
const GF_NOTIFICATION_END = 0xfd;
/** tamanho do chunk de notificação usado pelo app oficial (20 bytes) */
const GF_CHUNK_SIZE = 20;

/**
 * Nome exato anunciado pelo hardware (extraído do advertising do RT3/LS16):
 * o Web Bluetooth compara nomes com CASE-SENSITIVE — por isso os filtros
 * cobrem as variações de caixa observadas no anúncio real.
 */
const RT3_ADVERTISED_NAMES = ["HAYLOU Solar Plus", "Haylou Solar Plus", "HAYLOU Solar Plus RT3"];
const RT3_NAME_PREFIXES = ["HAYLOU", "Haylou", "LS16", "RT3", "Solar", "Solar Plus"];

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
  /** canal de escrita proprietário Haylou (FFE1) — usado como fallback do ANS */
  private haylouWriteChar: BluetoothRemoteGATTCharacteristic | null = null;
  /** canal de comando do protocolo GloryFit (0x33F1/0x33F2) */
  private gfCmdWrite: BluetoothRemoteGATTCharacteristic | null = null;
  private gfCmdRead: BluetoothRemoteGATTCharacteristic | null = null;
  /** canal de dados do protocolo GloryFit (0x34F1/0x34F2) */
  private gfDataWrite: BluetoothRemoteGATTCharacteristic | null = null;
  private gfDataRead: BluetoothRemoteGATTCharacteristic | null = null;
  /** características notificáveis descobertas (telemetria bruta) */
  private rawChars: BluetoothRemoteGATTCharacteristic[] = [];

  private readonly onSample?: (sample: RT3Sample) => void;
  private readonly onTelemetry?: (telemetry: RT3Telemetry) => void;
  private readonly onBattery?: (level: number) => void;
  private readonly onRssi?: (rssi: number) => void;
  private readonly onDisconnected?: () => void;
  private readonly onError?: (message: string) => void;
  private readonly onRawPacket?: (uuid: string, data: DataView) => void;
  private readonly onHardwareEvent?: (event: RT3HardwareEvent) => void;

  constructor(callbacks: RT3Callbacks = {}) {
    this.onSample = callbacks.onSample;
    this.onTelemetry = callbacks.onTelemetry;
    this.onBattery = callbacks.onBattery;
    this.onRssi = callbacks.onRssi;
    this.onDisconnected = callbacks.onDisconnected;
    this.onError = callbacks.onError;
    this.onRawPacket = callbacks.onRawPacket;
    this.onHardwareEvent = callbacks.onHardwareEvent;
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
                // nome exato anunciado pelo RT3 (case-sensitive) + prefixos
                ...RT3_ADVERTISED_NAMES.map((name) => ({ name })),
                ...RT3_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
                { services: [HEART_RATE_SERVICE] },
              ]
            : undefined,
        acceptAllDevices: mode === "any",
        optionalServices: [
          HEART_RATE_SERVICE,
          BATTERY_SERVICE,
          BLOOD_PRESSURE_SERVICE,
          ALERT_NOTIFICATION_SERVICE,
          HAYLOU_SERVICE, // canal FFE1 (fallback antigo)
          GENERIC_ACCESS_SERVICE, // 0x1800
          DEVICE_INFORMATION_SERVICE, // 0x180A
          GLORYFIT_CMD_SERVICE, // 0x55FF — protocolo real do RT3 (comandos)
          GLORYFIT_DATA_SERVICE, // 0x56FF — protocolo real do RT3 (dados)
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
      this.setupGloryFit(), // handshake oficial do RT3 (hora, versão, bateria)
      this.subscribeRawTelemetry(),
    ]);
    this.setupRssi();
  }

  /**
   * Handshake de inicialização do protocolo GloryFit (o mesmo que o app
   * oficial faz no primeiro pareamento). Sem ele o relógio fica "preso"
   * na tela de pareamento / estado de fábrica, sem liberar as funções.
   *
   * 1) assina as notificações dos canais de comando (0x33F2) e dados (0x34F2);
   * 2) pede a versão do firmware (0xA1);
   * 3) pede a bateria (0xA2);
   * 4) envia a data/hora do celular (0xA3) — é o que "destrava" o relógio.
   */
  private async setupGloryFit(): Promise<void> {
    if (!this.server) return;
    try {
      const cmdSvc = await this.server.getPrimaryService(GLORYFIT_CMD_SERVICE);
      const dataSvc = await this.server.getPrimaryService(GLORYFIT_DATA_SERVICE);
      const cmdWrite = await cmdSvc.getCharacteristic(GLORYFIT_CMD_WRITE);
      const cmdRead = await cmdSvc.getCharacteristic(GLORYFIT_CMD_READ);
      this.gfCmdWrite = cmdWrite;
      this.gfCmdRead = cmdRead;

      cmdRead.addEventListener("characteristicvaluechanged", this.handleGfCommand);
      await cmdRead.startNotifications();

      // canal de dados (telemetria: passos, sono, SpO2)
      try {
        const dataRead = await dataSvc.getCharacteristic(GLORYFIT_DATA_READ);
        this.gfDataRead = dataRead;
        dataRead.addEventListener("characteristicvaluechanged", this.handleGfData);
        await dataRead.startNotifications();
      } catch {
        // nem todo modelo expõe o canal de dados
      }

      if (cmdWrite.properties.write || cmdWrite.properties.writeWithoutResponse) {
        const write = (bytes: number[]) => {
          const payload = Uint8Array.from(bytes);
          if (cmdWrite.properties.write) return cmdWrite.writeValue(payload);
          return cmdWrite.writeValueWithoutResponse(payload);
        };
        // handshake: versão + bateria + hora/data (destrava o relógio)
        await write([GF_CMD_VERSION]);
        await write([GF_CMD_BATTERY]);
        await this.writeGfDateTime(write);
      }
    } catch {
      // sem o serviço GloryFit, segue com os demais canais
    }
  }

  /** Envia a data/hora atual no formato GloryFit (0xA3, big-endian). */
  private async writeGfDateTime(
    write: (bytes: number[]) => Promise<void>,
  ): Promise<void> {
    const now = new Date();
    const payload = [
      GF_CMD_DATE_TIME,
      (now.getFullYear() >> 8) & 0xff,
      now.getFullYear() & 0xff,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    ];
    await write(payload);
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

    // 1) protocolo REAL do RT3: GloryFit (0xC5 em chunks, como o app oficial)
    if (await this.writeGfNotification(meta.gloryFitCode, text)) return;
    // 2) perfil ANS padrão (0x1811 / New Alert)
    if (await this.writeAnsiNewAlert(meta.ansCategoryId, text)) return;
    // 3) canal proprietário Haylou/GloryFit (FFE0/FFE1)
    if (await this.writeHaylouChannel(n, vibration)) return;
    // 4) qualquer característica gravável exposta
    const target = await this.findWritableCharacteristic();
    if (!target) {
      throw new Error("Nenhuma característica gravável exposta pelo relógio");
    }
    await target.writeValue(this.encodePayload(n.category, n.title, n.text, vibration));
  }

  /**
   * Envia a notificação no formato do protocolo GloryFit (0xC5):
   * chunks de 20 bytes [0xC5, idx, (tipo, tamanho no 1º), payload…]
   * e fecha com [0xC5, 0xFD]. Igual ao app oficial/Gadgetbridge.
   */
  private async writeGfNotification(type: number, text: string): Promise<boolean> {
    const char = this.gfCmdWrite;
    if (!char) return false;
    const write = (bytes: number[]) => {
      const payload = Uint8Array.from(bytes);
      if (char.properties.write) return char.writeValue(payload);
      return char.writeValueWithoutResponse(payload);
    };
    try {
      const body = new TextEncoder().encode(text.slice(0, 240));
      let idx = 0;
      for (let off = 0; off < body.length; ) {
        const buf: number[] = [GF_CMD_NOTIFICATION, idx & 0xff];
        if (idx === 0) {
          buf.push(type & 0xff);
          buf.push(body.length & 0xff);
        }
        const end = Math.min(off + (GF_CHUNK_SIZE - buf.length), body.length);
        for (let i = off; i < end; i++) buf.push(body[i]);
        await write(buf);
        off = end;
        idx++;
      }
      await write([GF_CMD_NOTIFICATION, GF_NOTIFICATION_END]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escreve a notificação no canal FFE1 dos relógios Haylou/GloryFit.
   * Resolve true quando o canal existe e a escrita teve sucesso.
   */
  private async writeHaylouChannel(
    n: RT3Notification,
    vibrationMs: number[],
  ): Promise<boolean> {
    const char = this.haylouWriteChar;
    if (!char) return false;
    try {
      // payload compatível com o padrão UART-like: [categoria] título\ntexto\n[padrão de vibração]
      const body = new TextEncoder().encode(
        `${NOTIFICATION_CATEGORIES[n.category].label}|${n.title ?? ""}|${n.text}|${vibrationMs.join(",")}`,
      );
      const payload = body.slice(0, MAX_PACKET_BYTES);
      if (char.properties.write) {
        await char.writeValue(payload);
      } else {
        await char.writeValueWithoutResponse(payload);
      }
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ GATT

  private async setupHeartRate(): Promise<void> {
    if (!this.server) return;
    try {
      const svc = await this.server.getPrimaryService(HEART_RATE_SERVICE);
      const char = await svc.getCharacteristic(HEART_RATE_MEASUREMENT);
      this.hrChar = char;
      char.addEventListener("characteristicvaluechanged", this.handleHrValue);
      await char.startNotifications();
    } catch {
      // RT3 não expõe o HR padrão (0x180D) — o BPM real vem pelo 0xF7 do GloryFit
    }
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
    try {
      // canal proprietário Haylou/GloryFit (FFE0/FFE1) — o mais comum nos
      // relógios chineses para receber texto/vibração (usado no Gadgetbridge)
      const svc = await this.server.getPrimaryService(HAYLOU_SERVICE);
      const writeChar = await svc.getCharacteristic(HAYLOU_WRITE_CHAR);
      if (writeChar.properties.write || writeChar.properties.writeWithoutResponse) {
        this.haylouWriteChar = writeChar;
      }
    } catch {
      // modelo sem o serviço FFE0 — segue com ANS ou característica gravável
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
   * Handler dos dados que chegam pelo canal de COMANDOS do GloryFit (0x33F2).
   * Formatos (extraídos do GloryFitSupport.kt do Gadgetbridge):
   *   [0xA1, versão…]  -> firmware
   *   [0xA2, nível, carregando?] -> bateria
   *   [0xF7, 0x07, …]  -> pacote de HR em blocos de 10 min
   *   [0xB2, …]        -> passos
   *   [0x34, …]        -> SpO2
   */
  private readonly handleGfCommand = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv || dv.byteLength < 1) return;
    const cmd = dv.getUint8(0);
    if (cmd === GF_CMD_BATTERY && dv.byteLength >= 2) {
      this.onBattery?.(dv.getUint8(1));
      return;
    }
    if (cmd === GF_CMD_HEART_RATE && dv.byteLength >= 2) {
      const b1 = dv.getUint8(1);
      if (b1 !== GF_FETCH_DATA && b1 !== GF_FETCH_END) {
        // medição contínua: [0xF7, bpm]
        if (b1 > 20 && b1 < 250) this.onSample?.({ bpm: b1, ts: Date.now() });
      }
      return;
    }
    // demais comandos (versão, passos, SpO2, sono…) vão ao parser bruto
    this.onRawPacket?.(char.uuid, dv);
  };

  /** Handler dos dados do canal DATA do GloryFit (0x34F2) — telemetria bruta. */
  private readonly handleGfData = (ev: Event) => {
    const char = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = char.value;
    if (!dv) return;
    this.onRawPacket?.(char.uuid, dv);
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
    if (!dv) return;
    this.onRawPacket?.(char.uuid, dv);
    // tenta decodificar eventos de hardware (botão/coroa) de pacotes curtos;
    // retorna null para qualquer padrão não reconhecido (nunca inventa dados)
    const hw = decodeHardwareEvent(dv);
    if (hw) this.onHardwareEvent?.(hw);
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
    remove(this.gfCmdRead, this.handleGfCommand);
    remove(this.gfDataRead, this.handleGfData);
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
    this.haylouWriteChar = null;
    this.gfCmdWrite = null;
    this.gfCmdRead = null;
    this.gfDataWrite = null;
    this.gfDataRead = null;
    this.server = null;
  }
}

/**
 * Decodifica um evento de hardware (botão/coroa) a partir de um pacote bruto.
 * Heurística conservadora: só reconhece padrões inequívocos; para qualquer
 * formato desconhecido devolve null (a ponte NUNCA inventa eventos).
 * Quando o parser específico do firmware estiver disponível, substitua esta
 * função pela decodificação real dos pacotes FFE1/proprietários.
 */
export function decodeHardwareEvent(dv: DataView): RT3HardwareEvent | null {
  if (dv.byteLength < 1 || dv.byteLength > 8) return null;
  const b0 = dv.getUint8(0);
  // faixa comumente usada por relógios chineses para botão único:
  // 0x01 = press, 0x02 = double, 0x03 = long, 0x10 = coroa +/delta
  if (b0 === 0x01 || b0 === 0x02 || b0 === 0x03) {
    return {
      kind: "button",
      action: b0 === 0x01 ? "press" : b0 === 0x02 ? "double_press" : "long_press",
      ts: Date.now(),
    };
  }
  if (b0 === 0x10 && dv.byteLength >= 3) {
    return {
      kind: "crown",
      action: "turn",
      delta: dv.getInt16(1, true),
      ts: Date.now(),
    };
  }
  return null;
}
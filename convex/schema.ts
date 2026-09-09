import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  devices: defineTable({
    name: v.string(),
    model: v.string(),
    battery: v.number(),
    firmware: v.string(),
    lastSync: v.number(),
    status: v.union(v.literal("online"), v.literal("offline"), v.literal("syncing")),
  }),
  sessions: defineTable({
    deviceName: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    type: v.string(),
  }),
  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }),
  /**
   * Telemetria do smartwatch persistida a cada medição:
   * BPM vindo do Heart Rate Profile (BLE), SpO2/estresse, sono, passos,
   * distância, calorias, cadência, modo de esporte, pressão arterial,
   * bateria e RSSI — sempre que o firmware expuser cada leitura.
   */
  biometrics: defineTable({
    deviceId: v.string(),
    bpm: v.number(),
    spo2: v.optional(v.number()),
    stress: v.optional(v.number()),
    steps: v.optional(v.number()),
    distanceMeters: v.optional(v.number()),
    calories: v.optional(v.number()),
    cadence: v.optional(v.number()),
    sleepPhase: v.optional(v.string()),
    sleepDurationMin: v.optional(v.number()),
    posture: v.optional(v.string()),
    sportMode: v.optional(v.string()),
    systolic: v.optional(v.number()),
    diastolic: v.optional(v.number()),
    rssi: v.optional(v.number()),
    battery: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
  /**
   * Alertas e notificações enviados para a tela AMOLED do relógio
   * (categoria universal, título, texto + padrão de vibração + status).
   */
  ai_notifications: defineTable({
    deviceId: v.optional(v.string()),
    category: v.optional(v.string()),
    title: v.optional(v.string()),
    message: v.string(),
    sentAt: v.number(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("pending")),
    vibrationPattern: v.optional(v.string()),
  }).index("by_sentAt", ["sentAt"]),
  /**
   * Usuários da plataforma multi-tenant (Health Connect / RPM):
   * pacientes (com relógio/Health Connect) e treinadores (personal).
   */
  users: defineTable({
    name: v.string(),
    role: v.union(v.literal("trainer"), v.literal("patient")),
    age: v.number(),
    /** Ex.: "HAYLOU Solar Plus RT3", "Apple Watch", "" se não tiver. */
    connectedDevice: v.string(),
  }),
  /**
   * Métricas de saúde consolidadas por usuário, sincronizadas do
   * Google Health Connect / Apple HealthKit (ou do relógio via BLE).
   */
  health_metrics: defineTable({
    userId: v.id("users"),
    bpm: v.optional(v.number()),
    spo2: v.optional(v.number()),
    stress: v.optional(v.number()),
    steps: v.optional(v.number()),
    calories: v.optional(v.number()),
    sleepHours: v.optional(v.number()),
    /** Timestamp ISO da sincronização (ordena cronologicamente). */
    syncedAt: v.string(),
  }).index("by_userId_syncedAt", ["userId", "syncedAt"]),
  /**
   * Alertas clínicos gerados pela regra de monitoramento remoto
   * (BPM alto, SpO2 baixo, inatividade) para o treinador agir.
   */
  alerts: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("HIGH_BPM"), v.literal("LOW_SPO2"), v.literal("INACTIVITY")),
    message: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("RESOLVED")),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),
  /**
   * Ações/intenções de automação pedidas pelo usuário (relógio, voz, web
   * ou webhooks externos) — a "Central de Comandos" do ecossistema:
   * WhatsApp, agenda, chamadas, abertura de apps, etc.
   */
  user_actions: defineTable({
    /** Intenção normalizada (SEND_WHATSAPP, CREATE_CALENDAR_EVENT, …). */
    intent: v.string(),
    /** Origem da intenção: relógio (BLE), voz, web ou webhook externo. */
    source: v.union(v.literal("watch"), v.literal("voice"), v.literal("web"), v.literal("webhook")),
    /** Texto livre que originou a intenção (para auditoria/IA). */
    rawText: v.optional(v.string()),
    /** Dados estruturados da ação (destinatário, mensagem, horário, app…). */
    payload: v.optional(v.any()),
    /** Serviço alvo: "whatsapp", "calendar", "phone", "app", "n8n", … */
    targetService: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("executing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    /** Resposta do executor (ex.: id da mensagem enviada). */
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    executedAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),
});
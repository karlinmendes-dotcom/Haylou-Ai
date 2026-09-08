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
   * BPM vindo do Heart Rate Profile (BLE), SpO2/estresse quando o
   * firmware enviar, nível de bateria e timestamp do relógio.
   */
  biometrics: defineTable({
    deviceId: v.string(),
    bpm: v.number(),
    spo2: v.optional(v.number()),
    stress: v.optional(v.number()),
    battery: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
  /**
   * Alertas e notificações gerados pela IA e enviados para a tela
   * AMOLED do relógio (texto + padrão de vibração + status do envio).
   */
  ai_notifications: defineTable({
    deviceId: v.optional(v.string()),
    message: v.string(),
    sentAt: v.number(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("pending")),
    vibrationPattern: v.optional(v.string()),
  }).index("by_sentAt", ["sentAt"]),
});
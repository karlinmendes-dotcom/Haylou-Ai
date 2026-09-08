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
});
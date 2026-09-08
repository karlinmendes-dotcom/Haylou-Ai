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
});

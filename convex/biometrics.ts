import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Persiste uma medição biométrica vinda do smartwatch (BLE/API).
 * Chamada pelo cliente a cada nova leitura (com throttle no frontend).
 */
export const insert = mutation({
  args: {
    deviceId: v.string(),
    bpm: v.number(),
    spo2: v.optional(v.number()),
    stress: v.optional(v.number()),
    battery: v.optional(v.number()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("biometrics", {
      deviceId: args.deviceId,
      bpm: args.bpm,
      spo2: args.spo2,
      stress: args.stress,
      battery: args.battery,
      timestamp: args.timestamp ?? Date.now(),
    });
  },
});

/** Últimas medições (decrescente) para a lista do dashboard. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("biometrics").order("desc").take(limit ?? 50);
  },
});

/** Última medição registrada (para o painel "última leitura"). */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("biometrics").order("desc").first()) ?? null;
  },
});
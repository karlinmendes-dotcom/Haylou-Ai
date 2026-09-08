import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Registra uma notificação gerada pela IA e enviada para a tela AMOLED
 * do relógio (texto + padrão de vibração + status do envio).
 */
export const insert = mutation({
  args: {
    deviceId: v.optional(v.string()),
    category: v.optional(v.string()),
    title: v.optional(v.string()),
    message: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("pending")),
    vibrationPattern: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("ai_notifications", {
      deviceId: args.deviceId,
      category: args.category,
      title: args.title,
      message: args.message,
      status: args.status,
      vibrationPattern: args.vibrationPattern,
      sentAt: args.sentAt ?? Date.now(),
    });
  },
});

/** Últimas notificações enviadas (decrescente) para o dashboard. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("ai_notifications").order("desc").take(limit ?? 20);
  },
});

/** Última notificação registrada. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("ai_notifications").order("desc").first()) ?? null;
  },
});
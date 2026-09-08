import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { INTENTS, INTENT_META, parseIntent, type Intent } from "./intentParser";

/**
 * ENGINE DE AÇÕES E AUTOMAÇÕES — o "cérebro" do ecossistema.
 *
 * O usuário expressa uma intenção (pelo relógio, voz, web ou webhook
 * externo) e o Convex a registra em `user_actions` com um status de
 * execução. O executor real (WhatsApp/Evolution API, agenda, discador,
 * n8n/Make, Android Accessibility) consome essas ações e devolve o
 * resultado — o site e o relógio apenas acompanham o status.
 */

export { INTENTS, INTENT_META, parseIntent };
export type { Intent };

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Registra uma ação explícita (intenção já identificada pelo chamador). */
export const register = mutation({
  args: {
    intent: v.string(),
    source: v.union(v.literal("watch"), v.literal("voice"), v.literal("web"), v.literal("webhook")),
    rawText: v.optional(v.string()),
    payload: v.optional(v.any()),
    targetService: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intent = (INTENTS as readonly string[]).includes(args.intent)
      ? (args.intent as Intent)
      : "UNKNOWN";
    const meta = INTENT_META[intent];
    const id = await ctx.db.insert("user_actions", {
      intent,
      source: args.source,
      rawText: args.rawText,
      payload: args.payload,
      targetService: args.targetService ?? meta.targetService,
      status: "pending",
      createdAt: Date.now(),
    });
    return { id, intent, targetService: meta.targetService };
  },
});

/** Registra uma ação a partir de texto livre (parser local de intenções). */
export const registerFromText = mutation({
  args: {
    text: v.string(),
    source: v.union(v.literal("watch"), v.literal("voice"), v.literal("web"), v.literal("webhook")),
  },
  handler: async (ctx, args) => {
    const { intent, target, message } = parseIntent(args.text);
    const meta = INTENT_META[intent];
    const payload = {
      target,
      message,
      ...(intent === "CREATE_CALENDAR_EVENT" ? { summary: target ?? message } : {}),
    };
    const id = await ctx.db.insert("user_actions", {
      intent,
      source: args.source,
      rawText: args.text,
      payload,
      targetService: meta.targetService,
      status: "pending",
      createdAt: Date.now(),
    });
    return { id, intent, parsed: { target, message }, targetService: meta.targetService };
  },
});

/** Atualiza o status de uma ação (executando/done/failed) com resultado. */
export const setStatus = mutation({
  args: {
    id: v.id("user_actions"),
    status: v.union(
      v.literal("pending"),
      v.literal("executing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;
    await ctx.db.patch(args.id, {
      status: args.status,
      result: args.result ?? existing.result,
      error: args.error ?? existing.error,
      executedAt: args.status === "done" || args.status === "failed" ? Date.now() : undefined,
    });
    return await ctx.db.get(args.id);
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Lista as ações registradas (mais recentes primeiro), com filtro opcional. */
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("executing"),
        v.literal("done"),
        v.literal("failed"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    if (status) {
      return await ctx.db
        .query("user_actions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit ?? 30);
    }
    return await ctx.db
      .query("user_actions")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit ?? 30);
  },
});

/** Ações pendentes (para os executores externos consumirem). */
export const pending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("user_actions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit ?? 50);
  },
});

/** Contagem por status (para o painel). */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("user_actions").collect();
    return {
      total: all.length,
      pending: all.filter((a) => a.status === "pending").length,
      executing: all.filter((a) => a.status === "executing").length,
      done: all.filter((a) => a.status === "done").length,
      failed: all.filter((a) => a.status === "failed").length,
    };
  },
});
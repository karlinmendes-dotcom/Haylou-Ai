import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * PLATAFORMA MULTI-USUÁRIO — Health Connect / RPM.
 *
 * Evolução do app de dispositivo único para monitoramento remoto de
 * pacientes: cada aluno sincroniza métricas (via Google Health Connect,
 * Apple HealthKit ou o relógio BLE) e o treinador acompanha todos em um
 * painel central com alertas clínicos (BPM alto, SpO2 baixo, inatividade).
 */

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

/** Cadastra um usuário (trainer ou patient) na plataforma. */
export const registerUser = mutation({
  args: {
    name: v.string(),
    role: v.union(v.literal("trainer"), v.literal("patient")),
    age: v.number(),
    connectedDevice: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", {
      name: args.name,
      role: args.role,
      age: args.age,
      connectedDevice: args.connectedDevice,
    });
    return { id };
  },
});

/** Lista todos os usuários cadastrados. */
export const listUsers = query({
  args: {
    role: v.optional(v.union(v.literal("trainer"), v.literal("patient"))),
  },
  handler: async (ctx, { role }) => {
    const users = await ctx.db.query("users").collect();
    return role ? users.filter((u) => u.role === role) : users;
  },
});

// ---------------------------------------------------------------------------
// Métricas de saúde (Health Connect / HealthKit / relógio)
// ---------------------------------------------------------------------------

/**
 * Recebe os pacotes biométricos consolidados de um paciente e persiste
 * em `health_metrics`. Cada chamada cria uma nova linha (série temporal);
 * o dashboard consome a mais recente por usuário.
 */
export const syncMetrics = mutation({
  args: {
    userId: v.id("users"),
    bpm: v.optional(v.number()),
    spo2: v.optional(v.number()),
    stress: v.optional(v.number()),
    steps: v.optional(v.number()),
    calories: v.optional(v.number()),
    sleepHours: v.optional(v.number()),
    /** Timestamp ISO da sincronização (default: agora). */
    syncedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, syncedAt, ...metrics } = args;
    const id = await ctx.db.insert("health_metrics", {
      userId,
      ...metrics,
      syncedAt: syncedAt ?? new Date().toISOString(),
    });
    return { id };
  },
});

/**
 * Histórico de métricas de um paciente (para gráficos/detalhe no painel
 * do treinador), da mais recente para a mais antiga.
 */
export const getPatientHistory = query({
  args: {
    userId: v.id("users"),
    /** Máximo de registros retornados (default: 50). */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("health_metrics")
      .withIndex("by_userId_syncedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return limit && limit > 0 ? rows.slice(0, limit) : rows.slice(0, 50);
  },
});

/**
 * Painel central do Personal: todos os alunos cadastrados com suas
 * últimas métricas coletadas e a contagem de alertas abertos.
 */
export const getTrainerDashboard = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const rows: {
      user: (typeof users)[number];
      latestMetrics: Awaited<ReturnType<typeof ctx.db.get>> | null;
      openAlerts: number;
    }[] = [];

    for (const user of users) {
      const latest = await ctx.db
        .query("health_metrics")
        .withIndex("by_userId_syncedAt", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();
      const openAlerts = await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .collect();
      rows.push({ user, latestMetrics: latest ?? null, openAlerts: openAlerts.length });
    }
    return rows;
  },
});

// ---------------------------------------------------------------------------
// Alertas clínicos
// ---------------------------------------------------------------------------

/** Gera um alerta (BPM alto, SpO2 baixo, inatividade) para um paciente. */
export const createAlert = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("HIGH_BPM"), v.literal("LOW_SPO2"), v.literal("INACTIVITY")),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("alerts", {
      userId: args.userId,
      type: args.type,
      message: args.message,
      status: "PENDING",
    });
    return { id };
  },
});

/** Marca um alerta como resolvido. */
export const resolveAlert = mutation({
  args: { id: v.id("alerts") },
  handler: async (ctx, { id }) => {
    const alert = await ctx.db.get(id);
    if (!alert) return null;
    await ctx.db.patch(id, { status: "RESOLVED" });
    return await ctx.db.get(id);
  },
});

/** Lista alertas, com filtro opcional por usuário e status. */
export const listAlerts = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("PENDING"), v.literal("RESOLVED"))),
  },
  handler: async (ctx, { userId, status }) => {
    let q = ctx.db.query("alerts");
    if (userId) q = q.withIndex("by_userId", (qq) => qq.eq("userId", userId));
    if (status) q = q.filter((qq) => qq.eq(qq.field("status"), status));
    return await q.collect();
  },
});
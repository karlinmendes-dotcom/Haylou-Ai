import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { parseIntent } from "./intentParser";

/**
 * ROTAS HTTP DE AUTOMAÇÃO — porta de entrada/saída do ecossistema.
 *
 * Qualquer serviço externo (n8n, Make/Zapier, Android Accessibility, um
 * script de automação ou o app companion) pode enviar/consumir ações:
 *
 *   POST {CONVEX_URL}/http/actions        -> registra uma ação (intent explícita)
 *   POST {CONVEX_URL}/http/intent         -> converte texto livre em intenção + ação
 *   POST {CONVEX_URL}/http/actions/:id/status -> atualiza o status (executores)
 *   POST {CONVEX_URL}/http/actions/:id/dispatch -> executa uma ação pendente (ex.: WhatsApp)
 *   GET  {CONVEX_URL}/http/actions        -> lista ações (mais recentes)
 *   GET  {CONVEX_URL}/http/health         -> healthcheck do backend
 *
 * Ações SEND_WHATSAPP registradas via POST /actions são executadas
 * imediatamente pelo executor da Evolution API (convex/whatsapp.ts).
 *
 * As respostas incluem CORS liberado para o frontend e para chamadas de
 * servidores. Para uso público, proteja com um token via
 * CONVEX_HTTP_SECRET (comparado no header `x-haylou-secret`).
 */

const http = httpRouter();

/** Resposta JSON com CORS. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-haylou-secret",
    },
  });
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Se CONVEX_HTTP_SECRET estiver definido, exige o header de autenticação. */
function authorized(req: Request): boolean {
  const secret = process.env.CONVEX_HTTP_SECRET;
  if (!secret) return true; // sem segredo configurado -> aberto
  return req.headers.get("x-haylou-secret") === secret;
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return json({ ok: true, service: "haylou-ai-convex", ts: Date.now() });
  }),
});

/** Lista as ações registradas (para o frontend e executores externos). */
http.route({
  path: "/actions",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "30");
    const items = await ctx.runQuery(api.actions.list, {
      status: status as "pending" | "executing" | "done" | "failed" | undefined,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return json({ ok: true, items });
  }),
});

/** Registra uma ação enviada por webhook externo (intenção explícita). */
http.route({
  path: "/actions",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const body = (await readJson(req)) as Record<string, unknown> | null;
    if (!body || typeof body.intent !== "string") {
      return json({ error: "missing intent" }, 400);
    }
    const action = await ctx.runMutation(api.actions.register, {
      intent: body.intent,
      source: (body.source as "watch" | "voice" | "web" | "webhook") ?? "webhook",
      rawText: typeof body.rawText === "string" ? body.rawText : undefined,
      payload: body.payload,
      targetService: typeof body.targetService === "string" ? body.targetService : undefined,
    });
    // auto-dispara o executor para intenções de WhatsApp
    if (action.intent === "SEND_WHATSAPP") {
      try {
        const dispatch = await ctx.runAction(api.whatsapp.dispatch, {
          actionId: action.id as never,
        });
        return json({ ok: true, action, dispatch }, 201);
      } catch (err) {
        return json(
          { ok: true, action, dispatch: { success: false, reason: "DISPATCH_ERROR", error: String(err) } },
          201,
        );
      }
    }
    return json({ ok: true, action }, 201);
  }),
});

/** Executa manualmente uma ação pendente (ex.: reenviar um WhatsApp). */
http.route({
  path: "/actions/:id/dispatch",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const id = req.url.split("/").slice(-2)[0];
    const result = await ctx.runAction(api.whatsapp.dispatch, {
      actionId: id as never,
    });
    return json({ ok: true, ...result });
  }),
});

/** Converte texto livre em intenção + registra a ação (entrada de voz/IA). */
http.route({
  path: "/intent",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const body = (await readJson(req)) as Record<string, unknown> | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) return json({ error: "missing text" }, 400);
    if (!body) return json({ error: "missing body" }, 400);
    const parsed = parseIntent(text);
    const action = await ctx.runMutation(api.actions.registerFromText, {
      text,
      source: (body.source as "watch" | "voice" | "web" | "webhook") ?? "webhook",
    });
    return json({ ok: true, parsed, action }, 201);
  }),
});

/** Atualiza o status de uma ação (executores: n8n, app companion, etc.). */
http.route({
  path: "/actions/:id/status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const id = req.url.split("/").slice(-2)[0];
    const body = (await readJson(req)) as Record<string, unknown> | null;
    const status = body?.status as "pending" | "executing" | "done" | "failed" | undefined;
    if (!status) return json({ error: "missing status" }, 400);
    if (!body) return json({ error: "missing body" }, 400);
    const action = await ctx.runMutation(api.actions.setStatus, {
      id: id as never,
      status,
      result: body?.result,
      error: typeof body?.error === "string" ? body.error : undefined,
    });
    return json({ ok: true, action });
  }),
});

// CORS preflight
http.route({
  path: "/(.*)",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-haylou-secret",
      },
    });
  }),
});

export default http;
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

/**
 * EXECUTOR DO WHATSAPP — Evolution API (sem CNPJ/verificação Meta).
 *
 * Fluxo: o usuário/IA registra uma ação SEND_WHATSAPP em `user_actions`
 * (pelo /http/actions, voz ou relógio) → `dispatch` lê a ação pendente,
 * chama a Evolution API para enviar o texto real e devolve o status na
 * própria ação (done/failed) para o painel acompanhar.
 *
 * Variáveis de ambiente (dashboard do Convex -> Settings -> Environment):
 *   EVOLUTION_API_URL         ex.: https://api.sua-instancia.com
 *   EVOLUTION_API_KEY         apikey da instância (gerada no Evolution)
 *   EVOLUTION_INSTANCE_NAME   nome da instância criada no Evolution
 */

/** Normaliza um número brasileiro: remove símbolos e adiciona DDI 55. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  if (digits.length <= 11 && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

/** Formato do resultado do executor (evita inferência circular via `api`). */
export interface SendResult {
  success: boolean;
  reason?: string;
  status?: number;
  data?: unknown;
  error?: string;
  phone?: string;
  /** Id da ação executada (presente quando veio do dispatch). */
  actionId?: string;
}

/**
 * Dispara uma mensagem de texto REAL via Evolution API.
 * Retorna { success: true, data } ou { success: false, reason | error }.
 */
export const sendMessage = action({
  args: {
    recipientPhone: v.string(),
    messageText: v.string(),
  },
  handler: async (_ctx, args): Promise<SendResult> => {
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

    if (!apiUrl || !apiKey || !instanceName) {
      console.warn("Variáveis da Evolution API não configuradas no Convex.");
      return { success: false, reason: "ENV_MISSING" };
    }

    const phone = normalizePhone(args.recipientPhone);
    if (!phone) {
      return {
        success: false,
        reason: "INVALID_PHONE",
        error: `Número inválido: "${args.recipientPhone}". Envie no formato internacional (ex.: 5511999999999).`,
      };
    }

    try {
      const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: phone,
          text: args.messageText,
        }),
      });

      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        console.error("Evolution API respondeu erro:", response.status, data);
        return {
          success: false,
          reason: "HTTP_ERROR",
          status: response.status,
          data,
        };
      }
      return { success: true, data, phone };
    } catch (error) {
      console.error("Erro ao enviar mensagem via Evolution API:", error);
      return { success: false, reason: "NETWORK_ERROR", error: String(error) };
    }
  },
});

/**
 * Consome uma ação SEND_WHATSAPP pendente de `user_actions`, envia pelo
 * executor e registra o resultado na própria ação (executing → done/failed).
 * Aceita payload em dois formatos: { recipientPhone, messageText } ou
 * { target, message } (o que o parser de intenções produz).
 */
export const dispatch = action({
  args: {
    actionId: v.id("user_actions"),
  },
  handler: async (ctx, { actionId }): Promise<SendResult> => {
    const actionDoc = await ctx.runQuery(api.actions.getAction, { id: actionId });
    if (!actionDoc) return { success: false, reason: "NOT_FOUND" };
    if (actionDoc.intent !== "SEND_WHATSAPP") {
      return { success: false, reason: "NOT_WHATSAPP" };
    }
    if (actionDoc.status === "done" || actionDoc.status === "failed") {
      return { success: false, reason: "ALREADY_FINISHED" };
    }

    const payload = (actionDoc.payload ?? {}) as Record<string, unknown>;
    const recipientPhone =
      typeof payload.recipientPhone === "string"
        ? payload.recipientPhone
        : typeof payload.target === "string"
          ? payload.target
          : "";
    const messageText =
      typeof payload.messageText === "string"
        ? payload.messageText
        : typeof payload.message === "string"
          ? payload.message
          : "";

    if (!recipientPhone || !messageText) {
      await ctx.runMutation(api.actions.setStatus, {
        id: actionId,
        status: "failed",
        error: "Payload incompleto — informe recipientPhone e messageText (ou target e message).",
      });
      return { success: false, reason: "MISSING_FIELDS" };
    }

    await ctx.runMutation(api.actions.setStatus, { id: actionId, status: "executing" });

    const result: SendResult = await ctx.runAction(api.whatsapp.sendMessage, {
      recipientPhone,
      messageText,
    });

    if (result.success) {
      await ctx.runMutation(api.actions.setStatus, {
        id: actionId,
        status: "done",
        result: { phone: result.phone, data: result.data },
      });
    } else {
      await ctx.runMutation(api.actions.setStatus, {
        id: actionId,
        status: "failed",
        error:
          result.reason === "ENV_MISSING"
            ? "Evolution API não configurada — cadastre EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME no Convex."
            : result.reason === "INVALID_PHONE"
              ? String(result.error)
              : `Falha no envio: ${result.reason ?? "erro desconhecido"}`,
        result: result.data,
      });
    }

    return { ...result, actionId };
  },
});
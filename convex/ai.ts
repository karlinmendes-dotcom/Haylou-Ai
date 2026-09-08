import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Análise biométrica via Groq Cloud (LLM).
 *
 * A chave GROQ_API_KEY é lida apenas no servidor (variável de ambiente do
 * deploy do Convex) — nunca chega ao frontend. Se a chave não estiver
 * configurada, a action responde { ok: false, reason: "no_key" } e o
 * terminal mantém a análise local.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export const analyzeVitals = action({
  args: {
    bpm: v.number(),
    spo2: v.number(),
    stress: v.number(),
    steps: v.number(),
    calories: v.number(),
    anomaly: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { ok: false, reason: "no_key" };
    }

    const ritmo = args.anomaly
      ? "pico de frequência cardíaca em andamento"
      : "telemetria estável";

    const prompt =
      `Você é o assistente de saúde do relógio HAYLOU Solar Plus RT3 (LS16). ` +
      `Telemetria atual: BPM ${args.bpm}, SpO2 ${args.spo2.toFixed(1)}%, ` +
      `estresse ${args.stress}/100, ${args.steps} passos, ${args.calories} kcal, ` +
      `${ritmo}. Responda em português, em até 3 frases curtas: estado atual, ` +
      `o que observar e uma recomendação prática. Não faça diagnóstico médico.`;

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Assistente de análise biométrica conciso, direto e em português do Brasil.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 220,
        }),
      });

      if (!res.ok) {
        return { ok: false, reason: "http_error", status: res.status };
      }
      const data: { choices?: Array<{ message?: { content?: string } }> } =
        await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        return { ok: false, reason: "empty" };
      }
      return { ok: true, text: text.trim() };
    } catch {
      return { ok: false, reason: "network" };
    }
  },
});

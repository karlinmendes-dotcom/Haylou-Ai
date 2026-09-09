import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import type { VitalsReading } from "../hooks/useVitals";
import { EMERGENCY_BPM, type SendNotificationOptions } from "../hooks/useBluetoothWatch";
import {
  DEFAULT_CATEGORY,
  NOTIFICATION_CATEGORIES,
  type AppCategory,
} from "../lib/haylou-bluetooth/HaylouRT3Client";

interface Props {
  latest: VitalsReading;
  /** Envia a notificação universal para a tela AMOLED via BLE; resolve false se o relógio não estiver pareado. */
  onSendToWatch?: (text: string, options?: SendNotificationOptions) => Promise<boolean>;
}

type Tone = "ok" | "ai" | "alert" | "warn" | "sys";

interface Line {
  id: number;
  at: string;
  tone: Tone;
  text: string;
}

const META: Record<Tone, { cls: string; tag: string }> = {
  ok: { cls: "green", tag: "" },
  ai: { cls: "violet", tag: "IA" },
  alert: { cls: "red", tag: "ALERTA" },
  warn: { cls: "amber", tag: "AVISO" },
  sys: { cls: "soft", tag: "SYS" },
};

const now = () =>
  new Date().toLocaleTimeString("pt-BR", { hour12: false });

const stressLabel = (s: number) => (s < 35 ? "baixo" : s < 65 ? "moderado" : "alto");

/** Intervalo mínimo entre consultas automáticas de emergência (economia de cota). */
const EMERGENCY_COOLDOWN_MS = 60_000;

/**
 * Terminal do assistente de IA — 100% sob demanda.
 *
 * Regras de acionamento da IA (Groq via action do Convex):
 *  1. clique no botão "Consultar IA" (dados reais do relógio);
 *  2. gatilho de emergência real: BPM >= 150 vindo do relógio físico
 *     (máx. 1 consulta a cada 60 s);
 * Nada é analisado automaticamente em loop e nada é enviado ao modelo
 * enquanto o relógio estiver desconectado.
 */
export function AiTerminal({ latest, onSendToWatch }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<"idle" | "analyze" | "send">("idle");

  const latestRef = useRef(latest);
  latestRef.current = latest;

  const idRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const lastEmergencyRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  // categoria universal da notificação de teste (Web -> Relógio)
  const [category, setCategory] = useState<AppCategory>(DEFAULT_CATEGORY);

  const pushLine = useCallback((text: string, tone: Tone) => {
    idRef.current += 1;
    const id = idRef.current;
    setLines((prev) => [...prev, { id, at: now(), tone, text }].slice(-90));
  }, []);

  const setPhaseSafe = useCallback((p: "idle" | "analyze" | "send") => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  // feed inicial — apenas informativo, NENHUMA análise automática
  useEffect(() => {
    pushLine("link de telemetria estabelecido — aguardando conexão do LS16 via BLE", "sys");
    pushLine("IA sob demanda — nenhuma análise é disparada automaticamente", "sys");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasData = latest.bpm != null;

  /** Análise local (fallback) usando apenas a última leitura REAL. */
  const produceLines = useCallback((): Array<{ text: string; tone: Tone }> => {
    const r = latestRef.current;
    if (r.bpm == null || r.ts === 0) return [];

    const ritmo =
      r.bpm < 60 ? "repouso profundo" : r.bpm < 100 ? "faixa saudável" : "elevado";
    const out: Array<{ text: string; tone: Tone }> = [];

    if (r.spo2 != null && r.spo2 < 95) {
      out.push({
        tone: "alert",
        text: `Saturação de oxigênio em ${r.spo2.toFixed(1)}% (abaixo de 95%) — recomendo respirar fundo e repetir a medição em 1 min.`,
      });
    }

    // recomendação determinística (baseada na leitura REAL — sem aleatoriedade)
    let recomendacao: string;
    if (r.stress != null && r.stress >= 70) {
      recomendacao =
        r.bpm % 2 === 0
          ? "pausa curta + respiração 4-7-8 para baixar o estresse"
          : "check de hidratação — estresse elevado costuma acompanhar déficit hídrico";
    } else if (r.spo2 != null && r.spo2 < 96) {
      recomendacao = "postura ereta e respiração nasal lenta até a SpO2 normalizar";
    } else {
      recomendacao =
        r.bpm % 2 === 0
          ? "manter rotina — sinais vitais dentro do esperado"
          : "ótimo momento para uma caminhada leve de 10 min";
    }

    const detalhes = [
      `BPM ${r.bpm}`,
      r.spo2 != null ? `SpO2 ${r.spo2.toFixed(1)}%` : null,
      r.stress != null ? `estresse ${r.stress}/100 (${stressLabel(r.stress)})` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    out.push({
      tone: "ai",
      text: `Análise ${ritmo}: ${detalhes}. → ${recomendacao}.`,
    });
    return out;
  }, []);

  const convexClient = useConvex() as unknown as {
    action: (name: string, args: unknown) => Promise<unknown>;
  };

  // consulta o modelo real no backend (Groq via action do Convex);
  // devolve null quando a action ainda não está no deploy / sem chave / sem dados
  const consultGroq = useCallback(async (): Promise<string | null> => {
    const r = latestRef.current;
    if (r.bpm == null || r.ts === 0) return null;
    try {
      const timeout = new Promise<never>((_, reject) => {
        const id = window.setTimeout(() => reject(new Error("groq timeout")), 15000);
        timersRef.current.push(id);
      });
      const res = (await Promise.race([
        convexClient.action("ai:analyzeVitals", {
          bpm: r.bpm,
          spo2: r.spo2 ?? 0,
          stress: r.stress ?? 0,
          steps: r.steps ?? 0,
          calories: r.calories ?? 0,
          anomaly: r.bpm >= EMERGENCY_BPM,
        }),
        timeout,
      ])) as { ok?: boolean; text?: string };
      return res && res.ok === true && typeof res.text === "string" ? res.text : null;
    } catch {
      return null;
    }
  }, [convexClient]);

  // gatilho de emergência REAL: BPM >= 150 vindo do relógio físico.
  // Única chamada automática da IA — limitada a 1 a cada 60 s.
  useEffect(() => {
    const r = latestRef.current;
    if (r.bpm == null || r.bpm < EMERGENCY_BPM) return;
    const t = Date.now();
    if (t - lastEmergencyRef.current < EMERGENCY_COOLDOWN_MS) return;
    if (phaseRef.current !== "idle") return;
    lastEmergencyRef.current = t;
    pushLine(
      `Emergência real detectada: BPM ${r.bpm} (≥ ${EMERGENCY_BPM}) — acionando análise de acompanhamento.`,
      "alert",
    );
    setPhaseSafe("analyze");
    later(async () => {
      const groq = await consultGroq();
      if (!aliveRef.current) return;
      if (groq) {
        pushLine(groq, "ai");
      } else {
        pushLine(
          "IA remota indisponível — monitore o próximo ciclo e procure assistência se o pico persistir.",
          "warn",
        );
      }
      setPhaseSafe("idle");
    }, 400);
  }, [latest, later, pushLine, setPhaseSafe, consultGroq]);

  // rolagem automática
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, phase]);

  // limpeza
  useEffect(() => {
    aliveRef.current = true;
    const timers = timersRef.current;
    return () => {
      aliveRef.current = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const sendTest = async () => {
    if (phaseRef.current !== "idle") return;
    setPhaseSafe("send");
    const meta = NOTIFICATION_CATEGORIES[category];
    const text = `Haylou AI · ${hasData ? "análise concluída ✓" : "teste de notificação"}`;
    let ok = true;
    if (onSendToWatch) {
      ok = await onSendToWatch(text, { vibrate: true, category, title: meta.label });
    }
    if (!aliveRef.current) return;
    pushLine(
      ok
        ? `Notificação enviada ao relógio (${meta.icon} ${meta.label}): vibração + texto "${text}".`
        : `Relógio não conectado — envio BLE ignorado. Conecte o smartwatch para enviar (tentativa registrada: ${meta.icon} ${meta.label} — "${text}").`,
      ok ? "ok" : "warn",
    );
    setPhaseSafe("idle");
  };

  const askGroq = async () => {
    if (phaseRef.current !== "idle") return;
    if (!hasData) return; // sem leitura real não há o que analisar
    setPhaseSafe("analyze");
    const groq = await consultGroq();
    if (!aliveRef.current) return;
    if (groq) {
      pushLine(groq, "ai");
      pushLine("resposta gerada pelo modelo Groq · llama-3.3-70b-versatile", "sys");
    } else {
      pushLine(
        "IA remota (Groq) indisponível no momento — deploy do backend e chave GROQ_API_KEY pendentes. Análise local:",
        "warn",
      );
      for (const p of produceLines()) pushLine(p.text, p.tone);
    }
    setPhaseSafe("idle");
  };

  const chip =
    phase === "send" ? (
      <span className="ai-state work">
        <span className="led cyan led-pulse" />
        enviando notificação…
      </span>
    ) : phase === "analyze" ? (
      <span className="ai-state work">
        <span className={`led ${latest.anomaly ? "red led-pulse" : "cyan led-pulse"}`} />
        {latest.anomaly ? "analisando emergência…" : "analisando…"}
      </span>
    ) : (
      <span className="ai-state">
        <span
          className={`led ${
            !hasData ? "off" : latest.anomaly ? "red led-pulse" : "green"
          }`}
        />
        {!hasData
          ? "relógio desconectado — IA inativa"
          : latest.anomaly
            ? "emergência em monitoramento"
            : "IA sob demanda"}
      </span>
    );

  return (
    <section className="panel ai-panel" aria-label="terminal do assistente de IA">
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className="led violet" />
            assistente · convex ai
          </span>
          <h2 className="panel-title">
            Análise <span className="t-violet">sob demanda</span>
          </h2>
        </div>
        {chip}
      </div>

      <div className="ai-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="empty-note">inicializando o terminal de IA…</div>
        ) : (
          lines.map((l) => {
            const meta = META[l.tone];
            const tag = l.tone === "ok" ? "" : meta.tag;
            return (
              <div key={l.id} className={`log-line ${meta.cls} ${l.tone === "sys" ? "soft" : ""}`}>
                <time>{l.at}</time>
                <span className="arrow">›</span>
                <p>
                  {tag && <span className="tag">{tag}</span>}
                  {l.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="ai-foot">
        <button
          className="btn"
          onClick={() => void askGroq()}
          disabled={phase !== "idle" || !hasData}
          title={!hasData ? "Conecte o relógio para ter dados reais para analisar" : undefined}
        >
          <span className="send-ico" aria-hidden="true">
            ✦
          </span>
          {phase === "analyze" ? "Consultando IA…" : "Consultar IA (Groq)"}
        </button>

        <label className="cat-picker" title="categoria universal da notificação">
          <span className="cat-ico" aria-hidden="true">
            {NOTIFICATION_CATEGORIES[category].icon}
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AppCategory)}
            disabled={phase !== "idle"}
            aria-label="categoria da notificação de teste"
          >
            {(Object.keys(NOTIFICATION_CATEGORIES) as AppCategory[]).map((c) => (
              <option key={c} value={c}>
                {NOTIFICATION_CATEGORIES[c].icon} {NOTIFICATION_CATEGORIES[c].label}
              </option>
            ))}
          </select>
        </label>

        <button className="btn primary" onClick={sendTest} disabled={phase !== "idle"}>
          <span className="send-ico" aria-hidden="true">
            ⚡
          </span>
          {phase === "send" ? "Enviando…" : "Testar notificação no relógio"}
        </button>
        <span className="t-dim" style={{ fontSize: 11 }}>
          notificação universal (categoria + vibração) para a tela AMOLED — IA só sob demanda ou em
          emergência real (BPM ≥ {EMERGENCY_BPM}); sem chamadas automáticas
        </span>
      </div>
    </section>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import type { VitalsReading } from "../hooks/useVitals";

interface Props {
  latest: VitalsReading;
}

type Tone = "ok" | "ai" | "alert" | "warn" | "sys";

interface Line {
  id: number;
  at: string;
  tone: Tone;
  text: string;
}

const META: Record<Tone, { cls: string; tag: string }> = {
  ok: { cls: "green", tag: "OK" },
  ai: { cls: "violet", tag: "IA" },
  alert: { cls: "red", tag: "ALERTA" },
  warn: { cls: "amber", tag: "AVISO" },
  sys: { cls: "soft", tag: "SYS" },
};

const now = () =>
  new Date().toLocaleTimeString("pt-BR", { hour12: false });

const stressLabel = (s: number) => (s < 35 ? "baixo" : s < 65 ? "moderado" : "alto");

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function AiTerminal({ latest }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<"idle" | "analyze" | "send">("idle");

  const latestRef = useRef(latest);
  latestRef.current = latest;

  const idRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const lastStepsRef = useRef(latest.steps);
  const prevAnomalyRef = useRef(latest.anomaly);
  const prevStressHighRef = useRef(latest.stress >= 70);
  const timersRef = useRef<number[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  // feed inicial
  useEffect(() => {
    pushLine("link de telemetria estabelecido — aguardando dados do LS16", "sys");
    pushLine("módulo de análise habilitado · deploy moonlit-walrus-691", "sys");
    later(() => runAnalysis(), 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const produceLines = useCallback((): Array<{ text: string; tone: Tone }> => {
    const r = latestRef.current;
    if (r.ts === 0) return [];

    const stepDelta = Math.max(0, r.steps - lastStepsRef.current);
    lastStepsRef.current = r.steps;

    const ritmo =
      r.bpm < 60 ? "repouso profundo" : r.bpm < 100 ? "faixa saudável" : "elevado";
    const stress = stressLabel(r.stress);
    const out: Array<{ text: string; tone: Tone }> = [];

    if (r.spo2 < 95) {
      out.push({
        tone: "alert",
        text: `Saturação de oxigênio em ${r.spo2.toFixed(1)}% (abaixo de 95%) — recomendo respirar fundo e repetir a medição em 1 min.`,
      });
    }

    let recomendacao: string;
    if (r.stress >= 70) {
      recomendacao = pick([
        "pausa curta + respiração 4-7-8 para baixar o estresse",
        "check de hidratação — estresse elevado costuma acompanhar déficit hídrico",
      ]);
    } else if (r.spo2 < 96) {
      recomendacao = "postura ereta e respiração nasal lenta até a SpO2 normalizar";
    } else if (stepDelta >= 4) {
      recomendacao = "esforço detectado — manter cadência atual é seguro";
    } else {
      recomendacao = pick([
        "manter rotina — sinais vitais dentro do esperado",
        "ótimo momento para uma caminhada leve de 10 min",
      ]);
    }

    out.push({
      tone: "ai",
      text: `Análise ${ritmo}: BPM ${r.bpm} · SpO2 ${r.spo2.toFixed(1)}% · estresse ${r.stress}/100 (${stress}). → ${recomendacao}.`,
    });

    if (stepDelta > 0 && Math.random() < 0.5) {
      out.push({
        tone: "ai",
        text: `Registrados ${stepDelta} passos nesta janela · ${r.calories.toLocaleString("pt-BR")} kcal no dia.`,
      });
    }
    return out;
  }, []);

  const runAnalysis = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    setPhaseSafe("analyze");
    later(() => {
      const produced = produceLines();
      for (const p of produced) pushLine(p.text, p.tone);
      setPhaseSafe("idle");
    }, 1500);
  }, [later, produceLines, pushLine, setPhaseSafe]);

  // ciclo periódico de análise
  useEffect(() => {
    const id = window.setInterval(() => runAnalysis(), 7000);
    return () => window.clearInterval(id);
  }, [runAnalysis]);

  // transições de alerta (pico de frequência / estresse alto)
  useEffect(() => {
    const r = latestRef.current;
    const anomalyRising = r.anomaly && !prevAnomalyRef.current;
    const anomalyFalling = !r.anomaly && prevAnomalyRef.current;
    prevAnomalyRef.current = r.anomaly;

    const stressHigh = r.stress >= 70;
    const stressRising = stressHigh && !prevStressHighRef.current;
    const stressFalling = !stressHigh && prevStressHighRef.current;
    prevStressHighRef.current = stressHigh;

    if (anomalyRising) {
      setPhaseSafe("analyze");
      pushLine(
        `Pico de frequência detectado: BPM ${r.bpm} — cruzando com o acelerômetro e gerando alerta de acompanhamento.`,
        "alert",
      );
      later(() => setPhaseSafe("idle"), 1600);
    } else if (anomalyFalling) {
      pushLine(
        `Frequência normalizou para ${r.bpm} bpm. Evento registrado no histórico de sessão.`,
        "ok",
      );
    }
    if (stressRising) {
      pushLine(`Estresse subiu para ${r.stress}/100 — monitorando sinais de sobrecarga.`, "warn");
    } else if (stressFalling) {
      pushLine(`Estresse voltou a ${r.stress}/100 (${stressLabel(r.stress)}).`, "ok");
    }
  }, [latest, later, pushLine, setPhaseSafe]);

  // rolagem automática
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, phase]);

  // limpeza
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const sendTest = () => {
    if (phaseRef.current !== "idle") return;
    setPhaseSafe("send");
    later(() => {
      const r = latestRef.current;
      pushLine(
        `Notificação enviada ao relógio: vibração + texto "Haylou AI · ${r.anomaly ? "alerta de pico" : "análise concluída ✓"}".`,
        "ok",
      );
      setPhaseSafe("idle");
    }, 1100);
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
        {latest.anomaly ? "analisando pico…" : "analisando…"}
      </span>
    ) : (
      <span className="ai-state">
        <span className={`led ${latest.anomaly ? "red led-pulse" : "green"}`} />
        {latest.anomaly ? "pico em monitoramento" : "monitorando"}
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
            Análise <span className="t-violet">em tempo real</span>
          </h2>
        </div>
        {chip}
      </div>

      <div className="ai-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="empty-note">inicializando o stream de análise…</div>
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
        <button className="btn primary" onClick={sendTest} disabled={phase !== "idle"}>
          <span className="send-ico" aria-hidden="true">
            ⚡
          </span>
          {phase === "send" ? "Enviando…" : "Testar notificação no relógio"}
        </button>
        <span className="t-dim" style={{ fontSize: 11 }}>
          push de teste para a tela AMOLED do RT3 (canal BLE real chega com o pareamento)
        </span>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";

export interface VitalsReading {
  /** batimentos por minuto arredondados */
  bpm: number;
  /** saturação de oxigênio (%, 1 casa decimal) */
  spo2: number;
  /** estresse 0–100 */
  stress: number;
  /** passos acumulados na sessão */
  steps: number;
  /** calorias aproximadas */
  calories: number;
  /** pico transitório de frequência em andamento? */
  anomaly: boolean;
  /** timestamp da última leitura */
  ts: number;
}

const HISTORY_LEN = 96;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sampleBpm(now: number, baseline: number, boost: number): number {
  const wave =
    baseline +
    Math.sin(now / 11000) * 4 +
    Math.sin(now / 3700) * 1.6 +
    Math.sin(now / 1400) * 0.5 +
    (Math.random() - 0.5) * 2.4;
  return Math.round(clamp(wave + boost, 44, 172));
}

/**
 * Motor de telemetria do relógio.
 *
 * Gera, a cada segundo, uma leitura realista (BPM com variabilidade,
 * SpO2, estresse correlacionado à frequência, passos e calorias) e um
 * histórico em janela deslizante para o sparkline. Inclui eventos
 * esporádicos de pico de frequência ("anomalia") para exercitar os
 * alertas da interface. Quando o firmware do relógio enviar dados de
 * verdade (BLE/API), basta trocar a fonte deste hook por uma query
 * reativa do Convex.
 */
export function useVitals(): VitalsReading & { history: number[] } {
  const baselineRef = useRef(66 + Math.floor(Math.random() * 14)); // 66..79
  const anomalyEndRef = useRef(0);
  const anomalyDurRef = useRef(8000);
  const lastAnomalyRef = useRef(0);
  const stepsRef = useRef(0);
  const kcalRef = useRef(0);

  const [reading, setReading] = useState<VitalsReading>({
    bpm: 72,
    spo2: 97.6,
    stress: 21,
    steps: 0,
    calories: 1240,
    anomaly: false,
    ts: Date.now(),
  });
  const [history, setHistory] = useState<number[]>(() => {
    const now = Date.now();
    const arr: number[] = [];
    for (let i = 0; i < HISTORY_LEN; i++) {
      arr.push(sampleBpm(now - (HISTORY_LEN - i) * 1000, baselineRef.current, 0));
    }
    return arr;
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const baseline = baselineRef.current;
      const anomalyActive = now < anomalyEndRef.current;

      // ocasionalmente dispara um pico transitório de frequência
      if (!anomalyActive && now - lastAnomalyRef.current > 32000 && Math.random() < 0.012) {
        anomalyDurRef.current = 9000 + Math.random() * 9000;
        anomalyEndRef.current = now + anomalyDurRef.current;
        lastAnomalyRef.current = now;
      }

      const boost = anomalyActive
        ? Math.max(0, (anomalyEndRef.current - now) / anomalyDurRef.current) * 58
        : 0;
      const bpm = sampleBpm(now, baseline, boost);

      // passos: caminhada leve + impulso extra durante o pico
      let step = 0;
      if (Math.random() < 0.42) step += Math.floor(1 + Math.random() * 2);
      if (anomalyActive && Math.random() < 0.6) step += Math.floor(1 + Math.random() * 2);
      stepsRef.current += step;

      // calorias: repouso + gasto por passo
      kcalRef.current += step * 0.05 + 0.028 + (anomalyActive ? 0.5 : 0);

      const spo2Raw =
        97.4 + Math.sin(now / 9000) * 0.9 + (Math.random() - 0.5) * 0.8 - (anomalyActive ? 0.8 : 0);
      const stress = Math.round(
        clamp(
          16 + Math.max(0, bpm - baseline) * 2.4 + Math.sin(now / 19000) * 9 + (Math.random() - 0.5) * 7,
          4,
          96,
        ),
      );

      const next = {
        bpm,
        spo2: Math.round(clamp(spo2Raw, 93.5, 99.6) * 10) / 10,
        stress,
        steps: stepsRef.current,
        calories: Math.round(1240 + kcalRef.current + stepsRef.current * 0.05),
        anomaly: anomalyActive,
        ts: now,
      };
      setReading(next);
      setHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), bpm]);
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  return { ...reading, history };
}

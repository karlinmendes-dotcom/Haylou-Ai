import { useMemo } from "react";
import type { VitalsReading } from "../hooks/useVitals";

interface Props {
  reading: VitalsReading;
  history: number[];
}

const W = 600;
const H = 150;
const PAD_X = 2;
const PAD_Y = 14;

function buildPoints(history: number[]): { line: string; area: string } {
  const n = history.length;
  if (n === 0) return { line: "", area: "" };
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of history) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const pad = Math.max(6, (hi - lo) * 0.35);
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = PAD_X + (i / (n - 1)) * (W - PAD_X * 2);
    const y = PAD_Y + (1 - (history[i] - lo) / span) * (H - PAD_Y * 2);
    xs.push(x);
    ys.push(y);
  }
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
  const area = `${line}L${xs[xs.length - 1].toFixed(1)},${H}L${xs[0].toFixed(1)},${H}Z`;
  return { line, area };
}

export function HeartPanel({ reading, history }: Props) {
  const { line, area } = useMemo(() => buildPoints(history), [history]);

  const stats = useMemo(() => {
    if (history.length === 0) return { min: 0, avg: 0, max: 0 };
    const min = Math.min(...history);
    const max = Math.max(...history);
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    return { min, avg: Math.round(avg), max };
  }, [history]);

  return (
    <section
      className={`panel hr-panel ${reading.anomaly ? "red-mode" : ""}`}
      aria-label="telemetria de batimentos cardíacos"
    >
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className={`led ${reading.anomaly ? "red led-pulse" : "cyan"}`} />
            telemetria ao vivo
          </span>
          <h2 className="panel-title">
            Batimentos <span className="accent">cardíacos</span>
          </h2>
        </div>
        <div className="hr-top">
          {reading.anomaly ? (
            <span className="pill red">
              <span className="led red led-pulse" />
              pico detectado
            </span>
          ) : (
            <span className="pill green">
              <span className="led green" />
              ritmo estável
            </span>
          )}
        </div>
      </div>

      <div className="hr-hero">
        <div className="hr-value">
          <span className="num">{reading.bpm}</span>
          <span className="unit">bpm</span>
        </div>
        <div className="hr-label">batimentos por minuto · fonte LS16</div>
        <div className="hr-beat" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
          ))}
        </div>
      </div>

      <div className="hr-spark">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="gráfico do ritmo cardíaco nos últimos segundos">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={reading.anomaly ? "#ff2d6f" : "#00f0ff"} stopOpacity="0.28" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="100%" stopColor="#00ff87" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#areaGrad)" />
          <path
            d={line}
            fill="none"
            stroke={reading.anomaly ? "#ff2d6f" : "url(#lineGrad)"}
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${reading.anomaly ? "rgba(255,45,111,.6)" : "rgba(0,240,255,.45)"})` }}
          />
        </svg>
      </div>

      <div className="hr-foot">
        <span>
          janela <b className="t-mut">{history.length}s</b>
        </span>
        <span>
          mín <b className="t-cyan">{stats.min}</b>
        </span>
        <span>
          média <b className="t-mut">{stats.avg}</b>
        </span>
        <span>
          máx <b className={reading.anomaly ? "t-red" : "t-violet"}>{stats.max}</b>
        </span>
        <span>
          amostra{" "}
          <b className="t-green">
            {new Date(reading.ts).toLocaleTimeString("pt-BR", { hour12: false })}
          </b>
        </span>
      </div>
    </section>
  );
}

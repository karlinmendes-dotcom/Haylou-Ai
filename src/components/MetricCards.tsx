import type { VitalsReading } from "../hooks/useVitals";

interface Props {
  reading: VitalsReading;
}

const GOAL_STEPS = 10000;
const GOAL_KCAL = 2500;
const RING_C = 2 * Math.PI * 40;

function stressZone(s: number): { label: string; cls: string } {
  if (s < 35) return { label: "baixo", cls: "green" };
  if (s < 65) return { label: "moderado", cls: "amber" };
  return { label: "alto", cls: "red" };
}

function Spo2Card({ spo2 }: { spo2: number | null }) {
  const pct = spo2 != null ? Math.min(spo2, 100) / 100 : 0;
  const offset = RING_C * (1 - pct);
  const ok = spo2 != null && spo2 >= 95;
  return (
    <article className="panel m-card" aria-label="oxigenação do sangue">
      <div className="m-head">
        <span className="m-label">Oxigenação</span>
        <span className={`led ${spo2 == null ? "off" : ok ? "cyan" : "red led-pulse"}`} />
      </div>
      <div className={`ring-wrap ${ok ? "cyan" : "red"}`}>
        <svg width="92" height="92" viewBox="0 0 96 96">
          <circle className="ring-bg" cx="48" cy="48" r="40" strokeWidth="9" fill="none" />
          <circle
            className="ring-fg"
            cx="48"
            cy="48"
            r="40"
            strokeWidth="9"
            fill="none"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="ring-center">
          <div>
            <b>{spo2 != null ? spo2.toFixed(1) : "--"}</b>
            <span>spo2 %</span>
          </div>
        </div>
      </div>
      <div className={`m-sub ${spo2 == null ? "t-dim" : ok ? "t-mut" : "t-red"}`}>
        {spo2 == null ? "aguardando medição do relógio" : ok ? "normal · alvo ≥ 95%" : "abaixo do alvo · atenção"}
      </div>
    </article>
  );
}

function StressCard({ stress }: { stress: number | null }) {
  const zone = stress != null ? stressZone(stress) : null;
  const segs = stress != null ? Math.max(1, Math.round(stress / 10)) : 0;
  return (
    <article className="panel m-card" aria-label="nível de estresse">
      <div className="m-head">
        <span className="m-label">Estresse</span>
        <span className={`led ${zone ? zone.cls : "off"}`} />
      </div>
      <div className="m-main">
        <span
          className={`m-value ${
            zone
              ? `v-${zone.cls === "green" ? "green" : zone.cls === "amber" ? "amber" : "red"}`
              : ""
          }`}
        >
          {stress ?? "--"}
          {stress != null && <small>/100</small>}
        </span>
      </div>
      <div
        className={`seg-row ${zone?.cls ?? ""}`}
        role="meter"
        aria-valuenow={stress ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="nível de estresse"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className={`seg ${i < segs ? "on" : ""}`} />
        ))}
      </div>
      <div className="m-sub">
        {zone ? (
          <>
            <span className="t-dim">nível </span>
            <span className={`t-${zone.cls === "green" ? "green" : zone.cls === "amber" ? "amber" : "red"}`}>
              {zone.label}
            </span>
            <span className="t-dim"> · baseado no ritmo cardíaco</span>
          </>
        ) : (
          <span className="t-dim">aguardando medição do relógio</span>
        )}
      </div>
    </article>
  );
}

function StepsCard({ steps }: { steps: number | null }) {
  const pct = steps != null ? Math.min(100, (steps / GOAL_STEPS) * 100) : 0;
  return (
    <article className="panel m-card" aria-label="passos">
      <div className="m-head">
        <span className="m-label">Passos</span>
        <span className="led off" />
      </div>
      <div className="m-main">
        <span className="m-value v-green">{steps != null ? steps.toLocaleString("pt-BR") : "--"}</span>
      </div>
      <div
        className="bar"
        role="meter"
        aria-valuenow={steps ?? 0}
        aria-valuemin={0}
        aria-valuemax={GOAL_STEPS}
        aria-label="progresso da meta de passos"
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="m-sub">
        {steps != null ? (
          <>
            <span className="t-dim">meta </span>
            <span className="t-green">{GOAL_STEPS.toLocaleString("pt-BR")}</span>
            <span className="t-dim"> · {pct.toFixed(1)}% concluído</span>
          </>
        ) : (
          <span className="t-dim">aguardando leitura do pedômetro</span>
        )}
      </div>
    </article>
  );
}

function CaloriesCard({ calories }: { calories: number | null }) {
  const pct = calories != null ? Math.min(100, (calories / GOAL_KCAL) * 100) : 0;
  return (
    <article className="panel m-card" aria-label="calorias">
      <div className="m-head">
        <span className="m-label">Calorias</span>
        <span className="led violet off" />
      </div>
      <div className="m-main">
        <span className="m-value">
          {calories != null ? calories.toLocaleString("pt-BR") : "--"}
          {calories != null && <small>kcal</small>}
        </span>
      </div>
      <div className="bar" role="meter" aria-valuenow={calories ?? 0} aria-valuemin={0} aria-valuemax={GOAL_KCAL} aria-label="progresso de calorias">
        <i
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg,#a78bfa,#00f0ff)",
            boxShadow: "0 0 10px rgba(167,139,250,.5)",
          }}
        />
      </div>
      <div className="m-sub">
        {calories != null ? (
          <>
            <span className="t-dim">gasto estimado do dia · </span>
            <span className="t-violet">{calories.toLocaleString("pt-BR")} kcal</span>
          </>
        ) : (
          <span className="t-dim">aguardando leitura do relógio</span>
        )}
      </div>
    </article>
  );
}

export function MetricCards({ reading }: Props) {
  return (
    <section className="metrics-grid" aria-label="métricas de saúde">
      <Spo2Card spo2={reading.spo2} />
      <StressCard stress={reading.stress} />
      <StepsCard steps={reading.steps} />
      <CaloriesCard calories={reading.calories} />
    </section>
  );
}
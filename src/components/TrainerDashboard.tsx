import { useEffect, useState } from "react";
import type { GenericId } from "convex/values";

type UserId = GenericId<"users">;
import { useMutation, useQuery } from "convex/react";
import { api } from "../ConvexClientProvider";
import { ErrorBoundary } from "./ErrorBoundary";

/* ============================================================
   TIPOS (espelham o schema do Convex — health.ts)
   ============================================================ */

interface UserDoc {
  _id: string;
  name: string;
  role: "trainer" | "patient";
  age: number;
  connectedDevice: string;
}

interface HealthMetricDoc {
  _id: string;
  userId: string;
  bpm?: number;
  spo2?: number;
  stress?: number;
  steps?: number;
  calories?: number;
  sleepHours?: number;
  syncedAt: string;
}

interface DashboardRow {
  user: UserDoc;
  latestMetrics: HealthMetricDoc | null;
  openAlerts: number;
}

interface AlertDoc {
  _id: string;
  userId: string;
  type: "HIGH_BPM" | "LOW_SPO2" | "INACTIVITY";
  message: string;
  status: "PENDING" | "RESOLVED";
}

/** Limites de segurança (regra de alerta do monitoramento remoto). */
const MAX_RESTING_BPM = 130;
const MIN_SPO2 = 90;
const SYNC_STALE_MS = 12 * 60 * 60 * 1000;

/* ============================================================
   HELPERS
   ============================================================ */

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return "agora";
  const m = Math.floor(d / 60_000);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function fmtHm(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Cor do avatar a partir do nome (paleta do tema). */
function avatarHue(name: string): string {
  const hues = ["#00f0ff", "#a78bfa", "#00ff87", "#ffc857", "#ff2d6f", "#7000ff"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

/** Classe CSS por valor (reusa o tema). */
function toneFor(value: number | undefined, ok: boolean): string {
  if (value == null) return "";
  return ok ? "v-green" : "v-red";
}

/* ============================================================
   STATUS DO PACIENTE (verde / amarelo / vermelho)
   ============================================================ */

function statusOf(m: HealthMetricDoc | null, openAlerts: number): { tone: string; label: string } {
  if (m == null) {
    return { tone: "amber", label: "sem sincronização" };
  }
  const stale = Date.now() - new Date(m.syncedAt).getTime() > SYNC_STALE_MS;
  const highBpm = m.bpm != null && m.bpm > MAX_RESTING_BPM;
  const lowSpo2 = m.spo2 != null && m.spo2 < MIN_SPO2;
  if (highBpm || lowSpo2 || openAlerts > 0) {
    const why = highBpm ? `BPM ${m.bpm} > ${MAX_RESTING_BPM}` : lowSpo2 ? `SpO2 ${m.spo2}% < ${MIN_SPO2}%` : `${openAlerts} alerta(s)`;
    return { tone: "red", label: `alerta · ${why}` };
  }
  if (stale) return { tone: "amber", label: "sem sync há +12h" };
  return { tone: "green", label: "sinais normais" };
}

/* ============================================================
   GRÁFICO DE HISTÓRICO (SVG — sem lib externa)
   ============================================================ */

function HrChart({ rows }: { rows: HealthMetricDoc[] }) {
  const pts = rows
    .filter((r) => r.bpm != null)
    .slice()
    .reverse();
  if (pts.length < 2) {
    return <div className="empty-note">poucos pontos de BPM ainda — aguardando mais sincronizações</div>;
  }
  const W = 560;
  const H = 150;
  const PAD = 8;
  const min = Math.min(...pts.map((p) => p.bpm as number)) - 8;
  const max = Math.max(...pts.map((p) => p.bpm as number)) + 8;
  const span = Math.max(1, max - min);
  const stepX = (W - PAD * 2) / (pts.length - 1);
  const coords = pts.map((p, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((p.bpm as number) - min) * ((H - PAD * 2) / span);
    return { x, y, bpm: p.bpm as number, syncedAt: p.syncedAt };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;

  return (
    <div className="hr-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="histórico de batimentos">
        <defs>
          <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,240,255,0.28)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#hr-fill)" />
        <path d={path} fill="none" stroke="var(--cyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 4 : 2.4}
            fill={i === coords.length - 1 ? "var(--cyan)" : "rgba(0,240,255,0.55)"}
          >
            <title>{`${fmtHm(c.syncedAt)} — ${c.bpm} bpm`}</title>
          </circle>
        ))}
      </svg>
      <div className="hr-foot">
        <span>
          <b>{Math.round(min + 8)}</b> min
        </span>
        <span>
          última: <b>{pts[pts.length - 1].bpm} bpm</b> · {fmtHm(pts[pts.length - 1].syncedAt)}
        </span>
        <span>
          <b>{Math.round(max - 8)}</b> max
        </span>
      </div>
    </div>
  );
}

function SleepChart({ rows }: { rows: HealthMetricDoc[] }) {
  const pts = rows
    .filter((r) => r.sleepHours != null)
    .slice()
    .reverse()
    .slice(-7);
  if (pts.length === 0) {
    return <div className="empty-note">sem dados de sono ainda — a sincronização do sono aparece aqui</div>;
  }
  const maxH = Math.max(10, ...pts.map((p) => p.sleepHours as number));
  return (
    <div className="sleep-chart">
      {pts.map((p, i) => (
        <div className="sleep-col" key={i}>
          <span className="mono t-dim">{p.sleepHours}h</span>
          <div className="sleep-bar-wrap">
            <i
              className={p.sleepHours != null && p.sleepHours >= 7 ? "sleep-bar ok" : "sleep-bar"}
              style={{ height: `${Math.max(6, ((p.sleepHours as number) / maxH) * 100)}%` }}
            />
          </div>
          <span className="mono t-dim">{fmtHm(p.syncedAt)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MODAL DE DETALHE DO ALUNO
   ============================================================ */

function PatientModal({ userId, onClose }: { userId: UserId; onClose: () => void }) {
  const users = useQuery(api.health.listUsers, {});
  const history = useQuery(api.health.getPatientHistory, { userId, limit: 60 });
  const alerts = useQuery(api.health.listAlerts, { userId });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const user = users?.find((u: UserDoc) => u._id === userId);
  const rows = history ?? [];
  const latest = rows[0] ?? null;
  const pendingAlerts = (alerts ?? []).filter((a: AlertDoc) => a.status === "PENDING");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={user?.name ?? "detalhes do aluno"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-user">
            <span className="p-avatar" style={{ background: avatarHue(user?.name ?? "?") }}>
              {initials(user?.name ?? "?")}
            </span>
            <div>
              <h3>{user?.name ?? "Aluno"}</h3>
              <span className="mono t-dim">
                {user?.connectedDevice || "sem dispositivo"} · {user?.age ?? "–"} anos
              </span>
            </div>
          </div>
          <button className="btn modal-close" onClick={onClose} aria-label="fechar">
            ✕
          </button>
        </div>

        {latest && (
          <div className="modal-metrics">
            <div className="p-stat">
              <span className="m-label">BPM atual</span>
              <b className={`m-value ${toneFor(latest.bpm, (latest.bpm ?? 0) <= MAX_RESTING_BPM)}`}>
                {latest.bpm ?? "--"}<small>bpm</small>
              </b>
            </div>
            <div className="p-stat">
              <span className="m-label">SpO2</span>
              <b className={`m-value ${toneFor(latest.spo2, (latest.spo2 ?? 100) >= MIN_SPO2)}`}>
                {latest.spo2 != null ? latest.spo2.toFixed(1) : "--"}<small>%</small>
              </b>
            </div>
            <div className="p-stat">
              <span className="m-label">Passos hoje</span>
              <b className="m-value v-green">{latest.steps ?? "--"}</b>
            </div>
            <div className="p-stat">
              <span className="m-label">Sono</span>
              <b className="m-value">{latest.sleepHours != null ? latest.sleepHours.toFixed(1) : "--"}<small>h</small></b>
            </div>
            <div className="p-stat">
              <span className="m-label">Calorias</span>
              <b className="m-value">{latest.calories ?? "--"}</b>
            </div>
            <div className="p-stat">
              <span className="m-label">Sync</span>
              <b className="m-value" style={{ fontSize: 18 }}>{latest.syncedAt ? timeAgo(latest.syncedAt) : "--"}</b>
            </div>
          </div>
        )}

        <div className="modal-section">
          <span className="kicker">histórico de batimentos</span>
          <HrChart rows={rows} />
        </div>

        <div className="modal-section">
          <span className="kicker">sono · últimas 7 sincronizações</span>
          <SleepChart rows={rows} />
        </div>

        <div className="modal-section">
          <span className="kicker">alertas clínicos</span>
          {pendingAlerts.length === 0 ? (
            <div className="empty-note">nenhum alerta pendente</div>
          ) : (
            <div className="alert-list">
              {pendingAlerts.map((a: AlertDoc) => (
                <div className="alert-row" key={a._id}>
                  <span className="led red led-pulse" />
                  <span className="db-name">
                    <b>{a.type.replace(/_/g, " ")}</b>
                    <span>{a.message}</span>
                  </span>
                  <span className={`pill red`}>pendente</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HANDLER HEALTH CONNECT (client-side → health.syncMetrics)
   ============================================================ */

export interface HealthConnectPacket {
  userId: string;
  bpm?: number;
  spo2?: number;
  stress?: number;
  steps?: number;
  calories?: number;
  sleepHours?: number;
  syncedAt?: string;
}

/**
 * Converte um pacote formatado (vindo do Google Health Connect no Android,
 * do Apple HealthKit ou de qualquer leitor de saúde) em uma chamada
 * health.syncMetrics no Convex — persistência real, sem simulação.
 */
export async function pushHealthConnectPacket(packet: HealthConnectPacket): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!packet || typeof packet.userId !== "string" || packet.userId.length === 0) {
    return { ok: false, error: "campo userId é obrigatório" };
  }
  if (
    packet.bpm == null &&
    packet.spo2 == null &&
    packet.stress == null &&
    packet.steps == null &&
    packet.calories == null &&
    packet.sleepHours == null
  ) {
    return { ok: false, error: "pacote sem nenhuma métrica — envie ao menos um campo (bpm, spo2, steps…)" };
  }
  // registra o handler global para a ponte Android (WebView) chamar sem import
  return await syncPacket(packet);
}

let syncPacket: (p: HealthConnectPacket) => Promise<{ ok: true } | { ok: false; error: string }> = async () => ({
  ok: false,
  error: "mutation ainda não inicializada",
});

function HealthConnectSync() {
  const users = useQuery(api.health.listUsers, { role: "patient" });
  const syncMetrics = useMutation(api.health.syncMetrics);
  const [userId, setUserId] = useState("");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // injeta o handler real — a ponte Android/automação chama
  // window.__haylouHealthConnectSync({...}) ou pushHealthConnectPacket(...)
  useEffect(() => {
    syncPacket = async (packet) => {
      try {
        await syncMetrics({
          userId: packet.userId as UserId,
          bpm: packet.bpm,
          spo2: packet.spo2,
          stress: packet.stress,
          steps: packet.steps,
          calories: packet.calories,
          sleepHours: packet.sleepHours,
          syncedAt: packet.syncedAt ?? new Date().toISOString(),
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "falha na sincronização" };
      }
    };
    const w = window as unknown as Record<string, unknown>;
    w.__haylouHealthConnectSync = async (p: unknown) => {
      return pushHealthConnectPacket(p as HealthConnectPacket);
    };
    return () => {
      delete w.__haylouHealthConnectSync;
    };
  }, [syncMetrics]);

  const patients = (users ?? []).filter((u: UserDoc) => u.role === "patient");
  const firstId = patients[0]?._id;

  useEffect(() => {
    if (!userId && firstId) setUserId(firstId);
  }, [firstId, userId]);

  const send = async () => {
    setResult(null);
    if (!userId) {
      setResult("selecione um aluno para sincronizar");
      return;
    }
    let packet: HealthConnectPacket;
    try {
      packet = JSON.parse(raw) as HealthConnectPacket;
    } catch {
      setResult("JSON inválido — verifique o formato do pacote");
      return;
    }
    setBusy(true);
    const res = await pushHealthConnectPacket({ ...packet, userId });
    setBusy(false);
    setResult(res.ok ? `✓ métricas persistidas em health_metrics (${new Date().toLocaleTimeString("pt-BR")})` : `✗ ${res.error}`);
  };

  return (
    <div className="panel hc-panel">
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className="led green" />
            google health connect · android
          </span>
          <h2 className="panel-title">
            Sync <span className="accent">Health Connect</span>
          </h2>
        </div>
        <span className="pill green">
          <span className="led green" />
          ponte pronta
        </span>
      </div>

      <p className="hc-desc">
        Os dados vêm dos <b>apps oficiais dos relógios</b> (Haylou Fun, Mi Fitness, Health Connect do
        Android…). O app companion ou a automação envia o pacote formatado aqui — e ele é persistido em
        <code> health_metrics</code> via <code>health.syncMetrics</code>. Sem simulação: só grava o que chega
        de verdade.
      </p>

      <div className="hc-controls">
        <label className="hc-field">
          <span className="m-label">Aluno</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {patients.length === 0 && <option value="">nenhum paciente cadastrado</option>}
            {patients.map((u: UserDoc) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="hc-field hc-raw">
          <span className="m-label">Pacote Health Connect (JSON)</span>
          <textarea
            className="voice-input"
            placeholder={'{"bpm": 74, "spo2": 97.2, "steps": 8421, "sleepHours": 7.5}'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
          />
        </label>

        <button className="btn primary" onClick={() => void send()} disabled={busy || !raw.trim()}>
          {busy ? "sincronizando…" : "Enviar pacote → Convex"}
        </button>
      </div>

      {result && (
        <p className={result.startsWith("✓") ? "voice-ok" : "voice-notice"} style={{ marginTop: 10 }}>
          {result}
        </p>
      )}

      <p className="hc-hint mono">
        integração: <code>window.__haylouHealthConnectSync(packet)</code> — a ponte Android/WebView chama essa
        função com o payload acima.
      </p>
    </div>
  );
}

/* ============================================================
   DASHBOARD PRINCIPAL
   ============================================================ */

function TrainerDashboardContent() {
  const dashboard = useQuery(api.health.getTrainerDashboard);
  const patients = useQuery(api.health.listUsers, { role: "patient" });
  const registerUser = useMutation(api.health.registerUser);

  const [detailId, setDetailId] = useState<UserId | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [device, setDevice] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const rows = dashboard ?? [];
  const patientRows = rows.filter((r) => r.user.role === "patient");
  const totalAlerts = patientRows.reduce((acc, r) => acc + r.openAlerts, 0);
  const greenCount = patientRows.filter((r) => statusOf(r.latestMetrics, r.openAlerts).tone === "green").length;
  const warnCount = patientRows.filter((r) => statusOf(r.latestMetrics, r.openAlerts).tone === "amber").length;
  const alertCount = patientRows.filter((r) => statusOf(r.latestMetrics, r.openAlerts).tone === "red").length;

  const addPatient = async () => {
    setAddMsg(null);
    if (!name.trim()) {
      setAddMsg("informe o nome do aluno");
      return;
    }
    const parsedAge = Number.parseInt(age, 10);
    if (Number.isNaN(parsedAge) || parsedAge <= 0) {
      setAddMsg("informe uma idade válida");
      return;
    }
    await registerUser({
      name: name.trim(),
      role: "patient",
      age: parsedAge,
      connectedDevice: device.trim() || "HAYLOU Solar Plus RT3",
    });
    setName("");
    setAge("");
    setDevice("");
    setShowAdd(false);
    setAddMsg("aluno cadastrado ✓");
  };

  return (
    <section className="db-section">
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className="led cyan" />
            central de monitoramento · rpm
          </span>
          <h2 className="panel-title" style={{ fontSize: 18 }}>
            Dashboard do <span className="accent">Personal Trainer</span>
          </h2>
        </div>
        <div className="td-head-actions">
          {rows !== undefined && patientRows.length > 0 && (
            <span className="td-summary">
              <span className="pill green">
                <span className="led green" />
                {greenCount} ok
              </span>
              <span className="pill amber">
                <span className="led amber" />
                {warnCount} atenção
              </span>
              <span className="pill red">
                <span className="led red" />
                {alertCount} alerta
              </span>
            </span>
          )}
          <button className="btn primary" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancelar" : "+ Cadastrar aluno"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="add-form panel">
          <div className="add-fields">
            <label className="hc-field">
              <span className="m-label">Nome</span>
              <input
                className="voice-input"
                style={{ minHeight: 0, height: 40 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Maria Silva"
              />
            </label>
            <label className="hc-field" style={{ maxWidth: 120 }}>
              <span className="m-label">Idade</span>
              <input
                className="voice-input"
                style={{ minHeight: 0, height: 40 }}
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="28"
              />
            </label>
            <label className="hc-field">
              <span className="m-label">Dispositivo</span>
              <input
                className="voice-input"
                style={{ minHeight: 0, height: 40 }}
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="HAYLOU Solar Plus RT3"
              />
            </label>
            <button className="btn primary" onClick={() => void addPatient()} style={{ alignSelf: "flex-end" }}>
              Salvar aluno
            </button>
          </div>
          {addMsg && (
            <p className={addMsg.endsWith("✓") ? "voice-ok" : "voice-notice"} style={{ margin: "10px 0 0" }}>
              {addMsg}
            </p>
          )}
        </div>
      )}

      {rows === undefined || patients === undefined ? (
        <div className="td-grid">
          {[0, 1, 2].map((i) => (
            <div className="panel p-card" key={i}>
              <div className="sk" style={{ width: "60%", marginBottom: 12 }} />
              <div className="sk" style={{ width: "90%" }} />
              <div className="sk" style={{ width: "70%" }} />
            </div>
          ))}
        </div>
      ) : patientRows.length === 0 ? (
        <div className="panel empty-note" style={{ padding: 30 }}>
          nenhum aluno cadastrado ainda — clique em <b>“+ Cadastrar aluno”</b> para adicionar o primeiro
          paciente. Os dados chegam via Health Connect / app oficial do relógio.
        </div>
      ) : (
        <div className="td-grid">
          {patientRows.map((row) => {
            const { user, latestMetrics: m, openAlerts } = row;
            const st = statusOf(m, openAlerts);
            return (
              <button
                type="button"
                className={`panel p-card tone-${st.tone}`}
                key={user._id}
                onClick={() => setDetailId(user._id)}
              >
                <div className="p-head">
                  <span className="p-avatar" style={{ background: avatarHue(user.name) }}>
                    {initials(user.name)}
                  </span>
                  <span className="p-id">
                    <b>{user.name}</b>
                    <span className="mono t-dim">
                      {user.connectedDevice || "sem dispositivo"} · {user.age} anos
                    </span>
                  </span>
                  <span className={`pill ${st.tone}`}>
                    <span className={`led ${st.tone} ${st.tone === "green" ? "led-pulse" : st.tone === "red" ? "led-pulse" : "off"}`} />
                    {st.label}
                  </span>
                </div>

                <div className="p-stats">
                  <div className="p-stat">
                    <span className="m-label">BPM</span>
                    <b className={`m-value ${toneFor(m?.bpm, (m?.bpm ?? 0) <= MAX_RESTING_BPM)}`}>
                      {m?.bpm ?? "--"}
                    </b>
                  </div>
                  <div className="p-stat">
                    <span className="m-label">SpO2</span>
                    <b className={`m-value ${toneFor(m?.spo2, (m?.spo2 ?? 100) >= MIN_SPO2)}`}>
                      {m?.spo2 != null ? m.spo2.toFixed(1) : "--"}
                    </b>
                  </div>
                  <div className="p-stat">
                    <span className="m-label">Passos</span>
                    <b className="m-value">{m?.steps != null ? m.steps.toLocaleString("pt-BR") : "--"}</b>
                  </div>
                  <div className="p-stat">
                    <span className="m-label">Sono</span>
                    <b className="m-value">{m?.sleepHours != null ? m.sleepHours.toFixed(1) : "--"}</b>
                  </div>
                </div>

                <div className="p-foot">
                  <span className="mono t-dim">
                    {m ? `última sync ${timeAgo(m.syncedAt)} · ${fmtHm(m.syncedAt)}` : "aguardando primeira sincronização"}
                  </span>
                  <span className="p-open mono">
                    {openAlerts > 0 ? `${openAlerts} alerta(s)` : "ver detalhes →"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <HealthConnectSync />

      {detailId && <PatientModal userId={detailId} onClose={() => setDetailId(null)} />}
    </section>
  );
}

const fallback = (
  <section className="db-section">
    <div className="offline-hero">
      <span className="led red off" />
      <span>Dashboard indisponível — o Convex não respondeu. As demais seções seguem ativas.</span>
    </div>
  </section>
);

export function TrainerDashboard() {
  return (
    <ErrorBoundary fallback={fallback}>
      <TrainerDashboardContent />
    </ErrorBoundary>
  );
}
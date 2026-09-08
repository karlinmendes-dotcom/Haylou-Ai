import { useQuery } from "convex/react";
import { api } from "../ConvexClientProvider";
import { ErrorBoundary } from "./ErrorBoundary";

interface DeviceDoc {
  _id: string;
  name: string;
  model: string;
  battery: number;
  firmware: string;
  lastSync: number;
  status: string;
}

interface SessionDoc {
  _id: string;
  deviceName: string;
  startedAt: number;
  endedAt?: number;
  type: string;
}

interface SettingDoc {
  _id: string;
  key: string;
  value: string;
}

interface BiometricDoc {
  _id: string;
  deviceId: string;
  bpm: number;
  spo2?: number;
  stress?: number;
  battery?: number;
  timestamp: number;
}

interface NotificationDoc {
  _id: string;
  deviceId?: string;
  message: string;
  sentAt: number;
  status: "sent" | "failed" | "pending";
  vibrationPattern?: string;
}

const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function rel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 45_000) return "agora";
  const m = Math.floor(d / 60_000);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  return `há ${days} d`;
}

const TYPE_LABEL: Record<string, string> = {
  exercicio: "Exercício",
  sono: "Sono",
  corrida: "Corrida",
  caminhada: "Caminhada",
};

function deviceTone(status: string): string {
  if (status === "online") return "green";
  if (status === "syncing") return "amber";
  return "red";
}

function DeviceList() {
  const devices = useQuery(api.devices.listDevices);
  if (devices === undefined) {
    return (
      <>
        <div className="sk" style={{ width: "82%" }} />
        <div className="sk" style={{ width: "64%" }} />
      </>
    );
  }
  if (devices.length === 0) {
    return <div className="empty-note">nenhum dispositivo cadastrado — rode a seed do Convex</div>;
  }
  return (
    <>
      {devices.map((d: DeviceDoc) => {
        const tone = deviceTone(d.status);
        const batTone = d.battery > 40 ? "green" : d.battery > 15 ? "amber" : "red";
        return (
          <div className="db-row" key={d._id}>
            <span className={`led ${tone} ${d.status === "online" ? "led-pulse" : d.status === "syncing" ? "led-pulse" : "off"}`} />
            <span className="db-name">
              <b>{d.name.replace(/^Haylou\s+/i, "")}</b>
              <span>
                sync {rel(d.lastSync)}
              </span>
            </span>
            <span className="db-side">
              <span className="model-tag">{d.model} · fw {d.firmware}</span>
              <span className={`bat-label t-${batTone}`}>{d.battery}%</span>
              <span className={`bar bat ${batTone}`}>
                <i style={{ width: `${Math.min(100, d.battery)}%` }} />
              </span>
              <span className={`pill ${tone}`}>{d.status}</span>
            </span>
          </div>
        );
      })}
    </>
  );
}

function SessionList() {
  const sessions = useQuery(api.sessions.listSessions);
  if (sessions === undefined) {
    return (
      <>
        <div className="sk" style={{ width: "76%" }} />
        <div className="sk" style={{ width: "88%" }} />
      </>
    );
  }
  if (sessions.length === 0) {
    return <div className="empty-note">nenhuma sessão registrada</div>;
  }
  const recent = [...sessions].sort((a: SessionDoc, b: SessionDoc) => b.startedAt - a.startedAt).slice(0, 4);
  const active = sessions.filter((s: SessionDoc) => s.endedAt === undefined).length;
  return (
    <>
      {recent.map((s: SessionDoc) => {
        const ativa = s.endedAt === undefined;
        const label = TYPE_LABEL[s.type] ?? s.type;
        return (
          <div className="db-row" key={s._id}>
            <span className={`led ${ativa ? "green led-pulse" : "off"}`} style={ativa ? {} : { opacity: 0.3 }} />
            <span className="db-name">
              <b>{label}</b>
              <span>
                {fmtClock(s.startedAt)}
                {s.endedAt ? ` → ${fmtClock(s.endedAt)}` : " · em andamento"} · {s.deviceName.replace(/^Haylou\s+/i, "")}
              </span>
            </span>
            <span className="db-side">
              <span className={`pill ${ativa ? "green" : ""}`}>{ativa ? "ativa" : "encerrada"}</span>
            </span>
          </div>
        );
      })}
      <div className="m-sub" style={{ marginTop: 8 }}>
        <span className="t-dim">{sessions.length} sessões no total · </span>
        <span className="t-green">{active} ativa(s)</span>
      </div>
    </>
  );
}

function SettingList() {
  const settings = useQuery(api.settings.listSettings);
  if (settings === undefined) {
    return (
      <>
        <div className="sk" style={{ width: "70%" }} />
        <div className="sk" style={{ width: "55%" }} />
      </>
    );
  }
  if (settings.length === 0) {
    return <div className="empty-note">nenhuma configuração</div>;
  }
  return (
    <>
      {settings.map((s: SettingDoc) => (
        <div className="kv-row" key={s._id}>
          <code>{s.key}</code>
          <b>{s.value}</b>
        </div>
      ))}
    </>
  );
}

function BiometricList() {
  const rows = useQuery(api.biometrics.listRecent, { limit: 5 });
  if (rows === undefined) {
    return (
      <>
        <div className="sk" style={{ width: "78%" }} />
        <div className="sk" style={{ width: "58%" }} />
      </>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="empty-note">
        nenhuma medição ainda — conecte o relógio via BLE para gravar biometria no banco
      </div>
    );
  }
  return (
    <>
      {rows.map((b: BiometricDoc) => {
        const batTone = b.battery == null ? "" : b.battery > 40 ? "green" : "amber";
        return (
          <div className="db-row" key={b._id}>
            <span className="led green" />
            <span className="db-name">
              <b className="mono t-cyan">{b.bpm} bpm</b>
              <span>
                {new Date(b.timestamp).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}{" "}
                · {b.deviceId}
              </span>
            </span>
            <span className="db-side">
              {b.spo2 != null && <span className="model-tag">SpO2 {b.spo2.toFixed(1)}%</span>}
              {b.stress != null && <span className="model-tag">stress {b.stress}</span>}
              {b.battery != null && (
                <span className={`bat-label t-${batTone}`}>{b.battery}%</span>
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}

function NotificationList() {
  const rows = useQuery(api.notifications.listRecent, { limit: 5 });
  if (rows === undefined) {
    return (
      <>
        <div className="sk" style={{ width: "82%" }} />
        <div className="sk" style={{ width: "66%" }} />
      </>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="empty-note">nenhum alerta da IA enviado ainda — use o botão de teste do terminal</div>
    );
  }
  return (
    <>
      {rows.map((n: NotificationDoc) => (
        <div className="db-row" key={n._id}>
          <span className={`led ${n.status === "sent" ? "violet" : "red off"}`} />
          <span className="db-name">
            <b className="notif-msg">“{n.message}”</b>
            <span>
              {new Date(n.sentAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {n.vibrationPattern ? ` · vib ${n.vibrationPattern}` : ""}
            </span>
          </span>
          <span className="db-side">
            <span className={`pill ${n.status === "sent" ? "green" : "red"}`}>{n.status}</span>
          </span>
        </div>
      ))}
    </>
  );
}

function DbContent() {
  const devices = useQuery(api.devices.listDevices);
  const sessions = useQuery(api.sessions.listSessions);
  const settings = useQuery(api.settings.listSettings);
  const biometrics = useQuery(api.biometrics.listRecent, { limit: 5 });
  const notifications = useQuery(api.notifications.listRecent, { limit: 5 });
  const loading =
    devices === undefined ||
    sessions === undefined ||
    settings === undefined ||
    biometrics === undefined ||
    notifications === undefined;

  return (
    <section className="db-section">
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className="led cyan" />
            convex cloud · moonlit-walrus-691
          </span>
          <h2 className="panel-title" style={{ fontSize: 18 }}>
            Registros no <span className="accent">banco</span>
          </h2>
        </div>
        {loading ? (
          <span className="pill amber">
            <span className="led amber led-pulse" />
            sincronizando
          </span>
        ) : (
          <span className="pill green">
            <span className="led green" />
            ao vivo
          </span>
        )}
      </div>

      <div className="db-grid">
        <div className="panel">
          <div className="m-head">
            <span className="m-label">Dispositivos</span>
            {devices !== undefined && (
              <span className="count-chip cyan">{devices.length}</span>
            )}
          </div>
          <DeviceList />
        </div>

        <div className="panel">
          <div className="m-head">
            <span className="m-label">Sessões</span>
            {sessions !== undefined && (
              <span className="count-chip violet">{sessions.length}</span>
            )}
          </div>
          <SessionList />
        </div>

        <div className="panel">
          <div className="m-head">
            <span className="m-label">Configurações</span>
            {settings !== undefined && (
              <span className="count-chip amber">{settings.length}</span>
            )}
          </div>
          <SettingList />
        </div>

        <div className="panel">
          <div className="m-head">
            <span className="m-label">Biometria · últimas 5</span>
            {biometrics !== undefined && (
              <span className="count-chip green">{biometrics.length}</span>
            )}
          </div>
          <BiometricList />
        </div>

        <div className="panel">
          <div className="m-head">
            <span className="m-label">Notificações IA</span>
            {notifications !== undefined && (
              <span className="count-chip violet">{notifications.length}</span>
            )}
          </div>
          <NotificationList />
        </div>
      </div>
    </section>
  );
}

const fallback = (
  <section className="db-section">
    <div className="offline-hero">
      <span className="led red off" />
      <span>
        Convex indisponível no momento — as listas do banco não puderam ser carregadas. As demais
        seções seguem ativas.
      </span>
    </div>
  </section>
);

export function DbPanels() {
  return (
    <ErrorBoundary fallback={fallback}>
      <DbContent />
    </ErrorBoundary>
  );
}

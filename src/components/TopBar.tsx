import { useQuery } from "convex/react";
import { api } from "../ConvexClientProvider";
import { ErrorBoundary } from "./ErrorBoundary";
import { Clock } from "./Clock";

interface DeviceDoc {
  _id: string;
  name: string;
  model: string;
  battery: number;
  firmware: string;
  lastSync: number;
  status: string;
}

function DeviceChip() {
  const devices = useQuery(api.devices.listDevices);

  if (devices === undefined) {
    return (
      <span className="chip" aria-label="status do relógio">
        <span className="led amber led-pulse" />
        conectando ao relógio…
      </span>
    );
  }
  const device = devices.find((d: DeviceDoc) => d.status === "online") ?? devices[0];
  if (device === undefined) {
    return (
      <span className="chip" aria-label="status do relógio">
        <span className="led amber off" />
        nenhum relógio pareado
      </span>
    );
  }
  const online = device.status === "online";
  const short = device.name.replace(/^Haylou\s+/i, "");
  return (
    <span className="chip" aria-label="status do relógio">
      <span className={`led ${online ? "green led-pulse" : "red off"}`} />
      <b>{short}</b>
      <span className="t-dim">·</span>
      <span className="mono">{device.model}</span>
      <span className={`t-${device.battery > 40 ? "green" : device.battery > 15 ? "amber" : "red"}`}>
        {device.battery}%
      </span>
      <span className="t-dim">· {online ? "BLE" : "offline"}</span>
    </span>
  );
}

const fallbackChip = (
  <span className="chip" aria-label="sem conexão com o banco">
    <span className="led red off" />
    sem dados do banco
  </span>
);

export function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12.5h3.2l1.7-4.6 3.1 8.4 2.9-9.6 1.9 5.8H21"
              stroke="#00f0ff"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>
          <span className="brand-name">
            HAYLOU<em>·AI</em>
          </span>
          <span className="brand-sub">Biometria &amp; Inteligência</span>
        </span>
      </div>
      <div className="topbar-right">
        <ErrorBoundary fallback={fallbackChip}>
          <DeviceChip />
        </ErrorBoundary>
        <Clock />
      </div>
    </header>
  );
}

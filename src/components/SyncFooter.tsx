import { useQuery } from "convex/react";
import { api } from "../ConvexClientProvider";
import { ErrorBoundary } from "./ErrorBoundary";

function SyncContent() {
  const devices = useQuery(api.devices.listDevices);

  if (devices === undefined) {
    return (
      <>
        <span className="sync-item">
          <span className="led amber led-pulse" />
          <span className="t-amber">conectando ao Convex…</span>
        </span>
        <span className="t-dim">moonlit-walrus-691 · main · v0.2.0</span>
      </>
    );
  }

  const online = devices.some((d: { status: string }) => d.status === "online");
  return (
    <>
      <span className="sync-item">
        <span className="led green led-pulse" />
        <span className="t-green">Convex sync ativo</span>
        <span className="t-dim">· {online ? "relógio transmitindo telemetria" : "relógio offline — aguardando BLE"}</span>
      </span>
      <span className="t-dim">
        moonlit-walrus-691 · karlinmendes-dotcom/Haylou-Ai · main · v0.2.0
      </span>
    </>
  );
}

const fallback = (
  <>
    <span className="sync-item">
      <span className="led red off" />
      <span className="t-red">Convex offline — painel em modo demonstração</span>
    </span>
    <span className="t-dim">verifique a URL e o deploy (moonlit-walrus-691)</span>
  </>
);

export function SyncFooter() {
  return (
    <ErrorBoundary fallback={fallback}>
      <SyncContent />
    </ErrorBoundary>
  );
}

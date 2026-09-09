import { useEffect, useState } from "react";
import { ConvexProvider, ConvexReactClient, useConvex } from "convex/react";
import { api } from "../convex/_generated/api";
import type { ReactNode } from "react";

const FALLBACK_URL = "https://moonlit-walrus-691.convex.cloud";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = new ConvexReactClient(convexUrl ?? FALLBACK_URL);

/**
 * Aviso amigável quando a conexão com o Convex está indisponível
 * (chave/URL ausente ou backend fora do ar). Não quebra a renderização:
 * apenas um banner informativo no topo da tela.
 */
export function ConvexStatusBanner() {
  const convex = useConvex();
  const [offline, setOffline] = useState(false);
  const [envMissing, setEnvMissing] = useState(false);

  useEffect(() => {
    // env ausente: o client usa o fallback — avisa sem quebrar nada
    if (!import.meta.env.VITE_CONVEX_URL) setEnvMissing(true);
    const unsubscribe = convex.subscribeToConnectionState((s) => {
      const down =
        s.connectionRetries > 0 && !s.isWebSocketConnected && !s.hasEverConnected;
      setOffline(down);
    });
    return unsubscribe;
  }, [convex]);

  if (!offline && !envMissing) return null;
  return (
    <div className="convex-banner" role="status">
      <span className="led amber led-pulse" />
      <span>
        {offline
          ? "Convex indisponível no momento — o app continua funcionando, mas os dados do banco não sincronizam até a conexão voltar."
          : "VITE_CONVEX_URL não configurado no ambiente — usando o backend de desenvolvimento padrão."}
      </span>
    </div>
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={client}>
      <ConvexStatusBanner />
      {children}
    </ConvexProvider>
  );
}

export { api };
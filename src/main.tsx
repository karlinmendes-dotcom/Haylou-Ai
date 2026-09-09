import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const appFallback = (
  <div className="app">
    <main>
      <div className="panel offline-hero" style={{ marginTop: 40 }}>
        <span className="led red off" />
        <span>
          Algo deu errado ao carregar a interface. Recarregue a página; se o problema
          persistir, verifique a conexão com o Convex.
        </span>
      </div>
    </main>
  </div>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallback={appFallback}>
      <ConvexClientProvider>
        <App />
      </ConvexClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
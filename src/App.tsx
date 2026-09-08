import { useEffect } from "react";
import { useVitals } from "./hooks/useVitals";
import { TopBar } from "./components/TopBar";
import { HeartPanel } from "./components/HeartPanel";
import { MetricCards } from "./components/MetricCards";
import { AiTerminal } from "./components/AiTerminal";
import { DbPanels } from "./components/DbPanels";
import { SyncFooter } from "./components/SyncFooter";
import "./index.css";

export default function App() {
  const { history, ...reading } = useVitals();

  useEffect(() => {
    document.title = "Haylou AI · Biometria & IA";
  }, []);

  return (
    <div className="app">
      <div className="scene" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </div>

      <TopBar />

      <main>
        <section className="dash-hero">
          <HeartPanel reading={reading} history={history} />
          <AiTerminal latest={reading} />
        </section>

        <MetricCards reading={reading} />

        <DbPanels />

        <p className="demo-note">
          <span className="led amber" />
          telemetria exibida é um stream simulado do sensor — quando o firmware RT3 enviar dados via
          BLE/API, a mesma tela passa a consumir o Convex em tempo real
        </p>
      </main>

      <footer className="sysbar">
        <SyncFooter />
      </footer>
    </div>
  );
}

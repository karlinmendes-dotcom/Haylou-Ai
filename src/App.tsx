import { useEffect } from "react";
import { useBluetoothWatch } from "./hooks/useBluetoothWatch";
import { TopBar } from "./components/TopBar";
import { WatchConnect } from "./components/WatchConnect";
import { HeartPanel } from "./components/HeartPanel";
import { MetricCards } from "./components/MetricCards";
import { AiTerminal } from "./components/AiTerminal";
import { DbPanels } from "./components/DbPanels";
import { SyncFooter } from "./components/SyncFooter";
import "./index.css";

export default function App() {
  const watch = useBluetoothWatch();
  const connected = watch.status.phase === "connected";

  useEffect(() => {
    document.title = "Haylou AI · Biometria & IA";
  }, []);

  // a biometria vem 100% do relógio físico via Web Bluetooth:
  // desconectado → valores null ("--") e nenhum dado enviado ao Convex
  const reading = watch.reading;
  const history = watch.history;

  return (
    <div className="app">
      <div className="scene" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </div>

      <TopBar />

      <main>
        <WatchConnect
          status={watch.status}
          onConnect={() => void watch.connect()}
          onDisconnect={watch.disconnect}
        />

        <section className="dash-hero">
          <HeartPanel reading={reading} history={history} />
          <AiTerminal latest={reading} onSendToWatch={watch.sendNotification} />
        </section>

        <MetricCards reading={reading} />

        <DbPanels />

        <p className="demo-note">
          <span className={`led ${connected ? "green led-pulse" : "red off"}`} />
          {connected
            ? "telemetria ao vivo do relógio via Web Bluetooth — cada leitura real é persistida no Convex"
            : "relógio desconectado — nenhuma biometria é exibida nem enviada ao Convex. Conecte o Haylou RT3 para iniciar a telemetria real"}
        </p>
      </main>

      <footer className="sysbar">
        <SyncFooter />
      </footer>
    </div>
  );
}
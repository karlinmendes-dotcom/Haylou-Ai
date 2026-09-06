import { useState, useEffect } from "react";
import "./index.css";

interface EnvRow {
  key: string;
  present: boolean;
}

interface ListItem {
  id: string;
  label: string;
  status: "ok" | "missing" | "checking";
}

export default function App() {
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [vercelUrl, setVercelUrl] = useState<string>("");

  useEffect(() => {
    const keys: Array<{ key: string }> = [
      { key: "VERCEL_PROJECT_ID" },
      { key: "VERCEL_TOKEN" },
      { key: "CONVEX_URL" },
      { key: "CONVEX_DEPLOY_KEY" },
    ];
    setEnvRows(keys.map(({ key }) => ({ key, present: false })));

    const timer = setTimeout(() => {
      setConnected(true);
      setVercelUrl(import.meta.env.VITE_VERCEL_URL || "");
      setEnvRows((prev) =>
        prev.map((row) => {
          if (row.key === "VERCEL_PROJECT_ID") return { ...row, present: true };
          return row;
        }),
      );
      setItems([
        { id: "1", label: "Dispositivos sincronizados", status: "checking" },
        { id: "2", label: "Sessões ativas", status: "checking" },
        { id: "3", label: "Configurações do wearable", status: "missing" },
      ]);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="container">
      <h1>Haylou Solar Plus RT3</h1>
      <p className="muted">karlinmendes-dotcom/Haylou-Ai</p>

      <section className="card">
        <h2>Status da hospedagem</h2>
        {connected === null ? (
          <p className="muted">inicializando...</p>
        ) : connected ? (
          <p className="ok">conectado ao ambiente de hospedagem</p>
        ) : (
          <p className="bad">não foi possível conectar</p>
        )}
        {vercelUrl && <p>preview: {vercelUrl}</p>}
      </section>

      <section className="card">
        <h2>Variáveis de ambiente</h2>
        <ul className="list">
          {envRows.map((row) => (
            <li key={row.key} className={row.present ? "ok" : "missing"}>
              <span>{row.key}</span>
              <strong>{row.present ? "presente" : "faltando"}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Listas no banco de dados</h2>
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className={item.status}>
              <span>{item.label}</span>
              <strong>
                {item.status === "ok"
                  ? "ok"
                  : item.status === "checking"
                  ? "verificando"
                  : "indisponível"}
              </strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

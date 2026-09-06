import { useState, useEffect } from "react";
import "./index.css";

export default function App() {
  const [status, setStatus] = useState<string>("carregando...");
  const [branch, setBranch] = useState<string>("");

  useEffect(() => {
    setStatus("conectando ao pipeline...");
    const t = setTimeout(() => {
      setStatus("projeto haylou pronto para vercel/convex");
      setBranch("main");
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="container">
      <h1>Haylou Solar Plus RT3 (LS16)</h1>
      <p>projeto: karlinmendes-dotcom/Haylou-Ai</p>
      <p>branch: {branch || "main"}</p>
      <p>status: {status}</p>
    </main>
  );
}

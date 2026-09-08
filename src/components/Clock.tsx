import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="chip" role="timer" aria-label="horário local">
      <span className="clock">{now.toLocaleTimeString("pt-BR", { hour12: false })}</span>
      <span className="clock t-dim">
        {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </span>
    </span>
  );
}

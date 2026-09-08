import type { WatchStatus } from "../hooks/useBluetoothWatch";

interface Props {
  status: WatchStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function WatchConnect({ status, onConnect, onDisconnect }: Props) {
  if (!status.supported) {
    return (
      <div className="watchbar">
        <span className="pill amber">
          <span className="led amber off" />
          Web Bluetooth indisponível — use Chrome/Edge (desktop ou Android) com HTTPS
        </span>
      </div>
    );
  }

  const connected = status.phase === "connected";
  const working = status.phase === "scanning" || status.phase === "connecting";
  const failed = status.phase === "error";

  return (
    <div className="watchbar">
      <div className="watch-info">
        {connected ? (
          <>
            <span className="led green led-pulse" />
            <span className="watch-device">
              <b>Haylou RT3 Conectado</b>
              <span className="mono">
                {status.deviceName ?? "Solar Plus RT3 (LS16)"}
                {status.bpm != null && <> · {status.bpm} bpm</>}
                {status.battery != null ? ` · ${status.battery}%` : " · bateria n/d"}
                {status.rssi != null && <> · sinal {status.rssi} dBm</>}
              </span>
            </span>
            <span className="pill green">
              <span className="led cyan led-pulse" />
              BLE Active
            </span>
          </>
        ) : (
          <>
            <span className={`led ${working ? "cyan led-pulse" : failed ? "red led-pulse" : "red off"}`} />
            <span className="watch-device">
              <b className={failed ? "t-red" : ""}>
                {working ? "Procurando o relógio…" : failed ? "Falha na conexão" : "Relógio Desconectado"}
              </b>
              <span className="mono">
                {failed
                  ? "nenhum dado é enviado ao Convex até reconectar"
                  : "pareamento via Web Bluetooth · serviço HR 0x180D"}
              </span>
            </span>
          </>
        )}
        {status.error && <span className="watch-error">{status.error}</span>}
      </div>

      <div className="watch-actions">
        {connected ? (
          <button className="btn" onClick={onDisconnect}>
            <span className="send-ico" aria-hidden="true">
              ⊘
            </span>
            Desconectar
          </button>
        ) : (
          <button className="btn primary" onClick={onConnect} disabled={working}>
            <span className="send-ico" aria-hidden="true">
              ⌖
            </span>
            {working ? "Conectando…" : "Conectar Smartwatch (Haylou RT3)"}
          </button>
        )}
      </div>
    </div>
  );
}
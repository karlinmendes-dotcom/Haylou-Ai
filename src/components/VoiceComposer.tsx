import { useState } from "react";
import { useVoice } from "../hooks/useVoice";
import type { SendNotificationOptions } from "../hooks/useBluetoothWatch";

interface Props {
  /** Envia o texto para a tela AMOLED do relógio via BLE. */
  onSendToWatch?: (text: string, options?: SendNotificationOptions) => Promise<boolean>;
}

/**
 * Composer de voz — o fluxo "falar → transcrever → responder":
 *  1. 🎤 grava a voz (microfone do celular);
 *  2. transcreve via Groq Whisper (Convex action, mesma chave da IA);
 *  3. o texto fica editável e pode ser:
 *     - enviado ao relógio (AMOLED, com vibração);
 *     - falado em voz alta no alto-falante (TTS);
 *     - respondido no WhatsApp / Instagram Direct / qualquer app (Web Share).
 */
export function VoiceComposer({ onSendToWatch }: Props) {
  const voice = useVoice();
  const [sent, setSent] = useState<
    "watch" | "watch-fail" | "wa" | "share" | "share-fail" | null
  >(null);

  const runSend = async (kind: "watch" | "wa" | "share") => {
    const text = voice.text.trim();
    if (!text) return;
    setSent(null);
    if (kind === "watch" && onSendToWatch) {
      const ok = await onSendToWatch(text, {
        vibrate: true,
        category: "ai",
        title: "Resposta por voz",
      });
      setSent(ok ? "watch" : "watch-fail");
    } else if (kind === "wa") {
      voice.sendViaWhatsApp(text);
      setSent("wa");
    } else {
      const ok = await voice.shareText(text);
      setSent(ok ? "share" : "share-fail");
    }
  };

  return (
    <section className="panel voice-panel" aria-label="compositor de voz">
      <div className="panel-head">
        <div>
          <span className="kicker">
            <span className="led cyan" />
            voz · transcrição · respostas
          </span>
          <h2 className="panel-title">
            Fale e <span className="t-cyan">responda</span>
          </h2>
        </div>
        {voice.recording ? (
          <span className="ai-state work">
            <span className="led red led-pulse" />
            gravando… fale agora
          </span>
        ) : voice.busy ? (
          <span className="ai-state work">
            <span className="led amber led-pulse" />
            transcrevendo…
          </span>
        ) : (
          <span className="ai-state">
            <span className="led green" />
            {voice.supported ? "microfone pronto" : "microfone indisponível neste navegador"}
          </span>
        )}
      </div>

      <div className="voice-body">
        <textarea
          className="voice-input"
          rows={3}
          value={voice.text}
          onChange={(e) => voice.setText(e.target.value)}
          placeholder="Fale (botão 🎤) ou digite aqui a mensagem que quer enviar ao relógio, ao WhatsApp ou ao Instagram…"
          aria-label="mensagem por voz ou texto"
        />

        {voice.notice && <p className="voice-notice">{voice.notice}</p>}
        {sent === "watch" && <p className="voice-ok">Enviado para a tela AMOLED do relógio ✓</p>}
        {sent === "watch-fail" && (
          <p className="voice-notice">Relógio não conectado — conecte o smartwatch para enviar.</p>
        )}
        {sent === "wa" && <p className="voice-ok">WhatsApp aberto com a mensagem — escolha o contato ✓</p>}
        {sent === "share" && <p className="voice-ok">Compartilhado ✓</p>}
        {sent === "share-fail" && <p className="voice-notice">Compartilhamento cancelado.</p>}

        <div className="voice-actions">
          {voice.recording ? (
            <button
              className="btn primary"
              onClick={() => void voice.stopAndTranscribe()}
              disabled={voice.busy}
            >
              <span className="send-ico" aria-hidden="true">
                ■
              </span>
              {voice.busy ? "Transcrevendo…" : "Parar e transcrever"}
            </button>
          ) : (
            <button className="btn primary" onClick={() => void voice.start()} disabled={voice.busy}>
              <span className="send-ico" aria-hidden="true">
                🎤
              </span>
              {voice.busy ? "…" : "Falar"}
            </button>
          )}

          <button
            className="btn"
            onClick={() => void runSend("watch")}
            disabled={!voice.text.trim() || voice.busy}
            title="Enviar para a tela AMOLED do relógio"
          >
            <span className="send-ico" aria-hidden="true">
              ⌚
            </span>
            Relógio
          </button>

          <button
            className="btn"
            onClick={() => void runSend("wa")}
            disabled={!voice.text.trim()}
            title="Responder no WhatsApp"
          >
            <span className="send-ico" aria-hidden="true">
              💬
            </span>
            WhatsApp
          </button>

          <button
            className="btn"
            onClick={() => void runSend("share")}
            disabled={!voice.text.trim()}
            title="Compartilhar com qualquer app (Instagram Direct, e-mail…)"
          >
            <span className="send-ico" aria-hidden="true">
              ⤴
            </span>
            Instagram / Apps
          </button>

          <button
            className="btn"
            onClick={() => voice.speak(voice.text)}
            disabled={!voice.text.trim()}
            title="Ouvir a mensagem em voz alta (alto-falante)"
          >
            <span className="send-ico" aria-hidden="true">
              🔊
            </span>
            Ouvir
          </button>

          <button
            className="btn"
            onClick={() => {
              void voice.copyText(voice.text);
            }}
            disabled={!voice.text.trim()}
            title="Copiar o texto"
          >
            <span className="send-ico" aria-hidden="true">
              ⧉
            </span>
            Copiar
          </button>
        </div>

        <p className="t-dim" style={{ fontSize: 11 }}>
          A transcrição usa o Whisper da Groq (mesma chave da IA). O TTS “Ouvir” sai no alto-falante
          do celular; o alto-falante do relógio recebe áudio apenas em chamadas (HFP) — por isso o
          fluxo completo é: falar no celular → transcrever → responder no app ou enviar o texto ao
          relógio.
        </p>
      </div>
    </section>
  );
}
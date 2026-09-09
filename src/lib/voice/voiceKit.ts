/**
 * Voz — o cérebro de "falar → transcrever → responder".
 *
 * Fluxo universal de resposta por voz:
 *   1. O usuário fala no microfone do celular (ou digita) a mensagem;
 *   2. `transcribeVoice` envia o áudio para a action `ai:transcribeAudio`
 *      do Convex (Groq Whisper — mesma chave GROQ_API_KEY da análise);
 *   3. O texto transcrito/gerado pode ser:
 *      - enviado ao relógio (notificação AMOLED via BLE);
 *      - falado em voz alta no alto-falante (TTS do navegador);
 *      - respondido de volta no WhatsApp / Instagram Direct / qualquer
 *        app via Web Share (deep links + share sheet do sistema).
 */

const MAX_RECORD_MS = 15_000; // limite de gravação (evita payload gigante p/ Groq)

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface VoiceKit {
  /** true quando o navegador suporta gravação de microfone. */
  readonly supported: boolean;
  /** true enquanto há gravação ativa. */
  readonly recording: boolean;
  /** Inicia a gravação do microfone (para automática em MAX_RECORD_MS). */
  start(): Promise<void>;
  /** Para a gravação, transcreve via Groq e devolve o texto. */
  stopAndTranscribe(): Promise<TranscribeResult>;
  /** Cancela a gravação sem transcrever. */
  cancel(): void;
  /** Fala o texto em voz alta (TTS do navegador). */
  speak(text: string): void;
  /** Para qualquer fala em andamento. */
  stopSpeaking(): void;
  /** Abre o WhatsApp com o texto pré-preenchido (escolhe o contato). */
  sendViaWhatsApp(text: string): void;
  /** Compartilha o texto com qualquer app (Instagram Direct, WhatsApp…). */
  shareText(text: string): Promise<boolean>;
  /** Copia o texto para a área de transferência. */
  copyText(text: string): Promise<boolean>;
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let recordTimer: number | null = null;
let active = false;

function b64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Falha ao ler o áudio"));
      resolve((result.split(",")[1] ?? ""));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o áudio"));
    reader.readAsDataURL(blob);
  });
}

function stopRecorder(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!recorder || recorder.state === "inactive") {
      return reject(new Error("Nenhuma gravação ativa"));
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
      chunks = [];
      resolve(blob);
    };
    recorder.onerror = () => reject(new Error("Erro na gravação de áudio"));
    recorder.stop();
  });
}

function cleanupStream(): void {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (recordTimer !== null) {
    window.clearTimeout(recordTimer);
    recordTimer = null;
  }
}

/**
 * Cria o kit de voz. `transcribe` deve apontar para a action do Convex
 * (ai:transcribeAudio) — injetado para não acoplar o módulo ao cliente.
 */
export function createVoiceKit(
  transcribe: (audioB64: string, mimeType: string) => Promise<TranscribeResult>,
): VoiceKit {
  // checagem preventiva: navegador SEM suporte a microfone/gravação
  // (getUserMedia ou MediaRecorder ausentes) -> supported = false, sem exceção.
  const supported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  return {
    get supported() {
      return supported;
    },
    get recording() {
      return active;
    },
    start: async () => {
      if (!supported || active) return;
      chunks = [];
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error(
          "Microfone indisponível — verifique a permissão do navegador para usar o microfone.",
        );
      }
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      active = true;
      // para automaticamente após o limite de segurança
      recordTimer = window.setTimeout(() => {
        void stopRecorder()
          .then(() => {})
          .catch(() => {});
        cleanupStream();
        active = false;
      }, MAX_RECORD_MS);
    },
    stopAndTranscribe: async () => {
      if (!recorder || recorder.state === "inactive") {
        return { ok: false, reason: "Nenhuma gravação ativa" };
      }
      let blob: Blob;
      try {
        blob = await stopRecorder();
      } catch (err) {
        cleanupStream();
        active = false;
        return { ok: false, reason: err instanceof Error ? err.message : "Falha na gravação" };
      } finally {
        cleanupStream();
        active = false;
      }
      if (blob.size < 512) {
        return { ok: false, reason: "Áudio muito curto — fale um pouco mais" };
      }
      try {
        const b64 = await b64FromBlob(blob);
        return await transcribe(b64, blob.type || "audio/webm");
      } catch {
        return { ok: false, reason: "Falha na transcrição — tente de novo" };
      }
    },
    cancel: () => {
      active = false;
      try {
        recorder?.stop();
      } catch {
        // já parado
      }
      cleanupStream();
      chunks = [];
    },
    speak: (text) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.rate = 1;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    },
    stopSpeaking: () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    sendViaWhatsApp: (text) => {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    },
    shareText: async (text) => {
      if (typeof navigator === "undefined" || !navigator.share) return false;
      try {
        await navigator.share({ text });
        return true;
      } catch {
        return false;
      }
    },
    copyText: async (text) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
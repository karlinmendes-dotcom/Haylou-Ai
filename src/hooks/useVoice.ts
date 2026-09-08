import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import {
  createVoiceKit,
  type TranscribeResult,
  type VoiceKit,
} from "../lib/voice/voiceKit";

/**
 * Hook de voz: fala → transcreve (Groq Whisper via Convex) → responde.
 * O texto transcrito fica editável e pode ser enviado ao relógio, ao
 * WhatsApp/Instagram (Web Share) ou lido em voz alta (TTS).
 */
export function useVoice() {
  const convex = useConvex() as unknown as {
    action: (name: string, args: unknown) => Promise<unknown>;
  };

  const transcribe = useCallback(
    async (audioB64: string, mimeType: string): Promise<TranscribeResult> => {
      try {
        const res = (await convex.action("ai:transcribeAudio", {
          audioB64,
          mimeType,
        })) as TranscribeResult;
        return res;
      } catch {
        return { ok: false, reason: "Falha na transcrição — tente de novo" };
      }
    },
    [convex],
  );

  const kit = useMemo<VoiceKit>(() => createVoiceKit(transcribe), [transcribe]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // espelha o estado interno do kit (start automático no limite de tempo)
  useEffect(() => {
    const id = window.setInterval(() => {
      setRecording(kit.recording);
    }, 250);
    return () => window.clearInterval(id);
  }, [kit]);

  const start = useCallback(async () => {
    setNotice(null);
    try {
      await kit.start();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Falha ao acessar o microfone");
    }
  }, [kit]);

  const stopAndTranscribe = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    const res = await kit.stopAndTranscribe();
    setBusy(false);
    if (res.ok) {
      setText(res.text);
      return res.text;
    }
    setNotice(res.reason);
    return "";
  }, [kit]);

  const cancel = useCallback(() => kit.cancel(), [kit]);
  const speak = useCallback((t: string) => kit.speak(t), [kit]);
  const stopSpeaking = useCallback(() => kit.stopSpeaking(), [kit]);
  const sendViaWhatsApp = useCallback((t: string) => kit.sendViaWhatsApp(t), [kit]);
  const shareText = useCallback(async (t: string) => kit.shareText(t), [kit]);
  const copyText = useCallback(async (t: string) => kit.copyText(t), [kit]);

  return {
    supported: kit.supported,
    recording,
    busy,
    text,
    setText,
    notice,
    setNotice,
    start,
    stopAndTranscribe,
    cancel,
    speak,
    stopSpeaking,
    sendViaWhatsApp,
    shareText,
    copyText,
  };
}
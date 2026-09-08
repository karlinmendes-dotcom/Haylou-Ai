/**
 * Parser de intenções — módulo PURO (sem funções Convex), compartilhado
 * pelo http.ts (webhooks) e actions.ts (mutations). Converte texto livre
 * em intenções de automação estruturadas.
 */

export const INTENTS = [
  "SEND_WHATSAPP",
  "CREATE_CALENDAR_EVENT",
  "MAKE_PHONE_CALL",
  "OPEN_APP",
  "SEND_SMS",
  "SET_REMINDER",
  "UNKNOWN",
] as const;

export type Intent = (typeof INTENTS)[number];

export const INTENT_META: Record<Intent, { label: string; targetService: string }> = {
  SEND_WHATSAPP: { label: "Enviar mensagem no WhatsApp", targetService: "whatsapp" },
  CREATE_CALENDAR_EVENT: { label: "Criar evento na agenda", targetService: "calendar" },
  MAKE_PHONE_CALL: { label: "Fazer ligação", targetService: "phone" },
  OPEN_APP: { label: "Abrir aplicativo", targetService: "app" },
  SEND_SMS: { label: "Enviar SMS", targetService: "sms" },
  SET_REMINDER: { label: "Definir lembrete", targetService: "reminder" },
  UNKNOWN: { label: "Intenção não reconhecida", targetService: "unknown" },
};

/** Expressões comuns (pt-BR) para identificar cada intenção no texto livre. */
const INTENT_PATTERNS: Record<Exclude<Intent, "UNKNOWN">, RegExp[]> = {
  SEND_WHATSAPP: [
    /\b(whatsapp|zap|zapzap|mensagem\s*para)\b/i,
    /\b(enviar|mandar|responder|responde)\b.*\b(mensagem|msg|zap|texto)\b/i,
  ],
  CREATE_CALENDAR_EVENT: [
    /\b(agendar|marcar|compromisso|reuni[ãa]o|evento|hor[aá]rio)\b/i,
    /\b(agenda|calend[aá]rio)\b/i,
  ],
  MAKE_PHONE_CALL: [
    /\b(ligar|liga\s*para|telefonar|chamar|discar)\b/i,
    /\b(lig[açã]o|telefonema)\b/i,
  ],
  OPEN_APP: [
    /\b(abrir|abra|iniciar|abre)\b.*\b(app|aplicativo|banco|whatsapp|instagram|spotify|youtube|camera)\b/i,
    /\b(abrir)\b/i,
  ],
  SEND_SMS: [/\b(sms|mensagem\s*de\s*texto)\b/i, /\b(enviar|mandar)\b.*\b(sms)\b/i],
  SET_REMINDER: [
    /\b(lembrar|lembrete|lembra\s*me|alarme|despertador)\b/i,
    /\b(me\s*lembre)\b/i,
  ],
};

/**
 * Converte texto livre em uma intenção estruturada + payload inicial.
 * Usado pela IA (action) e pelo fallback local (regex).
 */
export function parseIntent(text: string): {
  intent: Intent;
  target: string | null;
  message: string | null;
} {
  const t = text.trim();
  const scores = new Map<Intent, number>();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;
    for (const re of patterns) {
      if (re.test(t)) score += 1;
    }
    if (score > 0) scores.set(intent as Intent, score);
  }

  // maior pontuação vence; desempate pela ordem de prioridade
  const priority: Exclude<Intent, "UNKNOWN">[] = [
    "MAKE_PHONE_CALL",
    "SEND_WHATSAPP",
    "SEND_SMS",
    "CREATE_CALENDAR_EVENT",
    "SET_REMINDER",
    "OPEN_APP",
  ];
  let best: Intent = "UNKNOWN";
  let bestScore = 0;
  for (const intent of priority) {
    const s = scores.get(intent) ?? 0;
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }

  // extrai o destinatário (após "para") e o texto da mensagem
  let target: string | null = null;
  let message: string | null = null;
  if (best === "SEND_WHATSAPP" || best === "SEND_SMS") {
    const toMatch = t.match(/\b(para|pro|pra)\s+([^,.?!]{2,40})/i);
    if (toMatch) {
      target = toMatch[2].trim();
      const rest = t.slice(0, toMatch.index).trim();
      const msg = t.slice((toMatch.index ?? 0) + toMatch[0].length).trim();
      message = msg || rest || null;
    } else {
      message = t;
    }
  } else if (best === "CREATE_CALENDAR_EVENT") {
    const whatMatch = t.match(/\b(compromisso|reuni[ãa]o|evento)\s+([^,.?!]{2,60})/i);
    if (whatMatch) target = whatMatch[2].trim();
  }

  return { intent: best, target, message };
}
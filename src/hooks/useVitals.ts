/**
 * Tipos das leituras biométricas do painel.
 *
 * IMPORTANTE: o painel NÃO gera dados simulados. Todas as leituras vêm
 * exclusivamente do smartwatch físico conectado via Web Bluetooth
 * (ver `useBluetoothWatch`). Enquanto o relógio estiver desconectado os
 * valores permanecem `null` e a interface exibe "--".
 */

export interface VitalsReading {
  /** batimentos por minuto — null quando o relógio está desconectado */
  bpm: number | null;
  /** saturação de oxigênio (%, 1 casa decimal) */
  spo2: number | null;
  /** estresse 0–100 */
  stress: number | null;
  /** passos acumulados na sessão (quando o firmware enviar) */
  steps: number | null;
  /** calorias aproximadas */
  calories: number | null;
  /** emergência real em andamento (BPM >= 150) */
  anomaly: boolean;
  /** timestamp da última leitura REAL — 0 quando nunca houve leitura */
  ts: number;
}

/** Estado "sem dados" usado enquanto o relógio não está conectado. */
export const EMPTY_READING: VitalsReading = {
  bpm: null,
  spo2: null,
  stress: null,
  steps: null,
  calories: null,
  anomaly: false,
  ts: 0,
};
/**
 * Dinheiro em centavos inteiros. Nenhuma soma usa ponto flutuante.
 */

const APENAS_INTEIROS = /^\d+$/;
const COM_DECIMAIS = /^\d+[.,]\d{1,2}$/;

/** Converte texto em reais para centavos; `null` quando o valor é ilegível. */
export function valorParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/\s+/g, "").replace(/^R\$/i, "");
  let centavos: number;
  if (APENAS_INTEIROS.test(limpo)) {
    centavos = Number.parseInt(limpo, 10) * 100;
  } else if (COM_DECIMAIS.test(limpo)) {
    const [inteiros, decimais] = limpo.split(/[.,]/) as [string, string];
    centavos = Number.parseInt(inteiros, 10) * 100 + Number.parseInt(decimais.padEnd(2, "0"), 10);
  } else {
    return null;
  }
  if (!Number.isFinite(centavos) || centavos < 0 || !Number.isSafeInteger(centavos)) {
    return null;
  }
  return centavos;
}

export function formatarCentavos(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(Math.trunc(centavos));
  const inteiros = Math.floor(absoluto / 100);
  const decimais = String(absoluto % 100).padStart(2, "0");
  return `${sinal}R$ ${inteiros},${decimais}`;
}

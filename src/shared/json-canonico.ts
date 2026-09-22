/**
 * Serialização JSON canônica: chaves de objeto ordenadas recursivamente e
 * nenhum espaço insignificante. Strings são citadas em qualquer posição, como
 * no JSON padrão; o chamador decide se um primitivo string de topo é o próprio
 * texto canônico (ver `hashCatalogo`).
 */

/** Profundidade máxima tolerada para não estourar a pilha em aninhamento patológico. */
const PROFUNDIDADE_MAXIMA = 100;

/** Erro tipado de canonicalização, devolvido como `{ ok: false, erros }` pelo catálogo. */
export class ErroCanonicalizacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroCanonicalizacao";
  }
}

export function textoCanonico(valor: unknown, profundidade = 0): string {
  if (profundidade > PROFUNDIDADE_MAXIMA) {
    throw new ErroCanonicalizacao("estrutura aninhada além do limite de canonicalização");
  }
  if (typeof valor === "string") {
    return JSON.stringify(valor);
  }
  if (valor === null || typeof valor !== "object") {
    const serializado = JSON.stringify(valor);
    return serializado === undefined ? "null" : serializado;
  }
  if (Array.isArray(valor)) {
    return `[${valor.map((item) => textoCanonico(item, profundidade + 1)).join(",")}]`;
  }
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto).sort();
  const partes = chaves.map(
    (chave) => `${JSON.stringify(chave)}:${textoCanonico(objeto[chave], profundidade + 1)}`,
  );
  return `{${partes.join(",")}}`;
}

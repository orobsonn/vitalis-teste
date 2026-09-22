/**
 * Serialização JSON canônica: chaves de objeto ordenadas recursivamente e
 * nenhum espaço insignificante. Strings são citadas em qualquer posição, como
 * no JSON padrão.
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
  if (valor === null) {
    return "null";
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) {
      throw new ErroCanonicalizacao("número não finito não é um valor JSON canônico");
    }
    return JSON.stringify(valor);
  }
  if (typeof valor === "boolean") {
    return valor ? "true" : "false";
  }
  if (typeof valor === "object") {
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
  throw new ErroCanonicalizacao(
    `valor não é JSON canônico: ${typeof valor === "undefined" ? "undefined" : typeof valor}`,
  );
}

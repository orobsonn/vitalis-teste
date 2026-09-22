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
      const itens: string[] = [];
      for (let indice = 0; indice < valor.length; indice += 1) {
        if (!(indice in valor)) {
          throw new ErroCanonicalizacao("array esparso não é um valor JSON canônico");
        }
        itens.push(textoCanonico(valor[indice], profundidade + 1));
      }
      return `[${itens.join(",")}]`;
    }
    const prototipo = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) {
      throw new ErroCanonicalizacao("objeto não puro não é um valor JSON canônico");
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

/** Índice canônico de array: inteiro não negativo dentro do comprimento corrente. */
function ehIndiceDeArray(nome: string, comprimento: number): boolean {
  const numero = Number(nome);
  return Number.isInteger(numero) && numero >= 0 && numero < comprimento && String(numero) === nome;
}

function copiarArray(valor: unknown[], visitados: Set<object>): unknown[] {
  for (const nome of Object.getOwnPropertyNames(valor)) {
    if (nome === "length") {
      continue;
    }
    if (!ehIndiceDeArray(nome, valor.length)) {
      throw new ErroCanonicalizacao(`array possui propriedade não indexada "${nome}"`);
    }
  }
  const copia = new Array<unknown>(valor.length);
  for (let indice = 0; indice < valor.length; indice += 1) {
    const descritor = Object.getOwnPropertyDescriptor(valor, indice);
    if (!descritor) {
      throw new ErroCanonicalizacao(`array esparso no índice ${indice}`);
    }
    if (descritor.get || descritor.set) {
      throw new ErroCanonicalizacao(`array possui acessor no índice ${indice}`);
    }
    copia[indice] = copiarSnapshot(descritor.value, visitados);
  }
  return copia;
}

function copiarObjeto(valor: object, visitados: Set<object>): Record<string, unknown> {
  const prototipo = Object.getPrototypeOf(valor);
  if (prototipo !== Object.prototype && prototipo !== null) {
    throw new ErroCanonicalizacao("objeto não é um objeto JSON puro");
  }
  const copia: Record<string, unknown> = {};
  for (const chave of Object.keys(valor)) {
    const descritor = Object.getOwnPropertyDescriptor(valor, chave);
    if (!descritor) {
      continue;
    }
    if (descritor.get || descritor.set) {
      throw new ErroCanonicalizacao(`propriedade "${chave}" é um acessor não JSON`);
    }
    copia[chave] = copiarSnapshot(descritor.value, visitados);
  }
  return copia;
}

function copiarSnapshot(valor: unknown, visitados: Set<object>): unknown {
  if (valor === null) {
    return null;
  }
  const tipo = typeof valor;
  if (tipo === "string" || tipo === "boolean") {
    return valor;
  }
  if (tipo === "number") {
    if (!Number.isFinite(valor as number)) {
      throw new ErroCanonicalizacao("número não finito não é um valor JSON");
    }
    return valor;
  }
  if (tipo !== "object") {
    throw new ErroCanonicalizacao(`valor não é JSON: ${tipo}`);
  }
  const objeto = valor as object;
  if (visitados.has(objeto)) {
    throw new ErroCanonicalizacao("estrutura cíclica não é um valor JSON");
  }
  visitados.add(objeto);
  try {
    return Array.isArray(objeto)
      ? copiarArray(objeto, visitados)
      : copiarObjeto(objeto, visitados);
  } finally {
    visitados.delete(objeto);
  }
}

/**
 * Copia a entrada para dados JSON puros exatamente uma vez, rejeitando qualquer
 * parte não JSON (undefined, funções, símbolos, bigints, números não finitos,
 * objetos com protótipo estranho, arrays esparsos/com propriedades extras,
 * acessores e ciclos). Cada parte válida é lida uma única vez, de modo que a
 * validação, o hash e o catálogo derivem do mesmo snapshot imutável.
 */
export function criarSnapshotJson(valor: unknown): unknown {
  return copiarSnapshot(valor, new Set<object>());
}

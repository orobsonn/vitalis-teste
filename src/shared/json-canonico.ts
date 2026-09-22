/**
 * Serialização JSON canônica: chaves de objeto ordenadas recursivamente e
 * nenhum espaço insignificante. Strings são citadas em qualquer posição, como
 * no JSON padrão.
 */

/** Profundidade máxima tolerada para não estourar a pilha em aninhamento patológico. */
const PROFUNDIDADE_MAXIMA = 100;

/**
 * Identidade inforjável dos erros criados por este módulo. Um `instanceof` é
 * forgeável: um Proxy pode devolver `ErroCanonicalizacao.prototype` em
 * `getPrototypeOf` e passar por um erro legítimo. O WeakSet registra apenas as
 * instâncias que o próprio construtor abaixo criou.
 */
const ERROS_CANONICALIZACAO = new WeakSet<object>();

/** Erro tipado de canonicalização, devolvido como `{ ok: false, erros }` pelo catálogo. */
export class ErroCanonicalizacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroCanonicalizacao";
    ERROS_CANONICALIZACAO.add(this);
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

/**
 * Lê o comprimento do array a partir do próprio descritor `length`, sem tocar
 * `valor.length` (que num Proxy dispara o trap `get`). Só aceita a forma de um
 * array real: propriedade própria, de dados, não acessora, não enumerável e com
 * inteiro não negativo seguro. Qualquer trap hostil propaga para a fronteira de
 * `criarSnapshotJson`, que normaliza a falha em `ErroCanonicalizacao`.
 */
function comprimentoDeArray(valor: object): number {
  const descritor = Object.getOwnPropertyDescriptor(valor, "length");
  if (!descritor) {
    throw new ErroCanonicalizacao("array sem propriedade própria length");
  }
  if (descritor.enumerable) {
    throw new ErroCanonicalizacao("array com length enumerável não é JSON");
  }
  if (descritor.get !== undefined || descritor.set !== undefined) {
    throw new ErroCanonicalizacao("array com length acessor não é JSON");
  }
  const comprimento = descritor.value;
  if (typeof comprimento !== "number" || !Number.isSafeInteger(comprimento) || comprimento < 0) {
    throw new ErroCanonicalizacao("array sem comprimento inteiro não negativo");
  }
  return comprimento;
}

function copiarArray(valor: unknown[], visitados: Set<object>): unknown[] {
  const comprimento = comprimentoDeArray(valor);
  for (const nome of Reflect.ownKeys(valor)) {
    if (typeof nome === "symbol") {
      throw new ErroCanonicalizacao("chave símbolo não é um valor JSON");
    }
    if (nome === "length") {
      continue;
    }
    if (!ehIndiceDeArray(nome, comprimento)) {
      throw new ErroCanonicalizacao(`array possui propriedade não indexada "${nome}"`);
    }
    const descritor = Object.getOwnPropertyDescriptor(valor, nome);
    if (descritor && !descritor.enumerable) {
      throw new ErroCanonicalizacao(`array possui propriedade não enumerável "${nome}"`);
    }
  }
  const copia = new Array<unknown>(comprimento);
  for (let indice = 0; indice < comprimento; indice += 1) {
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
  for (const chave of Reflect.ownKeys(valor)) {
    if (typeof chave === "symbol") {
      throw new ErroCanonicalizacao("chave símbolo não é um valor JSON");
    }
    const descritor = Object.getOwnPropertyDescriptor(valor, chave);
    if (!descritor) {
      continue;
    }
    if (!descritor.enumerable) {
      throw new ErroCanonicalizacao(`propriedade "${chave}" não enumerável não é JSON`);
    }
    if (descritor.get || descritor.set) {
      throw new ErroCanonicalizacao(`propriedade "${chave}" é um acessor não JSON`);
    }
    // `defineProperty` grava sempre uma propriedade própria de dados: uma chave
    // `__proto__` continua sendo dado comum e nunca muta o protótipo da cópia.
    Object.defineProperty(copia, chave, {
      value: copiarSnapshot(descritor.value, visitados),
      enumerable: true,
      writable: true,
      configurable: true,
    });
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

/** Mensagem constante para falhas de entrada, sem inspecionar o valor lançado. */
const MENSAGEM_ENTRADA_INVALIDA = "entrada não é um valor JSON canônico";

/**
 * Checa a marca de `ErroCanonicalizacao` sem `instanceof` — que um Proxy com trap
 * `getPrototypeOf` hostil pode forjar ou fazer propagar uma exceção estrangeira.
 * Só a identidade registrada pelo construtor conta; nenhuma leitura de
 * propriedade ocorre sobre o valor lançado.
 */
function ehErroCanonicalizacao(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && ERROS_CANONICALIZACAO.has(erro as object);
}

/**
 * Copia a entrada para dados JSON puros exatamente uma vez, rejeitando qualquer
 * parte não JSON (undefined, funções, símbolos, bigints, números não finitos,
 * objetos com protótipo estranho, arrays esparsos/com propriedades extras,
 * acessores e ciclos). Cada parte válida é lida uma única vez, de modo que a
 * validação, o hash e o catálogo derivem do mesmo snapshot imutável.
 *
 * A fronteira sancionada é dado JSON. Entradas respaldadas por Proxy passam
 * pelos traps reflexivos (`ownKeys`, `getPrototypeOf`, `getOwnPropertyDescriptor`)
 * dentro deste `try`, de forma que qualquer falha deles vira o `ErroCanonicalizacao`
 * tipado em vez de escapar como erro estrangeiro. Um Proxy deliberadamente
 * inconstante pode ainda devolver snapshots diferentes em chamadas separadas — o
 * JavaScript padrão não permite detectar um Proxy; por isso `carregarCatalogo`
 * tira o snapshot uma única vez e deriva regras e `regrasVersao` da mesma cópia.
 */
export function criarSnapshotJson(valor: unknown): unknown {
  try {
    return copiarSnapshot(valor, new Set<object>());
  } catch (erro) {
    if (ehErroCanonicalizacao(erro)) {
      throw erro;
    }
    throw new ErroCanonicalizacao(MENSAGEM_ENTRADA_INVALIDA);
  }
}

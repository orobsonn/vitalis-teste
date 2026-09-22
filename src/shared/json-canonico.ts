/**
 * Serialização JSON canônica: chaves de objeto ordenadas recursivamente e
 * nenhum espaço insignificante. Um valor primitivo string é o próprio texto
 * canônico (sem aspas), pois é ele que alimenta o digest.
 */

export function textoCanonico(valor: unknown): string {
  if (typeof valor === "string") {
    return valor;
  }
  if (valor === null || typeof valor !== "object") {
    const serializado = JSON.stringify(valor);
    return serializado === undefined ? "null" : serializado;
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(textoCanonico).join(",")}]`;
  }
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto).sort();
  const partes = chaves.map((chave) => `${JSON.stringify(chave)}:${textoCanonico(objeto[chave])}`);
  return `{${partes.join(",")}}`;
}

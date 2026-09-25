import { buscarConvenio, type Catalogo } from "../domain/catalogo";

/** Sugestões do catálogo vigente; a validação de cobertura continua no motor. */
export function procedimentosSugeridos(catalogo: Catalogo, nomeConvenio: string) {
  const convenio = buscarConvenio(catalogo, nomeConvenio);
  if (!convenio) return catalogo.procedimentos;
  const cobertos = new Set(convenio.procedimentosCobertos);
  return catalogo.procedimentos.filter(procedimento => cobertos.has(procedimento.codigo));
}

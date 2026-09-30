import { normalizarChave, type Catalogo } from "../domain";
import { PublicError } from "./errors";

export interface PaginaCatalogoInput { offset?: number; limite?: number }
export interface ProcedimentosInput extends PaginaCatalogoInput {
  convenio: string;
  cobertura?: "coberto" | "nao_coberto";
}
export interface BuscaProcedimentosInput extends ProcedimentosInput { termo: string }

function chave(texto: string) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function pagina<T>(items: T[], input: PaginaCatalogoInput) {
  const offset = input.offset ?? 0;
  const limite = input.limite ?? 50;
  return { items: items.slice(offset, offset + limite), total: items.length, offset, limite,
    proximo_offset: offset + limite < items.length ? offset + limite : null };
}

/** Leituras somente do snapshot validado; sem acesso a guias, IA ou storage. */
export function createCatalogHandlers(catalogo: Catalogo) {
  function convenio(nome: string) {
    // Priorizar a identidade exata antes do fallback sem acentos.
    const normalizado = normalizarChave(nome);
    const exato = catalogo.convenios.find(c => normalizarChave(c.nome) === normalizado);
    if (exato) return exato;
    const candidatos = catalogo.convenios.filter(c => chave(c.nome) === chave(nome));
    if (candidatos.length > 1) throw new PublicError(422, "Convênio ambíguo. Use o nome exato retornado por listar_convenios.");
    if (!candidatos[0]) throw new PublicError(404, "Convênio não encontrado. Consulte listar_convenios.");
    return candidatos[0];
  }
  function procedimentos(input: ProcedimentosInput, termo?: string) {
    const plano = convenio(input.convenio);
    const palavras = termo === undefined ? [] : chave(termo).split(" ");
    const items = catalogo.procedimentos.map(p => ({ codigo: p.codigo, descricao: p.descricao,
      cobertura: plano.procedimentosCobertos.includes(p.codigo) ? "coberto" : "nao_coberto",
      valor_referencia_centavos: p.valorReferenciaCentavos,
    })).filter(p => (!input.cobertura || input.cobertura === p.cobertura)
      && palavras.every(palavra => chave(`${p.codigo} ${p.descricao}`).includes(palavra)));
    const { items: resultado, ...meta } = pagina(items, input);
    return { convenio: plano.nome, regras_versao: catalogo.regrasVersao, procedimentos: resultado, ...meta };
  }
  return {
    listarConvenios(input: PaginaCatalogoInput) {
      const { items, ...meta } = pagina(catalogo.convenios.map(c => ({ nome: c.nome,
        quantidade_procedimentos: catalogo.procedimentos.length,
        quantidade_cobertos: c.procedimentosCobertos.length,
      })), input);
      return { convenios: items, regras_versao: catalogo.regrasVersao, versao: catalogo.versao, ...meta };
    },
    listarProcedimentos: (input: ProcedimentosInput) => procedimentos(input),
    buscarProcedimentos: (input: BuscaProcedimentosInput) => procedimentos(input, input.termo),
    obterConvenio(input: ProcedimentosInput) {
      const plano = convenio(input.convenio);
      return { ...procedimentos(input), campos_obrigatorios: [...plano.camposObrigatorios],
        validade_maxima_dias: plano.validadeMaximaDias, limite_sessoes: plano.limiteSessoes,
        prazo_envio_dias: plano.prazoEnvioDias, observacao: plano.observacao,
        limitacoes: [...catalogo.limitacoesGlobais], definicoes: { ...catalogo.definicoes } };
    },
  };
}

import { z } from "zod";
import { COLUNAS_GUIA, type ColunaGuia } from "../domain";

const celula = z.string().max(65_536).nullable().optional();
const colunas = Object.fromEntries(COLUNAS_GUIA.map((coluna) => [coluna, celula])) as
  Record<ColunaGuia, typeof celula>;

export const consultarRegraSchema = z.strictObject({
  convenio: z.string().max(512).describe("Nome informado na guia; não invente convênio."),
  procedimento_codigo: z.string().max(128).describe("Código informado do procedimento."),
});

const paginacao = {
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional().describe("Posição inicial; use proximo_offset para continuar."),
  limite: z.number().int().min(1).max(100).optional().describe("Itens por página, padrão 50, máximo 100."),
};
export const listarConveniosSchema = z.strictObject(paginacao);
export const listarProcedimentosSchema = z.strictObject({
  ...paginacao,
  convenio: z.string().min(1).max(512).refine(v => v.trim().length > 0).describe("Nome do convênio retornado por listar_convenios."),
  cobertura: z.enum(["coberto", "nao_coberto"]).optional().describe("Se omitido, inclui cobertos e não cobertos; para listar o que cobre, use coberto."),
});
export const buscarProcedimentosSchema = listarProcedimentosSchema.extend({
  termo: z.string().min(1).max(512).refine(v => v.trim().length > 0).describe("Palavras da descrição ou código; ignora acentos/maiúsculas e exige todas as palavras."),
});

export const verificarGuiaSchema = z.strictObject({
  guia: z.strictObject(colunas).describe(
    "Campos originais da guia. Preserve observacao_recepcao integralmente. Ausentes ficam omitidos, nulos ou vazios; nunca invente valores.",
  ),
  referencia_temporal: z.string().max(32).optional().describe(
    "Data explícita da conferência, em AAAA-MM-DD. Se omitida, o núcleo usa data_lancamento; não presume a data de hoje.",
  ),
});

export const registrarGuiaSchema = verificarGuiaSchema.extend({
  idempotency_key: z.string().min(1).max(256).refine((valor) => valor.trim().length > 0, {
    message: "A chave de idempotência não pode ser vazia.",
  }).describe("Chave estável da intenção de registro; reutilize a mesma chave e os mesmos dados em retentativas."),
});

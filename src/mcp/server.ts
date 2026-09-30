import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { codeMcpServer } from "@cloudflare/codemode/mcp";
import type { Executor } from "@cloudflare/codemode";
import type { ConsultaRegra } from "../domain";
import { PublicError } from "../application/errors";
import type { VitalisHandlers } from "./contratos";
import { consultarRegraSchema, verificarGuiaSchema, registrarGuiaSchema,
  listarConveniosSchema, listarProcedimentosSchema, buscarProcedimentosSchema } from "./schemas";
import { jsonDentroDoLimite, limitarExecutor } from "./limites";

const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function serializarRegra(regra: ConsultaRegra) {
  return {
    cobertura: regra.cobertura,
    procedimento: regra.procedimento ? {
      codigo: regra.procedimento.codigo,
      descricao: regra.procedimento.descricao,
      valor_referencia_centavos: regra.procedimento.valorReferenciaCentavos,
    } : null,
    campos_obrigatorios: regra.camposObrigatorios,
    validade_maxima_dias: regra.validadeMaximaDias,
    limite_sessoes: regra.limiteSessoes,
    prazo_envio_dias: regra.prazoEnvioDias,
    observacao: regra.observacao,
    limitacoes: regra.limitacoes,
    regras_versao: regra.regrasVersao,
  };
}

async function responder(acao: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    const valor = await acao();
    const text = jsonDentroDoLimite(valor);
    const result: CallToolResult = { content: [{ type: "text", text }] };
    if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
      result.structuredContent = valor as Record<string, unknown>;
    }
    // O envelope duplica structuredContent e texto: medir o que realmente sai.
    jsonDentroDoLimite(result);
    return result;
  } catch (erro) {
    if (erro instanceof PublicError) {
      const error = { status: erro.status, mensagem: erro.message };
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error }) }], structuredContent: { error } };
    }
    return {
      isError: true,
      content: [{ type: "text", text: erro instanceof RangeError
        ? "Resultado excede o limite. Reduza a consulta."
        : "Não foi possível concluir a operação. Confira os campos e tente novamente; em um registro, mantenha a chave de idempotência." }],
    };
  }
}

function registrarLeituras(server: McpServer, handlers: VitalisHandlers): void {
  server.registerTool("listar_convenios", {
    title: "Listar convênios", description: "Descobre os convênios cadastrados, nomes para consultas seguintes, quantidades de procedimentos e cobertura e versão do catálogo. Resultado paginado; continue por proximo_offset até null. Não registra guias.",
    inputSchema: listarConveniosSchema, annotations: READ_ANNOTATIONS,
  }, input => responder(() => handlers.listarConvenios(input)));
  server.registerTool("listar_procedimentos", {
    title: "Listar procedimentos do convênio", description: "Lista procedimentos conhecidos com código, descrição, cobertura explícita e valor de referência em centavos. Por padrão inclui não cobertos; para listar os cobertos use cobertura=coberto. Continue por proximo_offset até null. Use consultar_regra para detalhes de um código.",
    inputSchema: listarProcedimentosSchema, annotations: READ_ANNOTATIONS,
  }, input => responder(() => handlers.listarProcedimentos(input)));
  server.registerTool("buscar_procedimentos", {
    title: "Buscar procedimentos por nome ou código", description: "Busca palavras da descrição ou código dentro de um convênio, ignorando acentos e maiúsculas. Exige todas as palavras; resultados vazios não significam convênio inexistente. Retorna cobertura e valores; continue por proximo_offset até null.",
    inputSchema: buscarProcedimentosSchema, annotations: READ_ANNOTATIONS,
  }, input => responder(() => handlers.buscarProcedimentos(input)));
  server.registerTool("obter_convenio", {
    title: "Obter visão completa do convênio", description: "Retorna regras comuns, campos obrigatórios, limites, prazos, observação literal, definições, limitações e versão, com procedimentos e cobertura paginados. Continue por proximo_offset até null para recuperar todos. Valor é referência, sem garantia de pagamento. Não registra guias.",
    inputSchema: listarProcedimentosSchema, annotations: READ_ANNOTATIONS,
  }, input => responder(() => handlers.obterConvenio(input)));
  server.registerTool("consultar_regra", {
    title: "Consultar regra do convênio",
    description: "Consulta o catálogo versionado do Vitalis por convênio e procedimento. Retorna cobertura, campos exigidos, limites, observação literal e limitações. Não registra guias.",
    inputSchema: consultarRegraSchema,
    annotations: READ_ANNOTATIONS,
  }, (input) => responder(async () => serializarRegra(await handlers.consultarRegra(input))));
  server.registerTool("verificar_guia", {
    title: "Conferir guia sem salvar",
    description: "Confere uma guia pelo núcleo compartilhado e interpreta observacao_recepcao. Retorna decisão, motivos, evidências, orientações, limitações e checagem textual. Não persiste a guia nem altera indicadores. Não substitui campos ausentes por valores supostos.",
    inputSchema: verificarGuiaSchema,
    annotations: READ_ANNOTATIONS,
  }, (input) => responder(() => handlers.verificarGuia(input)));
}

export async function createVitalisMcpServer(handlers: VitalisHandlers, executor: Executor) {
  const base = new McpServer({ name: "vitalis-leitura", version: "1.0.0" });
  registrarLeituras(base, handlers);
  let server: McpServer;
  try {
    server = await codeMcpServer({
      server: base,
      executor: limitarExecutor(executor),
      description: "Execute uma função JavaScript async () => { ... } para combinar apenas leituras do Vitalis. Tempo máximo 5 segundos, até 20 chamadas e 128 KiB de saída. Sem fetch, connect, escrita ou acesso ao banco/secrets. Não use TypeScript. Retorne dados concisos.\n\n{{types}}\n\n{{example}}",
    });
  } catch (erro) {
    await base.close();
    throw erro;
  }
  registrarLeituras(server, handlers);
  server.registerTool("registrar_guia", {
    title: "Registrar ou revisar guia",
    description: "Persiste a guia e sua conferência com histórico. Use somente quando a pessoa pedir explicitamente para salvar/registrar/corrigir; conferir sozinho não autoriza gravação. Reenvios usam a mesma idempotency_key e os mesmos dados. Alteração real usa nova chave e preserva histórico. Indisponível dentro de code.",
    inputSchema: registrarGuiaSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => responder(() => handlers.registrarGuia(input)));
  return {
    server,
    async close() {
      await server.close();
      await base.close();
    },
  };
}

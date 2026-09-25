import { ESQUEMA_JSON_EXTRACAO } from "../../src/semantic/validacao";
import { describe, expect, it } from "vitest";
import { criarInterpretadorWorkersAi } from "../../src/semantic/workers-ai";
import { validarExtracao } from "../../src/semantic/validacao";

// Formato efetivamente observado na API Cloudflare em 25/09/2026 usando
// response_format:json_object. Conteúdo sintético, sem registro de guia.
const entrada = { observacao_recepcao: "Paciente pediu recibo para reembolso.", convenio: "Vitalcard", procedimento_codigo: "50000470" };
const respostaJsonReal = {
  ambiguidades: [],
  sinais: [{ evidencia: entrada.observacao_recepcao, tipo: "pedido_de_recibo" }],
  situacao: { autorizacao: "nenhuma", modalidade: "nenhuma", procedimento: "nenhuma", reagendamento: "nenhum" },
};

describe("compatibilidade com JSON mode real do Workers AI", () => {
  it("solicita JSON fechado no transporte e serializa response objeto sem perder campos", async () => {
    let enviada: Record<string, unknown> | undefined;
    const interpretador = criarInterpretadorWorkersAi({ run: async (_modelo, payload) => { enviada = payload; return { response: respostaJsonReal }; } });
    const resposta = await interpretador.extrair(entrada);
    expect(enviada?.response_format).toEqual({ type: "json_schema", json_schema: ESQUEMA_JSON_EXTRACAO });
    expect(enviada?.temperature).toBe(0);
    expect(enviada?.max_tokens).toBe(512);
    expect(JSON.parse(resposta.texto)).toEqual(respostaJsonReal);
    expect(validarExtracao(resposta.texto, entrada.observacao_recepcao).ok).toBe(true);
  });

  it("não aceita decisão inserida pelo modelo e não remove campo inesperado para consertar saída", async () => {
    const interpretador = criarInterpretadorWorkersAi({ run: async () => ({ response: { ...respostaJsonReal, decisao: "OK" } }) });
    const resposta = await interpretador.extrair(entrada);
    expect(JSON.parse(resposta.texto).decisao).toBe("OK");
    expect(validarExtracao(resposta.texto, entrada.observacao_recepcao).ok).toBe(false);
  });

  it("recusa ambiguidades como strings, formato inválido observado no provedor real", async () => {
    const response = { sinais: [], situacao: respostaJsonReal.situacao, ambiguidades: ["autorizacao_indefinida", "modalidade_indefinida", "procedimento_indefinido"] };
    const interpretador = criarInterpretadorWorkersAi({ run: async () => ({ response }) });
    const resposta = await interpretador.extrair(entrada);
    expect(validarExtracao(resposta.texto, entrada.observacao_recepcao)).toEqual({ ok: false, erro: "estrutura_invalida" });
    const schema = ESQUEMA_JSON_EXTRACAO as { additionalProperties?: unknown; required?: string[]; properties?: Record<string, { items?: { type?: string; required?: string[] } }> };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required?.toSorted()).toEqual(["ambiguidades", "sinais", "situacao"]);
    expect(schema.properties?.ambiguidades.items?.type).toBe("object");
    expect(schema.properties?.ambiguidades.items?.required?.toSorted()).toEqual(["evidencia", "tipo"]);
  });

  it("preserva rejeição de cerca Markdown e de JSON truncado", async () => {
    for (const texto of ["```json\n" + JSON.stringify(respostaJsonReal) + "\n```", '{"sinais":']) {
      const interpretador = criarInterpretadorWorkersAi({ run: async () => ({ response: texto }) });
      const resposta = await interpretador.extrair(entrada);
      expect(resposta.texto).toBe(texto);
      expect(validarExtracao(resposta.texto, entrada.observacao_recepcao).ok).toBe(false);
    }
  });

  it("não transforma evidência inventada em extração válida", async () => {
    const interpretador = criarInterpretadorWorkersAi({ run: async () => ({ response: { ...respostaJsonReal, sinais: [{ tipo: "pedido_de_recibo", evidencia: "Paciente solicitou recibo" }] } }) });
    const resposta = await interpretador.extrair(entrada);
    expect(validarExtracao(resposta.texto, entrada.observacao_recepcao)).toEqual({ ok: false, erro: "evidencia_invalida" });
  });

  it("recusa objeto com getter ou toJSON sem executar métodos do provedor", async () => {
    let calls = 0;
    const hostile = { ...respostaJsonReal, toJSON() { calls++; return respostaJsonReal; } };
    const getter = { ...respostaJsonReal };
    Object.defineProperty(getter, "sinais", { enumerable: true, get() { calls++; return respostaJsonReal.sinais; } });
    for (const response of [hostile, getter, null, 1, [], undefined]) {
      const interpretador = criarInterpretadorWorkersAi({ run: async () => ({ response }) });
      await expect(interpretador.extrair(entrada)).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });
});

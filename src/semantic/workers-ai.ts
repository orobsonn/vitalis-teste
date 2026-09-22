/**
 * Adaptador de produção sobre o binding `AI` do Workers AI (§3.1/§3.7).
 *
 * Responsabilidade única: transformar a entrada de domínio (`EntradaObservacao`)
 * em exatamente uma chamada de chat ao modelo fixado por configuração e devolver
 * a resposta bruta com os metadados efetivamente usados. Nada de retentativa,
 * timeout, cache ou logging aqui — essas políticas pertencem à orquestração.
 *
 * A requisição é fechada: system com o prompt versionado e user com o JSON dos
 * três campos, `max_tokens` como único teto. Nenhuma opção extra (`tools`,
 * functions, `stream`, …) e nenhum identificador estruturado é enviado. O modelo
 * vem de `MODELO_OBSERVACAO` ou da configuração injetada; jamais do texto da
 * observação, que é dado não confiável.
 */

import type {
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
} from "./contratos";
import { TEXTO_PROMPT, versaoEfetivaDoPrompt } from "./prompt";

/** Modelo padrão fixo do contrato; sobreponível apenas por configuração. */
export const MODELO_OBSERVACAO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Teto nativo de geração da resposta (spec §3.9). */
const MAX_TOKENS_RESPOSTA = 512;

/**
 * Superfície mínima do binding de inferência. O binding real do Workers AI
 * (`Env.AI`) e o fake estrutural usado nos testes satisfazem esta interface; um
 * fake de `InterpretadorObservacao` não substituiria a chamada real.
 */
export interface BindingAi {
  run(modelo: string, entrada: Record<string, unknown>): Promise<unknown>;
}

/** Opções de configuração do adaptador de produção. */
export interface OpcoesInterpretadorWorkersAi {
  /** Modelo fixado por configuração; padrão `MODELO_OBSERVACAO`. */
  modelo?: string;
}

/**
 * Monta a requisição exata de §3.1. O payload do usuário é reconstruído campo a
 * campo, de modo que propriedades extras eventualmente presentes na entrada não
 * vazem ao provedor: apenas `observacao_recepcao`, `convenio` e
 * `procedimento_codigo` são serializados.
 */
function montarRequisicao(entradaObservacao: EntradaObservacao): {
  messages: { role: string; content: string }[];
  max_tokens: number;
} {
  const payloadUsuario = JSON.stringify({
    observacao_recepcao: entradaObservacao.observacao_recepcao,
    convenio: entradaObservacao.convenio,
    procedimento_codigo: entradaObservacao.procedimento_codigo,
  });

  return {
    messages: [
      { role: "system", content: TEXTO_PROMPT },
      { role: "user", content: payloadUsuario },
    ],
    max_tokens: MAX_TOKENS_RESPOSTA,
  };
}

/** Lê o texto serializado do campo `response` devolvido pelo binding. */
function textoDaResposta(resultado: unknown): string {
  if (typeof resultado === "object" && resultado !== null) {
    const resposta = (resultado as { response?: unknown }).response;
    if (typeof resposta === "string") {
      return resposta;
    }
  }

  throw new Error("Resposta do provedor sem campo `response` textual.");
}

/**
 * Cria o interpretador de produção sobre o binding `AI`. Cada chamada a
 * `extrair` faz uma única inferência e devolve `{ texto, modelo, promptVersao }`
 * com o modelo enviado e a versão+hash do prompt efetivamente usados.
 */
export function criarInterpretadorWorkersAi(
  ai: BindingAi,
  opcoes: OpcoesInterpretadorWorkersAi = {},
): InterpretadorObservacao {
  const modelo = opcoes.modelo ?? MODELO_OBSERVACAO;

  return {
    async extrair(entradaObservacao: EntradaObservacao): Promise<RespostaBruta> {
      const resultado = await ai.run(modelo, montarRequisicao(entradaObservacao));

      return {
        texto: textoDaResposta(resultado),
        modelo,
        promptVersao: versaoEfetivaDoPrompt(),
      };
    },
  };
}

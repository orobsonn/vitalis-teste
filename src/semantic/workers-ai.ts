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
 * observação, que é dado não confiável. A configuração é normalizada: só uma
 * string não vazia (após `trim`), preservada literalmente, é aceita como
 * identidade; vazio, só espaços ou valor não-string recaem no padrão, de modo
 * que uma identidade vazia nunca chega ao provedor.
 *
 * Teto de ABUSO por campo cru: antes de serializar o payload e antes de chamar o
 * provedor, cada campo bruto (`observacao_recepcao`, `convenio`,
 * `procedimento_codigo`) é confrontado com `campoTemTamanhoDeAbuso` do contrato
 * compartilhado (mesmo `LIMITE_TEXTO_BRUTO_BYTES`, 64 KiB em bytes UTF-8). A
 * fronteira é inclusiva: exatamente o teto é enviado normalmente; um byte acima
 * é recusado com `ErroTetoDeAbuso`, SEM serializar o payload gigante e SEM
 * disparar inferência. Não é um limite semântico de entrada — esses continuam
 * nos contratos próprios — e nada de retentativa, timeout, cache ou quota aqui:
 * essas políticas permanecem na orquestração.
 *
 * Teto de COMPRIMENTO da identidade configurada: o adaptador — e SOMENTE o
 * adaptador — recusa, já na construção, uma `opcoes.modelo` textual acima de
 * 200 caracteres, medidos no valor CRU (sem `trim`), com `ErroModeloInvalido`.
 * O teto é alinhado NUMERICAMENTE ao limite de contexto do contrato
 * compartilhado (`LIMITE_CONTEXTO = 200`, usado para convênio/procedimento no
 * caminho central), mas mantido local de propósito, para não criar ciclo de
 * importação com `conferencia.ts`. O caminho central NÃO aplica esse teto à
 * identidade do modelo: `normalizarModelo` só trata vazio/whitespace/não-string.
 * A recusa na construção impede que a identidade hostil seja retida no closure
 * ou enviada ao provedor.
 */

import type {
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
} from "./contratos";
import { LIMITE_TEXTO_BRUTO_BYTES, campoTemTamanhoDeAbuso } from "./contratos";
import { TEXTO_PROMPT, versaoEfetivaDoPrompt } from "./prompt";

/** Modelo padrão fixo do contrato; sobreponível apenas por configuração. */
export const MODELO_OBSERVACAO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Teto nativo de geração da resposta (spec §3.9). */
const MAX_TOKENS_RESPOSTA = 512;

/**
 * Teto de COMPRIMENTO da identidade configurada do modelo: 200 caracteres,
 * medidos no valor CRU (sem `trim`) no momento da construção. Alinhado
 * NUMERICAMENTE ao teto de contexto do contrato compartilhado
 * (`LIMITE_CONTEXTO = 200`, usado para convênio/procedimento no caminho
 * central) e mantido LOCAL de propósito, para não criar ciclo de importação
 * com `conferencia.ts`. O caminho central não aplica esse teto à identidade do
 * modelo; a recusa é responsabilidade deste adaptador.
 */
const LIMITE_MODELO_CARACTERES = 200;

/**
 * Erro tipado e distinguível de teto de abuso por campo cru.
 *
 * Lançado quando algum dos três campos brutos enviados ao provedor excede o teto
 * de abuso compartilhado (`LIMITE_TEXTO_BRUTO_BYTES`, 64 KiB em bytes UTF-8),
 * medido no valor CRU antes de qualquer serialização. `name` é estável
 * (`"ErroTetoDeAbuso"`) para que o chamador classifique a falha sem inspecionar
 * a mensagem; a mensagem nomeia apenas o campo infrator e nunca o valor de
 * entrada.
 */
export class ErroTetoDeAbuso extends Error {
  constructor(campo: string) {
    super(
      `Campo bruto acima do teto de abuso de ${LIMITE_TEXTO_BRUTO_BYTES} bytes UTF-8: ${campo}.`,
    );
    this.name = "ErroTetoDeAbuso";
  }
}

/**
 * Erro tipado e distinguível de identidade de modelo inválida.
 *
 * Lançado na CONSTRUÇÃO do interpretador quando `opcoes.modelo` é uma string
 * acima do teto de comprimento (`LIMITE_MODELO_CARACTERES`, 200 caracteres),
 * medido no valor CRU antes de qualquer `trim`. A recusa precede a
 * normalização e a retenção do valor no closure, de modo que a identidade
 * hostil jamais chega ao provedor. `name` é estável (`"ErroModeloInvalido"`)
 * para que o chamador classifique a falha sem inspecionar a mensagem; a
 * mensagem cita APENAS o limite e NUNCA o valor de entrada.
 */
export class ErroModeloInvalido extends Error {
  constructor() {
    super(`Identidade de modelo acima do teto de ${LIMITE_MODELO_CARACTERES} caracteres.`);
    this.name = "ErroModeloInvalido";
  }
}

/** Campos brutos do payload do provedor sujeitos ao teto de abuso (§3.9). */
const CAMPOS_BRUTOS: readonly (keyof EntradaObservacao)[] = [
  "observacao_recepcao",
  "convenio",
  "procedimento_codigo",
];

/**
 * Recusa, por campo cru, entradas acima do teto de abuso. Chamada ANTES de
 * `montarRequisicao` e de `ai.run`, de modo que uma entrada abusiva não chegue a
 * ser serializada nem enviada ao provedor. A fronteira é inclusiva: exatamente o
 * teto passa.
 */
function garantirEntradaDentroDoTetoDeAbuso(entradaObservacao: EntradaObservacao): void {
  for (const campo of CAMPOS_BRUTOS) {
    if (campoTemTamanhoDeAbuso(entradaObservacao[campo])) {
      throw new ErroTetoDeAbuso(campo);
    }
  }
}

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
  /**
   * Modelo fixado por configuração; padrão `MODELO_OBSERVACAO`. Só uma string
   * não vazia (após `trim`) é aceita como identidade; vazio, só espaços ou
   * valor não-string recaem no padrão (ver `normalizarModelo`). Uma string
   * acima de 200 caracteres (valor CRU, sem `trim`) é recusada na construção
   * com `ErroModeloInvalido`.
   */
  modelo?: string;
}

/**
 * Modelo efetivo da configuração, com a MESMA semântica da orquestração
 * (`conferencia.ts`): só uma string não vazia após `trim` é aceita e é
 * PRESERVADA LITERALMENTE — inclusive espaços laterais — para conferir com a
 * identidade que o provedor devolve; qualquer outra forma (`undefined`, `""`,
 * só espaços ou valor não-string em runtime) recai no padrão
 * `MODELO_OBSERVACAO`. Assim nunca uma identidade vazia ou não-string chega ao
 * provedor, e o modelo enviado a `ai.run` coincide com o `modelo` devolvido.
 */
function normalizarModelo(valor: unknown): string {
  return typeof valor === "string" && valor.trim() !== "" ? valor : MODELO_OBSERVACAO;
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
 *
 * Aplica o teto de abuso por campo cru antes de serializar e antes de chamar o
 * provedor (fronteira inclusiva); entrada acima do teto falha com
 * `ErroTetoDeAbuso` sem nenhuma chamada ao binding, deixando ao chamador a
 * classificação como `limite_excedido`.
 *
 * Antes de normalizar, uma `opcoes.modelo` textual acima de 200 caracteres
 * (valor CRU, sem `trim`) é recusada com `ErroModeloInvalido` ainda na
 * construção: nenhum interpretador é devolvido, o valor hostil não é retido e
 * o binding nunca é tocado.
 *
 * O modelo de `opcoes` passa por `normalizarModelo`: só uma string não vazia
 * (após `trim`), preservada literalmente, é aceita como identidade; vazio, só
 * espaços ou valor não-string em runtime recaem em `MODELO_OBSERVACAO`. Esse é
 * o mesmo critério da orquestração, de modo que o primeiro argumento de
 * `ai.run` e o campo `modelo` da resposta são sempre uma identidade consistente
 * com a configuração, jamais uma string em branco.
 */
export function criarInterpretadorWorkersAi(
  ai: BindingAi,
  opcoes: OpcoesInterpretadorWorkersAi = {},
): InterpretadorObservacao {
  if (typeof opcoes.modelo === "string" && opcoes.modelo.length > LIMITE_MODELO_CARACTERES) {
    throw new ErroModeloInvalido();
  }

  const modelo = normalizarModelo(opcoes.modelo);

  return {
    async extrair(entradaObservacao: EntradaObservacao): Promise<RespostaBruta> {
      garantirEntradaDentroDoTetoDeAbuso(entradaObservacao);

      const resultado = await ai.run(modelo, montarRequisicao(entradaObservacao));

      return {
        texto: textoDaResposta(resultado),
        modelo,
        promptVersao: versaoEfetivaDoPrompt(),
      };
    },
  };
}

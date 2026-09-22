/**
 * Quota best-effort de chamadas por isolate, em memória, por janela fixa (§3.9).
 *
 * Responsabilidade única: decidir, antes de qualquer chamada ao modelo, se uma
 * **tentativa** ainda cabe na janela corrente. Não é quota global de custo nem
 * de tokens: o contador vive no isolate e se reinicia quando a janela avança.
 *
 * Garantias do contrato (§3.9, #ac-17):
 * - Relógio injetável (`agora`), sem timers reais; padrão `Date.now`.
 * - Padrões `LIMITE_PADRAO_CHAMADAS` (60) e `JANELA_PADRAO_MS` (60000 ms),
 *   ambos configuráveis por opção.
 * - Cada `consumir()` representa uma tentativa efetiva; quando o saldo acaba a
 *   recusa é devolvida (`false`) **antes** de o chamador acionar o modelo, e o
 *   observador injetável é notificado a cada recusa (cumulativo, não flag).
 * - Passada a janela (`>= janelaMs` desde o início corrente), uma nova janela
 *   abre e volta a aceitar; o histórico de recusas não é apagado.
 * - A quota não chama o modelo, não conhece cache e não emite logging; apenas
 *   reporta a recusa ao observador para que a orquestração conte as métricas.
 */

/** Observador injetável dos contadores de operação (§3.9). */
export interface ObservadorContadores {
  /** Conta uma tentativa efetiva encaminhada ao modelo. */
  registrarChamada(): void;
  /** Conta um acerto de cache semântico. */
  registrarCacheHit(): void;
  /** Conta uma tentativa recusada pela quota, somando recusas. */
  registrarRecusaQuota(): void;
}

/** Quota consultável pela orquestração antes de chamar o modelo. */
export interface QuotaDeChamadas {
  /** Consome uma tentativa da janela corrente; `false` quando esgotada. */
  consumir(): boolean;
}

/** Opções de configuração da quota por isolate. */
export interface OpcoesQuotaDeChamadas {
  /** Máximo de tentativas aceitas por janela; padrão `LIMITE_PADRAO_CHAMADAS`. */
  limite?: number;
  /** Duração da janela em ms; padrão `JANELA_PADRAO_MS`. */
  janelaMs?: number;
  /** Relógio injetável (monotônico esperado); padrão `Date.now`. */
  agora?: () => number;
  /** Observador injetável de contadores; opcional. */
  observador?: ObservadorContadores;
}

/** Limite padrão de tentativas por janela e por isolate (§3.9). */
export const LIMITE_PADRAO_CHAMADAS = 60;

/** Duração padrão da janela de quota em milissegundos (§3.9). */
export const JANELA_PADRAO_MS = 60000;

/**
 * Cria uma quota em memória com relógio e observador injetáveis. O estado fica
 * confinado à instância devolvida, o que corresponde a "por isolate" no runtime.
 */
export function criarQuotaDeChamadas(
  opcoes: OpcoesQuotaDeChamadas = {},
): QuotaDeChamadas {
  const limite = opcoes.limite ?? LIMITE_PADRAO_CHAMADAS;
  const janelaMs = opcoes.janelaMs ?? JANELA_PADRAO_MS;
  const agora = opcoes.agora ?? Date.now;

  let inicioJanela: number | undefined;
  let consumidas = 0;

  return {
    consumir(): boolean {
      const instante = agora();

      if (inicioJanela === undefined || instante - inicioJanela >= janelaMs) {
        inicioJanela = instante;
        consumidas = 0;
      }

      if (consumidas >= limite) {
        opcoes.observador?.registrarRecusaQuota();
        return false;
      }

      consumidas += 1;
      return true;
    },
  };
}

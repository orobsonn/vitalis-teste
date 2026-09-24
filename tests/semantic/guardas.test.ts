// Testes travados da task-5-guardas-operacionais (feature
// semantic-observation-interpretation):
//   lt-quota-por-tentativa        — com relógio e quota injetáveis, 60 consumos
//                                    na janela são aceitos (cada consumo = uma
//                                    tentativa efetiva), o 61º é recusado SEM
//                                    callback de modelo, o contador de recusas
//                                    incrementa e a nova janela volta a aceitar
//                                    (#ac-17, §3.9);
//   lt-logging-redigido-allowlist — somente chaves/tipos da allowlist e códigos
//                                    estáveis atravessam o `RegistradorRedigido`;
//                                    campos permitidos misturados com observação,
//                                    id_guia, paciente, carteirinha, autorização,
//                                    profissional, prompt, resposta e mensagem crua
//                                    são descartados; `cache_prefixo` é limitado a
//                                    12 hex; nenhum `console.*` direto é chamado e
//                                    nenhum corpo/identificador aparece
//                                    (#ac-14, #ac-23, §3.10).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// `src/semantic/quota.ts`/`src/semantic/observabilidade.ts` e as exportações
// correspondentes do barrel ainda não existem: a falha é de asserção no primeiro
// `expect` de cada caso, nunca de coleta/import. O relógio é injetado por um fake
// determinístico (sem timers reais) e o destino do registrador é injetado
// (sem rede, sem KV, sem Workers AI).
import { afterEach, describe, expect, it, vi } from "vitest";

interface ObservadorContadores {
  registrarChamada(): void;
  registrarCacheHit(): void;
  registrarRecusaQuota(): void;
}

interface QuotaDeChamadas {
  consumir(): boolean;
  // `true` exatamente quando `criarQuotaDeChamadas` recebeu um observador e,
  // portanto, já auto-notifica `registrarRecusaQuota()` em `consumir() === false`.
  // Ausente quando nenhum observador foi fornecido: consultável por quem orquestra
  // para não notificar a mesma recusa duas vezes (evita double-count).
  notificaRecusaNoObservador?: boolean;
}

interface OpcoesQuotaDeChamadas {
  limite?: number;
  janelaMs?: number;
  agora?: () => number;
  observador?: ObservadorContadores;
}

interface CamposPermitidos {
  [chave: string]: unknown;
}

// Registro redigido: exatamente as chaves da allowlist de §3.10.
interface EventoRedigido {
  evento: string;
  estado?: string;
  codigo?: string;
  cache_prefixo?: string;
  duracao_ms?: number;
  tentativas?: number;
  itens?: number;
}

interface RegistradorRedigido {
  info(evento: string, campos: CamposPermitidos): void;
}

interface ApiAprovada {
  criarQuotaDeChamadas(opcoes?: OpcoesQuotaDeChamadas): QuotaDeChamadas;
  criarRegistradorRedigido(
    destino: (evento: EventoRedigido) => void,
    opcoes?: { observador?: ObservadorContadores },
  ): RegistradorRedigido;
}

const modulosBarrel = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada | undefined;

const LIMITE_PADRAO = 60;
const JANELA_PADRAO_MS = 60000;

// Allowlist fechada de chaves de §3.10.
const CHAVES_PERMITIDAS = new Set([
  "evento",
  "estado",
  "codigo",
  "cache_prefixo",
  "duracao_ms",
  "tentativas",
  "itens",
]);

// Classificações estáveis de código de §3.10 (nenhuma mensagem crua do provedor).
const CODIGOS_ESTAVEIS = new Set([
  "erro_transporte",
  "timeout",
  "schema_invalido",
  "evidencia_invalida",
  "limite_excedido",
  "quota_excedida",
  "cache_indisponivel",
]);

interface ValoresContadores {
  chamadas: number;
  cacheHits: number;
  recusasQuota: number;
}

interface ObservadorFake {
  observador: ObservadorContadores;
  valores(): ValoresContadores;
}

// Observador injetável de contadores (§3.9, julgamento `contadores_observaveis`):
// métricas expostas por observador, não por campos novos de ResultadoVerificacao.
function criarObservadorFake(): ObservadorFake {
  let chamadas = 0;
  let cacheHits = 0;
  let recusasQuota = 0;

  const observador: ObservadorContadores = {
    registrarChamada() {
      chamadas += 1;
    },
    registrarCacheHit() {
      cacheHits += 1;
    },
    registrarRecusaQuota() {
      recusasQuota += 1;
    },
  };

  return { observador, valores: () => ({ chamadas, cacheHits, recusasQuota }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lt-quota-por-tentativa", () => {
  it("aceita 60 tentativas na janela, recusa a seguinte sem chamar o modelo e reabre na nova janela", () => {
    expect(typeof api?.criarQuotaDeChamadas).toBe("function");

    // Relógio injetável determinístico: a janela avança movendo o valor.
    let agora = 0;
    const relogio = () => agora;

    const { observador, valores } = criarObservadorFake();

    // Callback de modelo observável: só é invocado quando `consumir()` aceita.
    let chamadasAoModelo = 0;
    const chamarModelo = () => {
      chamadasAoModelo += 1;
    };

    const quota = api!.criarQuotaDeChamadas({ agora: relogio, observador });

    // 60 consumos na mesma janela: cada consumo representa uma tentativa efetiva.
    for (let tentativa = 1; tentativa <= LIMITE_PADRAO; tentativa += 1) {
      if (quota.consumir()) {
        chamarModelo();
      }
    }

    expect(chamadasAoModelo).toBe(LIMITE_PADRAO);
    expect(valores().recusasQuota).toBe(0);

    // 61ª tentativa na janela esgotada: recusada ANTES de qualquer callback de modelo.
    const aceitouNa61 = quota.consumir();
    if (aceitouNa61) {
      chamarModelo();
    }

    expect(aceitouNa61).toBe(false);
    expect(chamadasAoModelo).toBe(LIMITE_PADRAO);
    expect(valores().recusasQuota).toBe(1);

    // A recusa é cumulativa, não um flag de uso único.
    expect(quota.consumir()).toBe(false);
    expect(chamadasAoModelo).toBe(LIMITE_PADRAO);
    expect(valores().recusasQuota).toBe(2);

    // Nova janela (relógio além de 60000 ms): volta a aceitar; o contador não zera.
    agora += JANELA_PADRAO_MS + 1;
    const aceitouNovaJanela = quota.consumir();
    if (aceitouNovaJanela) {
      chamarModelo();
    }

    expect(aceitouNovaJanela).toBe(true);
    expect(chamadasAoModelo).toBe(LIMITE_PADRAO + 1);
    expect(valores().recusasQuota).toBe(2);
  });

  it("expoe notificaRecusaNoObservador=true somente quando ha observador injetado", () => {
    expect(typeof api?.criarQuotaDeChamadas).toBe("function");

    const { observador } = criarObservadorFake();

    // Com observador, a quota já auto-notifica a recusa em `consumir() === false`;
    // o marcador diz isso a quem orquestra, evitando contar a mesma recusa duas vezes.
    const quotaComObservador = api!.criarQuotaDeChamadas({ observador });
    expect(quotaComObservador.notificaRecusaNoObservador).toBe(true);

    // Sem observador, não há notificação própria da quota: o marcador fica ausente.
    const quotaSemObservador = api!.criarQuotaDeChamadas();
    expect(quotaSemObservador.notificaRecusaNoObservador).toBeUndefined();
  });
});

describe("lt-logging-redigido-allowlist", () => {
  it("deixa atravessar somente chaves/tipos da allowlist e códigos estáveis, sem PII e sem console direto", () => {
    expect(typeof api?.criarRegistradorRedigido).toBe("function");

    const capturados: EventoRedigido[] = [];
    const registrador = api!.criarRegistradorRedigido((evento) => {
      capturados.push(evento);
    });

    // Espiões de console instalados antes de emitir os eventos.
    const espiaoLog = vi.spyOn(console, "log");
    const espiaoInfo = vi.spyOn(console, "info");
    const espiaoWarn = vi.spyOn(console, "warn");
    const espiaoError = vi.spyOn(console, "error");
    const espiaoDebug = vi.spyOn(console, "debug");

    const PREFIXO_HEX_64 = "a".repeat(64);

    // Evento com campos permitidos misturados com corpos/identificadores sensíveis.
    registrador.info("extracao_iniciada", {
      estado: "incompleta",
      codigo: "quota_excedida",
      cache_prefixo: PREFIXO_HEX_64,
      duracao_ms: 1234,
      tentativas: 1,
      itens: 3,
      observacao_recepcao: "MARCADOR_OBSERVACAO_INTEGRAL",
      id_guia: "MARCADOR_ID_GUIA",
      paciente: "MARCADOR_PACIENTE",
      carteirinha: "MARCADOR_CARTEIRINHA",
      autorizacao: "MARCADOR_AUTORIZACAO",
      profissional: "MARCADOR_PROFISSIONAL",
      prompt: "MARCADOR_PROMPT_COMPLETO",
      resposta: "MARCADOR_RESPOSTA_BRUTA",
      mensagem: "MARCADOR_MENSAGEM_CRUA_DO_PROVEDOR",
    });

    // Evento com valores que violam a allowlist/tipo: código livre e prefixo não-hex.
    registrador.info("extracao_falhou", {
      codigo: "MARCADOR_CODIGO_LIVRE_NAO_CLASSIFICADO",
      cache_prefixo: "MARCADOR_PREFIXO_NAO_HEX",
      mensagem: "MARCADOR_MENSAGEM_CRUA_2",
    });

    expect(capturados).toHaveLength(2);

    // Somente chaves da allowlist atravessam, em ambos os eventos.
    for (const registro of capturados) {
      for (const chave of Object.keys(registro)) {
        expect(CHAVES_PERMITIDAS.has(chave)).toBe(true);
      }
    }

    // Campos permitidos atravessam com o tipo correto.
    expect(capturados[0].evento).toBe("extracao_iniciada");
    expect(capturados[0].estado).toBe("incompleta");
    expect(capturados[0].codigo).toBe("quota_excedida");
    expect(CODIGOS_ESTAVEIS.has(capturados[0].codigo as string)).toBe(true);
    expect(capturados[0].duracao_ms).toBe(1234);
    expect(capturados[0].tentativas).toBe(1);
    expect(capturados[0].itens).toBe(3);

    // `cache_prefixo` é limitado a 12 caracteres hexadecimais.
    expect(capturados[0].cache_prefixo).toBe(PREFIXO_HEX_64.slice(0, 12));
    expect(capturados[0].cache_prefixo).toMatch(/^[0-9a-f]{1,12}$/);

    // Código não estável e prefixo não-hex são descartados antes de registrar.
    expect(capturados[1].evento).toBe("extracao_falhou");
    expect(capturados[1].codigo).toBeUndefined();
    expect(capturados[1].cache_prefixo).toBeUndefined();

    // Nenhum corpo ou identificador aparece em qualquer registro emitido.
    const serializado = JSON.stringify(capturados);
    const marcadoresSensiveis = [
      "MARCADOR_OBSERVACAO_INTEGRAL",
      "MARCADOR_ID_GUIA",
      "MARCADOR_PACIENTE",
      "MARCADOR_CARTEIRINHA",
      "MARCADOR_AUTORIZACAO",
      "MARCADOR_PROFISSIONAL",
      "MARCADOR_PROMPT_COMPLETO",
      "MARCADOR_RESPOSTA_BRUTA",
      "MARCADOR_MENSAGEM_CRUA_DO_PROVEDOR",
      "MARCADOR_CODIGO_LIVRE_NAO_CLASSIFICADO",
      "MARCADOR_PREFIXO_NAO_HEX",
      "MARCADOR_MENSAGEM_CRUA_2",
    ];
    for (const marcador of marcadoresSensiveis) {
      expect(serializado).not.toContain(marcador);
    }

    // Nenhum `console.*` direto foi chamado durante a emissão dos eventos.
    expect(espiaoLog).not.toHaveBeenCalled();
    expect(espiaoInfo).not.toHaveBeenCalled();
    expect(espiaoWarn).not.toHaveBeenCalled();
    expect(espiaoError).not.toHaveBeenCalled();
    expect(espiaoDebug).not.toHaveBeenCalled();
  });
});

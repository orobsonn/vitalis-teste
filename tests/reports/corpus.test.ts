// Teste travado lt-corpus-relatorios-sem-lookup (#ac-8, #ac-9, #ac-10, #ac-11,
// #ac-12, #ac-13, #ac-16):
//
//   Given o CSV oficial de 80 guias, o catálogo real e o oráculo semântico
//   chaveado por CONTEÚDO da observação (nunca por `id_guia`), processados via
//   `conferirGuia` real,
//   When a importação completa e os relatórios de estoque e atividade são lidos,
//   Then o estoque vigente é 80 guias com 44 OK, 36 PENDENTE e 569400 centavos
//   registrados; as quatro guias 0027/0057/0059/0076 estão PENDENTE com 32000
//   centavos sob revisão; a exposição exclusiva é 222000 estruturada + 47200
//   textual/duplicidade = 269200; o excesso possível é 16000, SEPARADO e não
//   aditivo à exposição; e o valor sem pendência é 300200.
//
//   A prova anti-lookup globa `src/storage`, `src/application` e `src/reports`
//   por `?raw` e exige que nenhum módulo contenha literal `G-2608-\d{4}`; o
//   oráculo é conferido como chaveado por conteúdo, não por id.
//
// O barrel `src/reports/index.ts` entra por `import.meta.glob` (a SUT ainda não
// existe): a primeira asserção é de superfície, de modo que o RED é falha de
// asserção, nunca erro de coleta/import. As ENTRADAS usam apenas módulos já
// integrados (`src/domain`, `src/semantic`, `src/application/imports`,
// `src/shared`, `tests/storage/support/banco`) e as fixtures oficiais em `?raw`.
import { describe, expect, it } from "vitest";

import csv from "../../docs/fontes/guias.csv?raw";
import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";
import oraculoRaw from "../semantic/fixtures/oraculo-corpus.json?raw";

import { criarBanco } from "../storage/support/banco";
import { carregarCatalogo } from "../../src/domain";
import type { Catalogo, GuiaNormalizada, ResultadoVerificacao } from "../../src/domain";
import {
  MODELO_OBSERVACAO,
  conferirGuia,
  criarQuotaDeChamadas,
  versaoEfetivaDoPrompt,
} from "../../src/semantic";
import type {
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
} from "../../src/semantic";
import { importarLote } from "../../src/application/imports";
import { sha256Hex } from "../../src/shared/sha256";

// ---------------------------------------------------------------------------
// Superfície congelada do barrel da SUT (interface local; nunca import estático)
// ---------------------------------------------------------------------------

interface OpcoesRelatorioEstoque {
  agora: string;
  referencia?: string;
}

interface OpcoesRelatorioAtividade {
  de: string;
  ate: string;
  agora: string;
  referencia?: string;
}

interface ContagemCodigo {
  guias: number;
  ocorrencias: number;
}

interface RelatorioGuias {
  guias: number;
  ok: number;
  pendentes: number;
  falhasProcessamento: number;
  valorRegistradoCentavos: number;
  totalIncompleto: boolean;
  exposicaoCentavos: number;
  exposicaoEstruturadaCentavos: number;
  exposicaoTextualDuplicidadeCentavos: number;
  possivelExcessoCentavos: number;
  possivelExcessoIncompleto: boolean;
  valorSemPendenciaCentavos: number;
  porCodigo: Record<string, ContagemCodigo>;
  porConvenio: Record<string, number>;
  porUnidade: Record<string, number>;
  referenciasTemporais: string[];
  periodo: { de: string | null; ate: string | null };
  referencia: string | null;
}

interface ApiAprovada {
  relatorioEstoque(db: D1Database, opcoes?: OpcoesRelatorioEstoque): Promise<RelatorioGuias>;
  relatorioAtividade(db: D1Database, opcoes: OpcoesRelatorioAtividade): Promise<RelatorioGuias>;
}

const modulos = import.meta.glob("../../src/reports/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.relatorioEstoque).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Corpus real + porta semântica por conteúdo (padrão de tests/import)
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";

interface ConferenciaPersistivel {
  resultado: ResultadoVerificacao;
  extracao: {
    observacaoHash: string;
    modelo: string;
    promptVersao: string;
    sinais: unknown[];
    situacao: unknown;
    ambiguidades: unknown[];
  } | null;
}

interface OraculoFixture {
  versao: number;
  porTexto: Record<
    string,
    { sinais: unknown[]; situacao: unknown; ambiguidades: unknown[] }
  >;
}

function carregarRegrasReais(): Catalogo {
  const resultado = carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function carregarOraculo(): OraculoFixture {
  return JSON.parse(oraculoRaw) as OraculoFixture;
}

/**
 * Porta do corpus: a decisão vem de `conferirGuia` real com interpretador de
 * fixture decidido por CONTEÚDO da observação (nunca por id). Texto não mapeado
 * falha alto em vez de produzir extração benigna.
 */
function criarPortaCorpus(
  regras: Catalogo,
  oraculo: OraculoFixture,
): (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel> {
  const quota = criarQuotaDeChamadas({ limite: 100000 });
  const interpretador: InterpretadorObservacao = {
    async extrair(entrada: EntradaObservacao): Promise<RespostaBruta> {
      const achado = oraculo.porTexto[entrada.observacao_recepcao];
      if (achado === undefined) {
        throw new Error(`texto não mapeado no oráculo: ${entrada.observacao_recepcao}`);
      }
      return {
        texto: JSON.stringify(achado),
        modelo: MODELO_OBSERVACAO,
        promptVersao: versaoEfetivaDoPrompt(),
      };
    },
  };
  return async (guia) => {
    const resultado = await conferirGuia(guia, regras, { interpretador, quota });
    const texto = guia.observacaoRecepcao;
    const extracao =
      texto.trim() === ""
        ? null
        : {
            observacaoHash: sha256Hex(texto),
            modelo: MODELO_OBSERVACAO,
            promptVersao: versaoEfetivaDoPrompt(),
            sinais: oraculo.porTexto[texto]!.sinais,
            situacao: oraculo.porTexto[texto]!.situacao,
            ambiguidades: oraculo.porTexto[texto]!.ambiguidades,
          };
    return { resultado, extracao };
  };
}

// ---------------------------------------------------------------------------
// Prova anti-lookup: nenhum módulo de produção carrega o literal `G-2608-`
// ---------------------------------------------------------------------------

const modulosFonte = import.meta.glob(
  [
    "../../src/storage/**/*.ts",
    "../../src/application/**/*.ts",
    "../../src/reports/**/*.ts",
  ],
  { query: "?raw", eager: true, import: "default" },
);

// ---------------------------------------------------------------------------
// Caso
// ---------------------------------------------------------------------------

describe("lt-corpus-relatorios-sem-lookup: corpus oficial e oráculo por conteúdo", () => {
  it(
    "importa o corpus real e lê estoque/atividade com totais e partições exatos (#ac-8..#ac-13, #ac-16)",
    async () => {
      const api = exigirApi();
      const regras = carregarRegrasReais();
      const oraculo = carregarOraculo();
      const db = await criarBanco();

      const importacao = await importarLote(db, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-relatorios-corpus",
        regras,
        conferir: criarPortaCorpus(regras, oraculo),
        agora: AGORA,
      });
      expect(importacao.lote.status).toBe("CONCLUIDO");
      expect(importacao.progresso.processadas).toBe(80);
      expect(importacao.progresso.comFalha).toBe(0);

      // Estoque vigente: 80 guias, 44 OK, 36 PENDENTE, 569400 centavos.
      const estoque = await api.relatorioEstoque(db, { agora: AGORA });
      expect(estoque.guias).toBe(80);
      expect(estoque.ok).toBe(44);
      expect(estoque.pendentes).toBe(36);
      expect(estoque.valorRegistradoCentavos).toBe(569400);
      expect(estoque.totalIncompleto).toBe(false);
      expect(estoque.possivelExcessoIncompleto).toBe(false);

      // Exposição exclusiva: 222000 estruturada + 47200 textual = 269200.
      expect(estoque.exposicaoEstruturadaCentavos).toBe(222000);
      expect(estoque.exposicaoTextualDuplicidadeCentavos).toBe(47200);
      expect(estoque.exposicaoCentavos).toBe(269200);
      expect(estoque.exposicaoCentavos).toBe(
        estoque.exposicaoEstruturadaCentavos + estoque.exposicaoTextualDuplicidadeCentavos,
      );

      // Excesso possível é SEPARADO e NÃO aditivo à exposição (269200, não
      // 285200); valor sem pendência = 300200.
      expect(estoque.possivelExcessoCentavos).toBe(16000);
      expect(estoque.exposicaoCentavos).toBe(269200);
      expect(estoque.valorSemPendenciaCentavos).toBe(300200);

      // As quatro guias candidatas: lidas direto do D1 (o relatório não expõe
      // linha por guia) e somando exatamente 32000 centavos sob revisão.
      const candidatos = ["G-2608-0027", "G-2608-0057", "G-2608-0059", "G-2608-0076"];
      let centavosSobRevisao = 0;
      for (const idGuia of candidatos) {
        const linha = await db
          .prepare(
            `SELECT v.decisao AS decisao,
                    r.entrada_normalizada_json AS normalizada,
                    (SELECT COUNT(*) FROM findings f
                      WHERE f.validation_id = v.id AND f.codigo = ?) AS duplicidade
               FROM guides g
               JOIN guide_revisions r ON r.guide_id = g.id AND r.vigente = 1
               JOIN validations v ON v.revision_id = r.id AND v.vigente = 1
              WHERE g.id_guia = ?`,
          )
          .bind("duplicidade_grupo_candidato", idGuia)
          .first<{ decisao: string; normalizada: string; duplicidade: number }>();
        expect(linha?.decisao).toBe("PENDENTE");
        expect(Number(linha?.duplicidade)).toBeGreaterThan(0);
        const normalizada = JSON.parse(linha!.normalizada) as { valorCentavos: number | null };
        centavosSobRevisao += normalizada.valorCentavos ?? 0;
      }
      expect(centavosSobRevisao).toBe(32000);

      // Atividade com janela que cobre todo o corpus (data_lancamento entre
      // 2026-08-04 e 2026-08-31) reproduz os mesmos totais do estoque.
      const atividade = await api.relatorioAtividade(db, {
        de: "2026-08-01",
        ate: "2026-09-01",
        agora: AGORA,
      });
      expect(atividade.guias).toBe(80);
      expect(atividade.ok).toBe(44);
      expect(atividade.pendentes).toBe(36);
      expect(atividade.valorRegistradoCentavos).toBe(569400);
      expect(atividade.exposicaoCentavos).toBe(269200);
      expect(atividade.valorSemPendenciaCentavos).toBe(300200);
      expect(atividade.possivelExcessoCentavos).toBe(16000);
      expect(atividade.falhasProcessamento).toBe(0);

      // Prova anti-lookup: nenhum módulo de produção carrega literal `G-2608-`.
      const fontes = Object.values(modulosFonte).map((conteudo) => String(conteudo));
      expect(fontes.length).toBeGreaterThan(0);
      for (const conteudo of fontes) {
        expect(conteudo).not.toMatch(/G-2608-\d{4}/);
      }

      // O oráculo é chaveado por CONTEÚDO da observação e não carrega id algum.
      expect(oraculoRaw).not.toMatch(/G-2608-\d{4}/);
      const chaves = Object.keys(oraculo.porTexto);
      expect(chaves.length).toBeGreaterThan(0);
      for (const chave of chaves) {
        expect(chave).not.toMatch(/G-2608-\d{4}/);
      }
    },
    180000,
  );
});

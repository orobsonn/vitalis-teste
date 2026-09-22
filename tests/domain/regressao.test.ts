// Teste travado lt-regressao-corpus-estruturado — regressão sobre os fixtures
// imutáveis do corpus (80 guias) e proteção contra lookup por ID.
//
// Os fixtures são lidos por importação de asset do Vite (`?raw`), pois
// @types/node não está instalado. O barrel é importado por import.meta.glob (a
// forma com extensão `.ts` é rejeitada pelo tsc com TS5097). O módulo é tratado
// como `ApiAprovada`, interface local. RED por asserção de superfície.
import { describe, expect, it } from "vitest";

import csv from "../../docs/fontes/guias.csv?raw";
import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

// Varredura textual de src/** sem node:fs.
const fontesSrc = import.meta.glob("../../src/**/*.ts", {
  query: "?raw",
  eager: true,
  import: "default",
});

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

interface GuiaOriginal {
  id_guia: string;
  unidade: string;
  data_atendimento: string;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimento_codigo: string;
  procedimento_descricao: string;
  numero_autorizacao: string;
  autorizacao_validade: string;
  autorizacao_sessoes_limite: string;
  sessao_numero_na_autorizacao: string;
  profissional: string;
  profissional_registro: string;
  valor: string;
  observacao_recepcao: string;
  data_lancamento: string;
}

interface LinhaGuiaCsv {
  numero: number;
  original: GuiaOriginal;
  linhaOriginal: string;
}

interface FalhaCsv {
  numero: number;
  motivo: string;
  linhaOriginal: string;
}

interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  dataAtendimento: DataCivil | null;
  valorCentavos: number | null;
  problemas: Array<{ campo: string; codigo: string; valorOriginal: string }>;
}

interface Motivo {
  codigo: string;
  severidade: "pendencia" | "alerta";
  campos: string[];
  regra: string;
  evidencia: string;
  orientacao: string;
}

interface ResultadoVerificacao {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string | null;
  regras_versao: string;
}

interface Catalogo {
  versao: string;
  hash: string;
  regrasVersao: string;
  convenios: unknown[];
  procedimentos: unknown[];
  limitacoesGlobais: string[];
}

type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] };

interface AgregacaoCorpus {
  ocorrencias: number;
  guiasComPendencia: number;
  valorAssociadoCentavos: number;
  porCodigo: Record<string, number>;
  camposObrigatoriosAusentes: Record<string, number>;
  totalIncompleto: boolean;
  limitacoesGlobais: string[];
}

interface Entrada {
  guia: GuiaNormalizada;
  resultado: ResultadoVerificacao;
}

interface ApiAprovada {
  parseGuiasCsv(texto: string): { cabecalho: string[]; guias: LinhaGuiaCsv[]; falhas: FalhaCsv[] };
  dataParaIso(data: DataCivil): string;
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
  verificarGuia(guia: GuiaNormalizada, catalogo: Catalogo): ResultadoVerificacao;
  agregarVerificacoes(entradas: Entrada[]): AgregacaoCorpus;
}

const GLOBAL_NAO_VERIFICAVEL = "duracao_maxima_autorizacao_nao_verificavel";

function carregarCatalogoValido(): Catalogo {
  expect(typeof api.carregarCatalogo).toBe("function");
  const resultado = api.carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function prepararCorpus(): {
  parsed: { guias: LinhaGuiaCsv[]; falhas: FalhaCsv[] };
  entradas: Entrada[];
  agregado: AgregacaoCorpus;
  catalogo: Catalogo;
} {
  expect(typeof api.parseGuiasCsv).toBe("function");
  expect(typeof api.normalizarGuia).toBe("function");
  expect(typeof api.verificarGuia).toBe("function");
  expect(typeof api.agregarVerificacoes).toBe("function");

  const parsed = api.parseGuiasCsv(csv);
  const catalogo = carregarCatalogoValido();
  const entradas = parsed.guias.map((linha) => {
    const guia = api.normalizarGuia(linha);
    const resultado = api.verificarGuia(guia, catalogo);
    return { guia, resultado };
  });
  const agregado = api.agregarVerificacoes(entradas);
  return { parsed, entradas, agregado, catalogo };
}

function codigos(resultado: ResultadoVerificacao): string[] {
  return resultado.motivos.map((motivo) => motivo.codigo);
}

describe("regressão estrutrada do corpus", () => {
  it("lê 80 guias sem falhas e reproduz decisões, códigos e totais", () => {
    const { parsed, entradas, agregado, catalogo } = prepararCorpus();

    expect(parsed.guias).toHaveLength(80);
    expect(parsed.falhas).toHaveLength(0);

    const pendentes = entradas.filter((item) => item.resultado.decisao === "PENDENTE");
    const ok = entradas.filter((item) => item.resultado.decisao === "OK");
    expect(pendentes).toHaveLength(30);
    expect(ok).toHaveLength(50);

    expect(agregado.ocorrencias).toBe(32);
    expect(agregado.guiasComPendencia).toBe(30);
    expect(agregado.valorAssociadoCentavos).toBe(222000);
    expect(agregado.porCodigo).toEqual({
      autorizacao_vencida: 13,
      sessao_acima_do_limite: 6,
      procedimento_sem_cobertura: 5,
      campo_obrigatorio_ausente: 8,
    });
    expect(agregado.camposObrigatoriosAusentes).toEqual({
      numero_autorizacao: 4,
      profissional_registro: 2,
      cid: 2,
    });

    // Versão das regras propagada para cada resultado.
    for (const item of entradas) {
      expect(item.resultado.regras_versao).toBe(catalogo.regrasVersao);
    }
  });

  it("não produz prazo_envio_excedido e expõe a limitação global uma única vez", () => {
    const { entradas, agregado } = prepararCorpus();

    expect(agregado.porCodigo["prazo_envio_excedido"]).toBeUndefined();
    for (const item of entradas) {
      expect(codigos(item.resultado)).not.toContain("prazo_envio_excedido");
    }

    expect(
      agregado.limitacoesGlobais.filter((item) => item === GLOBAL_NAO_VERIFICAVEL),
    ).toHaveLength(1);
    for (const item of entradas) {
      expect(item.resultado.limitacoes).not.toContain(GLOBAL_NAO_VERIFICAVEL);
    }
  });

  it("acerta as guias específicas e preserva datas e valores cruciais", () => {
    const { entradas } = prepararCorpus();
    const porId = new Map(entradas.map((item) => [item.guia.id, item]));

    const guia0006 = porId.get("G-2608-0006");
    expect(guia0006).toBeDefined();
    expect(["procedimento_sem_cobertura", "sessao_acima_do_limite"].every((codigo) =>
      codigos(guia0006!.resultado).includes(codigo),
    )).toBe(true);

    const guia0056 = porId.get("G-2608-0056");
    expect(guia0056).toBeDefined();
    expect(
      guia0056!.resultado.motivos.some(
        (motivo) => motivo.codigo === "campo_obrigatorio_ausente" && motivo.campos.includes("cid"),
      ),
    ).toBe(true);
    expect(codigos(guia0056!.resultado)).toContain("sessao_acima_do_limite");

    const guia0016 = porId.get("G-2608-0016")!;
    expect(guia0016.guia.original.data_atendimento).toBe("03/08/2026");
    expect(guia0016.guia.dataAtendimento).toEqual({ ano: 2026, mes: 8, dia: 3 });
    expect(api.dataParaIso(guia0016.guia.dataAtendimento!)).toBe("2026-08-03");

    const guia0027 = porId.get("G-2608-0027")!;
    expect(guia0027.guia.original.data_atendimento).toBe("26/08/2026");
    expect(guia0027.guia.dataAtendimento).toEqual({ ano: 2026, mes: 8, dia: 26 });
    expect(api.dataParaIso(guia0027.guia.dataAtendimento!)).toBe("2026-08-26");

    const guia0065 = porId.get("G-2608-0065")!;
    expect(guia0065.guia.original.valor).toBe("62,00");
    expect(guia0065.guia.valorCentavos).toBe(6200);
  });

  it("renomear todos os id_guia não altera decisões nem códigos", () => {
    const { parsed, entradas, catalogo } = prepararCorpus();

    const renomeadas = parsed.guias.map((linha, indice) => ({
      numero: linha.numero,
      linhaOriginal: linha.linhaOriginal,
      original: { ...linha.original, id_guia: `X-0000-${String(indice + 1).padStart(4, "0")}` },
    }));
    const renomeadasResultado = renomeadas.map((linha) => {
      const guia = api.normalizarGuia(linha);
      const resultado = api.verificarGuia(guia, catalogo);
      return { decisao: resultado.decisao, codigos: codigos(resultado).sort() };
    });
    const originaisResultado = entradas.map((item) => ({
      decisao: item.resultado.decisao,
      codigos: codigos(item.resultado).sort(),
    }));

    expect(renomeadasResultado).toEqual(originaisResultado);
  });

  it("a varredura de src não encontra literal G-2608-NNNN nem tabela por ID", () => {
    const arquivos = Object.entries(fontesSrc);
    expect(arquivos.length).toBeGreaterThan(0);

    for (const conteudo of Object.values(fontesSrc)) {
      expect(typeof conteudo).toBe("string");
      expect(conteudo).not.toMatch(/G-2608-\d{4}/);
      expect(conteudo).not.toContain("G-2608-");
    }
  });
});

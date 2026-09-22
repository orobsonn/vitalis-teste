// Teste travado lt-csv-preservacao — parser CSV próprio e preservador.
//
// RED válido: o barrel src/domain/index.ts existe e é importado por
// import.meta.glob (a forma `await import("../../src/domain/index.ts")` é
// rejeitada pelo tsc com TS5097, pois allowImportingTsExtensions não está
// habilitado). Cada caso falha por asserção de superfície/comportamento, nunca
// por erro de resolução ou de tipo. O módulo é tratado como `ApiAprovada`,
// interface local, sem importar tipos do barrel.
import { describe, expect, it } from "vitest";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

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

interface ResultadoCsv {
  cabecalho: string[];
  guias: LinhaGuiaCsv[];
  falhas: FalhaCsv[];
}

interface ApiAprovada {
  COLUNAS_GUIA: readonly string[];
  parseGuiasCsv(texto: string): ResultadoCsv;
}

const COLUNAS = [
  "id_guia",
  "unidade",
  "data_atendimento",
  "paciente",
  "convenio",
  "carteirinha",
  "cid",
  "procedimento_codigo",
  "procedimento_descricao",
  "numero_autorizacao",
  "autorizacao_validade",
  "autorizacao_sessoes_limite",
  "sessao_numero_na_autorizacao",
  "profissional",
  "profissional_registro",
  "valor",
  "observacao_recepcao",
  "data_lancamento",
] as const;

// Célula só recebe aspas quando o conteúdo realmente exige (vírgula, aspas ou
// quebra interna); assim o texto sintético exercita aspas escapadas e CRLF.
function celula(valor: string): string {
  return /[",\r\n]/.test(valor) ? '"' + valor.replaceAll('"', '""') + '"' : valor;
}

function linhaCsv(valores: readonly string[]): string {
  return valores.map(celula).join(",");
}

function objetoOriginal(valores: readonly string[]): GuiaOriginal {
  const original: Record<string, string> = {};
  COLUNAS.forEach((coluna, indice) => {
    original[coluna] = valores[indice]!;
  });
  return original as unknown as GuiaOriginal;
}

// Sem terminador de linha para tolerar tanto a linha crua quanto a linha com
// CRLF final; a quebra INTERNA da observação permanece intacta.
function semTerminador(texto: string): string {
  return texto.replace(/\r?\n$/, "");
}

const OBSERVACAO_QUOTED = 'Trouxe exame, anexado; disse "ok"\nSegunda linha de observação';

const CELULAS_A = [
  "G-SINT-0001",
  "Sul",
  "03/08/2026",
  "P-9001",
  "Vitalcard",
  "0007123",
  "M79.7",
  "50000470",
  "Sessão de fisioterapia",
  "AUT000001",
  "2026-08-14",
  "10",
  "007",
  "Profissional Teste",
  "CREFITO-3 204411-F",
  "62,00",
  OBSERVACAO_QUOTED,
  "2026-08-04",
];

// 17 células: cardinalidade divergente das 18 colunas.
const CELULAS_B = [
  "G-SINT-0002",
  "Sul",
  "2026-08-10",
  "P-9002",
  "Vitalcard",
  "123456",
  "M51.1",
  "50000470",
  "Descrição",
  "AUT000002",
  "2026-08-20",
  "10",
  "1",
  "Outro",
  "CREFITO-3 204411-F",
  "62,00",
];

const CELULAS_C = [
  "G-SINT-0003",
  "Norte",
  "2026-08-10",
  "P-9003",
  "Plano Bem",
  "123456",
  "M51.1",
  "20103301",
  "Consulta ortopédica",
  "AUT000003",
  "2026-08-20",
  "10",
  "1",
  "Dra. Teste",
  "CRM-SP 112390",
  "90.00",
  "",
  "2026-08-11",
];

const LINHA_A = linhaCsv(CELULAS_A);
const LINHA_B = linhaCsv(CELULAS_B);
const LINHA_C = linhaCsv(CELULAS_C);

// BOM + CRLF + cabeçalho de 18 nomes + linha válida + linha divergente + linha
// válida posterior (a divergente não pode interromper as demais).
const CSV_SINTETICO =
  "\uFEFF" +
  COLUNAS.join(",") +
  "\r\n" +
  LINHA_A +
  "\r\n" +
  LINHA_B +
  "\r\n" +
  LINHA_C +
  "\r\n";

// Campos compartilhados das linhas que exercitam aspas malformadas: só a
// primeira célula (id_guia) recebe sintaxe crua; o restante é escapado por
// `celula`, de modo que o defeito testado seja exatamente a aspa malformada.
const CAMPOS_COMUNS_ASPAS = [
  "Sul",
  "03/08/2026",
  "P-8001",
  "Vitalcard",
  "0008123",
  "M79.7",
  "50000470",
  "Sessão de fisioterapia",
  "AUTASPAS1",
  "2026-08-14",
  "10",
  "1",
  "Profissional Teste",
  "CREFITO-3 204411-F",
  "62,00",
  "obs, com vírgula",
  "2026-08-04",
];

// A primeira célula é literal: `celula()` nunca produz sintaxe malformada.
function linhaComPrimeiraCelulaCrua(primeira: string): string {
  return [primeira, ...CAMPOS_COMUNS_ASPAS.map(celula)].join(",");
}

// Colunas unidade..observacao_recepcao sem nenhum caractere que exija aspas:
// junto do id_guia formam as 17 primeiras colunas de uma linha literal. Assim,
// qualquer aspa no texto é intencional e nunca produzida por `celula()`.
const CAMPOS_SEM_ASPAS = [
  "Sul",
  "03/08/2026",
  "P-8001",
  "Vitalcard",
  "0008123",
  "M79.7",
  "50000470",
  "Sessão de fisioterapia",
  "AUTASPAS1",
  "2026-08-14",
  "10",
  "1",
  "Profissional Teste",
  "CREFITO-3 204411-F",
  "62.00",
  "",
];

function linhaLiteral(id: string, dataLancamento: string): string {
  return [id, ...CAMPOS_SEM_ASPAS, dataLancamento].join(",");
}

describe("parseGuiasCsv — preservação da entrada", () => {
  it("preserva as 18 colunas, as células cruas e segue após a linha divergente", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    const resultado = api.parseGuiasCsv(CSV_SINTETICO);

    // Cabeçalho exatamente com os 18 nomes, sem BOM.
    expect(resultado.cabecalho).toEqual([...COLUNAS]);
    expect(resultado.cabecalho).toHaveLength(18);
    expect(resultado.cabecalho[0]).toBe("id_guia");
    expect([...api.COLUNAS_GUIA]).toEqual([...COLUNAS]);

    // A linha divergente vira falha e não impede as demais.
    expect(resultado.guias).toHaveLength(2);
    expect(resultado.falhas).toHaveLength(1);

    const guiaA = resultado.guias[0]!;
    const guiaC = resultado.guias[1]!;
    const falha = resultado.falhas[0]!;

    // Cada célula permanece string, byte a byte, inclusive zeros à esquerda,
    // vírgula dentro de aspas, aspas escapadas e quebra interna.
    expect(guiaA.original).toEqual(objetoOriginal(CELULAS_A));
    for (const valor of Object.values(guiaA.original)) {
      expect(typeof valor).toBe("string");
    }
    expect(guiaA.original.carteirinha).toBe("0007123");
    expect(guiaA.original.sessao_numero_na_autorizacao).toBe("007");
    expect(guiaA.original.valor).toBe("62,00");
    expect(guiaA.original.observacao_recepcao).toBe(OBSERVACAO_QUOTED);

    // linhaOriginal integral.
    expect(semTerminador(guiaA.linhaOriginal)).toBe(LINHA_A);
    expect(guiaA.linhaOriginal).toContain('"ok"');
    expect(guiaA.linhaOriginal).toContain("\n");

    expect(guiaC.original).toEqual(objetoOriginal(CELULAS_C));
    expect(guiaC.original.id_guia).toBe("G-SINT-0003");

    // A falha preserva número, motivo e a linha divergente integral.
    expect(typeof falha.numero).toBe("number");
    expect(falha.motivo.length).toBeGreaterThan(0);
    expect(semTerminador(falha.linhaOriginal)).toBe(LINHA_B);

    // Numeração presente e sem colisão entre guias e falhas.
    const numeros = [
      ...resultado.guias.map((g) => g.numero),
      ...resultado.falhas.map((f) => f.numero),
    ];
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(numeros.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });

  it("rejeita aspas malformadas preservando as linhas válidas vizinhas", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    const linhaValidaAntes = linhaComPrimeiraCelulaCrua("G-ASPAS-0001");
    const linhaValidaDepois = linhaComPrimeiraCelulaCrua("G-ASPAS-0002");
    // Lixo após a aspa de fechamento de um campo citado.
    const linhaComJunkAposAspas = linhaComPrimeiraCelulaCrua('"G-1"lixo');
    // Aspa solta dentro de um campo não citado.
    const linhaComAspaNoMeio = linhaComPrimeiraCelulaCrua('G-1"x');

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaValidaAntes +
      "\n" +
      linhaComJunkAposAspas +
      "\n" +
      linhaComAspaNoMeio +
      "\n" +
      linhaValidaDepois +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // As linhas bem formadas ao redor continuam em guias; a vírgula dentro do
    // campo citado permanece válida e preservada.
    expect(resultado.guias).toHaveLength(2);
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-ASPAS-0001",
      "G-ASPAS-0002",
    ]);
    expect(resultado.guias[0]!.original.valor).toBe("62,00");
    expect(resultado.guias[0]!.original.observacao_recepcao).toBe("obs, com vírgula");

    // As duas linhas com sintaxe de aspas inválida viram falhas preservadas.
    expect(resultado.falhas).toHaveLength(2);
    for (const falha of resultado.falhas) {
      expect(typeof falha.numero).toBe("number");
      expect(falha.motivo.length).toBeGreaterThan(0);
      expect(falha.linhaOriginal.length).toBeGreaterThan(0);
    }

    // Nunca são aceitas como guias.
    const idsGuias = resultado.guias.map((guia) => guia.original.id_guia);
    expect(idsGuias).not.toContain("G-1");
    expect(idsGuias.some((id) => id.includes("lixo"))).toBe(false);
    expect(idsGuias.some((id) => id.includes('"'))).toBe(false);

    // A linhaOriginal preserva byte a byte a sintaxe malformada.
    const originaisFalhas = resultado.falhas.map((falha) => falha.linhaOriginal);
    expect(originaisFalhas.some((linha) => linha.includes('"G-1"lixo'))).toBe(true);
    expect(originaisFalhas.some((linha) => linha.includes('G-1"x'))).toBe(true);
  });

  it("recupera linhas válidas após aspa aberta na última célula", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    // As linhas seguintes são literais: nenhuma célula exige aspas, de modo que
    // a única aspa do arquivo é a que abre e permanece aberta até o fim.
    const linhaValida1 = linhaLiteral("G-Q-0003", "2026-08-04");
    const linhaValida2 = linhaLiteral("G-Q-0004", "2026-08-05");

    // A última célula abre uma aspa que nunca fecha. A linha é literal, pois
    // `celula()` nunca produz sintaxe malformada.
    const linhaAspasAberta =
      ["G-Q-0002", ...CAMPOS_SEM_ASPAS].join(",") + ',"aspas abertas sem fim';

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaAspasAberta +
      "\n" +
      linhaValida1 +
      "\n" +
      linhaValida2 +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // A linha com aspa aberta não engole as duas linhas bem formadas seguintes.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-Q-0003",
      "G-Q-0004",
    ]);

    // Exatamente uma falha, para a linha física 2, preservando a sintaxe crua.
    expect(resultado.falhas).toHaveLength(1);
    const falha = resultado.falhas[0]!;
    expect(falha.numero).toBe(2);
    expect(falha.motivo.length).toBeGreaterThan(0);
    expect(falha.linhaOriginal).toContain('"aspas abertas sem fim');

    // As linhas recuperadas preservam as células cruas e não contêm aspa alguma:
    // o defeito exercitado é só o registro com aspas ainda abertas no fim do
    // arquivo, nunca um fechamento prematuro na linha seguinte.
    for (const guia of resultado.guias) {
      expect(guia.original.carteirinha).toBe("0008123");
      expect(guia.original.valor).toBe("62.00");
      expect(guia.original.observacao_recepcao).toBe("");
      expect(guia.linhaOriginal).not.toContain('"');
    }
    expect(resultado.guias[0]!.original.data_lancamento).toBe("2026-08-04");
    expect(resultado.guias[1]!.original.data_lancamento).toBe("2026-08-05");
  });

  it("não ressincroniza registro malformado já delimitado por aspas fechadas", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    const linhaValidaAntes = linhaLiteral("G-J-0001", "2026-08-04");
    const linhaValidaDepois = linhaLiteral("G-J-0004", "2026-08-06");

    // O campo entre aspas fecha corretamente e só então recebe lixo ("junk");
    // como o campo citado tem quebra interna, o registro ocupa duas linhas
    // físicas, mas já está delimitado por uma aspa de fechamento.
    const linhaComLixoAposFechamento =
      ["G-J-0002", ...CAMPOS_SEM_ASPAS].join(",") + ',"primeira\nsegunda"junk';

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaValidaAntes +
      "\n" +
      linhaComLixoAposFechamento +
      "\n" +
      linhaValidaDepois +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // O registro malformado inteiro é uma única falha: as duas linhas físicas
    // ficam no mesmo `linhaOriginal`.
    expect(resultado.falhas).toHaveLength(1);
    const falha = resultado.falhas[0]!;
    expect(falha.numero).toBe(3);
    expect(falha.motivo.length).toBeGreaterThan(0);
    expect(falha.linhaOriginal).toContain("primeira\nsegunda");
    expect(falha.linhaOriginal).toContain("junk");

    // A linha interna citada não vira guia fantasma nem desloca a válida final.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-J-0001",
      "G-J-0004",
    ]);
  });

  it("conta \\r isolado dentro de aspas como quebra de linha física", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    // Campo citado e corretamente fechado com um `\r` solto dentro: o registro
    // ocupa duas linhas físicas.
    const linhaComCrDentroDeAspas =
      ["G-R-0001", ...CAMPOS_SEM_ASPAS].join(",") + ',"primeira\rsegunda"';
    // 17 colunas: cardinalidade divergente, logo uma falha.
    const linhaDivergente = ["G-R-0002", ...CAMPOS_SEM_ASPAS].join(",");
    const linhaValidaDepois = linhaLiteral("G-R-0003", "2026-08-07");

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaComCrDentroDeAspas +
      "\n" +
      linhaDivergente +
      "\n" +
      linhaValidaDepois +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // A guia com o `\r` interno continua válida e preserva o campo cru.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-R-0001",
      "G-R-0003",
    ]);
    expect(resultado.guias[0]!.original.data_lancamento).toBe("primeira\rsegunda");

    // Cabeçalho (1), guia que ocupa as linhas 2-3, divergente (4) e válida
    // final (5): o `\r` dentro das aspas conta como uma quebra física.
    expect(resultado.falhas).toHaveLength(1);
    expect(resultado.falhas[0]!.numero).toBe(4);
    expect(resultado.falhas[0]!.linhaOriginal).toContain("G-R-0002");
  });
});

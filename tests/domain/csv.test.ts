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

  it("ressincroniza registro malformado delimitado por aspas sem criar guia fantasma", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    const linhaValidaAntes = linhaLiteral("G-J-0001", "2026-08-04");
    const linhaValidaDepois = linhaLiteral("G-J-0004", "2026-08-06");

    // O campo entre aspas fecha corretamente e só então recebe lixo ("junk");
    // como o campo citado tem quebra interna, o registro ocupa as linhas
    // físicas 3 e 4 até estar delimitado.
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

    // Semântica refinada da recuperação: cada linha física do registro
    // malformado tem seu próprio desfecho. A primeira (3) vira falha com o
    // texto cru desta linha; a restante (4) é reexaminada e, por trazer aspa
    // solta dentro de campo não citado, também vira falha — sem que o texto
    // citado (`segunda`) seja promovido a guia nem descartado em silêncio.
    expect(resultado.falhas).toHaveLength(2);
    const primeiraFalha = resultado.falhas[0]!;
    const segundaFalha = resultado.falhas[1]!;
    expect(primeiraFalha.numero).toBe(3);
    expect(primeiraFalha.motivo.length).toBeGreaterThan(0);
    expect(primeiraFalha.linhaOriginal).toContain("primeira");
    expect(primeiraFalha.linhaOriginal).not.toContain("segunda");
    expect(segundaFalha.numero).toBe(4);
    expect(segundaFalha.motivo.length).toBeGreaterThan(0);
    expect(segundaFalha.linhaOriginal).toContain("segunda");

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

  it("registra a linha em branco entre dados como falha e não penaliza o terminador final", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    const linhaValida1 = linhaLiteral("G-B-0001", "2026-08-04");
    const linhaValida2 = linhaLiteral("G-B-0002", "2026-08-05");

    // Cabeçalho (1), guia (2), linha física em branco (3), guia (4) e o
    // terminador final, que não cria uma linha. A linha em branco intermediária
    // não pode ser descartada em silêncio: ela vira uma falha preservada.
    const csv =
      COLUNAS.join(",") + "\n" + linhaValida1 + "\n\n" + linhaValida2 + "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // As duas guias válidas são coletadas, em ordem.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-B-0001",
      "G-B-0002",
    ]);

    // Exatamente uma falha, para a linha física em branco (3), com motivo de
    // cardinalidade (não vazio) e a linha em branco preservada.
    expect(resultado.falhas).toHaveLength(1);
    const falha = resultado.falhas[0]!;
    expect(falha.numero).toBe(3);
    expect(typeof falha.motivo).toBe("string");
    expect(falha.motivo.length).toBeGreaterThan(0);
    expect(falha.linhaOriginal.trim()).toBe("");

    // Um arquivo que termina após a última linha de dados com um único `\n` não
    // ganha uma falha fantasma: o terminador final não é uma linha física.
    const csvFinal = COLUNAS.join(",") + "\n" + linhaValida1 + "\n";
    const resultadoFinal = api.parseGuiasCsv(csvFinal);
    expect(resultadoFinal.guias.map((guia) => guia.original.id_guia)).toEqual(["G-B-0001"]);
    expect(resultadoFinal.falhas).toHaveLength(0);
  });

  it("recupera as guias seguintes após aspa aberta que não fecha na linha", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    // A última célula abre uma aspa que não fecha nesta linha; a guia válida
    // seguinte fecha-a prematuramente com o campo citado `"62,00"`, de modo que
    // o registro malformado engole as primeiras linhas seguintes e precisa ser
    // ressincronizado para não perder as guias.
    const linhaValidaComValorCitado = linhaComPrimeiraCelulaCrua("G-Q-0003");
    const linhaValidaDepois = linhaLiteral("G-Q-0004", "2026-08-05");
    const linhaAspasAberta =
      ["G-Q-0002", ...CAMPOS_SEM_ASPAS].join(",") + ',"sem_fechamento_ate_o_fim';

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaAspasAberta +
      "\n" +
      linhaValidaComValorCitado +
      "\n" +
      linhaValidaDepois +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // O registro malformado vira exatamente uma falha, com o número da própria
    // linha física e o texto cru que contém a aspa aberta.
    expect(resultado.falhas).toHaveLength(1);
    const falha = resultado.falhas[0]!;
    expect(falha.numero).toBe(2);
    expect(falha.motivo.length).toBeGreaterThan(0);
    expect(falha.linhaOriginal).toContain("sem_fechamento_ate_o_fim");

    // As guias seguintes integram o resultado, em ordem, com as células cruas
    // preservadas — inclusive o campo citado `"62,00"`.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-Q-0003",
      "G-Q-0004",
    ]);
    expect(resultado.guias[0]!.original.valor).toBe("62,00");
    expect(resultado.guias[0]!.original.observacao_recepcao).toBe("obs, com vírgula");
    expect(resultado.guias[1]!.original.id_guia).toBe("G-Q-0004");
    expect(resultado.guias[1]!.original.data_lancamento).toBe("2026-08-05");

    // O texto malformado nunca vira identificador de guia.
    for (const guia of resultado.guias) {
      expect(guia.original.id_guia).not.toContain("sem_fechamento_ate_o_fim");
      expect(guia.original.id_guia).not.toContain('"');
    }
  });

  it("recupera como guia única o registro citado com quebra interna após aspa aberta", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    // A guia seguinte é um registro válido com quebra interna no campo citado:
    // ela ocupa as linhas físicas 3 e 4 e precisa sobreviver inteira à
    // ressincronização do registro malformado que a engoliu.
    const linhaComQuebraInterna = linhaCsv([
      "G-R-0003",
      ...CAMPOS_COMUNS_ASPAS.slice(0, 15),
      OBSERVACAO_QUOTED,
      "2026-08-04",
    ]);
    const linhaValidaDepois = linhaLiteral("G-R-0004", "2026-08-06");
    const linhaAspasAberta =
      ["G-R-0002", ...CAMPOS_SEM_ASPAS].join(",") + ',"sem_fechamento_ate_o_fim';

    const csv =
      COLUNAS.join(",") +
      "\n" +
      linhaAspasAberta +
      "\n" +
      linhaComQuebraInterna +
      "\n" +
      linhaValidaDepois +
      "\n";

    const resultado = api.parseGuiasCsv(csv);

    expect(resultado.cabecalho).toEqual([...COLUNAS]);

    // Só a linha física com a aspa aberta é falha; a guia engolida pelo
    // registro malformado é recuperada em vez de descartada.
    expect(resultado.falhas).toHaveLength(1);
    expect(resultado.falhas[0]!.numero).toBe(2);

    // Um único registro recuperado para a guia com quebra interna, com a célula
    // crua preservada byte a byte.
    expect(resultado.guias.map((guia) => guia.original.id_guia)).toEqual([
      "G-R-0003",
      "G-R-0004",
    ]);
    expect(resultado.guias[0]!.original.valor).toBe("62,00");
    expect(resultado.guias[0]!.original.observacao_recepcao).toBe(OBSERVACAO_QUOTED);
    expect(resultado.guias[0]!.linhaOriginal).toContain("\n");
    expect(resultado.guias[0]!.linhaOriginal).toContain("Segunda linha de observação");
    expect(resultado.guias[1]!.original.id_guia).toBe("G-R-0004");
  });

  it("registra como falha todas as linhas físicas quando o cabeçalho é inválido", () => {
    expect(typeof api.parseGuiasCsv).toBe("function");

    // Cabeçalho de 3 colunas (linha física 1) seguido de duas linhas bem
    // formadas de 18 colunas (linhas físicas 2 e 3) e o terminador final.
    const linhaValida1 = linhaLiteral("G-HDR-0001", "2026-08-04");
    const linhaValida2 = linhaLiteral("G-HDR-0002", "2026-08-05");
    const csv = "X,Y,Z" + "\n" + linhaValida1 + "\n" + linhaValida2 + "\n";

    const resultado = api.parseGuiasCsv(csv);

    // §4.2/#ac-5 e PRD #23/#28: sem cabeçalho válido nada é promovido a guia,
    // mas nenhuma linha física pode ser descartada em silêncio. As três linhas
    // físicas aparecem em falhas, cada uma com número, motivo e linhaOriginal.
    expect(resultado.guias).toEqual([]);
    expect(new Set(resultado.falhas.map((falha) => falha.numero))).toEqual(new Set([1, 2, 3]));

    // A primeira falha reflete o cabeçalho inválido e preserva a linha crua.
    const primeira = resultado.falhas[0]!;
    expect(primeira.numero).toBe(1);
    expect(primeira.motivo.toLowerCase()).toContain("cabecalho");
    expect(primeira.linhaOriginal).toContain("X,Y,Z");

    // Toda falha tem motivo textual não vazio e linhaOriginal presente.
    for (const falha of resultado.falhas) {
      expect(typeof falha.motivo).toBe("string");
      expect(falha.motivo.length).toBeGreaterThan(0);
      expect(typeof falha.linhaOriginal).toBe("string");
      expect(falha.linhaOriginal.length).toBeGreaterThan(0);
    }
  });
});

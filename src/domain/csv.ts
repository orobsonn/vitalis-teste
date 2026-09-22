/**
 * Leitura própria do CSV de guias, preservando a entrada como texto.
 *
 * Nenhum valor é convertido para número: códigos, identificadores e zeros à
 * esquerda permanecem strings. O parser tolera BOM, CRLF, campos entre aspas
 * com vírgula, aspas escapadas e quebras internas; uma linha com cardinalidade
 * divergente vira uma falha preservada sem interromper as demais.
 */

import { COLUNAS_GUIA, type ColunaGuia, type GuiaOriginal } from "./contratos";

export interface LinhaGuiaCsv {
  numero: number;
  original: GuiaOriginal;
  linhaOriginal: string;
}

export interface FalhaCsv {
  numero: number;
  motivo: string;
  linhaOriginal: string;
}

export interface ResultadoCsv {
  cabecalho: string[];
  guias: LinhaGuiaCsv[];
  falhas: FalhaCsv[];
}

interface RegistroCsv {
  campos: string[];
  textoCru: string;
  numeroLinha: number;
  aspasAbertas: boolean;
  malformado: boolean;
}

function dividirRegistros(entrada: string, linhaBase = 1): RegistroCsv[] {
  const texto = entrada.charCodeAt(0) === 0xfeff ? entrada.slice(1) : entrada;
  const registros: RegistroCsv[] = [];
  let campos: string[] = [];
  let campo = "";
  let textoCru = "";
  let emAspas = false;
  let aposAspas = false;
  let malformado = false;
  let numeroLinha = linhaBase;
  let linhaInicial = linhaBase;
  let indice = 0;

  const concluirCampo = (): void => {
    campos.push(campo);
    campo = "";
    aposAspas = false;
  };

  const concluirRegistro = (): void => {
    concluirCampo();
    const linhaEmBranco = campos.length === 1 && campos[0] === "" && textoCru === "";
    // §4.2/#ac-5 e PRD #23/#28: nenhuma linha física é descartada em silêncio.
    // Uma linha em branco entre dados vira falha de cardinalidade com 0 campos,
    // tanto na leitura normal quanto na recuperação pós-malformação.
    const camposDoRegistro = linhaEmBranco ? [] : campos;
    registros.push({
      campos: camposDoRegistro,
      textoCru,
      numeroLinha: linhaInicial,
      aspasAbertas: emAspas,
      malformado,
    });
    campos = [];
    textoCru = "";
    emAspas = false;
    aposAspas = false;
    malformado = false;
  };

  while (indice < texto.length) {
    const caractere = texto[indice]!;

    if (emAspas) {
      if (caractere === '"') {
        if (texto[indice + 1] === '"') {
          campo += '"';
          textoCru += '""';
          indice += 2;
          continue;
        }
        emAspas = false;
        aposAspas = true;
        textoCru += caractere;
        indice += 1;
        continue;
      }
      if (caractere === "\n") {
        numeroLinha += 1;
      } else if (caractere === "\r" && texto[indice + 1] !== "\n") {
        // Um `\r` isolado dentro das aspas é uma quebra física própria; em
        // `\r\n` a quebra é contada uma única vez pelo `\n` seguinte.
        numeroLinha += 1;
      }
      campo += caractere;
      textoCru += caractere;
      indice += 1;
      continue;
    }

    if (aposAspas) {
      if (caractere === ",") {
        concluirCampo();
        textoCru += caractere;
        indice += 1;
        continue;
      }
      if (caractere === "\r" || caractere === "\n") {
        concluirRegistro();
        indice += caractere === "\r" && texto[indice + 1] === "\n" ? 2 : 1;
        numeroLinha += 1;
        linhaInicial = numeroLinha;
        continue;
      }
      malformado = true;
      campo += caractere;
      textoCru += caractere;
      indice += 1;
      continue;
    }

    if (caractere === '"') {
      if (campo === "") {
        emAspas = true;
        textoCru += caractere;
        indice += 1;
        continue;
      }
      malformado = true;
      campo += caractere;
      textoCru += caractere;
      indice += 1;
      continue;
    }
    if (caractere === ",") {
      concluirCampo();
      textoCru += caractere;
      indice += 1;
      continue;
    }
    if (caractere === "\r" || caractere === "\n") {
      concluirRegistro();
      indice += caractere === "\r" && texto[indice + 1] === "\n" ? 2 : 1;
      numeroLinha += 1;
      linhaInicial = numeroLinha;
      continue;
    }
    campo += caractere;
    textoCru += caractere;
    indice += 1;
  }

  // Um terminador final não cria uma linha física: o último segmento vazio é
  // apenas o resíduo do `\n`/`\r` que fecha o texto. Só conclui se houver
  // conteúdo pendente, de modo que o terminador final não duplique uma linha em
  // branco real já emitida dentro do laço.
  if (textoCru !== "" || campos.length > 0 || campo !== "") {
    concluirRegistro();
  }
  return registros;
}

function montarOriginal(campos: readonly string[]): GuiaOriginal {
  const original = {} as Record<ColunaGuia, string>;
  COLUNAS_GUIA.forEach((coluna, posicao) => {
    original[coluna] = campos[posicao] ?? "";
  });
  return original;
}

function cabecalhoEsperado(cabecalho: readonly string[]): boolean {
  return (
    cabecalho.length === COLUNAS_GUIA.length &&
    COLUNAS_GUIA.every((coluna, posicao) => cabecalho[posicao] === coluna)
  );
}

const MOTIVO_ASPAS_NAO_TERMINADAS =
  "aspas_nao_terminadas: campo entre aspas sem fechamento até o fim do arquivo";
const MOTIVO_ASPAS_MALFORMADAS = "aspas_malformadas: sintaxe de aspas inválida no campo";
// Motivo das linhas físicas que, sem cabeçalho válido, nunca podem ser guias.
const MOTIVO_CABECALHO_INVALIDO_LINHA =
  "cabecalho_invalido: linha nao processada sem cabecalho valido";

function motivoCardinalidade(quantidade: number): string {
  return `cardinalidade_invalida: esperado ${COLUNAS_GUIA.length} colunas, obtido ${quantidade}`;
}

interface QuebraFisica {
  indice: number;
  comprimento: number;
}

/** Primeira quebra de linha física do texto, ou `null` se ele tem uma só linha. */
function localizarPrimeiraQuebra(texto: string): QuebraFisica | null {
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice]!;
    if (caractere === "\n") {
      return { indice, comprimento: 1 };
    }
    if (caractere === "\r") {
      return { indice, comprimento: texto[indice + 1] === "\n" ? 2 : 1 };
    }
  }
  return null;
}

/** Motivo da falha de um registro recuperado, ou `null` se ele for uma guia válida. */
function motivoDoRegistro(registro: RegistroCsv): string | null {
  if (registro.aspasAbertas || registro.malformado) {
    return registro.aspasAbertas ? MOTIVO_ASPAS_NAO_TERMINADAS : MOTIVO_ASPAS_MALFORMADAS;
  }
  if (registro.campos.length !== COLUNAS_GUIA.length) {
    return motivoCardinalidade(registro.campos.length);
  }
  return null;
}

function processarRegistros(
  registros: readonly RegistroCsv[],
  guias: LinhaGuiaCsv[],
  falhas: FalhaCsv[],
  promoverGuias: boolean,
): void {
  // Pilha de trabalho explícita e iterativa, processada em ordem: os registros
  // recuperados de uma ressincronização são empilhados na ordem inversa para
  // serem consumidos do início ao fim. Cada ressincronização consome ao menos a
  // primeira linha física do registro, então a pilha nunca cresce além da
  // entrada e a recursão de chamadas é evitada.
  const trabalho: RegistroCsv[] = [];
  for (let indice = registros.length - 1; indice >= 0; indice -= 1) {
    trabalho.push(registros[indice]!);
  }

  while (trabalho.length > 0) {
    const registro = trabalho.pop()!;
    const quebra = localizarPrimeiraQuebra(registro.textoCru);

    // Registros com sintaxe de aspas inválida engolem linhas seguintes: o texto
    // cru abrange mais de uma linha física, então emite uma única falha para a
    // primeira linha e reexamina o restante com o parser completo, para que uma
    // guia recuperada com quebra interna em campo citado sobreviva inteira. Sem
    // cabeçalho válido (`promoverGuias` falso), um registro sintaticamente válido
    // que ocupe várias linhas físicas também é ressincronizado, para que cada
    // linha física receba um desfecho explícito, sem linha descartada em silêncio.
    if (
      (registro.aspasAbertas || registro.malformado || !promoverGuias) &&
      quebra !== null
    ) {
      falhas.push({
        numero: registro.numeroLinha,
        motivo: registro.aspasAbertas
          ? MOTIVO_ASPAS_NAO_TERMINADAS
          : registro.malformado
            ? MOTIVO_ASPAS_MALFORMADAS
            : MOTIVO_CABECALHO_INVALIDO_LINHA,
        linhaOriginal: registro.textoCru.slice(0, quebra.indice),
      });
      const resto = registro.textoCru.slice(quebra.indice + quebra.comprimento);
      const recuperados = dividirRegistros(resto, registro.numeroLinha + 1);
      for (let indice = recuperados.length - 1; indice >= 0; indice -= 1) {
        trabalho.push(recuperados[indice]!);
      }
      continue;
    }

    const motivo = motivoDoRegistro(registro);
    if (motivo !== null) {
      falhas.push({ numero: registro.numeroLinha, motivo, linhaOriginal: registro.textoCru });
      continue;
    }

    if (promoverGuias) {
      guias.push({
        numero: registro.numeroLinha,
        original: montarOriginal(registro.campos),
        linhaOriginal: registro.textoCru,
      });
      continue;
    }

    // Sem cabeçalho válido um registro sintaticamente válido ainda é falha: a
    // linha física entra no resultado em vez de ser promovida a guia.
    falhas.push({
      numero: registro.numeroLinha,
      motivo: MOTIVO_CABECALHO_INVALIDO_LINHA,
      linhaOriginal: registro.textoCru,
    });
  }
}

export function parseGuiasCsv(texto: string): ResultadoCsv {
  const registros = dividirRegistros(texto);
  const [primeiro, ...demais] = registros;
  const cabecalho = primeiro ? [...primeiro.campos] : [];

  const guias: LinhaGuiaCsv[] = [];
  const falhas: FalhaCsv[] = [];

  if (primeiro && primeiro.aspasAbertas) {
    // §4.2/#ac-5 e PRD #23/#28: o cabeçalho com aspas não terminadas é a falha
    // de sua primeira linha física; a máquina de recuperação existente reexame
    // o restante do registro, sempre como falha e nunca como guia.
    processarRegistros(registros, guias, falhas, false);
    return { cabecalho, guias, falhas };
  }

  if (!cabecalhoEsperado(cabecalho)) {
    falhas.push({
      numero: primeiro ? primeiro.numeroLinha : 1,
      motivo: `cabecalho_invalido: esperado ${COLUNAS_GUIA.join(",")}`,
      linhaOriginal: primeiro ? primeiro.textoCru : "",
    });
    // §4.2/#ac-5 e PRD #23/#28: sem cabeçalho válido nada é promovido a guia,
    // mas cada linha física restante precisa de um desfecho explícito, inclusive
    // a ressincronização de um registro que ocupe várias linhas físicas.
    processarRegistros(demais, guias, falhas, false);
    return { cabecalho, guias, falhas };
  }

  processarRegistros(demais, guias, falhas, true);

  return { cabecalho, guias, falhas };
}

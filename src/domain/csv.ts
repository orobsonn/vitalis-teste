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

function dividirRegistros(entrada: string): RegistroCsv[] {
  const texto = entrada.charCodeAt(0) === 0xfeff ? entrada.slice(1) : entrada;
  const registros: RegistroCsv[] = [];
  let campos: string[] = [];
  let campo = "";
  let textoCru = "";
  let emAspas = false;
  let aposAspas = false;
  let malformado = false;
  let numeroLinha = 1;
  let linhaInicial = 1;
  let indice = 0;

  const concluirCampo = (): void => {
    campos.push(campo);
    campo = "";
    aposAspas = false;
  };

  const concluirRegistro = (): void => {
    concluirCampo();
    const linhaEmBranco = campos.length === 1 && campos[0] === "" && textoCru === "";
    if (!linhaEmBranco) {
      registros.push({ campos, textoCru, numeroLinha: linhaInicial, aspasAbertas: emAspas, malformado });
    }
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

  concluirRegistro();
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

export function parseGuiasCsv(texto: string): ResultadoCsv {
  const registros = dividirRegistros(texto);
  const [primeiro, ...demais] = registros;
  const cabecalho = primeiro ? [...primeiro.campos] : [];

  const guias: LinhaGuiaCsv[] = [];
  const falhas: FalhaCsv[] = [];

  if (primeiro && primeiro.aspasAbertas) {
    falhas.push({
      numero: primeiro.numeroLinha,
      motivo: "aspas_nao_terminadas: campo entre aspas sem fechamento até o fim do arquivo",
      linhaOriginal: primeiro.textoCru,
    });
    return { cabecalho, guias, falhas };
  }

  if (!cabecalhoEsperado(cabecalho)) {
    falhas.push({
      numero: primeiro ? primeiro.numeroLinha : 1,
      motivo: `cabecalho_invalido: esperado ${COLUNAS_GUIA.join(",")}`,
      linhaOriginal: primeiro ? primeiro.textoCru : "",
    });
    return { cabecalho, guias, falhas };
  }

  for (const registro of demais) {
    if (registro.aspasAbertas) {
      falhas.push({
        numero: registro.numeroLinha,
        motivo: "aspas_nao_terminadas: campo entre aspas sem fechamento até o fim do arquivo",
        linhaOriginal: registro.textoCru,
      });
      continue;
    }
    if (registro.malformado) {
      falhas.push({
        numero: registro.numeroLinha,
        motivo: "aspas_malformadas: sintaxe de aspas inválida no campo",
        linhaOriginal: registro.textoCru,
      });
      continue;
    }
    if (registro.campos.length !== COLUNAS_GUIA.length) {
      falhas.push({
        numero: registro.numeroLinha,
        motivo: `cardinalidade_invalida: esperado ${COLUNAS_GUIA.length} colunas, obtido ${registro.campos.length}`,
        linhaOriginal: registro.textoCru,
      });
      continue;
    }
    guias.push({
      numero: registro.numeroLinha,
      original: montarOriginal(registro.campos),
      linhaOriginal: registro.textoCru,
    });
  }

  return { cabecalho, guias, falhas };
}

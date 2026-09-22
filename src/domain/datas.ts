/**
 * Datas civis sem fuso: calendário real, aritmética de dias inteiros e
 * comparação total. Nada aqui usa `Date` nem relógio de parede.
 */

export interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

const DIAS_POR_MES: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2 && ehBissexto(ano)) {
    return 29;
  }
  return DIAS_POR_MES[mes - 1] ?? 0;
}

function validar(ano: number, mes: number, dia: number): DataCivil | null {
  if (mes < 1 || mes > 12) {
    return null;
  }
  if (dia < 1 || dia > diasNoMes(ano, mes)) {
    return null;
  }
  return { ano, mes, dia };
}

/** Interpreta `DD/MM/AAAA` ou `AAAA-MM-DD`, rejeitando datas fora do calendário. */
export function parseDataCivil(texto: string): DataCivil | null {
  const limpo = texto.trim();
  const brasileira = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpo);
  if (brasileira) {
    return validar(Number(brasileira[3]), Number(brasileira[2]), Number(brasileira[1]));
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(limpo);
  if (iso) {
    return validar(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return null;
}

export function dataParaIso(data: DataCivil): string {
  const mes = String(data.mes).padStart(2, "0");
  const dia = String(data.dia).padStart(2, "0");
  return `${String(data.ano).padStart(4, "0")}-${mes}-${dia}`;
}

function diasAbsolutos(data: DataCivil): number {
  const ajuste = data.mes <= 2 ? 1 : 0;
  const ano = data.ano - ajuste;
  const era = Math.floor(ano / 400);
  const anoDaEra = ano - era * 400;
  const diaDoAno =
    Math.floor((153 * (data.mes + (data.mes > 2 ? -3 : 9)) + 2) / 5) + data.dia - 1;
  const diaDaEra =
    anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno;
  return era * 146097 + diaDaEra - 719468;
}

function deDiasAbsolutos(dias: number): DataCivil {
  const deslocado = dias + 719468;
  const era = Math.floor(deslocado / 146097);
  const diaDaEra = deslocado - era * 146097;
  const anoDaEra = Math.floor(
    (diaDaEra - Math.floor(diaDaEra / 1460) + Math.floor(diaDaEra / 36524) - Math.floor(diaDaEra / 146096)) / 365,
  );
  const ano = anoDaEra + era * 400;
  const diaDoAno = diaDaEra - (365 * anoDaEra + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100));
  const mesDeslocado = Math.floor((5 * diaDoAno + 2) / 153);
  const dia = diaDoAno - Math.floor((153 * mesDeslocado + 2) / 5) + 1;
  const mes = mesDeslocado < 10 ? mesDeslocado + 3 : mesDeslocado - 9;
  return { ano: mes <= 2 ? ano + 1 : ano, mes, dia };
}

export function somarDias(data: DataCivil, dias: number): DataCivil {
  return deDiasAbsolutos(diasAbsolutos(data) + dias);
}

export function compararData(a: DataCivil, b: DataCivil): -1 | 0 | 1 {
  if (a.ano !== b.ano) {
    return a.ano < b.ano ? -1 : 1;
  }
  if (a.mes !== b.mes) {
    return a.mes < b.mes ? -1 : 1;
  }
  if (a.dia !== b.dia) {
    return a.dia < b.dia ? -1 : 1;
  }
  return 0;
}

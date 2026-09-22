// Teste travado lt-primitivas-datas-dinheiro — datas civis sem fuso e dinheiro
// em centavos.
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097). O módulo é tratado como `ApiAprovada`,
// interface local. RED por asserção de superfície/comportamento.
import { describe, expect, it } from "vitest";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

interface ApiAprovada {
  parseDataCivil(texto: string): DataCivil | null;
  dataParaIso(data: DataCivil): string;
  somarDias(data: DataCivil, dias: number): DataCivil;
  compararData(a: DataCivil, b: DataCivil): -1 | 0 | 1;
  valorParaCentavos(texto: string): number | null;
  formatarCentavos(centavos: number): string;
}

describe("datas civis (calendário real, sem fuso)", () => {
  it("interpreta DD/MM/AAAA e AAAA-MM-DD e rejeita datas impossíveis", () => {
    expect(typeof api.parseDataCivil).toBe("function");

    expect(api.parseDataCivil("03/08/2026")).toEqual({ ano: 2026, mes: 8, dia: 3 });
    expect(api.parseDataCivil("26/08/2026")).toEqual({ ano: 2026, mes: 8, dia: 26 });
    expect(api.parseDataCivil("2026-08-26")).toEqual({ ano: 2026, mes: 8, dia: 26 });

    expect(api.dataParaIso({ ano: 2026, mes: 8, dia: 3 })).toBe("2026-08-03");
    expect(api.dataParaIso({ ano: 2026, mes: 8, dia: 26 })).toBe("2026-08-26");

    // Fora do calendário real.
    expect(api.parseDataCivil("31/04/2026")).toBeNull();
    expect(api.parseDataCivil("30/02/2026")).toBeNull();
    expect(api.parseDataCivil("2026-02-30")).toBeNull();
  });

  it("trata fronteiras bissextas", () => {
    expect(typeof api.parseDataCivil).toBe("function");

    expect(api.parseDataCivil("29/02/2024")).toEqual({ ano: 2024, mes: 2, dia: 29 });
    expect(api.parseDataCivil("2024-02-29")).toEqual({ ano: 2024, mes: 2, dia: 29 });
    expect(api.parseDataCivil("29/02/2026")).toBeNull();
    expect(api.parseDataCivil("2000-02-29")).toEqual({ ano: 2000, mes: 2, dia: 29 });
    expect(api.parseDataCivil("1900-02-29")).toBeNull();
  });

  it("soma dias inteiros cruzando mês e ano", () => {
    expect(typeof api.somarDias).toBe("function");

    expect(api.somarDias({ ano: 2026, mes: 8, dia: 31 }, 1)).toEqual({ ano: 2026, mes: 9, dia: 1 });
    expect(api.somarDias({ ano: 2026, mes: 12, dia: 31 }, 1)).toEqual({ ano: 2027, mes: 1, dia: 1 });
    expect(api.somarDias({ ano: 2026, mes: 3, dia: 1 }, -1)).toEqual({ ano: 2026, mes: 2, dia: 28 });
    expect(api.somarDias({ ano: 2024, mes: 2, dia: 28 }, 1)).toEqual({ ano: 2024, mes: 2, dia: 29 });
    expect(api.somarDias({ ano: 2026, mes: 1, dia: 1 }, 365)).toEqual({ ano: 2027, mes: 1, dia: 1 });
  });

  it("compara datas de forma total", () => {
    expect(typeof api.compararData).toBe("function");

    expect(api.compararData({ ano: 2026, mes: 8, dia: 9 }, { ano: 2026, mes: 8, dia: 10 })).toBe(-1);
    expect(api.compararData({ ano: 2026, mes: 8, dia: 10 }, { ano: 2026, mes: 8, dia: 10 })).toBe(0);
    expect(api.compararData({ ano: 2026, mes: 9, dia: 1 }, { ano: 2026, mes: 8, dia: 31 })).toBe(1);
    expect(api.compararData({ ano: 2027, mes: 1, dia: 1 }, { ano: 2026, mes: 12, dia: 31 })).toBe(1);
  });
});

describe("dinheiro em centavos", () => {
  it("converte texto em centavos e rejeita formatos ilegíveis", () => {
    expect(typeof api.valorParaCentavos).toBe("function");

    expect(api.valorParaCentavos("62,00")).toBe(6200);
    expect(api.valorParaCentavos("62.00")).toBe(6200);
    expect(api.valorParaCentavos("62,0")).toBe(6200);
    expect(api.valorParaCentavos("140")).toBe(14000);

    expect(api.valorParaCentavos("")).toBeNull();
    expect(api.valorParaCentavos("6,2,0")).toBeNull();
    expect(api.valorParaCentavos("-62,00")).toBeNull();
    expect(api.valorParaCentavos("62,000")).toBeNull();
    expect(api.valorParaCentavos("R$ 62,00")).toBe(6200);
  });

  it("rejeita valores cujo total em centavos não é um inteiro seguro", () => {
    expect(typeof api.valorParaCentavos).toBe("function");

    // Último valor seguro: exatamente Number.MAX_SAFE_INTEGER centavos.
    expect(api.valorParaCentavos("90071992547409,91")).toBe(9007199254740991);
    expect(Number.isSafeInteger(api.valorParaCentavos("90071992547409,91") as number)).toBe(true);

    // Primeiro valor inseguro (2^53 centavos, representável mas não seguro).
    expect(api.valorParaCentavos("90071992547409,92")).toBeNull();

    // Ramo inteiro: ×100 já estoura o inteiro seguro.
    expect(api.valorParaCentavos("9007199254740991")).toBeNull();

    // Sequência gigante de dígitos.
    expect(api.valorParaCentavos("9".repeat(25))).toBeNull();
  });

  it("formata centavos como reais", () => {
    expect(typeof api.formatarCentavos).toBe("function");

    expect(api.formatarCentavos(6200)).toBe("R$ 62,00");
    expect(api.formatarCentavos(14000)).toBe("R$ 140,00");
  });
});

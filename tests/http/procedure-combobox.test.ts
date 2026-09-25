import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcedureCombobox, filtrarProcedimentos } from "../../src/react-app/ProcedureCombobox";

const procedimentos = [
  { codigo: "50000470", descricao: "Sessão de fisioterapia" },
  { codigo: "10101012", descricao: "Consulta em consultório" },
  { codigo: "50000144", descricao: "Avaliação fisioterapêutica" },
];

describe("busca de procedimentos sem lista nativa do navegador", () => {
  it("encontra códigos completos/parciais e descrições ignorando acentos e caixa", () => {
    expect(filtrarProcedimentos(procedimentos, "5000").map(p => p.codigo)).toEqual(["50000470", "50000144"]);
    expect(filtrarProcedimentos(procedimentos, " SESSAO ")).toEqual([procedimentos[0]]);
    expect(filtrarProcedimentos(procedimentos, "FISIOTERAPEUTICA")).toEqual([procedimentos[2]]);
    expect(filtrarProcedimentos(procedimentos, "10101012")).toEqual([procedimentos[1]]);
  });

  it("vazio oferece o catálogo e código desconhecido não inventa correspondência", () => {
    expect(filtrarProcedimentos(procedimentos, "")).toEqual(procedimentos);
    expect(filtrarProcedimentos(procedimentos, "99999999")).toEqual([]);
    expect(procedimentos[0].descricao).toBe("Sessão de fisioterapia");
  });

  it.each(["", "99999999", " 50000470 "])("preserva o valor controlado literal %j e vincula acessibilidade sem datalist", (value) => {
    const html = renderToStaticMarkup(createElement(ProcedureCombobox, {
      id: "procedimento_codigo", value, procedimentos, onValueChange: () => {},
      "aria-describedby": "procedimento_codigo-hint", "aria-invalid": true,
    }));
    expect(html).toContain(`value="${value}"`);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-describedby="procedimento_codigo-hint"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('autoComplete="off"');
    expect(html).not.toMatch(/<datalist|\slist=/);
  });
});

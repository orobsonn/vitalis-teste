import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { carregarCatalogo, type Catalogo } from "../../src/domain/catalogo";
import regras from "../../docs/fontes/regras_convenio.json";
import { procedimentosSugeridos } from "../../src/react-app/procedimentos-sugeridos";
import { SelectMenu } from "../../src/react-app/SelectMenu";

const loaded = carregarCatalogo(regras);
if (!loaded.ok) throw Error(loaded.erros.join(", "));
const catalogo = loaded.catalogo;
const codes = (nome: string, source: Catalogo = catalogo) => procedimentosSugeridos(source, nome).map(item => item.codigo);

describe("sugestões preventivas por cobertura", () => {
  it("mostra apenas procedimentos cobertos pelo convênio escolhido", () => {
    expect(codes("Plano Bem")).toEqual(["50000470", "50000560", "50000012"]);
    expect(codes("Saúde Interior")).toEqual(["50000470", "50000012", "20103301", "40201015"]);
    expect(codes("Vitalcard")).not.toContain("40201015");
  });

  it("usa a normalização do domínio e não inventa cobertura para convênio ausente", () => {
    expect(codes("  plano  bem ")).toEqual(codes("Plano Bem"));
    expect(codes("")).toEqual(catalogo.procedimentos.map(item => item.codigo));
    expect(codes("Convênio histórico")).toEqual(catalogo.procedimentos.map(item => item.codigo));
  });

  it("não transforma cobertura vazia em catálogo geral", () => {
    const empty = { ...catalogo, convenios: catalogo.convenios.map(item => item.nome === "Plano Bem" ? { ...item, procedimentosCobertos: [] } : item) };
    expect(codes("Plano Bem", empty)).toEqual([]);
  });
});

describe("seletor padronizado", () => {
  it("preserva valor histórico fora das opções e expõe lista acessível", () => {
    const html = renderToStaticMarkup(createElement(SelectMenu, {
      id: "convenio", label: "Convênio", value: "Convênio antigo", onChange: () => {},
      options: [{ value: "", label: "Selecione o convênio" }, { value: "Plano Bem", label: "Plano Bem" }],
    }));
    expect(html).toContain("Convênio antigo");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<select");
  });
});

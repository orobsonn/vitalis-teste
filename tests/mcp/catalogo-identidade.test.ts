import { expect, it } from "vitest";
import { carregarCatalogo } from "../../src/domain";
import { createCatalogHandlers } from "../../src/application/catalogo";
import raw from "../../docs/fontes/regras_convenio.json";

it("nome retornado pela listagem preserva identidade com espaços e nomes semelhantes sem acento", () => {
  const loaded = carregarCatalogo({ ...raw, convenios: [
    { ...raw.convenios[1], nome: " Saúde  Interior " },
    { ...raw.convenios[0], nome: "Saude Interior" },
  ] });
  if (!loaded.ok) throw new Error(loaded.erros.join("; "));
  const handlers = createCatalogHandlers(loaded.catalogo);
  const nomes = handlers.listarConvenios({}).convenios.map(c => c.nome);
  expect(handlers.obterConvenio({ convenio: nomes[0] }).limite_sessoes).toBe(20);
  expect(handlers.obterConvenio({ convenio: nomes[1] }).limite_sessoes).toBe(10);
  expect(() => handlers.obterConvenio({ convenio: "sàude interior" })).toThrow("ambíguo");
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NormalizedGuide } from "../../src/react-app/GuidePages";
import { normalizarGuia, parseGuiasCsv } from "../../src/domain";
import csv from "../../docs/fontes/guias.csv?raw";

it("dados normalizados mostram centavos como reais, datas ISO e ausência sem converter para zero", () => {
  const original = { ...parseGuiasCsv(csv).guias[0].original, valor: "90,00", data_atendimento: "04/08/2026", autorizacao_validade: "31/02/2026", autorizacao_sessoes_limite: "0012", paciente: "<script>" };
  const guia = normalizarGuia({ original, numero: 1, linhaOriginal: "" });
  const html = renderToStaticMarkup(createElement(NormalizedGuide, { guia }));
  expect(html).toContain("R$ 90,00");
  expect(html).toContain("2026-08-04");
  expect(html).toContain("<dd>12</dd>");
  expect(html).toContain("Ausente ou inválido");
  expect(html).toContain("não puderam ser normalizados");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("[object Object]");
});

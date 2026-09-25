import { describe, expect, it } from "vitest";
import { httpHarness } from "./support";

describe("endereço público da configuração MCP", () => {
  it("redireciona sessão válida à tela correta sem devolver a SPA inicial", async () => {
    const h = await httpHarness();
    const response = await h.request("/configuracoes/mcp", { headers: { Accept: "text/html" } });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/#conectar");
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.ai).not.toHaveBeenCalled();
  });

  it("continua exigindo sessão antes de indicar a tela de conexão", async () => {
    const h = await httpHarness();
    const response = await h.request("/configuracoes/mcp", { headers: { Cookie: "", Accept: "text/html" } });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.ai).not.toHaveBeenCalled();
  });
});

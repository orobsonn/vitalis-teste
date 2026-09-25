import { describe, expect, it, vi } from "vitest";
import { boundedRequest } from "../../src/http/body";

function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); }, cancel,
  });
  const request = new Request("https://vitalis.test/api/importacoes", { method: "POST", headers, body, duplex: "half" } as RequestInit);
  return { request, cancel };
}

describe("limite de corpo na entrada do Worker", () => {
  it("recusa bytes efetivos acima de 64KiB sem Content-Length e com tamanho declarado falso", async () => {
    const variants: Array<Record<string, string>> = [{}, { "Content-Length": "10" }];
    for (const headers of variants) {
      const { request } = streamed([new Uint8Array(40_000), new Uint8Array(25_537)], headers);
      const response = await boundedRequest(request);
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(413);
    }
  });
  it("aceita exatamente o teto e preserva payload/headers para OAuth e Hono", async () => {
    const source = new Uint8Array(65_536).fill(65);
    const { request } = streamed([source.slice(0, 17), source.slice(17)], { Origin: "https://vitalis.test", "Content-Type": "text/plain" });
    const bounded = await boundedRequest(request);
    expect(bounded).toBeInstanceOf(Request);
    expect((bounded as Request).headers.get("Origin")).toBe("https://vitalis.test");
    expect(new Uint8Array(await (bounded as Request).arrayBuffer())).toEqual(source);
  });
  it("mantém GET sem corpo intacto", async () => {
    const request = new Request("https://vitalis.test/health");
    expect(await boundedRequest(request)).toBe(request);
  });
});

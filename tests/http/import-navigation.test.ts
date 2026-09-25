import { afterEach, describe, expect, it, vi } from "vitest";
import { postImportMutation } from "../../src/react-app/import-request";

afterEach(() => vi.unstubAllGlobals());

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const response = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { response, resolve, reject };
}

describe("navigation during import mutations", () => {
  it.each(["/api/importacoes", "/api/importacoes/lote/processar"])("lets %s finish but discards the departed screen's response", async (path) => {
    const server = deferredResponse();
    let connectionCancelled = false;
    const fetch = vi.fn((_path: string, init: RequestInit) => {
      init.signal?.addEventListener("abort", () => {
        connectionCancelled = true;
        server.reject(new DOMException("Client disconnected", "AbortError"));
      });
      return server.response;
    });
    vi.stubGlobal("fetch", fetch);
    const screen = new AbortController();
    const pending = postImportMutation(path, { idempotency_key: "stable-key" }, screen.signal);
    screen.abort();
    server.resolve(Response.json({ lote: { id: "persisted", status: "PROCESSANDO" } }));
    await expect(pending).resolves.toBeNull();
    expect(connectionCancelled).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"idempotency_key":"stable-key"}' });
  });

  it("does not start a mutation after navigation while reading the file", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const screen = new AbortController();
    screen.abort();
    expect(await postImportMutation("/api/importacoes", { csv: "file read finished" }, screen.signal)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("delivers success and HTTP errors while the screen remains active", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ lote: { id: "saved" } }))
      .mockResolvedValueOnce(Response.json({ error: "Há outra operação em andamento." }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const screen = new AbortController();
    expect(await postImportMutation("/api/importacoes", {}, screen.signal)).toEqual({ lote: { id: "saved" } });
    await expect(postImportMutation("/api/importacoes/lote/processar", {}, screen.signal)).rejects.toThrow("Há outra operação em andamento.");
  });
});

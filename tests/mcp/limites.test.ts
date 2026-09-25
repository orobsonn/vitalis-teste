import { afterEach, describe, expect, it, vi } from "vitest";
import type { Executor, ResolvedProvider } from "@cloudflare/codemode";
import { CODE_TIMEOUT_MS, MAX_RESPONSE_BYTES, lerCorpoLimitado, limitarExecutor } from "../../src/mcp/limites";

afterEach(() => vi.useRealTimers());

describe("limites MCP e sandbox", () => {
  it("limita corpo chunked por bytes UTF-8", async () => {
    const corpo = () => new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(new TextEncoder().encode("áá"));
      c.enqueue(new TextEncoder().encode("á")); c.close();
    } });
    expect((await lerCorpoLimitado(corpo(), 6)).byteLength).toBe(6);
    await expect(lerCorpoLimitado(corpo(), 5)).rejects.toBeInstanceOf(RangeError);
  });

  it("filtra escrita mesmo se um provider futuro a incluir por acidente", async () => {
    const escrita = vi.fn();
    const executor: Executor = { execute: async (_code, ps) => ({ result: Object.keys((ps as ResolvedProvider[])[0].fns) }) };
    const result = await limitarExecutor(executor).execute("async()=>{}", [{ name: "codemode", fns: { registrar_guia: escrita, verificar_guia: async () => "ok" } }]);
    expect(result.result).toEqual(["verificar_guia"]);
    expect(escrita).not.toHaveBeenCalled();
  });

  it("limita 20 chamadas internas e descarta logs e mensagens de erro arbitrárias", async () => {
    const leitura = vi.fn(async () => "ok");
    const executor: Executor = { async execute(_code, ps) {
      const fn = (ps as ResolvedProvider[])[0].fns.verificar_guia;
      for (let n = 0; n < 21; n++) await fn({ guia: {} });
      return { result: "não alcançado" };
    } };
    const result = await limitarExecutor(executor).execute("async()=>{}", [{ name: "codemode", fns: { verificar_guia: leitura } }]);
    expect(result.error).toBeDefined();
    expect(leitura).toHaveBeenCalledTimes(20);
    const erro = await limitarExecutor({ execute: async () => ({ result: null, error: "SQL segredo", logs: ["TOKEN"] }) })
      .execute("async()=>{}", []);
    expect(JSON.stringify(erro)).not.toMatch(/SQL|segredo|TOKEN/);
  });

  it("recusa resposta serializada acima de128KiB sem truncar um resultado de conferência", async () => {
    const result = await limitarExecutor({ execute: async () => ({ result: "é".repeat(MAX_RESPONSE_BYTES), logs: ["privado"] }) })
      .execute("async()=>{}", [{ name: "codemode", fns: {} }]);
    expect(result.error).toBeDefined();
    expect(result.result).toBeNull();
    expect(result.logs).toBeUndefined();
  });

  it("deadline no host encerra uma execução travada e rejeita RPC posterior", async () => {
    vi.useFakeTimers();
    let fn: ((...args: unknown[]) => Promise<unknown>) | undefined;
    const leitura = vi.fn(async () => "ok");
    const executor: Executor = { async execute(_code, ps) {
      fn = (ps as ResolvedProvider[])[0].fns.verificar_guia;
      return new Promise(() => {});
    } };
    const pendente = limitarExecutor(executor).execute("async()=>{}", [{ name: "codemode", fns: { verificar_guia: leitura } }]);
    await vi.advanceTimersByTimeAsync(CODE_TIMEOUT_MS);
    expect((await pendente).error).toContain("5 segundos");
    await expect(fn!({ guia: {} })).rejects.toThrow("Limite");
    expect(leitura).not.toHaveBeenCalled();
  });
});

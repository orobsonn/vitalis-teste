import type { ExecuteResult, Executor, ResolvedProvider } from "@cloudflare/codemode";

export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 128 * 1024;
export const CODE_TIMEOUT_MS = 5_000;
export const MAX_CODE_TOOL_CALLS = 20;
const encoder = new TextEncoder();
const READ_TOOLS = new Set(["consultar_regra", "verificar_guia"]);

export function jsonDentroDoLimite(valor: unknown, limite = MAX_RESPONSE_BYTES): string {
  const texto = JSON.stringify(valor);
  if (texto === undefined || encoder.encode(texto).byteLength > limite) {
    throw new RangeError("Conteúdo excede o limite permitido.");
  }
  return texto;
}

/** Lê inclusive corpos chunked sem alocar acima do teto da aplicação. */
export async function lerCorpoLimitado(body: ReadableStream<Uint8Array> | null, limite: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        void reader.cancel().catch(() => {});
        throw new RangeError("Conteúdo excede o limite permitido.");
      }
      partes.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const resultado = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    resultado.set(parte, offset);
    offset += parte.byteLength;
  }
  return resultado;
}

/**
 * Deadline também no host: após o término, nenhuma nova chamada RPC é aceita.
 * O DynamicWorkerExecutor isola a execução e bloqueia rede pelo WorkerLoader.
 * Não devolvemos logs, stack ou mensagens arbitrárias do runtime ao cliente.
 */
export function limitarExecutor(executor: Executor): Executor {
  return {
    async execute(code, providersOrFns): Promise<ExecuteResult> {
      let encerrado = false;
      let chamadas = 0;
      let bytesSaida = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = Date.now() + CODE_TIMEOUT_MS;
      const falha = (error: string): ExecuteResult => ({ result: null, error });
      try {
        jsonDentroDoLimite(code, MAX_REQUEST_BYTES);
        const providers: ResolvedProvider[] = Array.isArray(providersOrFns)
          ? providersOrFns : [{ name: "codemode", fns: providersOrFns }];
        if (providers.length !== 1 || providers[0].name !== "codemode") {
          return falha("Ferramentas indisponíveis no sandbox.");
        }
        const fns: ResolvedProvider["fns"] = {};
        for (const [nome, fn] of Object.entries(providers[0].fns)) {
          if (!READ_TOOLS.has(nome)) continue;
          fns[nome] = async (...args: unknown[]) => {
            if (encerrado || Date.now() >= deadline || ++chamadas > MAX_CODE_TOOL_CALLS) {
              throw new Error("Limite de execução atingido.");
            }
            jsonDentroDoLimite(args, MAX_REQUEST_BYTES);
            const resultado = await fn(...args);
            const texto = jsonDentroDoLimite(resultado);
            bytesSaida += encoder.encode(texto).byteLength;
            if (encerrado || bytesSaida > MAX_RESPONSE_BYTES) {
              throw new Error("Limite de execução atingido.");
            }
            return resultado;
          };
        }
        const resultado = await Promise.race([
          executor.execute(code, [{ name: "codemode", fns }]),
          new Promise<ExecuteResult>((resolve) => {
            timer = setTimeout(() => resolve(falha("Tempo limite de 5 segundos excedido.")), CODE_TIMEOUT_MS);
          }),
        ]);
        if (resultado.error) {
          return falha(resultado.error === "Tempo limite de 5 segundos excedido."
            ? resultado.error : "Não foi possível executar o código. Verifique o código e os limites do sandbox.");
        }
        jsonDentroDoLimite(resultado.result);
        return { result: resultado.result };
      } catch {
        return falha("Não foi possível executar o código dentro dos limites permitidos.");
      } finally {
        encerrado = true;
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}

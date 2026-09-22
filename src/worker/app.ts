import { Hono } from "hono";

/**
 * Constroi a aplicacao Hono compartilhada pelo Worker.
 *
 * Ainda sem rotas: o roteamento (OAuth/MCP/API) chega nas proximas issues.
 * O `env` tipado pelos bindings gerados fica disponivel para as proximas
 * tarefas sem alterar esta assinatura.
 */
export function createApp(_env: Env): Hono<{ Bindings: Env }> {
  return new Hono<{ Bindings: Env }>();
}

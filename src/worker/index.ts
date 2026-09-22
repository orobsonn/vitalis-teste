import { createApp } from "./app";

/**
 * Entrypoint do Worker declarado em `wrangler.jsonc` (`main`).
 *
 * Apenas adapta `fetch` para a aplicacao criada por `createApp(env)`.
 */
export default {
  fetch(request, env, ctx) {
    return createApp(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

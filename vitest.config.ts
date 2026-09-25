import { defineConfig } from "vitest/config";

// Os testes unitários/de aplicação usam Node, SQLite em memória e doubles dos
// bindings. O plugin Cloudflare pertence ao dev/build: Vitest desliga a descoberta
// de dependências do ambiente Worker e faz dependências CommonJS do SDK MCP (AJV)
// chegarem sem pré-bundle ao Workerd. Um config Node separado mantém o runtime
// de produção intacto; npm run check e os smokes HTTP verificam o Worker real.
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});

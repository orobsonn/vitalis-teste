import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Os testes rodam offline. Sem CLOUDFLARE_API_TOKEN, o binding `AI` (placeholder)
// e remoto por natureza e faria o plugin Cloudflare abrir uma sessao remota,
// falhando em ambiente nao interativo. Sob Vitest forcamos o modo local: os
// testes nao devem acessar recursos remotos.
if (process.env.VITEST) {
  process.env.CLOUDFLARE_VITE_FORCE_LOCAL = "true";
}

export default defineConfig({
  plugins: [react(), cloudflare(), tailwindcss()],
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});

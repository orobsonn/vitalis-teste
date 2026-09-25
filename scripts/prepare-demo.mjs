import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

const directory = new URL("../.local/", import.meta.url);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const target = new URL("cloudflare-secrets.json", directory);
if (existsSync(target) && !process.argv.includes("--rotate")) {
  console.log("Credenciais já preparadas em .local/. Use --rotate somente para trocar a senha.");
  process.exit(0);
}
const email = process.env.DEMO_EMAIL || "demo@vitalis.app";
const password = randomBytes(18).toString("base64url");
const pepper = randomBytes(32).toString("base64url");
const salt = randomBytes(24).toString("base64");
const secrets = {
  COOKIE_ENCRYPTION_KEY: randomBytes(48).toString("base64url"),
  AUTH_PASSWORD_PEPPER: pepper, DEMO_EMAIL: email, DEMO_PASSWORD_SALT: salt,
  DEMO_PASSWORD_HASH: pbkdf2Sync(pepper + password, Buffer.from(salt, "base64"), 100_000, 32, "sha256").toString("base64"),
};
writeFileSync(target, JSON.stringify(secrets), { mode: 0o600 });
writeFileSync(new URL("demo-credentials.txt", directory),
  `Vitalis — acesso privado de demonstração\nE-mail: ${email}\nSenha: ${password}\n\nCompartilhe somente com o avaliador por canal privado. Nunca publique este arquivo.\n`, { mode: 0o600 });
writeFileSync(new URL("../.dev.vars", import.meta.url),
  Object.entries(secrets).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
console.log("Credenciais geradas em .local/demo-credentials.txt; secrets em .local/cloudflare-secrets.json; .dev.vars local preparado. Valores não exibidos.");

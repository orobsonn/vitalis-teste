# MCP Vitalis — OAuth, Code Mode e contrato de implementação

- **Status:** decisão aprovada para o MVP
- **Escopo:** referência autocontida para implementação e criação das issues
- **Autoridade funcional:** `docs/prd/vitalis-conferencia-preventiva-guias.md`

Este documento traz para dentro do repositório o padrão técnico necessário. Nenhuma issue ou run futura deve depender de acesso aos projetos locais `oraculo` ou `victor-mcp`.

## 1. Experiência esperada

1. A pessoa adiciona a URL HTTPS do MCP Vitalis ao Claude Chat, Claude Code ou Codex.
2. O cliente descobre o OAuth do servidor e abre `/authorize` no navegador.
3. A tela “Conectar ao Vitalis” solicita e-mail e senha da conta de demonstração.
4. O servidor valida as credenciais e conclui a autorização OAuth.
5. O cliente recebe e armazena access token e refresh token; a pessoa não copia Bearer token nem API key.
6. Depois do login, `tools/list` mostra `consultar_regra`, `verificar_guia`, `registrar_guia` e `code`.
7. As credenciais da conta de demonstração são enviadas privadamente ao avaliador. O repositório contém apenas placeholders e instruções.

## 2. Arquitetura mínima

- Cloudflare Worker stateless em TypeScript.
- Streamable HTTP em `/mcp` com `createMcpHandler` de `agents/mcp`.
- OAuth com `@cloudflare/workers-oauth-provider` e Dynamic Client Registration.
- Formulário de autorização em Hono.
- Estado OAuth de uso único e TTL curto em KV.
- Dados do produto em D1; identidade única de demonstração em Worker secrets.
- Cloudflare Code Mode com `DynamicWorkerExecutor` e binding `LOADER`.
- React + Vite + TypeScript + shadcn/ui para a SPA autenticada.
- Biblioteca de domínio TypeScript pura compartilhada pela aplicação, importação e MCP.

Baseline de versões aprovada para iniciar a implementação; o lockfile criado na primeira instalação passa a ser a fonte exata. Upgrade só entra após build, testes e deploy local compatíveis:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "cf-typegen": "wrangler types",
    "check": "tsc --noEmit && vite build && wrangler deploy --dry-run",
    "deploy": "npm run build && wrangler deploy"
  },
  "dependencies": {
    "@cloudflare/codemode": "^0.3.8",
    "@cloudflare/workers-oauth-provider": "^0.4.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "agents": "^0.11.9",
    "hono": "^4.12.34",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "react-router-dom": "^7.10.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.53.0",
    "@cloudflare/vitest-pool-workers": "^0.22.0",
    "@cloudflare/workers-types": "^5.20260710.1",
    "@tailwindcss/vite": "^4.1.18",
    "@vitejs/plugin-react": "^5.1.1",
    "typescript": "^7.0.2",
    "vite": "^8.2.1",
    "vitest": "^4.1.10",
    "wrangler": "^4.124.0"
  }
}
```

Configuração mínima do Vite conforme o plugin oficial:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare(), tailwindcss()],
});
```

## 3. Rotas e bindings

Rotas obrigatórias:

| Rota | Responsabilidade |
|---|---|
| `/mcp` | endpoint MCP protegido pelo OAuth |
| `/login` GET/POST | autenticação da aplicação com a conta única de demonstração |
| `/configuracoes/mcp` | tela autenticada “Conectar ao Claude”, com URL e instruções, sem token visível |
| `/authorize` GET | validar a solicitação OAuth e reutilizar a sessão web ou mostrar o login |
| `/authorize` POST | validar CSRF, estado e credenciais/sessão; concluir a autorização |
| `/token` | emissão e renovação de token pelo `OAuthProvider` |
| `/register` | Dynamic Client Registration pelo `OAuthProvider` |
| `/health` | health check sem dados sensíveis |

Bindings e secrets:

```jsonc
{
  "main": "src/worker.ts",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "vitalis" }
  ],
  "kv_namespaces": [
    { "binding": "OAUTH_KV", "id": "<CONFIGURAR_NO_DEPLOY>" }
  ],
  "worker_loaders": [
    { "binding": "LOADER" }
  ],
  "ai": { "binding": "AI" }
}
```

Precedência obrigatória de roteamento:

1. `OAuthProvider`: `/mcp`, `/authorize`, `/token` e `/register`;
2. Hono: `/login`, `/logout`, `/api/*`, `/configuracoes/mcp` e `/health`;
3. guarda de sessão para as rotas e assets da aplicação;
4. `env.ASSETS.fetch(request)` somente para assets/`GET` de navegação permitidos;
5. `404` JSON para APIs/protocolos desconhecidos, nunca HTML da SPA.

`run_worker_first: true` faz todo request passar pelo Worker antes dos assets. Isso evita que uma rota nova ou arquivo estático contorne a autenticação; em contrapartida, o Worker deve delegar explicitamente os assets autorizados. Smoke tests de `/health` e APIs verificam conteúdo e `Content-Type`, não apenas status `200`, porque um fallback SPA também pode responder com sucesso.

Secrets obrigatórios, criados no ambiente e nunca commitados:

```text
COOKIE_ENCRYPTION_KEY=<valor aleatório forte>
AUTH_PASSWORD_PEPPER=<valor aleatório forte>
DEMO_EMAIL=<e-mail da conta de teste>
DEMO_PASSWORD_SALT=<salt aleatório em base64>
DEMO_PASSWORD_HASH=<hash PBKDF2 em base64>
```

`Env` mínimo:

```ts
interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  LOADER: WorkerLoader;
  AI: Ai;
  ASSETS: Fetcher;
  COOKIE_ENCRYPTION_KEY: string;
  AUTH_PASSWORD_PEPPER: string;
  DEMO_EMAIL: string;
  DEMO_PASSWORD_SALT: string;
  DEMO_PASSWORD_HASH: string;
}
```

## 4. Conta de demonstração

Existe somente a identidade lógica `demo`, com papel `demo`. Não há tabela de usuários nem cadastro público. E-mail, salt, hash e pepper ficam em secrets do Worker; a senha nunca é armazenada em texto puro.

Um script local de preparação deve:

1. receber e-mail, senha e pepper por variáveis de ambiente ou prompt sem eco;
2. normalizar o e-mail com `trim().toLowerCase()`;
3. gerar salt aleatório;
4. derivar o hash com Web Crypto PBKDF2-HMAC-SHA-256 usando um número fixo e versionado de iterações;
5. orientar a gravação de e-mail, salt, hash e pepper pelos comandos `wrangler secret put`, sem colocá-los na linha de comando ou em arquivo versionado;
6. nunca imprimir ou persistir a senha.

A autenticação compara o e-mail normalizado com `DEMO_EMAIL` e o hash derivado com `DEMO_PASSWORD_HASH`. A comparação do hash deve percorrer todos os bytes, sem retorno antecipado:

```ts
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

A autenticação deve responder com erro genérico como `E-mail ou senha inválidos`, sem revelar se o usuário existe.

Após login web, o Worker emite `__Host-vitalis_session`, assinado com HMAC-SHA-256 e `COOKIE_ENCRYPTION_KEY`, contendo apenas `userId`, emissão e expiração máxima de oito horas. O cookie usa `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e nenhum atributo `Domain`; novo login rotaciona a sessão e logout a apaga. O handler OAuth reutiliza essa sessão quando válida; se não houver sessão, apresenta o mesmo formulário de e-mail e senha. A página `/configuracoes/mcp` mostra somente URL e instruções — nunca afirma detectar um cliente externo nem exibe access token, refresh token, hash ou segredo.

## 5. Estado OAuth e CSRF

O estado completo da solicitação não vai para o HTML. Ele é guardado no KV e representado por um identificador opaco, aleatório, de uso único:

```ts
const CSRF_COOKIE = "vitalis_csrf";

export async function saveOAuthState(
  requestInfo: unknown,
  kv: KVNamespace,
): Promise<string> {
  const id = crypto.randomUUID();
  await kv.put(`oauth_state:${id}`, JSON.stringify(requestInfo), {
    expirationTtl: 600,
  });
  return id;
}

export async function loadOAuthState(
  id: string,
  kv: KVNamespace,
): Promise<unknown | null> {
  const value = await kv.get(`oauth_state:${id}`);
  return value ? JSON.parse(value) : null;
}

export async function deleteOAuthState(
  id: string,
  kv: KVNamespace,
): Promise<void> {
  await kv.delete(`oauth_state:${id}`);
}

export function createCsrf(): { token: string; cookie: string } {
  const token = crypto.randomUUID();
  return {
    token,
    cookie: `${CSRF_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  };
}
```

O POST valida o token do formulário contra o cookie e carrega o estado sem apagá-lo antes da autenticação. Credencial incorreta permanece sujeita ao rate limit e recebe um novo CSRF, mas pode reutilizar o estado OAuth ainda válido. Após `completeAuthorization` concluir, o estado é apagado; estado ausente, expirado ou já utilizado é rejeitado.

Toda mutação autenticada por cookie — login, logout, importação, cadastro, correção e reset — exige método não idempotente apropriado, token CSRF ligado à sessão e validação do header `Origin`; `Referer` pode ser defesa adicional. Nenhuma mutação ocorre por `GET`. Chamadas MCP usam o Bearer emitido pelo OAuthProvider e não reutilizam CSRF de navegador.

## 6. Handler de autorização

Estrutura obrigatória do fluxo, omitindo apenas o HTML visual:

```ts
import { Hono } from "hono";
import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

type AppEnv = {
  Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
};

const app = new Hono<AppEnv>();

app.get("/authorize", async (c) => {
  let requestInfo: AuthRequest;
  try {
    requestInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  } catch {
    return c.text("Solicitação OAuth inválida", 400);
  }

  if (!requestInfo.clientId) return c.text("client_id ausente", 400);

  const state = await saveOAuthState(requestInfo, c.env.OAUTH_KV);
  const csrf = createCsrf();
  const sessionUser = await readWebSession(c.req.raw, c.env);
  const page = sessionUser
    ? renderAuthorize({ state, csrf: csrf.token, user: sessionUser })
    : renderLogin({ state, csrf: csrf.token });
  return c.html(page, 200, { "Set-Cookie": csrf.cookie });
});

app.post("/authorize", async (c) => {
  const form = await c.req.formData();
  const state = String(form.get("state") ?? "");
  const csrf = String(form.get("csrf_token") ?? "");

  if (!validateCsrf(csrf, c.req.raw)) {
    return c.html(renderExpiredLogin(), 403);
  }

  const requestInfo = await loadOAuthState(state, c.env.OAUTH_KV);
  if (!requestInfo) return c.html(renderExpiredLogin(), 400);

  let user = await readWebSession(c.req.raw, c.env);
  if (!user) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    user = await authenticateDemoUser(email, password, c.env);
  }
  if (!user) return c.html(renderInvalidLogin(), 401);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: requestInfo as AuthRequest,
    userId: user.id,
    metadata: { label: `Vitalis (${user.email})` },
    scope: (requestInfo as AuthRequest).scope,
    props: {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
  });

  await deleteOAuthState(state, c.env.OAUTH_KV);
  return Response.redirect(redirectTo, 302);
});
```

O formulário deve:

- usar `method="POST"`;
- incluir `state` e `csrf_token` ocultos;
- usar `autocomplete="username"` e `autocomplete="current-password"`;
- escapar todos os valores interpolados no HTML;
- desabilitar o botão após envio;
- não registrar e-mail, senha ou conteúdo da guia em logs.

## 7. OAuthProvider e servidor MCP

O entrypoint segue esta composição:

```ts
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { codeMcpServer } from "@cloudflare/codemode/mcp";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp";

interface OAuthProps {
  userId: string;
  email: string;
  role: "demo";
}

const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const props = (ctx as ExecutionContext & { props?: OAuthProps }).props;
    if (!props) return Response.json({ error: "Sessão inválida" }, { status: 401 });

    const handlers = createVitalisHandlers({ env, actor: props });

    // O servidor base contém apenas primitivas permitidas no sandbox.
    const baseServer = createCodeModeBaseServer(handlers);
    const executor = new DynamicWorkerExecutor({
      loader: env.LOADER,
      timeout: 5_000,
      // globalOutbound permanece no default null: sem fetch/connect externo.
    });
    const wrappedServer = await codeMcpServer({
      server: baseServer,
      executor,
    });

    // Tools explícitas, avaliáveis sem geração de código.
    registerDirectReadTools(wrappedServer, handlers);

    // Escrita somente fora do Code Mode.
    registerRegistrarGuia(wrappedServer, handlers);

    return createMcpHandler(wrappedServer)(request, env, ctx);
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler as never,
  defaultHandler: authHandler as never,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  accessTokenTTL: 86_400,
  refreshTokenTTL: 2_592_000,
});
```

Não adicionar `globalOutbound`, módulos arbitrários, D1, secrets ou `registrar_guia` aos providers do sandbox.

## 8. Registro das tools sem duplicar regras

`createVitalisHandlers` é a única composição dos casos de uso:

```ts
function createVitalisHandlers(deps: Dependencies) {
  return {
    consultarRegra: (input: ConsultarRegraInput) =>
      consultarRegra(input, deps.ruleCatalog),
    verificarGuia: (input: VerificarGuiaInput) =>
      verificarGuia(input, deps.ruleCatalog, deps.textInterpreter),
    registrarGuia: (input: RegistrarGuiaInput) =>
      registrarGuia(input, deps.repository, deps.actor),
  };
}
```

### 8.1. Interpretação de observações

`textInterpreter` usa o binding Cloudflare Workers AI somente quando `observacao_recepcao` não está vazia. A entrada enviada ao modelo contém apenas:

```ts
{
  observacao_recepcao: string;
  convenio: string;
  procedimento_codigo: string;
}
```

Não enviar ID da guia, paciente, carteirinha, autorização, profissional ou registro. O modelo retorna sinais de enumeração fechada, situação, trecho literal de evidência e ambiguidades. O host valida o schema e confirma que cada evidência existe no texto original. O modelo não retorna a decisão final e não possui tool, D1, rede ou permissão de escrita.

O cache usa hash de texto, convênio, procedimento, versão do prompt e ID do modelo. A versão/ID do modelo deve ser fixada na configuração implantada e registrada na validação; trocar prompt ou modelo invalida o cache. Timeout, resposta inválida ou indisponibilidade preservam as verificações determinísticas e produzem `checagem_textual_incompleta`.

O servidor base do Code Mode registra somente:

- `consultar_regra` → `handlers.consultarRegra`;
- `verificar_guia` → `handlers.verificarGuia`.

O servidor final registra diretamente:

- `consultar_regra` → o mesmo `handlers.consultarRegra`;
- `verificar_guia` → o mesmo `handlers.verificarGuia`;
- `registrar_guia` → `handlers.registrarGuia`;
- `code` → criado pelo wrapper.

Assim, `tools/list` atende literalmente ao enunciado, enquanto o Code Mode usa o mesmo núcleo sem conseguir gravar dados.

## 9. Contratos mínimos das tools

### `consultar_regra`

Entrada:

```ts
{
  convenio: string;
  procedimento_codigo: string;
}
```

Saída inclui cobertura, procedimento, valor de referência, campos obrigatórios, validade máxima, limite de sessões, prazo de envio, observação literal, limitações e `regras_versao`.

### `verificar_guia`

Aceita os campos documentados em `docs/fontes/dicionario_dados.md`, inclusive `observacao_recepcao`, e uma referência temporal explícita quando aplicável.

Saída mínima:

```ts
{
  decisao: "OK" | "PENDENTE";
  motivos: Array<{
    codigo: string;
    campos: string[];
    regra: string;
    evidencia: string;
  }>;
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string;
  regras_versao: string;
}
```

A operação nunca persiste nem altera indicadores.

### `registrar_guia`

Recebe a mesma guia, a referência temporal e uma `idempotency_key` estável. Valida primeiro, então cria ou revisa a guia com `DB.batch` atômico. `idempotency_key` possui constraint `UNIQUE`; repetir os mesmos dados devolve o resultado anterior sem nova guia, revisão ou valor. Uma alteração real preserva a revisão anterior, e um índice único parcial impede duas revisões vigentes da mesma guia.

A tool fica fora do Code Mode e registra somente metadados de auditoria necessários: ator, horário, id da guia, revisão e resultado. Não registra senha, token ou conteúdo integral em logs de infraestrutura.

O estado do teste é global para a conta `demo`. O reset é recusado com `409` enquanto existir importação `PROCESSANDO`; fora disso, um `DB.batch` autenticado apaga somente lotes, guias, revisões, validações e extrações. Regras, secrets e OAuth permanecem. Não haverá isolamento por sessão nem geração de ambientes.

A importação cria primeiro o lote e seu status, depois processa linhas em chamadas limitadas/chunks, persistindo progresso e falhas. Ela não depende de uma única requisição longa. O status final só vira `CONCLUIDO` quando todas as linhas terminarem; falha parcial permanece visível.

## 10. Limites e segurança

Valores iniciais, ajustáveis somente com evidência:

- corpo HTTP máximo: 64 KiB;
- timeout do `code`: 5 segundos;
- resposta serializada máxima: 128 KiB;
- estado OAuth: TTL de 10 minutos e uso único;
- access token: 24 horas;
- refresh token: 30 dias, emitido/renovado/revogado pelo `OAuthProvider`, sem implementação paralela;
- no máximo 10 tentativas de login por 15 minutos por IP;
- no máximo 60 chamadas MCP por minuto por combinação de usuário e IP;
- senha com tamanho máximo antes do PBKDF2 para evitar abuso de CPU;
- erros internos não retornam SQL, stack, binding ou segredo;
- `fetch()` e `connect()` bloqueados no sandbox;
- `registrar_guia` indisponível dentro de `code`;
- Workers AI recebe somente observação, convênio e código do procedimento;
- uma retentativa máxima para falha transitória da extração e quota de custo por usuário.

Respostas de limite excedido usam HTTP `429`, informam quando tentar novamente e não revelam se um e-mail existe.

## 11. Testes de aceitação da infraestrutura MCP

A implementação só está pronta quando houver evidência executável de que:

1. o endpoint protegido inicia o fluxo OAuth em vez de aceitar chamadas anônimas;
2. Dynamic Client Registration funciona;
3. login válido conclui e redireciona;
4. senha incorreta retorna erro genérico;
5. CSRF ausente/incorreto é rejeitado;
6. estado OAuth expirado ou reutilizado é rejeitado;
7. refresh token renova uma sessão sem pedir senha novamente;
8. `tools/list` autenticado contém as quatro tools esperadas;
9. `consultar_regra` e `verificar_guia` funcionam diretamente;
10. `code` acessa apenas consulta e verificação e não possui rede externa;
11. `registrar_guia` persiste com histórico e idempotência;
12. `verificar_guia` não altera D1 nem indicadores;
13. logs e respostas não expõem senha, token, SQL ou stack;
14. uma guia inédita chega à mesma decisão no núcleo, no MCP direto e no fluxo da Skill;
15. rotas de API/protocolo nunca recebem o fallback HTML da SPA, e assets protegidos não contornam a sessão;
16. login, importação, cadastro, correção e reset rejeitam CSRF ou `Origin` inválidos;
17. idempotência concorrente não cria duplicata nem duas revisões vigentes;
18. reset retorna `409` durante importação e, quando permitido, preserva regras/OAuth;
19. importação parcial mantém progresso, sucessos e falhas sem se declarar integralmente concluída.

## 12. README e entrega ao avaliador

O README final deve documentar, com comandos realmente verificados:

- URL publicada do MCP;
- como adicionar um servidor MCP HTTP no Claude Chat, Claude Code e Codex;
- que o navegador abrirá a tela OAuth;
- placeholders para e-mail e senha;
- como consultar regra, verificar guia e executar a Skill;
- solução para sessão expirada ou reconexão;
- ausência deliberada de credenciais no repositório.

A mensagem privada de entrega contém as credenciais de demonstração. Ela não contém access token nem exige que o avaliador copie Bearer token.

## 13. Regra para criação das issues

Toda issue que implemente esta arquitetura deve:

1. citar este arquivo por caminho relativo;
2. copiar na própria issue os critérios de aceitação e os trechos de contrato necessários à tarefa;
3. listar paths de escrita previstos;
4. não dizer apenas “faça como no Oráculo” ou referenciar diretórios externos;
5. incluir os testes focais correspondentes;
6. preservar a separação: leitura dentro do Code Mode, escrita somente na tool direta;
7. proibir segredos e credenciais reais em código, fixture, issue, log ou histórico Git.

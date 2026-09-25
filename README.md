# Vitalis — conferência preventiva de guias

Aplicação demonstrativa para importar guias, apontar pendências antes do faturamento, explicar cada motivo e acompanhar valores sob revisão. Uma guia inédita percorre o mesmo núcleo pela aplicação, pelo MCP e pela Skill.

**Aplicação:** `https://vitalis.robsonlins.workers.dev`

**MCP:** `https://vitalis.robsonlins.workers.dev/mcp`

**Acesso:** e-mail `<EMAIL_DEMO>` e senha `<SENHA_DEMO>`, enviados privadamente ao avaliador. Nenhuma credencial real deve ser adicionada a este arquivo.

## Usar a demonstração

1. Entre com a conta de demonstração.
2. Em **Importações**, envie [`docs/fontes/guias.csv`](docs/fontes/guias.csv). O progresso e as falhas ficam visíveis por linha; um processamento interrompido pode ser retomado.
3. Em **Guias**, abra uma pendência para ver regra, evidência, orientação e histórico. Corrigir preserva a revisão anterior.
4. Em **Nova guia**, informe um caso novo. Cadastro e correção conferem automaticamente antes de apresentar o resultado.
5. Em **Visão geral**, acompanhe o relatório: estoque vigente, pendências, valor das guias pendentes, excesso de valor e duplicidade candidata são medidas distintas.
6. Em **Conectar ao Claude**, copie a URL do MCP e siga o login OAuth no cliente escolhido.

O estado é global para a única conta `demo`: pessoas conectadas enxergam as mesmas guias. **Reiniciar demonstração** apaga o estado operacional e preserva regras e acesso; a operação é recusada enquanto existe importação em processamento. Os dados da fonte são fictícios.

Baseline das 80 guias originais, confirmada na aplicação publicada em 25/09/2026 após a reconferência: **44 OK e 36 pendentes**, **R$ 5.694,00 registrados** e **R$ 2.692,00 em guias pendentes**. As 36 observações preenchidas tiveram checagem completa; as 44 vazias não exigiram interpretação. Duplicidade candidata envolve quatro guias, R$ 320,00 sob revisão e R$ 160,00 de possível excesso, sem excluir registros automaticamente. As três guias sintéticas criadas nos testes foram removidas seletivamente ao final, preservando as 80 guias e seu histórico. Veja as [evidências E2E](docs/evidencias-e2e.md).

## Rodar a partir de um clone

Requisitos: Node.js 22.22 ou posterior compatível, npm, conta Cloudflare com Workers/D1/KV/Workers AI e acesso ao Worker Loader. Os testes de storage usam `node:sqlite`.

```bash
git clone https://github.com/orobsonn/vitalis-teste.git
cd vitalis-teste
npm ci
node scripts/prepare-demo.mjs
npx wrangler d1 migrations apply vitalis --local
npm run dev
```

O script gera credenciais de desenvolvimento e prepara `.dev.vars`. Os arquivos `.local/demo-credentials.txt`, `.local/cloudflare-secrets.json` e `.dev.vars` são privados e ignorados pelo Git; não os adicione a commits ou anexos públicos. O script não mostra valores secretos no terminal. `--rotate` troca as credenciais existentes e deve ser usado somente quando essa troca for intencional.

Abra o endereço informado pelo Vite e consulte localmente o arquivo privado de credenciais para entrar. Workers AI pode usar recursos remotos mesmo durante desenvolvimento: use uma conta Cloudflare autenticada para testar a interpretação real. As suítes automatizadas usam doubles e não chamam o modelo remoto.

`wrangler.jsonc` contém os IDs dos recursos da conta de demonstração. Para publicar em outra conta, substitua `account_id`, o ID de D1 e os dois IDs de KV pelos seus recursos. Crie-os, se necessário:

```bash
npx wrangler login
npx wrangler d1 create vitalis
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create CACHE_SEMANTICO
```

Mantenha os bindings `DB`, `OAUTH_KV`, `CACHE_SEMANTICO`, `AI`, `LOADER` e `ASSETS`. Os secrets exigidos são `COOKIE_ENCRYPTION_KEY`, `AUTH_PASSWORD_PEPPER`, `DEMO_EMAIL`, `DEMO_PASSWORD_SALT` e `DEMO_PASSWORD_HASH`. Depois de conferir a conta de destino e preparar as credenciais privadas:

```bash
npx wrangler d1 migrations apply vitalis --remote
npx wrangler secret bulk .local/cloudflare-secrets.json
npm run cf-typegen
npm run check
npm run deploy
```

As migrations são aditivas. Aplique todas, em ordem; os arquivos versionados incluem storage operacional, autenticação e coordenação de escrita. Repita `npm run cf-typegen` quando alterar bindings. O deploy usa o build Vite para gerar Worker e assets. O health público é `/health` e deve responder JSON do Vitalis, não o HTML da aplicação.

## Testes e verificação

```bash
npm test
npm run typecheck
npm run check
```

`npm test` executa o contrato do projeto e as suítes de domínio, interpretação, storage, importação, relatório, autenticação, HTTP e MCP. A configuração `vitest.config.ts` usa Node; o build/desenvolvimento mantém o plugin Cloudflare em `vite.config.ts`. Isso evita que o runner Vitest desative o pré-bundle CommonJS do ambiente Worker. O runtime real é validado separadamente por build/dry-run e smoke HTTP.

Última suíte consolidada nesta validação: **513 testes Vitest e 11 verificações de fundação aprovados**. `npm run check` (typecheck, build e dry-run) passou com os últimos ajustes de integração e interface. A interface tem provas E2E manuais, contratos HTTP e cinco verificações de filtro/renderização SSR; estas últimas não simulam interação DOM em navegador.

Evidências focais desta entrega: **25 testes MCP aprovados**, incluindo protocolo em memória, isolamento das ferramentas de leitura, limite de corpo/saída, deadline, erros seguros, leitura sem persistência e registro idempotente com histórico. O build e o health em Workerd local também foram executados. Na publicação final, **38 verificações reais do cliente SDK MCP passaram**, incluindo OAuth/refresh, ferramentas, isolamento do Code Mode e oito verificações de escrita/histórico. A escrita criou uma guia fictícia e comprovou concorrência, conflito, retentativa e correção sem duplicar revisões. A matriz complementar final aprovou **49/49 bordas** e comprovou conteúdo idêntico em nove tabelas operacionais e no dashboard antes/depois. A quota publicada também retornou 429 e liberou nova consulta após Retry-After. O [registro de demonstração](docs/demonstracao.md) separa esses resultados dos testes publicados e da gravação ainda a completar.

## Conectar o MCP

Use a URL HTTPS publicada terminando em `/mcp`. A conexão abre a autorização Vitalis no navegador. O cliente recebe e renova os tokens; a pessoa não precisa copiar um Bearer token.

**Codex CLI** — sintaxe conferida no CLI local 0.155.1 e na [documentação oficial](https://learn.chatgpt.com/docs/extend/mcp?surface=cli):

```bash
codex mcp add vitalis --url https://vitalis.robsonlins.workers.dev/mcp
codex mcp login vitalis --oauth-client-registration dcr
codex mcp list
```

**Claude Code** — adicione o servidor HTTP, abra o Claude Code e use `/mcp` para autenticar o Vitalis. [Documentação oficial](https://code.claude.com/docs/en/mcp).

```bash
claude mcp add --transport http vitalis https://vitalis.robsonlins.workers.dev/mcp
```

**Claude Chat** — em **Customize → Connectors**, adicione um conector personalizado com a URL do MCP, clique em conectar e conclua o login Vitalis. Em organizações, um administrador pode precisar disponibilizar o conector. A interface e a disponibilidade dependem do plano; veja as [instruções oficiais](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Depois de conectar, a lista deve conter exatamente `consultar_regra`, `verificar_guia`, `registrar_guia` e `code`. Peça para consultar a regra de um convênio/procedimento e conferir uma guia. `verificar_guia` não salva. Para salvar, peça explicitamente o registro; o servidor recebe uma chave de idempotência estável para as retentativas.

Se a sessão expirar e o cliente não conseguir renová-la, reconecte/autentique o servidor. No Codex, repita `codex mcp login vitalis --oauth-client-registration dcr`. HTTP 429 pede uma pausa pelo tempo de `Retry-After`. Respostas de checagem textual incompleta devem continuar visíveis: não significam que todas as verificações foram realizadas.

Contratos, limites e exemplos ficam em [`docs/mcp.md`](docs/mcp.md).

## Executar a Skill

A fonte está em [`skills/conferir-guia/SKILL.md`](skills/conferir-guia/SKILL.md). O diretório `.agents/skills/conferir-guia` contém um symlink para essa fonte, permitindo descoberta automática pelo Codex neste clone. Caso seu sistema não preserve symlinks, copie a pasta `skills/conferir-guia` para `.agents/skills/`.

Abra uma nova sessão do Codex nesse repositório, com o MCP Vitalis conectado, e use:

```text
$conferir-guia Confira esta guia sem salvar: id_guia EXEMPLO-001.
Observação da recepção: "Ainda não recebi o número; talvez confirme amanhã."
Os demais dados não foram informados.
```

A conexão configurada pelo usuário foi validada em um processo Codex CLI com o OAuth salvo pelo próprio cliente: consulta de regra e conferência de guia `OK`, sem gravar ou fornecer token manual ao processo.

A Skill mantém ausências, preserva o texto integral e explica o resultado do servidor. Para persistir, faça um pedido explícito de registro. O diretório `.agents/skills` é reconhecido conforme a [documentação oficial de Skills do Codex](https://learn.chatgpt.com/docs/build-skills). A Skill não substitui a conexão MCP nem contém uma cópia das regras. Sua execução foi verificada em cliente Codex CLI real com casos de campos completos, ausências e instrução indevida na observação. O roteiro e as limitações dessa prova estão em `docs/demonstracao.md`.

## Como foi feito

O produto foi implementado neste repositório a partir das fontes do exercício, do [PRD aprovado](docs/prd/vitalis-conferencia-preventiva-guias.md) e da [decisão de arquitetura MCP](docs/arquitetura/mcp-oauth-codemode.md). O código, os testes e a documentação foram produzidos com assistência de IA no Codex; Robson conduziu as escolhas de produto e a aprovação do escopo. Não há registro suficiente para atribuir edições manuais específicas de código ao candidato.

Decisões autorais de produto registradas e aprovadas no PRD (a aprovação de uma decisão não implica edição manual de código):

| Decisão | Motivo e consequência |
| --- | --- |
| Decisão determinística; IA somente extrai sinais de texto. | Regras de cobertura, campos, datas e valores permanecem auditáveis. Evidências do modelo precisam existir na observação original. |
| Conferência ad hoc não persiste. | Uma pergunta na conversa não altera o relatório; o registro exige intenção explícita. PRD D15. |
| Histórico e idempotência na escrita. | Correções preservam versões; reenvios iguais não duplicam guias ou valores. PRD D17. |
| Excesso, exposição e duplicidade são separados. | Uma guia com vários motivos não multiplica o valor em risco; suspeita de duplicidade não é exclusão automática. PRD D12–D13. |
| Code Mode com apenas leitura, protegido por OAuth. | O cliente conecta pelo navegador. Código gerado não recebe banco, secrets, rede ou ferramenta de gravação. |

Ferramentas: TypeScript, React/Vite, Hono, Cloudflare Workers, D1, KV, Workers AI, SDK MCP, Code Mode, Vitest, SQLite em memória e Codex. O prompt de observações efetivamente carregado está em [`prompts/observacao/v1.md`](prompts/observacao/v1.md); a Skill operacional está versionada separadamente. O modelo configurado é `@cf/meta/llama-4-scout-17b-16e-instruct` (Scout), com versão de prompt `observacao-v3-scout` acrescida do hash do conteúdo. A configuração fica em `src/semantic/workers-ai.ts` e a identidade efetiva acompanha a conferência. A matriz direta do prompt final teve 24/25 casos com extração completa e correta. Uma observação longa teve evidência com capitalização alterada e foi recusada pelo validador, mantendo a checagem incompleta. Outros 13 cenários foram exercitados pelo MCP publicado e passaram. São amostras nomeadas, não garantia para qualquer texto; a prova final da Skill e do lote é registrada separadamente.

**Tempo pessoal estimado por Robson:** 6–8 horas no total, incluindo 4–6 horas de estudo do problema antes da implementação. O tempo de execução autônoma da IA não foi medido separadamente. A estimativa de que o pipeline habitual levaria cerca de quatro dias é contrafactual; não representa uma duração realizada nesta entrega. Por urgência, Robson dispensou a cerimônia normal do pipeline. Datas de commits e duração dos testes não substituem essas estimativas declaradas.

Ficaram fora do MVP: agenda/recepção por WhatsApp, conciliação de pagamentos, previsão de glosa, cadastro de múltiplas clínicas, notificações automáticas e integrações reais com operadoras. **Não há validação do padrão TISS nem consulta a histórico externo**: o sistema usa as fontes fornecidas e o histórico registrado nesta demonstração. **Code Mode é experimental**; os limites e testes de isolamento estão documentados, mas essa prova não representa certificação de segurança para qualquer código possível. A conta de demonstração não oferece isolamento entre usuários. O registro dinâmico anônimo de clientes OAuth é atendido pelo provider; a quota das ferramentas MCP não limita esse endpoint de cadastro. A conferência é preventiva: não garante pagamento, não representa auditoria clínica e não usa regras externas para completar lacunas da fonte. Falhas de IA mantêm as verificações determinísticas e indicam a limitação textual.

## Estrutura

- `src/domain`: catálogo, normalização, datas, dinheiro, políticas e decisão pura.
- `src/semantic`: extração limitada, validação de evidências, cache, quota e prompt.
- `src/application`, `src/storage`, `src/reports`: casos de uso, histórico, importação e agregações.
- `src/auth`, `src/http`, `src/worker`: acesso, endpoints internos e composição do Worker.
- `src/mcp`, `skills/conferir-guia`: protocolo e fluxo da Skill sobre os mesmos casos de uso.
- `src/react-app`: interface operacional; `tests`: evidência executável.

O [roteiro de vídeo](docs/demonstracao.md) cabe em até cinco minutos. O MCP publicado já foi exercitado pelo cliente SDK real; a Skill também foi executada no Codex CLI: seis casos estritos de leitura, um caso de texto livre e três ações autorizadas de registro, repetição e correção, com entradas preservadas e paridade dos resultados. O vídeo ainda precisa ser gravado/anexado. O smoke pode ser repetido com `node scripts/smoke-mcp.mjs` usando o arquivo privado de credenciais; por padrão ele não grava guias. `--write` habilita o registro E2E idempotente e altera a demonstração.

A [matriz de evidências E2E](docs/evidencias-e2e.md) registra os fluxos publicados já exercitados e os retestes finais.

A [matriz nominal de MCP e OAuth](docs/evidencias-mcp.md) publica os casos executados, os hashes de não persistência e os retestes realizados, sem segredos.

O [plano de validação final](docs/plano-validacao-final.md) reúne o checklist geral e o histórico de correções. As matrizes são finitas, contêm sobreposições e não representam garantia para toda entrada possível.

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

## Problema, fluxo e premissas

Na operação descrita pelo recrutador, **a recepção lança a guia durante o atendimento**, o **financeiro confere em planilha no fim do mês** e o **envio ao convênio sai do sistema de gestão** da clínica, que tem API e exporta relatórios. A solução se encaixa entre o lançamento e o envio: importa o recorte de guias ou recebe uma guia nova, confere preventivamente e devolve à recepção os campos e documentos a revisar. O financeiro vê as pendências e o valor associado, sem precisar reconstruí-los em planilha. A tela de detalhes mostra, para cada motivo, **regra aplicada, evidência e orientação**; **Salvar correção** cria outra revisão e mantém a anterior no histórico. Não há envio real, pedido de autorização, integração com o sistema de gestão ou alteração automática de cobranças.

O recrutador confirmou que **não estão definidos** quem pede a autorização, como ela é cadastrada/recebida, a frequência e o formato do envio ou o processo atual de retorno da pendência. Para a demonstração, adotamos a premissa de que a recepção corrige a guia no Vitalis e o financeiro decide o encaminhamento depois da conferência. **`OK`** significa ausência de pendência nas verificações que os dados permitem; **`PENDENTE`** significa que há algo para corrigir ou esclarecer antes do envio. Nenhum dos dois estados confirma pagamento, autenticidade do documento ou recebimento pelo convênio. O app não cria um status fictício de “enviada”.

As [fontes fornecidas](docs/fontes/) são o [CSV de 80 guias](docs/fontes/guias.csv), o [dicionário](docs/fontes/dicionario_dados.md) e o [JSON versionado dos convênios](docs/fontes/regras_convenio.json). O [PRD](docs/prd/vitalis-conferencia-preventiva-guias.md) registra as decisões de produto; os [esclarecimentos operacionais do recrutador](docs/fontes/esclarecimentos-operacionais.md) separam a resposta recebida das nossas premissas. O recrutador esclareceu especialmente que **não há regra complementar além do JSON** e que não devemos preencher lacunas com supostas normas clínicas ou contratuais.

## Regras efetivamente aplicadas

O catálogo vigente contém cinco procedimentos. A cobertura não é inferida pela descrição nem pela IA: é a lista explícita `procedimentos_cobertos` de cada convênio. No formulário, escolher o convênio reduz as **sugestões** aos códigos cobertos, mas a recepção ainda pode digitar um código recebido fora da lista; nesse caso ele é preservado e a conferência aponta a pendência. Na consulta de regras, todos os códigos continuam disponíveis para investigar também a falta de cobertura.

| Convênio | Códigos cobertos | Campos obrigatórios específicos | Limite por autorização | Prazo de envio |
| --- | --- | --- | ---: | ---: |
| Vitalcard | `50000470`, `50000560`, `50000012`, `20103301` | número e validade da autorização, registro profissional, carteirinha e CID | 10 sessões | 30 dias |
| Saúde Interior | `50000470`, `50000012`, `20103301`, `40201015` | número e validade da autorização, registro profissional e carteirinha | 20 sessões | 45 dias |
| Plano Bem | `50000470`, `50000560`, `50000012` | número e validade da autorização, registro profissional, carteirinha e CID | 12 sessões | 30 dias |

Os códigos representam, respectivamente, fisioterapia musculoesquelética, fisioterapia neurofuncional, reavaliação fisioterapêutica, consulta ortopédica e infiltração articular. O JSON também informa validade máxima de autorização de **30, 45 e 60 dias**, nessa ordem, e observações literais dos convênios. **Essa duração máxima não é testável:** o CSV só contém a data final de validade, não a data de concessão. Ela aparece como limitação, sem transformar as 80 guias em pendentes por falta de uma data inexistente. A observação sobre reavaliação médica da Vitalcard também não permite provar que ela ocorreu sem histórico completo.

| Verificação | Conduta da solução |
| --- | --- |
| Convênio/código não catalogado ou procedimento sem cobertura | Identificação ou cobertura fica pendente; não se escolhe outro convênio/código por aproximação. Código conhecido fora da cobertura permanece registrável e sinalizado. |
| Campos exigidos pelo convênio, código e descrição | Campo específico vazio gera motivo com nome do campo. Código e descrição divergentes pedem conferência; a descrição não é reescrita automaticamente. |
| Datas, números e registro profissional | Datas devem existir no calendário em `DD/MM/AAAA` ou `AAAA-MM-DD`; sessão e limite são inteiros positivos; valor deve ser interpretável em reais; registro profissional preenchido precisa ter o formato mínimo `CREFITO` ou `CRM`. Formato válido não comprova habilitação. |
| Validade da autorização | A data final deve alcançar a data do atendimento, **inclusive**. Sem data de concessão, a duração máxima informada no JSON permanece não verificável. |
| Sessões | A posição declarada não pode passar do menor limite entre a autorização da guia e o teto do convênio. O recorte de agosto não contém o histórico completo; não calculamos consumo real nem afirmamos que faltou reavaliação. |
| Prazo de envio | Para o lote de agosto, a conferência é simulada na **data de lançamento**, pois a guia ainda não foi enviada. O prazo começa no atendimento. Adotamos **dias corridos, último dia inclusivo** como política explícita do exercício; não confundimos lançamento com comprovante de envio. Se falta data necessária, o prazo é não verificável. |
| Cronologia | Lançamento anterior ao atendimento é inconsistência da entrada, não regra nova de convênio. |
| Valor | O JSON traz **valor de referência**, sem preço obrigatório ou tolerância. Valor válido diferente gera **alerta informativo**, não pendência/glosa automática; valor ilegível impede soma segura. |
| Duplicidade candidata | A mesma assinatura normalizada de nove campos materiais em revisões vigentes deixa **todas** as guias do grupo pendentes para revisão humana. Não apagamos nem escolhemos uma “correta”. O possível excesso é separado do valor total das guias sob revisão. |

Os nove campos da assinatura de duplicidade são convênio, paciente, carteirinha, número da autorização, data do atendimento, código do procedimento, número da sessão, unidade e registro profissional. A comparação não usa o ID da guia nem sua posição no CSV. O histórico e as chaves de idempotência evitam que correções e retentativas multipliquem guias ou valores. O relatório de **estoque** usa uma revisão vigente por guia; o de **atividade** filtra pela data civil de lançamento, não pelo instante técnico de processamento.

### O que fazemos com a observação da recepção

O recrutador deixou essa interpretação como decisão de produto, sem regra adicional. Quando há texto, o **Llama 4 Scout** extrai sinais em um vocabulário fechado e cita o trecho literal que os sustenta. A saída passa por validação de estrutura, evidência e coerência; **o motor determinístico**, e não o modelo, decide `OK`/`PENDENTE`. O modelo recebe apenas observação, convênio e procedimento. Texto vazio não chama IA. Se a extração necessária falha ou deixa dúvida material, a checagem fica **incompleta** e pede revisão humana, em vez de produzir um `OK` irrestrito. A observação é dado não confiável: instruções escritas nela não comandam o sistema. Prompt e versão do modelo ficam identificados na validação.

Casos concretos orientaram a política: autorização nova mencionada apenas no texto não substitui os campos formais; reagendamento dentro da validade, sem outra violação, não cria exigência inventada de nova autorização; decisão explícita por atendimento particular contradiz uma guia de convênio; protocolo de autorização verbal da Saúde Interior não substitui o número formal exigido antes do envio, e **sem a data da concessão não contamos os cinco dias úteis**; relato explícito de procedimento diferente do lançado pede conferência humana. Perguntar preço particular, pedir recibo ou registrar nota administrativa não bloqueia sozinho. Esses exemplos e os motivos estão detalhados no [dossiê de regras e casos](docs/vitalis_dossie_prd_inicial.md) e no [código das políticas textuais](src/domain/policies/textuais.ts).

### Desafios encontrados e decisões ainda abertas

- **Tempo e significado das datas:** data de lançamento não é data de envio, e a execução em setembro não muda a simulação de agosto. A referência temporal fica gravada em cada validação; uma conferência futura na operação real precisaria receber o evento efetivo de pré-envio.
- **Dados insuficientes:** sem emissão da autorização, histórico completo de sessões e data da autorização verbal, não há base para provar duração máxima, consumo real nem a janela de cinco dias úteis. Essas lacunas são exibidas como limitações, não convertidas em glosas presumidas.
- **Observações livres:** termos parafraseados exigem interpretação, mas um modelo pode errar ou ficar indisponível. Por isso, evidência literal, schema estrito, políticas fixas, marcação de checagem incompleta e testes de casos contraditórios foram necessários. A amostra de avaliação do prompt não constitui garantia geral.
- **Importação, correção e concorrência:** lotes de CSV podem terminar parcialmente e ser retomados; cada linha mantém seu resultado. Retentativas e correções concorrem com a leitura do relatório, então a implementação conserva a revisão anterior, usa chave de idempotência e lê indicadores de um snapshot coerente.
- **MCP autenticado com escrita controlada:** OAuth no mesmo domínio evita token manual; `verificar_guia` e `consultar_regra` são leitura, enquanto `registrar_guia` exige intenção e chave estável. O Code Mode compõe apenas ferramentas de leitura, com limites de corpo, tempo, saída e chamadas. Isso mantém a Skill útil sem permitir que código gerado grave diretamente no banco.
- **Operação compartilhada e integração:** a demonstração usa uma conta e um estado global, adequados à prova. Para uso real ainda seria preciso definir identidade da recepção e do financeiro, segregação por clínica, retorno de pendências, aprovação humana, integração com o sistema de gestão, data/protocolo de envio e tratamento de reenvio.
- **Regras não fornecidas:** compatibilidade entre profissão e procedimento, tolerância de preço, feriados no prazo geral, forma de comprovar reavaliação e políticas de pagamento exigem fonte ou decisão da clínica/operadora. O Vitalis não as apresenta como verificações existentes. O formato do registro profissional é verificado; a habilitação clínica não.

As questões acima **não bloqueiam a demonstração**: são limites conhecidos da informação e decisões necessárias antes de levar o fluxo para uma clínica real. A principal escolha deliberada foi preferir uma pendência explicável ou uma limitação explícita a inventar dados e afirmar uma regra inexistente.

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

Última suíte consolidada nesta validação: **517 testes Vitest e 11 verificações de fundação aprovados**. `npm run check` (typecheck, build e dry-run) passou com os últimos ajustes de integração e interface. A interface tem provas E2E manuais, contratos HTTP e testes focais de filtro/renderização SSR; estas últimas não simulam interação DOM em navegador.

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

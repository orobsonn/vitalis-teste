# Demonstração — até cinco minutos

**URL da aplicação:** `https://vitalis.robsonlins.workers.dev`

**URL MCP:** `https://vitalis.robsonlins.workers.dev/mcp`

**Vídeo:** ainda não gravado/anexado. Robson precisa gravar a apresentação real.

**Prazo informado para esta entrega:** 25/09/2026, antes de 23h59, horário de Fortaleza. Esse prazo atualizado prevalece para a submissão; as fontes históricas preservam o enunciado recebido.

Prepare a conta de demonstração, o CSV original e um cliente MCP autenticado antes de gravar. Não mostre senha, tokens, arquivos `.dev.vars`/`.local`, cabeçalhos de autorização ou a tela de configuração de secrets. Use somente os dados fictícios do exercício e exemplos novos igualmente fictícios.

## Roteiro de gravação

| Tempo | Mostrar | Explicação sugerida |
| --- | --- | --- |
| 0:00–0:25 | Aplicação e estado inicial; importar `docs/fontes/guias.csv`. | “A recepção consegue conferir um lote antes do faturamento. O sistema processa as linhas e mostra falhas parciais.” |
| 0:25–1:05 | Progresso e visão geral após o lote. | Mostre as quantidades e os valores realmente gerados. Explique que valor pendente, diferença de valor e duplicidade não são somados indiscriminadamente. |
| 1:05–1:40 | Abrir uma pendência com regra e evidência; mostrar a observação. | Escolha uma guia cuja pendência apareça no resultado atual. Diga qual campo precisa ser confirmado e como a evidência sustenta a orientação. |
| 1:40–2:20 | Nova guia fictícia; conferir e salvar. | Use um ID inédito e explique o retorno. Mostre que a mesma lógica também atende guias fora do lote original. |
| 2:20–2:55 | Cliente MCP com as quatro ferramentas; executar `code`. | Peça: “Use code para consultar a regra e conferir esta guia sem salvar.” Mostre a chamada `code` combinando `consultar_regra` e `verificar_guia`, com resultado e versão. Explique que o recurso experimental só combina leituras. |
| 2:55–4:00 | Invocar `$conferir-guia`, registrar explicitamente e repetir. | Cole outra guia fictícia inédita e a observação literal. Primeiro confira sem salvar. Depois peça “Registre esta guia com a chave VIDEO-REGISTRO-001” e “Repita exatamente o registro, com os mesmos dados e chave”. Mostre `criada` seguido de `reaproveitada` com a mesma revisão: a repetição não cria outra guia. |
| 4:00–4:35 | Corrigir e abrir o histórico. | Peça explicitamente para salvar uma alteração real com nova chave, mantendo o ID. Mostre a revisão anterior preservada e apenas uma vigente. |
| 4:35–5:00 | README, testes e limites. | “A IA interpreta a observação; regras e decisão ficam no núcleo compartilhado. Code Mode é experimental. Não há validação TISS nem histórico externo.” Cite a limitação real da observação longa recusada pelo validador. |

A fala é uma sugestão de roteiro, não prova de execução. Não apresente um resultado esperado como se já tivesse ocorrido. Se a IA estiver indisponível, mostre a checagem textual incompleta e os motivos determinísticos preservados.

Prepare as entradas fictícias antes de gravar para caber no tempo. Use um ID e uma chave ainda não utilizados; `VIDEO-REGISTRO-001` é apenas exemplo e deve ser substituído se já existir. A repetição mantém a mesma entrada/chave; a correção usa uma nova. As três ações devem aparecer com seus retornos reais, sem apresentar uma consulta como gravação.

## Guia inédita para ensaio

Escolha valores fictícios válidos no catálogo exibido pela aplicação. Use um identificador que ainda não existe, como `EXEMPLO-VIDEO-001`, e um código anônimo para paciente. Copie exatamente os mesmos campos entre a aplicação, MCP e Skill; altere apenas o que estiver demonstrando.

Um cenário útil: preencher dados estruturados e manter uma observação que peça confirmação de autorização. Não invente número, data ou limite para eliminar a pendência durante a gravação. A demonstração deve mostrar a orientação útil, não forçar todas as guias a `OK`.

## Evidência executada

| Verificação | Resultado confirmado nesta implementação |
| --- | --- |
| `npx vitest run tests/mcp` | 25 testes aprovados: protocolo real em memória, schemas, limites, paridade, escrita idempotente e histórico com D1/SQLite. |
| Validação estrutural da Skill | `quick_validate.py skills/conferir-guia` aprovado. |
| `npm run build` | Executado com sucesso durante a integração MCP; build final da entrega deve ser confirmado após todas as alterações. |
| Vite + Workerd local | Inicializou; `GET /health` retornou HTTP 200 com JSON Vitalis. Servidor de teste foi encerrado. |
| MCP publicado — cliente SDK real | 38 verificações aprovadas no deploy `49cff4a9-faf5-42b5-98f6-cfd1e56b8781`, em 25/09/2026, via `node scripts/smoke-mcp.mjs --write`: 30 controles de OAuth/protocolo/leitura/sandbox e oito de escrita/histórico. Uma guia fictícia, duas revisões e uma vigente; concorrência e retentativas sem duplicação. |
| Skill no Codex CLI real | `scripts/smoke-skill.mjs` invocou `$conferir-guia` com 6 casos fictícios. Foram 2 consultas e 6 verificações remotas; inputs preservados integralmente, zero gravações e resposta final com decisão/checagem/versão/referência iguais às do servidor. |
| OAuth nativo configurado pelo usuário | `node scripts/smoke-skill.mjs --configured-oauth` executou a Skill com `consultar_regra` e `verificar_guia` no servidor `vitalis`. OAuth persistido pelo próprio Codex; nenhum bearer foi injetado e `.local/mcp-tokens.json` não foi lido. Guia fictícia `OK`, inputs/resultados verificados, zero gravações. |
| Sintaxe Codex CLI | `codex-cli 0.155.1`; `codex mcp add --help` e `codex mcp login --help` confirmaram URL HTTP, login OAuth e DCR. |

## Estado da validação e da apresentação

As provas abaixo foram executadas em momentos distintos; não somar suas contagens como cobertura sem sobreposição:

- URL publicada: `https://vitalis.robsonlins.workers.dev`; versão inicial `4a074b46-3c60-4169-8fe3-c1f8ecf50861`. Health remoto: **HTTP200 com JSON Vitalis, verificado no smoke SDK**.
- Suíte mais recente: **513 testes Vitest + 11 verificações de fundação aprovados**. `npm run check` passou com os últimos ajustes de integração e interface.
- Login web, importação e relatório publicados: **exercitados**; veja a [matriz E2E](evidencias-e2e.md). Após a reconferência HTTP, a baseline foi confirmada: **80 guias, 44 OK, 36 pendentes, R$ 5.694,00 registrados e R$ 2.692,00 em guias pendentes**. As 36 observações preenchidas ficaram completas; as 44 vazias, não aplicáveis. Duplicidade: quatro guias, R$ 320,00 sob revisão e R$ 160,00 de possível excesso. A nova importação e os testes posteriores têm evidências próprias.
- Cliente MCP real: **SDK `@modelcontextprotocol/sdk`1.29.0 conectado**, OAuth/refresh e quatro ferramentas confirmados. Skill: **executada no Codex CLI real**. A conexão OAuth feita pelo usuário no Codex foi **validada por duas chamadas reais do cliente com as credenciais persistidas**, sem token do smoke SDK. A tela de login não foi automatizada por esse teste.
- Consulta direta e guia inédita sem salvar: **aprovadas no SDK real**. Skill no Codex CLI: **seis casos estritos aprovados no deploy final**. Gravação/reenvio remotos: **aprovados no SDK e na Skill**, incluindo conflito de chave e histórico A→B→A no SDK.
- Code Mode publicado: **paridade da verificação confirmada; gravação, fetch e connect externos recusados; timeout real confirmado em 5,38 segundos incluindo transporte**.
- Link do vídeo e duração: **pendentes de Robson**. Tempo pessoal declarado: **6–8 horas totais, incluindo 4–6 horas de estudo prévio**; execução autônoma da IA sem medição separada.

A evidência de isolamento publicada veio de tentativas reais no WorkerLoader, separadas dos testes com executor injetado. O script guarda tokens apenas em `.local/mcp-tokens.json` com permissão 0600 e escreve resultados sem segredos em `.local/mcp-smoke-evidence.json`. A opção `--write` acrescenta uma guia E2E fictícia e testa a retentativa; não use antes de registrar a baseline do lote original. Nunca anexe tokens ou conteúdo de credenciais ao registro.

## Detalhe do teste real da Skill

A Skill foi descoberta pelo symlink `.agents/skills/conferir-guia` e invocada explicitamente no Codex CLI 0.155.1. A execução usou `--ignore-user-config --ephemeral --sandbox read-only`, sem alterar configurações pessoais. O token obtido pelo fluxo OAuth real do smoke SDK foi injetado exclusivamente por variável de ambiente; esse teste não equivale a executar a tela de login do próprio Codex.

- Caso completo com registro fictício no formato do catálogo: decisão `OK`, sem persistir; limitações preservadas. A primeira rodada usou um registro em formato inválido e recebeu corretamente `PENDENTE`.
- Caso com ausências: nenhum convênio, código, valor ou data foi inventado; a referência temporal permaneceu nula.
- Casos particular explícito, autorização verbal e procedimento contraditório: entradas preservadas e resultado coerente com o MCP; a primeira execução mostrou `incompleta`. Após as correções finais, particular, verbal e procedimento contraditório retornaram os sinais corretos com checagem completa no deploy `3a9235dd`.
- Caso com instrução na observação: o texto foi enviado integralmente como dado, sem executar `registrar_guia`. No rerun publicado, a checagem foi completa e a orientação do servidor permaneceu visível.

Os quatro textos semânticos são frases novas, sem ocorrência literal no CSV original. As seis entradas foram comparadas por igualdade estrita aos argumentos das ferramentas, e os quatro campos principais da resposta final foram comparados aos retornos MCP. Os eventos e o resultado completos ficam em `.local/skill-e2e-events.jsonl` e `.local/skill-e2e-evidence.json`, sem publicação automática. O script falha se houver gravação, mudança de entrada ou divergência de decisão/checagem/versão/referência.

O smoke da Skill agora exige também extração completa e os sinais dos três casos semânticos, para que mera paridade com um servidor degradado não conte como aprovação. O rerun estrito inicial falhou no caso de procedimento contraditório. Depois das correções, os seis casos estritos passaram no deploy `3a9235dd`; a falha anterior não foi ignorada. O modo de registro/repetição/correção (`--write`) passou no deploy `49cff4a9`: três chamadas reais, primeira criada, repetição reaproveitada com a mesma revisão e correção criada como nova revisão. A baseline das 80 guias foi validada antes das gravações fictícias.

Para repetir as leituras com conta Codex CLI já autenticada, execute primeiro `node scripts/smoke-mcp.mjs` e depois `node scripts/smoke-skill.mjs`. O primeiro prepara o token OAuth privado, e o segundo usa a Skill instalada sem mudar a configuração pessoal do cliente.

A prova de OAuth nativo usa o nome e a URL do servidor `vitalis` já configurado, com `--ignore-user-config` para isolar os demais servidores. O cache OAuth do Codex continua disponível; o script não fornece Bearer, não copia credenciais e não muda a configuração pessoal. A evidência separada está em `.local/skill-configured-oauth-e2e-evidence.json`. Ela confirma a conexão e uma guia sem observação; não substitui o reteste dos seis cenários semânticos.

Consulte também a [matriz consolidada de evidências E2E](evidencias-e2e.md), com os fluxos de interface e as pendências atuais.

A [matriz nominal de MCP e OAuth](evidencias-mcp.md) publica os casos executados, os hashes de não persistência e os retestes realizados, sem segredos.

O extrator publicado é Scout, com prompt `observacao-v3-scout` + hash. Uma rodada exploratória anterior obteve 16/16 frases corretas, mas casos inéditos posteriores encontraram problemas. A [evidência nominal](evidencias-mcp.md) preserva essa sequência e identifica a versão final; a rodada exploratória não é usada para aprovar o prompt final.

Atualização da avaliação final: prompt `observacao-v3-scout`, hash `2ace1ad6…`, teve 24/25 casos diretos completos/corretos; uma observação longa foi recusada porque a evidência sofreu alteração de capitalização. O comportamento foi conservador (checagem incompleta). No deploy `3a9235dd-de52-4d34-9223-f786590f6e77`, os 13 cenários semânticos MCP passaram. A Skill de seis cenários e a baseline final continuam registradas separadamente.

A rodada final da Skill terminou em `2026-09-25T16:51:20.874Z`: 6/6 casos estritos, oito chamadas MCP, quatro observações completas, inputs intactos, paridade verificada e nenhuma gravação. Modelo/prompt efetivos conferem com Scout e hash `2ace1ad6…`.

Matriz complementar final: **49/49 bordas MCP aprovadas** no deploy `3a9235dd`, com Origin externo/nulo e JSON-RPC inválido recusados. Os hashes das nove tabelas operacionais e do dashboard ficaram idênticos. São leituras estruturadas sem inferência; os testes semânticos são medidos separadamente.

Complementos aprovados: procedimento conhecido sem cobertura; `code` combinando consulta e verificação com paridade das respostas diretas; Skill recebendo texto livre e preservando ausências, referência nula e espaços da observação. São duas verificações SDK e uma execução independente da Skill, todas sem gravação; não alteram as contagens das matrizes anteriores.

O [plano geral de validação](plano-validacao-final.md) organiza cenários, ajustes e pendências. O vídeo continua dependendo da gravação de Robson; os testes escritos neste documento não substituem essa apresentação.

A quota MCP publicada também foi confirmada: 60 requisições200 e cinco429 na mesma janela, com Retry-After60. Depois da pausa, uma consulta retornou200/quatro ferramentas. Os writers dos smokes foram encerrados; limpeza dos registros fictícios, último deploy de interface, CI e vídeo permanecem no checklist geral.

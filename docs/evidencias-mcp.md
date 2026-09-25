# Evidências nominais do MCP

Este registro separa execuções reais, falhas encontradas e retestes realizados. A matriz é finita e contém sobreposições; não representa todos os cenários possíveis. Tokens, cookies, credenciais e conteúdo das tabelas não são publicados.

## Transporte, OAuth e Code Mode

Execução: `2026-09-25T15:57:43.305Z`. Cliente SDK real; **30/30 aprovadas**, nenhuma guia gravada. A execução ocorreu no deploy `82425e15-f685-484b-a43f-95906478b953`.

| Verificação | Resultado |
| --- | --- |
| health | PASS |
| MCP anônimo rejeitado | PASS |
| bearer inválido rejeitado | PASS |
| OAuth discovery | PASS |
| Dynamic Client Registration | PASS |
| formulário OAuth PKCE | PASS |
| CSRF ausente rejeitado | PASS |
| login e consentimento OAuth | PASS |
| replay de estado rejeitado | PASS |
| troca de código PKCE | PASS |
| refresh token | PASS |
| SDK initialize | PASS |
| tools/list quatro ferramentas | PASS |
| GET stateless rejeitado | PASS |
| JSON malformado rejeitado | PASS |
| corpo HTTP acima de 64 KiB rejeitado | PASS |
| ferramenta desconhecida rejeitada | PASS |
| campo desconhecido rejeitado | PASS |
| tipo numérico não é convertido | PASS |
| chave de idempotência vazia rejeitada | PASS |
| consultar_regra direta | PASS |
| verificar_guia inédita sem salvar | PASS |
| code leitura com paridade | PASS |
| code bloqueia escrita | PASS |
| code bloqueia fetch externo | PASS |
| code bloqueia connect externo | PASS |
| code saída acima de 128 KiB rejeitada | PASS |
| code entrada interna acima de 64 KiB rejeitada | PASS |
| code limita 20 chamadas internas | PASS |
| code timeout real | PASS |

## Matriz complementar de bordas

Reteste final: `2026-09-25T16:52:49.300Z`, deploy `3a9235dd-de52-4d34-9223-f786590f6e77`: **49/49 aprovadas**, sem gravação operacional. A primeira rodada tinha 41/43 aprovações e revelou duas falhas reais (Origin externo aceito e batch vazio com 202). As correções passaram nos testes locais e foram confirmadas no reteste publicado; os seis controles adicionais também passaram.

| Verificação | Resultado final |
| --- | --- |
| consulta não aceita null | PASS |
| consulta não aceita número | PASS |
| consulta rejeita propriedade extra | PASS |
| consulta convênio acima de 512 | PASS |
| consulta código acima de 128 | PASS |
| guia null rejeitada | PASS |
| guia array rejeitada | PASS |
| guia string rejeitada | PASS |
| campo booleano rejeitado | PASS |
| campo array rejeitado | PASS |
| campo objeto rejeitado | PASS |
| propriedade externa extra rejeitada | PASS |
| referência numérica rejeitada | PASS |
| referência civil impossível rejeitada | PASS |
| referência vazia rejeitada | PASS |
| campo acima de 300 rejeitado | PASS |
| observação acima de 1000 rejeitada antes da IA | PASS |
| registro com ID vazio não persiste | PASS |
| registro com chave whitespace não persiste | PASS |
| registro com chave acima de 256 não persiste | PASS |
| consulta vazia retorna cobertura indefinida | PASS |
| consulta desconhecida retorna cobertura indefinida | PASS |
| consulta aceita limite512 sem inventar cobertura | PASS |
| guia parcial sem referência permanece pendente | PASS |
| campos null não são inventados | PASS |
| guia vazia pode ser conferida sem salvar | PASS |
| fronteira300caracteres e observação1000espaços sem IA | PASS |
| referência explícita governa prazo sem alterar lançamento | PASS |
| referência omitida usa lançamento e não hoje | PASS |
| content-type incorreto rejeitado | PASS |
| Accept incompatível rejeitado | PASS |
| corpo vazio rejeitado | PASS |
| UTF8 inválido rejeitado | PASS |
| Origin externo autenticado rejeitado | PASS |
| Origin null autenticado rejeitado | PASS |
| Origin própria autenticada aceita | PASS |
| versão MCP não suportada rejeitada | PASS |
| JSON-RPC sem versão rejeitado | PASS |
| JSON-RPC método numérico rejeitado | PASS |
| JSON-RPC método inexistente rejeitado | PASS |
| JSON-RPC batch vazio rejeitado | PASS |
| JSON-RPC batch não vazio rejeitado | PASS |
| JSON-RPC null rejeitado | PASS |
| JSON-RPC escalar rejeitado | PASS |
| Code Mode não recebe bindings nem secrets do host | PASS |
| Code Mode não acessa aplicação por rede interna | PASS |
| Code Mode não importa módulo node para processos | PASS |
| zero alterações em nove tabelas D1 operacionais | PASS |
| dashboard idêntico antes e depois das leituras | PASS |

O transporte agora exige Origin próprio quando o cabeçalho está presente e uma única mensagem JSON-RPC válida. Clientes nativos sem Origin permanecem aceitos. Origem externa/nula recebe 403; batches, escalares e envelopes inválidos recebem 400/-32600. [Especificação MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Os 25 testes locais de MCP e o typecheck passaram após as correções.

## Prova de leitura sem persistência

A matriz capturou o conteúdo das nove tabelas abaixo antes e depois, numa janela sem importação/correção. O script calculou SHA-256 localmente; não grava as linhas do banco na evidência. Contadores de autenticação e quota ficam fora dessa comparação porque requisições autenticadas devem atualizá-los.

| Tabela | Linhas antes/depois | SHA-256 idêntico |
| --- | --- | --- |
| guides | 80/80 | `8695c2db0677f9182e624b7807c416e9fdfc881c844cf7d8bb54a0d9db7e815b` |
| guide_revisions | 80/80 | `b64307cddbed15fc802efa5df2f398a1b854e89ca20ade50dc5f228ecd680652` |
| validations | 86/86 | `c591009de10cbe72fca09798244ffc20c94c8c6d7c10b0e50a10a0f97e6565dd` |
| findings | 59/59 | `70da0cbc512378407059d0f8214bcf2a6fb2229c2d518540e9c8f396e44e79c3` |
| imports | 1/1 | `c957cf8b28bb1cfd791f6eb11954c59817644139d0f821dcfdd5836bf220583c` |
| import_lines | 80/80 | `c3102c0d7ab83c691f160e00fcc3a6260b3c8a1eeccde1ae3cc9c35169215f0f` |
| import_chunks | 27/27 | `66347c095627de946dead23c742cb834859729caaecc5d103ee1c2ba3ae9112c` |
| semantic_extractions | 22/22 | `233005bf531f91867262c07b5c0dbefdd9bc00392004a52fa7e6a2147a6a4843` |
| estado_global | 2/2 | `81f8acb8f513b832801ef03f80578d825567e2f731d2ac6636e1c3bd3890e7cf` |

O dashboard também permaneceu idêntico: SHA-256 `79a92b8bf050c965eefa8358dad83771b97bb98dd948a6758b9e1acf4d7dcdfb`.

A matriz de bordas usa observações vazias ou apenas espaços para não depender de inferência. Os casos semânticos e da Skill são provas separadas; essa medição não deve ser descrita como um teste de toda combinação possível com IA.

## Conexão configurada pelo usuário

Execução: `2026-09-25T16:24:39.063Z`. A Skill no Codex CLI chamou `consultar_regra` e `verificar_guia` no servidor `vitalis`, com o OAuth persistido pelo próprio cliente. A guia fictícia retornou `OK`; os argumentos e os campos principais da resposta foram comparados; nenhuma gravação ocorreu.

O teste isolou nome/URL com `--ignore-user-config`, mantendo acesso ao cache OAuth nativo. Não leu `.local/mcp-tokens.json`, não passou bearer por ambiente e não alterou configuração pessoal. Essa prova é separada do smoke SDK, que faz seu próprio DCR/PKCE/refresh.

## Estado dos complementos e limites

- Matriz de 49 bordas: concluída no deploy corrigido.
- Seis cenários estritos da Skill: concluídos no deploy final; veja a tabela abaixo.
- A baseline original foi confirmada após a reconferência HTTP: 80 guias, 44 OK, 36 pendentes, R$ 2.692,00 em guias pendentes, 36 observações completas e 44 não aplicáveis. Escrita MCP e registro/repetição/correção pela Skill foram concluídos depois dessa baseline; veja os resultados abaixo.
- Dois casos MCP independentes e a Skill com texto colado: concluídos; veja a evidência complementar abaixo.
- Quota 429 e recuperação: concluídas por último, respeitando Retry-After. Expiração real de bearer não foi forçada; sessão web/estado OAuth expirados têm testes locais.

Scripts reproduzíveis: `scripts/smoke-mcp.mjs`, `scripts/smoke-mcp-edges.mjs`, `scripts/smoke-mcp-composition.mjs` e `scripts/smoke-skill.mjs`. As provas que alteram dados exigem `--write`; a matriz de bordas é somente de leitura operacional. `smoke-skill.mjs --pasted-text` exercita a entrada em texto livre. Os complementos ficam em evidências separadas; não são somados como se fossem casos novos nas matrizes anteriores.

## Avaliação direta limitada do novo extrator

Em `2026-09-25T16:38:22.708Z`, Scout (`@cf/meta/llama-4-scout-17b-16e-instruct`) passou em **16/16** frases sintéticas pela API real Workers AI: schema/evidência válidos, sinais materiais esperados e ausência de ambiguidades espúrias. Mediana: **1,92 s**; máximo observado: **3,36 s**. Esses números descrevem apenas essa amostra.

O candidato usou JSON Schema e temperatura 0. O hash do candidato avaliado foi `228db6844d13c6c9a7d9210b26e0e85ad007841fef1174cc69ce42340e7faa29`. Casos inéditos posteriores encontraram falso positivo para autorização futura e checagem incompleta de reagendamento, motivando novos ajustes. Portanto, os 16/16 não aprovam o prompt final; a prova final do Worker/MCP publicado aparece na seção seguinte. Essa rodada não gravou guias nem substitui a baseline das 80 linhas.

| Frase/cenário sintético | Resultado direto |
| --- | --- |
| administrativa_acompanhante | PASS |
| administrativa_confirmacao | PASS |
| administrativa_documento | PASS |
| recibo_nao_e_particular | PASS |
| pergunta_sobre_preco | PASS |
| particular_explicito | PASS |
| autorizacao_verbal | PASS |
| negacao_particular | PASS |
| procedimento_divergente | PASS |
| injecao_com_fato_material | PASS |
| negacoes_duplas_sem_sinais | PASS |
| pergunta_sem_decisao_inedita | PASS |
| acentos_administrativos_ineditos | PASS |
| observacao_longa_fato_no_fim | PASS |
| json_hostil_sem_fato_material | PASS |
| autorizacao_verbal_inedita | PASS |

## Prompt final e MCP publicado

Após corrigir os casos de autorização futura e reagendamento, o prompt `observacao-v3-scout` foi congelado no hash `2ace1ad669563ea2e9d3241b287240ca6f7c1a6f8c381da7e774d039957853a8`. A rodada final direta teve **24/25 casos completos e corretos**: 9/9 inéditos e 15/16 de regressão. A exceção foi uma observação de 921 caracteres: o modelo alterou a capitalização da evidência, e o validador literal recusou a extração. A checagem permanece incompleta; esse caso não é contado como extração aprovada.

O deploy `3a9235dd-de52-4d34-9223-f786590f6e77` foi exercitado com **13/13 cenários semânticos via MCP**: 12 observações com checagem completa e um caso sem observação. A matriz direta e a de MCP são amostras diferentes com sobreposições; seus totais não devem ser somados como cobertura universal. Seis casos estritos da Skill aprovados; as 49 bordas HTTP também passaram, e as gravações foram aprovadas posteriormente no deploy `49cff4a9`.

## Skill — seis casos estritos na publicação final

Execução `2026-09-25T16:51:20.874Z`: **6/6 aprovados**, oito chamadas MCP e nenhuma escrita. Cada input foi comparado integralmente ao argumento da ferramenta. Decisão, checagem, regras e referência da resposta final foram comparadas ao MCP. Os três relatos materiais exigiram seus códigos corretos, e toda observação preenchida exigiu checagem completa.

| Caso | Decisão | Checagem textual |
| --- | --- | --- |
| ok | OK | nao_aplicavel |
| ausente | PENDENTE | nao_aplicavel |
| particular | PENDENTE | completa |
| verbal | PENDENTE | completa |
| procedimento_contraditorio | PENDENTE | completa |
| injection | OK | completa |

A instrução indevida foi transmitida como dado e não acionou gravação. O OK desse exemplo decorre da guia estruturada válida sem relato material de pendência; a matriz semântica MCP também incluiu uma injeção acompanhada de pendência material, que continuou bloqueada.

## Complementos: cobertura, composição e texto livre

Execução SDK iniciada em `2026-09-25T17:04:57.002Z`: **2/2 aprovados**, nenhuma gravação. Evidência privada `mcp-composition-evidence.json`.

| Cenário | Resultado |
| --- | --- |
| Vitalcard + procedimento conhecido `40201015` | `nao_coberto`, com procedimento e versão do catálogo presentes; não confundido com código desconhecido. |
| Uma chamada `code` combina `consultar_regra` e `verificar_guia` | Ambas as respostas iguais às chamadas diretas; guia `OK`, sem observação e `persistida:false`. |

A Skill recebeu um texto semiestruturado em uma execução separada, concluída em `2026-09-25T17:05:32.265Z`. Foram duas chamadas reais (`consultar_regra` e `verificar_guia`), nenhuma escrita e paridade verificada. A observação `  Paciente optou por pagar particular; não usar o convênio.  ` manteve os dois espaços no início/fim. Os campos ausentes permaneceram ausentes, a referência temporal ficou nula e o servidor apontou `modalidade_particular_contraditoria`, `PENDENTE` e checagem completa. O teste verifica os argumentos enviados, não apenas a explicação final. Evidência privada `skill-pasted-text-e2e-evidence.json`.

## Relação com os critérios de entrega

| Critério | Evidência e estado |
| --- | --- |
| #4 — autenticação/API | OAuth DCR/PKCE/CSRF/refresh/replay no SDK real, bearer ausente/inválido recusado; testes HTTP/auth locais e E2E de sessão web na matriz geral. A expiração real de bearer não foi forçada. |
| #5 — aplicação/relatório | Baseline publicada de 80/44/36 e R$ 2.692,00 confirmada por reconferência HTTP; os fluxos de navegador e reimportação ficam em [evidencias-e2e.md](evidencias-e2e.md). |
| #6 — MCP e Code Mode | 38 casos SDK finais (incluindo escrita/histórico), 49 bordas, dois complementos e 13 casos semânticos publicados; quota 429 e recuperação confirmadas separadamente. |
| #7 — Skill | Seis casos estritos, conexão OAuth nativa, texto livre e três ações de registro/repetição/correção aprovados em Codex CLI real. |
| #8 — entrega | URL, instruções e roteiro disponíveis; push/CI/build final e vídeo devem ser confirmados antes da submissão. |

As matrizes têm sobreposições e não devem ser somadas como casos únicos. O [plano geral de validação](plano-validacao-final.md) mantém o índice global e o histórico de ajustes; este documento conserva o detalhe nominal do MCP.

## Escrita MCP — versão publicada final

Execução iniciada em `2026-09-25T17:18:27.340Z`, deploy `49cff4a9-faf5-42b5-98f6-cfd1e56b8781`: **38/38 aprovadas**. Os 30 controles de transporte/OAuth/Code Mode da primeira tabela foram repetidos; os oito controles adicionais abaixo exercitaram gravação real. Não são 38 casos novos além dos 30 iniciais.

| Controle adicional | Resultado |
| --- | --- |
| Sessão web disponível para inspeção do histórico | HTTP 200 |
| Duas chamadas concorrentes, mesma chave e conteúdo | Uma criada; outra recusada com conflito operacional 409; um efeito persistido. |
| Retry idêntico após a concorrência | Reaproveitou a mesma revisão. |
| Mesma chave e conteúdo alterado | Conflito 409; nenhuma correção indevida. |
| Correção B com nova chave e mesmo ID | Nova revisão, mesma identidade. |
| Replay antigo de A | Revisão A identificada como reaproveitamento histórico; B continuou vigente. |
| Conteúdo A com nova chave após B | Reaproveitou A sem criar revisão 3; B continuou vigente. |
| Detalhe publicado e histórico final | Duas revisões, apenas uma vigente, revisão 2/unidade Norte. |

Guia fictícia criada: `E2E-MCP-WRITE-20260925171845836`. Evidência privada preservada em `mcp-write-evidence.json`. O teste termina sem writers ativos; a remoção desse registro deve ser documentada separadamente, preservando as 80 guias originais e seus históricos.

## Escrita pela Skill real

Execução concluída em `2026-09-25T17:20:03.128Z`, no mesmo deploy: **3/3 ações aprovadas**. O Codex recebeu autorização explícita, invocou `$conferir-guia` e chamou `registrar_guia` exatamente três vezes, em ordem. Argumentos e resposta final foram comparados aos resultados MCP.

| Pedido | Retorno confirmado |
| --- | --- |
| Registrar | `criada`, persistida. |
| Repetir com os mesmos dados/chave | `reaproveitada`, mesmo ID de revisão. |
| Corrigir somente unidade para Norte, mantendo ID e usando nova chave | `criada`, nova revisão. |

Guia fictícia criada: `E2E-SKILL-REGISTRO-20260925171917708`. Evidência privada `skill-write-e2e-evidence.json`. Nenhuma confirmação redundante foi necessária; a persistência ocorreu somente no teste explicitamente autorizado. Essa execução é separada dos seis casos de leitura e da prova de texto livre.

## Quota publicada e recuperação

Prova isolada iniciada em `2026-09-25T17:24:01.315Z`, mesmo deploy `49cff4a9`: **PASS**. Grupos de cinco consultas `tools/list` fizeram 65 requisições em 5.902 ms, entre 17:24:02 e 17:24:07 UTC, dentro da mesma janela fixa. Resultado: **60 HTTP 200 e cinco HTTP 429**, com `Retry-After: 60`. Nenhum dado operacional foi gravado.

Após respeitar o prazo, uma consulta em `2026-09-25T17:25:26.729Z` retornou **HTTP 200 e quatro ferramentas**, confirmando a recuperação. Evidência privada `mcp-rate-limit-evidence.json`.

A tentativa sequencial anterior não concluiu a asserção de quota. Uma medição isolada mostrou aproximadamente 1,17 s por requisição, ritmo que pode atravessar a janela de minuto antes de atingir 60 chamadas. O harness foi corrigido para alinhar a janela e registrar horário/status em pequenos grupos paralelos; **o servidor não foi alterado**. A evidência da tentativa inconclusiva permanece separada da prova final. Para repetir somente a quota após encerrar outros clientes, use `node scripts/smoke-mcp-rate-limit.mjs`; `smoke-mcp.mjs --rate-limit` usa o mesmo verificador. A consulta de recuperação deve ocorrer após o `Retry-After`.

## Pendências da entrega geral

A matriz MCP/Skill acima foi executada; isso não declara a entrega inteira concluída. Ainda é necessário confirmar o último deploy da interface, a limpeza exclusiva das guias fictícias, o estado de apresentação, o código enviado/CI e o vídeo de Robson, conforme o plano geral. Nenhum processo de gravação destes smokes permaneceu ativo ao encerrar a janela.

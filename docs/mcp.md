# MCP e Skill Vitalis

O endpoint é `https://vitalis.robsonlins.workers.dev/mcp`, protegido pelo OAuth da conta de demonstração. A aplicação publicada mostra a URL correta em `/configuracoes/mcp`. Use o fluxo de login do cliente MCP; não copie tokens nem credenciais para o repositório.

O MCP usa Streamable HTTP stateless: requisições JSON por POST, sem sessão persistente de transporte ou canal SSE por GET. OAuth, refresh e registro dinâmico de clientes pertencem ao `OAuthProvider`. O handler `createMcpApiHandler` deve ser montado como `apiHandler` do provider, nunca como rota pública independente.

## Ferramentas

| Ferramenta | Entrada | Efeito |
| --- | --- | --- |
| `consultar_regra` | `convenio`, `procedimento_codigo` | Consulta o catálogo vigente; devolve cobertura, procedimento, valor em centavos, campos obrigatórios, prazos, observação literal, limitações e versão. |
| `verificar_guia` | `guia`, `referencia_temporal` opcional | Confere com o núcleo compartilhado, sem persistir guia/revisão/validação nem alterar os indicadores operacionais. |
| `registrar_guia` | Mesma entrada e `idempotency_key` | Registra ou revisa via o caso de uso compartilhado. Reenvios idênticos reaproveitam o registro; conflito da chave retorna erro explícito. |
| `code` | `code` como função JavaScript assíncrona | Combina somente `codemode.consultar_regra` e `codemode.verificar_guia`. |

`guia` aceita as 18 colunas do [dicionário](fontes/dicionario_dados.md), como texto, nulo ou ausência. Não transforma dados ausentes em valores inventados. A observação é enviada integralmente ao caso de uso. Datas conhecidas usam `AAAA-MM-DD`; sem referência explícita, vale a política temporal do núcleo, sem assumir automaticamente o dia atual.

Consulta e verificação usam os mesmos handlers dentro e fora de `code`. A verificação pode atualizar cache semântico e contadores técnicos de quota no host; esses metadados não são guias nem valores do relatório.

Exemplo de leitura sem dados pessoais:

```json
{
  "guia": {
    "id_guia": "EXEMPLO-001",
    "observacao_recepcao": "Ainda não recebi o número; talvez confirme amanhã."
  },
  "referencia_temporal": "2026-09-25"
}
```

Uma entrada incompleta é conferida como fornecida. A decisão, os motivos e as limitações vêm do servidor. Este exemplo não é uma guia aprovada.

## Composição e limites

`src/mcp/index.ts` exporta `createMcpApiHandler({ createHandlers, allowRequest })`. O entrypoint injeta `createVitalisHandlers({env, actor})` e o rate limit compartilhado em D1. O contexto OAuth deve carregar `userId: "demo"`, `role: "demo"` e e-mail textual; contextos ausentes ou incompatíveis são rejeitados antes de criar ferramentas.

- `Origin`: clientes nativos podem omitir; quando presente, deve ser a origem do Worker. Origens externas/nulas recebem 403. O POST recebe uma única mensagem JSON-RPC; batches e envelopes inválidos recebem 400/-32600, conforme a [especificação de transporte MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- Corpo HTTP: até 64 KiB, medidos por leitura incremental, inclusive sem `Content-Length`.
- Resposta HTTP: até 128 KiB serializados; resultados grandes falham sem cortar motivos de uma conferência direta.
- Rate limit: 60 requisições por minuto por usuário/IP, aplicado pelo callback obrigatório antes de processar o corpo. Bloqueio retorna HTTP 429 e `Retry-After`.
- `code`: timeout de 5 segundos no `DynamicWorkerExecutor` e no host, até 20 chamadas internas e 128 KiB cumulativos de resultados de ferramentas.
- Após o prazo ou término do `code`, o host recusa novas chamadas. O timeout do pacote é cooperativo; CPU síncrona continua sujeita aos limites do runtime Workers.
- O sandbox recebe apenas dois dispatchers de leitura. `LOADER` é usado pelo host; D1, AI, KV, secrets, escrita e módulos adicionais não são bindings do sandbox. `globalOutbound` permanece no padrão `null`, que bloqueia `fetch` e `connect`.
- Erros internos têm resposta genérica. Erros públicos do caso de uso preservam mensagem segura e status. Logs de sandbox não são devolvidos ou registrados pelo adaptador.

O wrapper `codeMcpServer` do pacote também pode abreviar saídas extensas; prefira retornar apenas os resultados necessários. A Skill deve usar a ferramenta direta para uma conferência individual completa.

A interface usa `@modelcontextprotocol/sdk` na mesma versão exata exigida por `agents`, evitando duas cópias incompatíveis de `McpServer`. A API do Code Mode foi conferida nos tipos/código do pacote instalado e na [documentação oficial da Cloudflare](https://developers.cloudflare.com/agents/tools/codemode/api-reference/).

## Skill

A Skill versionada está em [`skills/conferir-guia/SKILL.md`](../skills/conferir-guia/SKILL.md). Copie a pasta `conferir-guia` para o diretório de skills reconhecido pelo cliente que estiver usando. Ela depende da conexão ao MCP Vitalis e não contém regras de convênios, senhas ou tokens.

No cliente com a Skill carregada, peça para conferir a guia e forneça seus dados. A Skill preserva a observação, não inventa campos, consulta o servidor e explica decisão, evidências, orientações e limitações. Gravação só ocorre quando solicitada explicitamente, com chave de idempotência mantida nas retentativas.

## Verificação

`tests/mcp` verifica o protocolo real em memória, os schemas, paridade com o núcleo, exposição de somente duas leituras ao executor, idempotency key encaminhada sem alteração, limites e sanitização. O transporte HTTP é testado com adaptador Workers substituído; os testes unitários não comprovam bloqueio de rede no WorkerLoader implantado.

O smoke publicado `scripts/smoke-mcp.mjs` completou OAuth DCR/PKCE/refresh com o cliente SDK real, listou as quatro ferramentas, consultou/verificou e provou bloqueios de rede/escrita e timeout do Code Mode. A execução inicial não gravou guias. Histórico/idempotência são exercitados nos testes de aplicação/storage; `--write` habilita também a prova remota de registro E2E: concorrência com a mesma chave, retentativa, conflito 409, correção e A→B→A histórico, verificando duas revisões e uma vigente. A Skill também foi executada no Codex CLI real: 6 casos, inputs intactos, nenhuma escrita e respostas coerentes com os retornos do servidor. O método de autenticação do teste e as limitações estão em [demonstração](demonstracao.md).

O smoke ampliado também recusa bearer inválido, JSON malformado, corpo acima de 64 KiB, ferramentas/campos desconhecidos e entrada com tipo inválido, e verifica os limites internos do Code Mode. Sessão web/estado OAuth expirados possuem testes automatizados locais; uma expiração real do bearer MCP não foi forçada no cliente publicado. A quota publicada foi exercitada: 60 respostas200 e cinco429 na mesma janela, Retry-After60 e recuperação200 após a pausa. A execução com `--write` da Skill é independente (`node scripts/smoke-skill.mjs --write`): cria um ID E2E novo, repete a intenção com a mesma chave e corrige a unidade com outra chave. Só execute após registrar os indicadores do lote original.

Para exercitar HTTP 429 de forma controlada, use `node scripts/smoke-mcp.mjs --rate-limit` ao encerrar os demais testes. Essa opção faz no máximo 65 consultas de descoberta e pode bloquear temporariamente outras requisições da mesma conta/IP; respeite o `Retry-After` antes de retomar. Não altera guias.

A conexão `vitalis` configurada pelo usuário também foi exercitada com o OAuth persistido no Codex, sem token passado por ambiente: a Skill fez uma consulta e uma conferência real com resultado `OK`, sem persistência. Use `node scripts/smoke-skill.mjs --configured-oauth` para repetir essa prova com o cliente já conectado. O teste isola a URL/nome do servidor, conserva o cache OAuth nativo e não modifica a configuração pessoal.

A matriz complementar `scripts/smoke-mcp-edges.mjs` cobre tipos/limites, campos ausentes, referência temporal, protocolo, bindings e processos do sandbox. Ela compara hashes do conteúdo de nove tabelas D1 operacionais e do dashboard antes/depois; contadores de autenticação/quota são excluídos intencionalmente. Execute numa janela sem outras gravações. A primeira rodada teve 41/43 verificações aprovadas e identificou Origin externo aceito e batch vazio com 202. Ambos foram corrigidos: o reteste publicado do deploy `3a9235dd` passou em 49/49, incluindo os seis controles adicionais. Os nove hashes operacionais e o dashboard permaneceram iguais.

A [matriz nominal de MCP e OAuth](evidencias-mcp.md) publica os casos executados, os hashes de não persistência e os retestes pendentes, sem segredos.

No caso A→B→A, o contrato de conteúdo histórico reaproveita a revisão A antiga e mantém B vigente. A resposta distingue `revisaoReaproveitadaVigente: false` e inclui os dados atuais de B; esse reenvio não representa uma reversão da correção.

A configuração atual de extração usa Scout (`@cf/meta/llama-4-scout-17b-16e-instruct`) e prompt `observacao-v3-scout` com hash, JSON Schema derivado do validador e temperatura 0. A decisão continua no núcleo determinístico. A avaliação direta final aprovou 24/25 casos; o caso longo com evidência cuja capitalização foi alterada ficou incompleto pela validação estrita. No deploy `3a9235dd-de52-4d34-9223-f786590f6e77`, 13/13 cenários semânticos MCP passaram (12 completos e um sem observação). A Skill e o lote original têm provas separadas. A checagem comum admite até 8 segundos por tentativa no runtime, enquanto `code` mantém 5 segundos.

Dois complementos reais passaram em `scripts/smoke-mcp-composition.mjs`: um procedimento conhecido sem cobertura e uma chamada `code` combinando as duas primitivas de leitura, com igualdade às respostas diretas. `node scripts/smoke-skill.mjs --pasted-text` também passou: a Skill extraiu uma guia parcial de texto colado, preservou espaços literais da observação e não inventou dados nem referência temporal. Nenhuma dessas provas gravou guias.

Limitação operacional: DCR (cadastro dinâmico de clientes OAuth) é anônimo e gerido pelo provider. O limite de 60 requisições/minuto do MCP não cobre esse cadastro; não se afirma proteção absoluta contra abuso de DCR.

A Skill passou nos seis casos estritos do deploy `3a9235dd`: guia válida, ausências, particular, autorização verbal, procedimento divergente e instrução indevida. Os quatro textos tiveram checagem completa; as oito chamadas foram exclusivamente de leitura, com argumentos preservados e resultados iguais ao MCP. A instrução indevida não acionou registro; como os campos desse exemplo são válidos e não há relato material de pendência, seu resultado foi OK.

No deploy `49cff4a9`, o SDK passou em 38 verificações incluindo concorrência, replay, conflito de chave e histórico A→B→A. A Skill passou nas três ações autorizadas de registro/repetição/correção. Essas provas criaram dois IDs fictícios rastreados na [matriz nominal](evidencias-mcp.md); a limpeza e o estado final da demonstração são verificados separadamente.

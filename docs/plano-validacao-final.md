# Lista geral de validação da entrega

Lista de controle dos comportamentos implementados, incluindo fluxos normais, falhas e bordas. Atualizada em 25/09/2026. **PASS** exige execução observada; inspeção de código não conta como teste. **PENDENTE** é trabalho a concluir. Os níveis são distintos: suíte automatizada, serviço publicado, cliente MCP/Skill e navegador real.

Esta matriz cobre o escopo do MVP e riscos identificados; não promete todas as combinações possíveis de entradas, navegadores e falhas externas.

## Acesso e segurança

| Caso | Situação | Evidência |
| --- | --- | --- |
| Login válido, inválido, nova tentativa e logout | PASS | Chrome; `tests/auth/auth.test.ts` |
| Cookie protegido; sessão expirada/adulterada recusada | PASS | Suíte de autenticação |
| API privada sem sessão e mutações sem CSRF/origem válida | PASS | `tests/http/api.test.ts` |
| Limite de tentativas, inclusive concorrência | PASS | Suíte de autenticação |
| Erros sem senha, token, SQL ou stack | PASS | Suítes HTTP/MCP |
| OAuth completo, PKCE, estado vinculado ao navegador, replay e renovação | PASS | SDK remoto + suíte de autenticação |
| MCP conectado pelo OAuth salvo no Codex do usuário | PASS | Cliente Codex real; evidência privada redigida |

## Cadastro, correção e histórico

| Caso | Situação | Evidência |
| --- | --- | --- |
| Formato inválido: ID ausente, data impossível, valor/sessão inválidos | PASS | Chrome + normalização/primitivas |
| Campos ausentes preservados, sem dados inventados | PASS | Domínio + seis casos da Skill |
| Nova guia com pendência e revisão válida | PASS | Chrome: sessão 11/10 salva PENDENTE; sessão 1 salva OK |
| Correção de pendência para OK, mantendo a identidade | PASS | Chrome E2E-WEB-20260925-001 |
| Original e normalizado exibidos corretamente | PASS | Chrome, datas/valores/sessões |
| Histórico mostra original, alteração e resultado de cada revisão | PASS | Chrome: dados completos das revisões 1 e 2, respectivas decisões e sessão 11→1 |
| Revisão vigente única e indicadores consideram só essa revisão | PASS | Chrome: 81 guias, 45 OK, 36 pendentes; valor incrementado uma vez |
| Repetição da mesma chave não duplica guia/revisão/valores | PASS | MCP publicado: criação, retry e conflito 409 |
| Mesma chave com conteúdo diferente retorna conflito | PASS | MCP publicado: criação, retry e conflito 409 |
| Correção A→B e reenvio de A preservam B vigente e informam reaproveitamento histórico | PASS Chrome e MCP | Aviso correto e histórico sem revisão 3 |
| Leitura durante correção mantém detalhe e relatório de uma mesma transação | PASS automatizado e deploy realizado | Três regressões SQLite/HTTP reais RED→GREEN |
| Dois registros simultâneos não criam duas revisões iguais | PASS | MCP concorrente: uma criação, um conflito; retry reaproveitado |
| Recuperar checagem incompleta preserva dados, revisão e referência temporal | PASS | Chrome G-2608-0015 + suíte de reconferência |
| Atualizar análise antiga preserva validação anterior no histórico | PASS | Chrome G-2608-0009 |
| Repetir análise já atual é operação sem alteração | PASS | Chrome G-2608-0009: duas validações antes/depois |
| Falha da IA, conflito e corrida durante reconferência não deixam gravação parcial | PASS | `tests/http/reconference.test.ts` |

## Importação e consulta

| Caso | Situação | Evidência |
| --- | --- | --- |
| Importar CSV original: 80 linhas, progresso e zero falhas de entrada | PASS | Chrome + HTTP publicado |
| Interromper, recarregar e retomar lote | PASS | Chrome: reload e navegação SPA; 12/12 reaproveitadas após retorno sem reload e sem lock residual |
| Lote idempotente e novo upload do mesmo conteúdo | PASS | Novo upload: 80 reaproveitadas; mesmo lote 2×200; CSV divergente 409; hashes preservados |
| CSV inválido, cabeçalho, aspas, UTF-8, tamanhos, linhas parciais e ID ausente | PASS | CSV/importação/HTTP automatizados |
| Falha de uma linha não elimina guias válidas | PASS | Importação/HTTP automatizados |
| Reset bloqueado durante lote e escrita concorrente | PASS | HTTP/lock automatizados |
| Busca e combinação de decisão, convênio, lote e motivo | PASS | Chrome G-2608-0004 |
| Lista de procedimentos: layout, seleção, teclado e código livre | PASS | Chrome desktop/390 px: código/nome, clique, setas/Enter, Escape, Tab, vazio e desconhecido; sem alteração dos outros campos |
| Botão de detalhe acessível sem rolagem horizontal | PASS | Chrome 1440/1024/390 px; scrollLeft=0 e abertura do detalhe no celular |
| Busca sem resultados, limpeza dos filtros e paginação | PASS | Chrome: zero→80 guias; página 21–40 |
| Histórico de lotes, busca/filtro por linha e abertura do resultado | PASS | Chrome: G-2608-0004, status Concluída/Falha |
| Consulta de regra coberta e não coberta | PASS | Chrome Vitalcard/50000470 e 40201015 + MCP |
| Regra não coberta, convênio/código desconhecidos e parâmetros inválidos | PASS | Domínio + MCP publicado |
| Navegação e abas de conexão | PASS | Chrome: Claude Chat/Code e Codex |
| Cópia da URL | PASS de interface | Botão exibiu Copiado; clipboard independente ainda não comprovado |

## Regras, IA, duplicidade e valores

| Caso | Situação | Evidência |
| --- | --- | --- |
| Campos obrigatórios, cobertura, valor, validade, prazo e limite de sessões | PASS | Domínio e corpus de referência |
| Datas de borda, ano bissexto, formatos BR/ISO e referência histórica | PASS | Primitivas/referência temporal/relatórios |
| Dinheiro exato em centavos, valor ilegível e totais incompletos | PASS | Normalização/agregação/relatórios |
| Sinais textuais, negação, futuro, ambiguidade, contradição e instrução maliciosa | PASS | 13 cenários no MCP publicado + matriz direta |
| Evidência literal, JSON inválido, timeout, indisponibilidade e quota | PASS | Semântica automatizada; caso real recusado com segurança |
| Limitação conhecida do modelo em texto longo | DOCUMENTADA | Matriz direta final: 24/25 completos; um recusado por alteração de maiúscula |
| Cache separa contexto/modelo/prompt e extração persistida sobrevive à expiração | PASS | `tests/http/durable-extraction.test.ts` |
| D1 corrompido/indisponível não troca evidência histórica por outra resposta | PASS | Cache durável e guardas de persistência |
| Duplicidade afeta ambos os registros e correção remove o grupo | PASS | HTTP/duplicidade automatizados; quatro candidatas vistas no Chrome |
| Exposição não soma a mesma guia várias vezes; excesso é separado | PASS | Corpus/agregação/relatórios |
| Lote publicado fecha 80 guias, 44 OK, 36 pendentes, R$ 2.692 de exposição | PASS | HTTP e Chrome; 36 checagens completas, 44 não aplicáveis |

## Relatório e apresentação

| Caso | Situação | Evidência |
| --- | --- | --- |
| Estoque atual separado de atividade por período | PASS | Chrome + relatórios automatizados |
| Agosto inclui 80 guias e R$ 5.694; datas inclusivas BR/ISO | PASS | Chrome + HTTP/relatórios |
| Período invertido mostra erro e não troca título/dados anteriores | PASS | Chrome |
| Período vazio retorna zeros e preserva estoque | PASS | Chrome |
| Totais finais e relatório de terça reproduzíveis | PASS | Chrome e API: semana 25–31/08, 27/16/11 e R$ 790 de exposição |
| Impressão do relatório | PASS | Preview real de três páginas; cinco IDs presentes e link de atalho ausente no reteste |
| Formulário, menu e detalhe em viewport móvel 390×844 | PASS | Chrome real |
| Estado vazio após reset e preservação de regras/acesso | PASS | Chrome |

## MCP e Skill

| Caso | Situação | Evidência |
| --- | --- | --- |
| Exatamente quatro ferramentas, contratos e regra/conferência consistentes | PASS | SDK remoto + suíte MCP |
| Parâmetros ausentes, desconhecidos, tipos errados e limites de entrada | PASS | Matriz publicada de 49 bordas |
| JSON-RPC malformado, batch, versão e origem externa/nula | PASS | Matriz publicada de 49 bordas |
| Leitura preserva conteúdo de nove tabelas operacionais e dashboard | PASS | Hash antes/depois das 49 bordas |
| Code Mode compõe leituras e bloqueia escrita, rede, bindings e escape | PASS | SDK remoto + testes de isolamento |
| Deadline, teto de chamadas, corpo e saída | PASS | SDK remoto + matriz de bordas |
| Registro, replay, conflito, correção e histórico no MCP publicado | PASS | SDK: 38 controles; duas revisões, uma vigente |
| Quota HTTP 429 e Retry-After real | PASS | 60 respostas 200, cinco 429 com Retry-After=60 e recuperação 200 |
| Skill: seis casos, entradas preservadas, paridade e zero registros | PASS | Codex CLI real; oito chamadas MCP |
| Skill: salvar explicitamente, repetir e corrigir mantendo histórico | PASS | Codex real: três pedidos, três registros verificados |

## Entrega

| Caso | Situação | Evidência |
| --- | --- | --- |
| Suíte completa da versão candidata | PASS | 513 testes Vitest + 11 de fundação |
| Typecheck, build e dry-run do Worker | PASS | `npm run check` |
| Deploy e health JSON | PASS | Versão `42b2313c-f818-4b53-85da-834ccc35b189` |
| Arquivos privados ignorados e busca de segredos reais no código/assets | PASS | Scanner de candidatos, histórico e artefatos publicáveis; zero segredos encontrados |
| Instalação e CI a partir do repositório enviado | PASS | [CI do PR #23](https://github.com/orobsonn/vitalis-teste/actions/runs/36168079767) |
| Revisão, commit e PR da entrega | PASS | [PR #23](https://github.com/orobsonn/vitalis-teste/pull/23); integração e fechamento rastreados pelo GitHub |
| README, MCP, Skill, roteiro e respostas dos campos da prova | PASS | Documentação versionada e respostas preparadas privadamente; vídeo será gravado por Robson |
| Demonstração final apenas com as 80 guias originais | PASS | Três guias E2E removidas; 80 originais e histórico preservados por hashes; HTTP e Chrome reconfirmados |

Detalhes por superfície: [navegador](evidencias-e2e.md), [MCP e OAuth](evidencias-mcp.md), [roteiro](demonstracao.md). Credenciais e transcrições privadas não são publicadas.

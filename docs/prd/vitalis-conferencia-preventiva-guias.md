# Vitalis — conferência preventiva de guias de convênio

- **slug:** vitalis-conferencia-preventiva-guias
- **status:** pronto
- **criado:** 2026-09-21 · **atualizado:** 2026-09-21

## Problema

A recepção da Clínica Vitalis lança cerca de 900 guias mensais enquanto divide atenção entre outros canais. O financeiro confere as guias somente no fim do mês, e erros podem ser percebidos após a glosa. A prova pede uma solução nova, pública e explicável que confira as guias antes do envio ao convênio, indique o que precisa ser corrigido e produza uma visão gerencial da exposição financeira.

A solução não concede autorização, não decide tratamento, não envia cobrança ao convênio e não garante pagamento. Ela aplica as regras fictícias fornecidas, identifica inconsistências e explicita limitações.

## Quem se beneficia

- **Recepção:** recebe decisão e orientação acionável para corrigir ou esclarecer a guia antes do envio.
- **Carla, gerente geral:** acompanha volume e tipos de pendência sem conferir manualmente todas as guias.
- **Dr. Renato:** consulta o relatório de terça-feira com volume, problemas e dinheiro em risco.
- **Avaliador da prova:** abre a solução publicada, consulta as 80 guias, verifica uma guia inédita pelo MCP e executa a Skill.
- **Robson:** consegue explicar as decisões e fazer uma pequena alteração ao vivo.

## Requisitos

1. A solução deve importar as 80 linhas de `docs/fontes/guias.csv`, conservar o conteúdo original e exibir falhas de importação sem descartá-las silenciosamente.
2. Cada guia deve receber decisão `OK` ou `PENDENTE`, acompanhada dos motivos, campos envolvidos, regra ou política aplicada e orientação de correção.
3. `OK` deve significar apenas que nenhuma pendência foi encontrada nas verificações executadas; a interface deve deixar claro que isso não garante pagamento nem autenticidade externa.
4. As verificações determinísticas devem usar `docs/fontes/regras_convenio.json` para obrigatoriedade de campos, cobertura, validade inclusiva, limite de sessões e prazo de envio.
5. Dados ausentes ou não verificáveis não podem ser inventados. Verificações dependentes devem indicar limitação ou necessidade de conferência.
6. A conferência do lote de agosto deve usar a data de lançamento como referência histórica antes do envio, sem afirmar que lançamento equivale a envio.
7. Observações da recepção materialmente relevantes devem influenciar a orientação ou decisão; texto vazio ou administrativo irrelevante não deve criar pendência por si só.
8. Uma falha ao interpretar observação relevante deve preservar os achados determinísticos e retornar `checagem_textual_incompleta`, em vez de liberar a guia irrestritamente.
9. Uma guia inédita, com outro identificador e texto parafraseado, deve ser verificada pelas mesmas regras gerais; a produção não pode decidir por IDs do lote conhecido.
10. O MCP deve expor diretamente as tools `consultar_regra` e `verificar_guia`, além da tool `code` do Cloudflare Code Mode. `consultar_regra` recebe convênio/procedimento; `verificar_guia` aceita uma guia nova e retorna decisão, motivos, orientação, limitações e versão das regras usadas.
11. `verificar_guia` deve analisar também uma guia inédita e, por padrão, não persistir, cadastrar, alterar registro existente nem modificar indicadores.
12. A Skill deve permitir que a operação cole uma guia como foi escrita pela recepção, usar o MCP e devolver `OK` ou `PENDENTE`, motivo e ação de correção sem inventar campos.
13. A Skill só deve registrar quando o pedido já trouxer intenção explícita, como “registre esta guia” ou “salve essa correção”; nesse caso deve chamar a tool autenticada e idempotente `registrar_guia`, sem confirmação redundante. Essa tool fica exposta diretamente pelo MCP, fora do sandbox e das primitivas acessíveis à tool `code`.
14. Cadastrar ou importar pela aplicação deve persistir e validar automaticamente, sem depender de um segundo botão ou comando para conferir.
15. Salvar uma correção deve preservar o histórico, tornar a nova revisão vigente e substituir a revisão anterior nos indicadores, sem contar novamente a guia ou o valor.
16. Repetir exatamente uma solicitação de registro deve ser idempotente e não criar guia, revisão ou valor duplicado.
17. Cada importação deve criar um lote identificável. O dashboard mostra o conjunto atual das revisões vigentes; filtros e histórico permitem consultar um lote específico, sem abas separadas de “lote original” e “conjunto ampliado”.
18. Aplicação, importação, MCP e Skill devem chegar às mesmas decisões quando recebem a mesma guia, regras, referência temporal e contexto.
19. O relatório de terça-feira deve mostrar período e referência, guias distintas verificadas, `OK`, `PENDENTE`, falhas de processamento, tipos de pendência, convênios e unidades afetadas, valor registrado e valor associado às pendências.
20. O valor de uma guia deve entrar uma única vez no total pendente, mesmo quando ela possuir vários motivos. O relatório deve chamar esse valor de exposição, não de glosa realizada, perda ou economia comprovada.
21. Reimportar o mesmo conteúdo ou revalidar uma guia não pode inflar quantidade de guias, sessões ou valores. Uma alteração real deve preservar histórico suficiente para distinguir a revisão anterior da atual.
22. A solução publicada deve limitar abuso e não expor chaves, senhas, SQL, shell ou ações administrativas perigosas. O MCP exige OAuth; os dados fictícios podem ser demonstrados publicamente após login com a conta de teste.
23. O repositório público deve conter código, prompts efetivamente usados, MCP, Skill, testes, README “Como fiz” e histórico real de commits, sem segredos.
24. O README deve documentar instalação, uso, conexão OAuth do MCP no Claude Chat, Claude Code e Codex, execução da Skill, testes, ferramentas, tempo real, ao menos três decisões próprias e itens cortados. E-mail e senha reais da demonstração não entram no repositório e são enviados privadamente ao avaliador.
25. A entrega deve incluir um vídeo de até cinco minutos mostrando o lote, uma pendência explicável, uma guia inédita, MCP, Skill, relatório e uma decisão técnica.
26. O projeto deve ser publicável na infraestrutura e conta de Robson, sem custo para a Expert, priorizando o núcleo funcional dentro do teto sugerido de seis horas.
27. A solução deve iniciar vazia e orientar a importação do primeiro CSV; dados da prova não devem aparecer como se já tivessem sido processados antes da demonstração.
28. Após selecionar um CSV, a interface deve mostrar progresso, linhas encontradas, processadas, em andamento e com falha, além do resultado por linha. Falha parcial não pode ocultar sucessos nem marcar o lote inteiro como concluído sem ressalva.
29. Ao concluir o processamento, a visão geral deve exibir guias verificadas, sem pendência, com pendência, exposição associada, tipos de pendência, prioridades e guias que exigem atenção.
30. A lista de guias deve permitir busca e filtros por decisão, convênio, lote e motivo; cada guia aparece uma vez pela revisão vigente e o detalhe preserva o histórico.
31. “Ver resultado” deve abrir um pop-up com decisão, regra e evidência aplicadas, motivo, orientação de correção e acesso aos dados originais. “Salvar correção” abre o cadastro com os dados atuais.
32. O cadastro de guia deve usar wizard em quatro etapas: identificação/atendimento, convênio/procedimento, autorização/sessões e finalização. Formatos e obrigatoriedade contextual são validados durante o preenchimento; a decisão completa ocorre em “Salvar e conferir”.
33. Formato impossível de interpretar impede avançar no wizard. Violação de negócio não impede o registro: salva a guia como `PENDENTE`, com motivo e orientação.
34. A tela de regras deve usar consulta direta por convênio e procedimento, ser somente leitura e devolver cobertura, referência, campos obrigatórios, limites, prazo, observação literal, versão e limitações; seu conteúdo deve corresponder ao contrato do MCP.
35. Observações não vazias devem passar por extração estruturada no Cloudflare Workers AI usando somente o texto, convênio e procedimento. O retorno deve obedecer a schema fechado, citar evidência literal e alimentar políticas determinísticas; o modelo não decide `OK` ou `PENDENTE`, não grava dados e não recebe identificadores de paciente ou profissional.
36. Quando duas ou mais guias coincidirem na assinatura de negócio aprovada, todas devem ficar `PENDENTE` para conferência, independentemente da ordem de importação. Nenhuma é apagada ou escolhida automaticamente; o possível excesso considera apenas os registros excedentes e aparece separado da exposição total.
37. O prazo geral de envio será contado em dias corridos: `data_limite = data_atendimento + prazo_envio_dias`; a data limite ainda é aceita e o dia seguinte gera `PENDENTE`. A interface e as respostas devem identificar essa convenção como política do exercício, não como regra adicional fornecida pelo convênio.
38. Quando a observação mencionar autorização nova ainda não cadastrada, a guia deve permanecer `PENDENTE` até que número, validade e demais campos formais sejam atualizados. O texto pode orientar a correção, mas não substitui os dados estruturados nem libera a guia.
39. Uma remarcação mencionada na observação não cria pendência quando o atendimento realizado permanece dentro da validade cadastrada e nenhuma outra regra é violada. Se a nova data ultrapassar a validade, aplica-se normalmente a pendência objetiva de autorização vencida.
40. Pedido explícito de não usar o convênio e faturar como particular torna a guia de convênio `PENDENTE` para correção da modalidade. A solução não converte a cobrança, não inventa preço particular e não trata pergunta sobre preço ou pedido de recibo como decisão equivalente.
41. Autorização verbal da Saúde Interior sem número formal permanece `PENDENTE` para envio, mesmo quando houver protocolo. O protocolo não substitui `numero_autorizacao`; sem a data da autorização verbal, a solução não calcula nem afirma expiração dos cinco dias úteis.
42. Quando a observação afirmar que o procedimento realizado difere do lançado, a guia fica `PENDENTE` para conferência. A solução preserva as duas versões, não escolhe um código substituto e não altera o registro automaticamente.
43. Notas administrativas como atraso, confirmação por WhatsApp, exame anexado ou pedido de recibo não criam pendência sozinhas. Texto ambíguo com possível impacto material produz conferência humana específica, não aprovação irrestrita nem bloqueio genérico.
44. Divergência entre valor válido e valor de referência é alerta não impeditivo, com diferença exibida; a referência não é preço obrigatório. Valor ilegível ou tecnicamente inválido é `PENDENTE` e fica fora das somas, que devem indicar total incompleto.
45. A solução valida presença e formato do registro profissional quando exigidos, mas não bloqueia por suposta incompatibilidade entre categoria profissional e procedimento, pois o catálogo não fornece essa regra.
46. A assinatura de duplicidade usa convênio, paciente, carteirinha, autorização, data normalizada do atendimento, procedimento, posição da sessão, unidade e registro profissional. Correção que rompa a coincidência reavalia todas as guias ligadas, preservando as revisões anteriores.
47. O relatório semanal usa `data_lancamento` para delimitar a atividade do período e apresenta separadamente o estoque atual das revisões vigentes. `processado_em` serve à auditoria técnica e não substitui atendimento ou lançamento nas métricas operacionais.
48. Sob as políticas aprovadas, o corpus conhecido deve reproduzir 80 guias, 44 `OK`, 36 `PENDENTE`, R$ 5.694,00 registrados e R$ 2.692,00 associados a pendências, dos quais R$ 2.220,00 vêm de pendências estruturadas e R$ 472,00 apenas de revisão textual/duplicidade. Esses totais são fixture de regressão, nunca tabela de decisão por ID.
49. Toda a aplicação web exige a mesma conta única de demonstração usada para autorizar o MCP. Após login, uma ação “Reiniciar demonstração”, com confirmação explícita, pode apagar guias, lotes, revisões, validações e extrações da demonstração, mas nunca regras, configuração OAuth ou credenciais; essa ação não é exposta pelo MCP.
50. A área autenticada “Conectar ao Claude” deve mostrar e permitir copiar a URL do MCP, explicar a configuração em cada cliente e iniciar o OAuth sem revelar token permanente. Se a sessão web estiver válida, ela pode ser reutilizada na autorização; caso contrário, o mesmo login é solicitado. ID/e-mail podem ser configuração fixa, mas hash, salt e pepper da senha ficam em Worker secrets, nunca no código ou D1.
51. A conta de demonstração usa um único estado global. O reset afeta todo esse estado, exige confirmação e retorna conflito enquanto houver importação em andamento; não haverá isolamento por sessão, cliente ou workspace.
52. Aplicação, rotas internas, login, OAuth, MCP e assets serão publicados em um único Cloudflare Worker e domínio. A interface usa React, Vite, TypeScript e somente os componentes shadcn/ui necessários; a integração usa `@cloudflare/vite-plugin`, `run_worker_first: true` e delegação explícita ao binding `ASSETS`. Hono roteia APIs e autenticação, e o fallback da SPA nunca intercepta rotas de API, OAuth ou MCP.

## Decisões travadas

- O dossiê inicial é ponto de partida, não autoridade isolada.
- As fontes preservadas em `docs/fontes/` fundamentam o PRD.
- A mensagem posterior do recrutador prevalece sobre o HTML antigo no requisito alterado: MCP + Skill são obrigatórios e substituem a obrigação de API.
- O MCP deve consultar regras e verificar guias; a Skill deve operar sobre dados colados pela recepção.
- O MCP será um Cloudflare Worker stateless em TypeScript, exposto por Streamable HTTP com `createMcpHandler`, e usará Cloudflare Code Mode com `DynamicWorkerExecutor` e binding `LOADER`; a conta Workers Paid necessária já está disponível.
- O contrato público terá `consultar_regra`, `verificar_guia`, `registrar_guia` e `code`. As três tools de domínio e as primitivas internas do Code Mode reutilizam o mesmo núcleo puro, sem duplicar regras.
- `code` pode consultar regras e verificar guias, mas não recebe `registrar_guia`, D1, segredo nem acesso de rede. `registrar_guia` fica fora do sandbox, exige autenticação e preserva idempotência e histórico.
- Todo o endpoint MCP será protegido por OAuth com Dynamic Client Registration e `@cloudflare/workers-oauth-provider`. Ao conectar a URL, o cliente abre uma tela Vitalis de e-mail e senha; após o login, guarda e renova access/refresh tokens automaticamente, sem Bearer manual.
- Haverá uma conta de demonstração previamente criada, com senha armazenada somente como hash. As credenciais serão enviadas privadamente ao avaliador; o repositório conterá apenas placeholders e instruções.
- A proteção inicial permitirá até 10 tentativas de login por 15 minutos por IP e 60 chamadas MCP por minuto por combinação de usuário e IP. O corpo HTTP terá até 64 KiB, a resposta até 128 KiB e `code` terá timeout de 5 segundos.
- Observações não vazias usarão Cloudflare Workers AI somente para extração estruturada. Serão enviados apenas texto, convênio e procedimento; a decisão permanece determinística. O resultado será validado por schema e cacheado por texto, contexto, prompt e modelo; falha preserva achados objetivos e produz `checagem_textual_incompleta`.
- Todas as guias de um grupo candidato a duplicidade ficam `PENDENTE` até correção ou esclarecimento humano. A análise é independente da ordem, não remove registros e separa o possível excesso da exposição total para não somar o mesmo risco duas vezes.
- O prazo geral de envio usa dias corridos, inclui a data limite e só fica vencido no dia seguinte. Essa é uma política explícita do exercício; a exceção de cinco dias úteis da autorização verbal da Saúde Interior permanece separada porque está escrita no catálogo.
- Menção textual a uma autorização nova não substitui número, validade ou limite estruturados: a guia permanece `PENDENTE` até a recepção atualizar os campos formais a partir do documento.
- Reagendamento dentro da validade não bloqueia por si só. Sem regra complementar fornecida, a solução não presume que a autorização ficou inválida apenas porque a data mudou.
- Pedido explícito de não usar o convênio deixa a guia de convênio `PENDENTE`; perguntas sobre preço particular e pedidos de recibo não equivalem a essa decisão. A solução apenas orienta a correção da modalidade, sem converter ou precificar automaticamente.
- Autorização verbal da Saúde Interior sem número formal continua pendente; protocolo não vira autorização e os cinco dias úteis não são calculados sem a data de início.
- Relato de procedimento realizado diferente do lançado gera conferência humana, preserva as duas versões e nunca escolhe ou grava um código por inferência.
- Notas administrativas irrelevantes não bloqueiam. Valor de referência gera apenas alerta quando o valor é válido, e categoria profissional não é confrontada com procedimento sem regra fornecida.
- A assinatura de duplicidade usa os nove campos documentados no requisito 46; correções reavaliam o grupo sem apagar seu histórico.
- O relatório semanal filtra atividade por `data_lancamento` e separa essa janela do estoque atual de pendências.
- A aplicação web inteira usa a mesma conta única de demonstração do OAuth. O reset autenticado exige confirmação, restaura somente os dados operacionais da demonstração e nunca fica acessível ao MCP.
- “Conectar ao Claude” mostra a URL e instruções, não um token copiável. A autorização reutiliza a sessão web quando possível; a identidade é única e fixa, enquanto hash, salt e pepper da senha ficam em secrets do Worker, sem tabela de usuários.
- A demonstração mantém um único estado global. O reset é global, confirmado e indisponível durante importação; não haverá isolamento multiusuário, por sessão ou por cliente.
- Web, APIs internas, autenticação, MCP e assets compartilham um Cloudflare Worker/domínio. React + Vite + TypeScript e poucos componentes shadcn/ui formam a SPA; o plugin oficial da Cloudflare integra Vite/Worker e `run_worker_first: true` garante que Hono/autenticação rodem antes de qualquer asset.
- A referência autocontida de implementação é `docs/arquitetura/mcp-oauth-codemode.md`. Issues futuras devem citar esse arquivo e incorporar os critérios e trechos necessários, sem depender de projetos locais externos.
- A API pública não faz parte do MVP porque a atualização do recrutador a substituiu por MCP + Skill. Uma rota interna necessária à aplicação não será tratada como entregável de API.
- Conferência ad hoc pela Skill não persiste por padrão; registro ou correção exige intenção explícita já presente no pedido, sem confirmação redundante, e passa pela tool MCP `registrar_guia`.
- Cadastro/importação pela aplicação persiste e dispara validação automaticamente.
- Correções preservam histórico real no banco, atualizam a revisão vigente e permanecem visíveis no detalhe; repetição do mesmo registro é idempotente.
- A solução inicia sem guias. A primeira ação demonstrada é importar o CSV e acompanhar o processamento.
- Não haverá abas “lote original” e “conjunto ampliado”. Cada importação mantém identidade própria e pode ser consultada pelo histórico ou filtro; o dashboard resume o estado atual.
- A interface usará shadcn/ui para acelerar a implementação e manter componentes consistentes.
- O cadastro será um wizard. Validação técnica acontece durante o preenchimento; regras de negócio e decisão completa são executadas ao salvar.
- A consulta visual de regras segue a alternativa direta: convênio + procedimento → recorte aplicável, igual ao contrato do MCP.
- O projeto será novo e público em `https://github.com/orobsonn/vitalis-teste`.
- O repositório local foi inicializado em `main` com esse remoto e já contém commits reais dos mockups; não houve push nem publicação.

### Racional das decisões

| ID | Decisão | Motivo defendido |
|---|---|---|
| D01 | Tratar o dossiê como ponto de partida e preservar as fontes primárias. | Evita transformar análise derivada em regra; permite ao avaliador rastrear cada requisito ao material recebido. |
| D02 | Entregar MCP + Skill e não uma API pública. | A mensagem posterior do recrutador substituiu expressamente a API; cortar a superfície não exigida protege o teto de seis horas. |
| D03 | Usar TypeScript e Cloudflare Workers stateless com Code Mode, D1, KV e Workers AI. | Mantém runtime, banco, OAuth, sandbox e inferência na infraestrutura já disponível na conta paga; reduz integrações e aproveita um padrão que Robson consegue explicar. |
| D04 | Expor `consultar_regra` e `verificar_guia` diretamente, além de `code`. | Cumpre a leitura literal do enunciado, facilita `tools/list`, testes e demonstração; `code` continua disponível para composição sem virar o único caminho crítico. |
| D05 | Expor `registrar_guia` diretamente e fora do Code Mode. | A Skill precisa persistir quando houver intenção explícita, mas conceder escrita ao código gerado ampliaria o risco de efeitos laterais acidentais. |
| D06 | Bloquear rede, D1 e secrets no sandbox. | O código gerado precisa apenas orquestrar primitivas permitidas; acesso direto aumentaria exfiltração, abuso de custo e divergência das regras. |
| D07 | Usar OAuth com login de demonstração em vez de Bearer manual. | O uso cotidiano no Claude Chat deve exigir apenas conectar a URL e entrar uma vez; o cliente guarda e renova tokens sem copiar segredos em configurações. |
| D08 | Guardar somente hash da senha e enviar credenciais privadamente. | O repositório é público e não pode conter senha reutilizável ou segredo; a conta de teste continua simples para o avaliador. |
| D09 | Aplicar limites de login, chamadas, payload, resposta e execução. | Credenciais de demonstração podem vazar e `code`/Workers AI consomem recursos; limites reduzem abuso sem impedir vídeo ou avaliação normal. |
| D10 | Usar Workers AI apenas para extração estruturada de observações. | Texto parafraseado exige generalização, mas cobertura, datas e decisão precisam permanecer determinísticas, auditáveis e testáveis. |
| D11 | Enviar à IA apenas observação, convênio e procedimento. | É o contexto mínimo para interpretar o relato e evita compartilhar identificadores desnecessários, mesmo com dados fictícios. |
| D12 | Marcar todas as guias de um grupo duplicado como `PENDENTE`. | Não existe evidência para escolher a correta; tratar apenas a última tornaria o resultado dependente da ordem de importação. |
| D13 | Separar possível excesso de duplicidade da exposição total. | As quatro guias suspeitas representam R$ 320 sob revisão, mas apenas R$ 160 seriam excedentes se uma de cada par for duplicada; somar ambos inflaria o risco. |
| D14 | Contar o prazo geral em dias corridos, com último dia inclusivo. | O catálogo não fornece calendário útil nem feriados; a convenção é simples, reproduzível e explicitamente rotulada como política do exercício. |
| D15 | Não persistir conferência ad hoc; persistir somente com intenção explícita. | Rascunhos da conversa não devem alterar indicadores, enquanto “registre” ou “salve” expressam efeito desejado sem confirmação redundante. |
| D16 | Persistir e validar automaticamente cadastro e importação pela aplicação. | A conferência preventiva não pode depender de um segundo clique que a recepção possa esquecer. |
| D17 | Preservar revisões e tornar o registro idempotente. | Correções precisam manter auditoria, e retentativas não podem inflar guias, sessões ou valores. |
| D18 | Iniciar vazio e importar o primeiro CSV durante a demonstração. | Prova que a solução realmente processa a fonte e não exibe resultados previamente embutidos. |
| D19 | Dar identidade a cada lote sem abas artificiais de conjunto original/ampliado. | Mantém rastreabilidade de importações e, ao mesmo tempo, apresenta um estado atual único das revisões vigentes. |
| D20 | Usar shadcn/ui, wizard e consulta direta de regras. | Componentes prontos reduzem tempo; o wizard divide um formulário longo; convênio + procedimento reproduz o contrato simples do MCP. |
| D21 | Manter uma referência técnica autocontida no repositório. | Runs e contribuidores futuros não têm acesso aos projetos locais usados como inspiração; issues precisam ser implementáveis apenas com materiais versionados aqui. |
| D22 | Manter pendente uma guia cuja nova autorização aparece somente na observação. | O relato indica uma correção possível, mas não fornece todos os campos formais necessários nem comprova que o registro estruturado já foi atualizado. |
| D23 | Não bloquear reagendamento que permaneça dentro da validade. | Não há regra complementar sobre remarcação; criar uma produziria falso positivo e retrabalho sem fundamento nas fontes. |
| D24 | Bloquear guia de convênio quando o texto registra decisão explícita por cobrança particular. | A modalidade cadastrada contradiz a intenção relatada, mas o sistema não tem autoridade nem preço para converter a cobrança sozinho. |
| D25 | Manter pendente autorização verbal sem número formal. | A exceção da Saúde Interior admite protocolo temporário, mas exige o número antes do envio; protocolo e autorização são evidências distintas. |
| D26 | Bloquear contradição entre procedimento realizado e lançado. | Cobrar um serviço diferente do relato é material, mas o texto não fornece autoridade para escolher o código correto. |
| D27 | Não bloquear notas administrativas irrelevantes. | Atraso, WhatsApp, exame anexado e recibo não violam nenhuma regra fornecida; bloqueá-los aumentaria falsos positivos. |
| D28 | Tratar diferença de valor válido como alerta. | O JSON chama o valor de referência e o recrutador não forneceu preço obrigatório ou tolerância; valor inválido continua sendo problema técnico. |
| D29 | Não validar compatibilidade entre profissão e procedimento. | O catálogo só exige o registro; inferir habilitação seria criar regra clínica/contratual externa ao exercício. |
| D30 | Usar a assinatura de nove campos para duplicidade e reavaliar o grupo após correção. | A combinação representa o mesmo evento de negócio sem depender do ID; preservar revisões mantém rastreabilidade da suspeita e da resolução. |
| D31 | Filtrar atividade semanal por lançamento e separar o estoque atual. | Lançamento é o momento operacional disponível para a conferência; processamento é técnico e atendimento mede outro evento. |
| D32 | Usar os totais conhecidos como regressão, nunca como lookup. | A fixture detecta regressões do motor, mas regras por ID falhariam justamente na guia inédita exigida pela prova. |
| D33 | Proteger a aplicação com uma conta única e oferecer reset autenticado. | Escrita anônima permitiria adulterar a demonstração; um único usuário reduz escopo, e o reset permite repetir o roteiro sem apagar regras ou autenticação. |
| D34 | Mostrar a URL do MCP e usar OAuth sem token manual; guardar a credencial única em secrets. | O cliente consegue renovar sessões para uso diário, a tela não expõe credencial reutilizável e a ausência de tabela de usuários reduz implementação desnecessária. |
| D35 | Manter um único estado global da demonstração. | Há uma só conta e um único avaliador esperado; isolamento por sessão aumentaria banco, reset e autenticação sem benefício proporcional para a prova. |
| D36 | Publicar SPA, Hono, OAuth e MCP em um Worker/domínio. | Mesma origem elimina CORS e permite reutilizar sessão; um deploy reduz risco operacional, desde que o roteamento impeça assets de interceptar protocolos. |
| D37 | Usar o plugin oficial do Cloudflare para Vite e executar o Worker antes dos assets. | Segue o template atual da plataforma, unifica desenvolvimento/build/deploy e impede que fallback ou arquivo estático contorne autenticação e rotas de protocolo. |
| D38 | Dividir a implementação em oito issues orientadas a resultado. | Mantém cada incremento verificável, explicita dependências e evita issues vagas por camada ou uma única entrega impossível de revisar. |

### Handoff aprovado para issues

1. **Fundação executável e núcleo determinístico:** scaffold Cloudflare/Vite/Hono, contratos, normalização, regras puras e regressão estruturada.
2. **Interpretação segura de observações:** Workers AI, schema, políticas textuais, cache e fallback.
3. **Importação, histórico e relatório sem dupla contagem:** D1, lotes, revisões, idempotência, duplicidades e indicadores.
4. **Autenticação da demonstração e OAuth do MCP:** conta única, sessão, CSRF, DCR, reset e roteamento protegido.
5. **Experiência web aprovada:** importação, dashboard, lista, detalhe, wizard, regras e relatório.
6. **MCP com Code Mode:** quatro tools, sandbox, limites e teste em cliente real.
7. **Skill operacional:** guia colada, conferência via MCP e registro somente com intenção explícita.
8. **Publicação e documentação avaliável:** deploy, README “Como fiz”, evidências e roteiro de vídeo.

Dependências: `1 → 2 → 3`; `4` parte da fundação; `5` depende de `3+4`; `6` depende de `2+3+4`; `7` depende de `6`; `8` depende de `5+6+7`.

### Baseline reproduzida das fontes

A conferência direta de `docs/fontes/guias.csv` e `docs/fontes/regras_convenio.json` reproduziu:

- 80 linhas, 80 IDs e R$ 5.694,00 registrados;
- 44 observações vazias e 36 preenchidas;
- 32 ocorrências estruturadas em 30 guias, somando R$ 2.220,00;
- 13 validades vencidas, 6 excessos de sessão, 5 procedimentos sem cobertura, 4 autorizações ausentes, 2 registros profissionais ausentes e 2 CIDs obrigatórios ausentes;
- dois pares candidatos a duplicidade após normalização: `0027/0057` e `0059/0076`;
- expectativa consolidada de 44 `OK`, 36 `PENDENTE`, R$ 2.692,00 de exposição e R$ 160,00 de possível excesso de duplicidade separado e não aditivo.

### Mockups aprovados

O único artefato canônico é `docs/prd/vitalis-conferencia-preventiva-guias-mockup.html`; os estados aprovados anteriores permanecem no histórico Git:

- `e4de8a4` — estado inicial vazio;
- `82dd711` — importação e processamento do CSV;
- `95a3a0e` — visão geral após processamento;
- `a2eb076` — cadastro em wizard;
- `e809122` — lista de guias;
- `7233c12` — consulta direta de regras.

O pop-up de resultado também foi aprovado: decisão, evidência/regra, orientação, dados originais e ação para salvar correção.

## Suposições do modelo

- A aplicação, a importação e as tools MCP devem consumir a mesma biblioteca TypeScript pura de normalização e decisão; D1 será usado por adaptadores de persistência, não pelo núcleo de regras.

## Em aberto

Nenhuma questão material aberta para o handoff. Descoberta de conflito real durante implementação deve voltar ao PRD; preferência técnica reversível pode ser resolvida na issue correspondente, preservando requisitos e motivos.

## Fora de escopo

- Substituir ou integrar de verdade o sistema de gestão da clínica.
- Solicitar ou autenticar autorizações junto aos convênios.
- Enviar guias ou cobranças reais.
- Interpretar CID clinicamente ou validar habilitação profissional em fonte externa.
- Construir agenda, WhatsApp de pacientes, contestação de glosa, conciliação bancária ou ERP clínico.
- Usar regras externas para “corrigir” o catálogo fictício da prova.
- Alegar economia, recuperação, pagamento ou glosa efetiva com base apenas no lote.

## Riscos conhecidos

- O HTML público capturado ainda mostra a exigência antiga de API; a atualização posterior do recrutador está preservada como fonte que a substitui.
- Data de concessão da autorização não existe no CSV, portanto a duração máxima não pode ser verificada com segurança.
- O lote de agosto não representa o histórico completo de sessões ou autorizações.
- Observações livres podem exigir interpretação semântica; regras literais demais não generalizam, enquanto uma LLM pode errar, custar ou ficar indisponível.
- Uma demonstração pública com MCP ou LLM pode sofrer abuso e gerar custo se não houver limites.
- `@cloudflare/codemode` se declara experimental e sujeito a mudanças incompatíveis; manter `consultar_regra` e `verificar_guia` como tools diretas reduz o risco de demonstração e avaliação.
- O teto sugerido de seis horas torna arquitetura excessiva e entregáveis acessórios um risco direto para a conclusão.
- Os totais estruturados do dossiê foram reproduzidos diretamente do CSV e do JSON; a expectativa integral ainda depende das políticas textuais em aberto e não pode virar lookup por ID em produção.

# Verificações da interface publicada

Execução em 25/09/2026, no Google Chrome, com controle real da interface pelo Computer Use do Codex. Ambiente: https://vitalis.robsonlins.workers.dev. Dados exclusivamente fictícios do exercício. Esta lista descreve verificações realizadas; não representa cobertura exaustiva de todos os comportamentos possíveis.

## Fluxos já verificados

| Cenário | Resultado observado |
| --- | --- |
| Login com credencial válida | Aplicação autenticada aberta no Chrome. |
| Encerrar sessão | Retorno à página de login. |
| Login inválido | Mensagem genérica “E-mail ou senha inválidos”; sem identificar existência da conta. |
| Nova tentativa após login inválido | Credencial válida restabeleceu acesso, preservando as 80 guias. |
| Reset autorizado da demonstração | Estado vazio exibido; autenticação e regras preservadas. |
| Importação do arquivo fornecido | `guias.csv`, 80 de 80 linhas concluídas; zero falhas de entrada. |
| Interrupção e retomada da importação | Recarregamento da página preservou o lote; “Retomar processamento” continuou as linhas restantes. |
| Busca por guia | Filtro por `G-2608-0004` exibiu uma guia, com valor de R$ 62,00. |
| Filtros combinados | Decisão PENDENTE, Plano Bem, lote e autorização vencida retornaram somente `G-2608-0004`, R$ 62,00. |
| Possível duplicidade | Filtro retornou quatro guias, somando R$ 320,00; painel mostrou possível excesso separado de R$ 160,00. |
| Detalhe de pendência objetiva | Autorização vencida com regra, evidência e orientação. |
| Dados originais e histórico | Dados recebidos preservados e revisão 1 acessível. |
| Dados normalizados | Datas ISO, sessões numéricas e valor em reais; observação vazia indicada como não informada. |
| Recuperação de checagem incompleta | `G-2608-0015` passou de PENDENTE/incompleta para OK/completa, mantendo revisão 1 e referência 26/08/2026; validação anterior permaneceu visível. |
| Atualização de análise antiga | `G-2608-0009` deixou de interpretar confirmação de WhatsApp como autorização verbal; manteve dados, revisão 1 e referência 21/08/2026. |
| Repetir checagem atual | Nova tentativa em `G-2608-0009` informou que o resultado vigente foi preservado; histórico continuou com duas validações. |
| Consulta de regra | Vitalcard / 50000470: cobertura, R$ 62,00, limite de 10 sessões e prazo de 30 dias. |
| Guia inédita com pendência | `E2E-WEB-20260925-001`, sessão 11 de limite 10: salva como PENDENTE, com regra e orientação corretas. |
| Correção pela interface | Alterar somente a sessão para 1 gerou revisão 2 OK, mantendo o ID e a observação original. |
| Histórico de ajustes completo | Revisão 1 PENDENTE/sessão 11 e revisão 2 vigente OK/sessão 1 exibiram todos os dados próprios e suas validações. |
| Reenvio de conteúdo antigo A→B→A | Reenviar sessão 11 informou conteúdo já registrado; revisão 2 OK permaneceu vigente, sem revisão 3. |
| Indicadores após correção | 81 guias, 45 OK, 36 pendentes, R$ 5.756 registrados e exposição mantida em R$ 2.692; guia E2E contada uma vez. |
| Relatório semanal de terça | Período 25–31/08: 27 guias, 16 OK, 11 pendentes, R$ 1.851 registrados e R$ 790 de exposição, zero falhas. |
| Cadastro com formato inválido | ID vazio e data 31/02/2026 impediram avanço com mensagens específicas. |
| Relatório de agosto | Intervalo 01/08/2026–31/08/2026 incluiu as 80 guias e R$ 5.694,00 registrados. |
| Relatório com datas invertidas | Mensagem acionável; relatório anterior manteve seu período explícito. |
| Relatório sem lançamentos | Janeiro/2026 retornou zero guias e zero valores, preservando o estoque geral. |
| Busca vazia, limpeza e paginação | ID inexistente retornou zero guias/R$ 0; limpar restaurou 80; página seguinte mostrou guias 21–40. |
| Histórico de importações | Lote concluído abriu 80/80 linhas, zero falhas; busca G-2608-0004 e filtro Concluída retornaram a linha 5; filtro Falha retornou vazio; abrir resultado exibiu autorização vencida. |
| URL direta de configuração MCP | `/configuracoes/mcp` abriu `/#conectar` autenticado; teste HTTP verifica redirecionamento para login sem sessão. |
| Atalho de acessibilidade | Ativar “Ir para o conteúdo” em Nova guia manteve `#nova`, etapa 2 e rascunho; foco foi para o conteúdo. |
| Conexão MCP na interface | Abas Claude Chat, Claude Code e Codex exibiram instruções; botão Copiar URL exibiu Copiado. O conteúdo do clipboard não foi validado independentemente. |
| Baseline após reconferência | Painel publicado mostrou 80 guias, 44 OK, 36 pendentes, R$ 5.694 registrados e R$ 2.692 de exposição; zero checagem incompleta. |
| Detalhes sem rolagem horizontal | Botão visível com scroll horizontal zero em 1440, 1024 e 390 px; tabela maior que a área em 1024/390 px; abertura do resultado funcionou no celular. |
| Impressão do relatório | Preview real do Chrome com três páginas; reteste preservou os cinco IDs das guias e removeu o link de acessibilidade que sobrepunha o conteúdo. |
| Lista de procedimentos própria | Desktop e 390 px: lista branca ancorada ao campo, sem datalist; busca por nome sem acento; mouse e ArrowDown/Enter selecionam código sem avançar; Tab preserva código desconhecido; limpeza e Escape preservam vazio; descrição permanece intacta; última opção selecionável e nenhum overflow horizontal. |
| Tela móvel | Formulário, navegação e detalhe de duplicidade conferidos em 390 × 844; menu abriu, navegou e fechou. Abas e versão longa das regras quebraram linha sem ultrapassar o painel. |

## Verificações em andamento

- Retomada após navegar para outra tela aprovada: lote de 12 guias apareceu sem reload, retomou e concluiu 12 reaproveitadas/zero falhas; nenhum lock residual. A conexão do trecho em andamento agora conclui ao sair da tela.
- Reimportação das 80 guias aprovada: 80 reaproveitadas, zero falhas; inspeção final em andamento.

Os testes HTTP, MCP e da Skill têm evidências próprias e não são apresentados como testes de navegador. Credenciais, cookies, tokens e transcrições privadas ficam fora do repositório.

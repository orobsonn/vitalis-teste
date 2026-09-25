# Changelog

As alterações relevantes deste projeto são registradas aqui, seguindo Keep a Changelog.

## [Unreleased]

### Added

- Acesso autenticado à demonstração, sessão protegida e OAuth com PKCE para clientes MCP.
- Interface para importação de CSV, consulta de regras, cadastro e correção de guias, histórico e relatório de atividade.
- Ferramentas MCP sobre o núcleo compartilhado, Code Mode limitado à leitura e Skill operacional para Codex.
- Scripts de preparação de credenciais privadas e verificação da aplicação publicada.
- Documentação de instalação, operação e roteiro de demonstração.
- Reconferência das observações com preservação dos dados originais, da referência temporal e do histórico de validações.

### Changed

- Seletores padronizados na interface; no cadastro, sugestões de procedimentos seguem a cobertura do convênio, preservando a entrada livre para sinalizar exceções.
- Extração textual com Llama 4 Scout, prompt com critérios explícitos por sinal e saída limitada pelo schema JSON do domínio.

### Fixed

- Atalho de acessibilidade preserva a tela e o rascunho; URL de configuração MCP leva à conexão autenticada.

- Lista de procedimentos própria da aplicação, com busca por código/nome e navegação por teclado.

- Acesso aos detalhes das guias mantido visível durante rolagem horizontal da tabela.
- Histórico e relatórios lidos em uma transação para evitar mistura de revisões durante correções simultâneas.
- Retomada de importação ao voltar à tela, sem exigir recarregamento manual; o trecho iniciado conclui ao sair, sem abortar a gravação.
- Identificação das guias preservada na impressão, sem sobreposição do link de acessibilidade.

- Compatibilidade do formulário de autenticação com a origem enviada pelo navegador.
- Identidade das extrações textuais por observação, convênio, procedimento, modelo e prompt.
- Tratamento de conflitos de unicidade no formato retornado pelo D1 remoto.
- Validação da origem e de mensagens JSON-RPC individuais no endpoint MCP.
- Normalização de datas brasileiras nos filtros do relatório.
- Reutilização validada das extrações persistidas após expiração do cache, com recusa de divergências entre resultado e evidência histórica.

Não há release formal ou tag deste marco; a versão do pacote permanece `0.0.0` até a definição da baseline.

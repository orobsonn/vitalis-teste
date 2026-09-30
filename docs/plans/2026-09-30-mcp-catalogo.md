# Descoberta do catálogo MCP

Fluxo enxuto solicitado: testes → implementação → validação → adversário e compliance → PR → merge → release minor → deploy.

1. Testar via cliente MCP real as quatro ferramentas novas, a busca por descrição/código sem acentos, cobertura, paginação, convênio desconhecido e schemas estritos. Usar o runtime integrado e comparar o D1 antes/depois.
2. Adicionar leituras puras do catálogo validado em `src/application/catalogo.ts`; conectar ao runtime, contratos, schemas e registro MCP. Manter as três ferramentas existentes. Expor as novas leituras também ao Code Mode, mantendo escrita inacessível.
3. Listagem traz todos os procedimentos conhecidos com cobertura explícita; filtro `cobertura` permite somente cobertos/não cobertos. Busca exige convênio e termo, com palavras combinadas. Paginação por `offset` e `limite` (50 padrão, 100 máximo), total e próximo offset. Visão consolidada traz regras comuns e procedimentos paginados, sem inventar vigência ou identificadores ausentes.
4. Rodar testes completos, typecheck, build e dry-run. Atualizar documentação e smoke. Revisores independentes inspecionam diff e evidências; corrigir bloqueios antes de publicar.
5. Criar baseline v0.0.1 no marco anterior e release v0.1.0 desta expansão, mantendo pacote/changelog/tag em sincronia. PR com CI verde, merge autorizado pelo usuário, release e deploy com smoke de leitura.

Escopo sensível: registro MCP e composição do Code Mode. Não alterar OAuth, permissões, storage ou regras do catálogo. Reversão: rollback da versão do Worker e revert do PR.

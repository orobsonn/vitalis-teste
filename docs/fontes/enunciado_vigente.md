# Etapa técnica — guias de convênio da Clínica Vitalis

- **Fonte:** https://prova.expertintegrado.com.br/
- **Capturado em:** 2026-09-21
- **Cópia integral:** `enunciado-publico.html`
- **Natureza:** transcrição estruturada para consulta, complementada pela atualização posterior em `resposta_recrutador.md`. Essa atualização prevalece no requisito que substituiu API por MCP + Skill.

## Contexto

A Clínica Vitalis é uma rede fictícia de fisioterapia e ortopedia com três unidades, 41 pessoas e cerca de 900 guias por mês. O faturamento mensal informado é de R$ 780 mil; 58% vem de convênios; 8% do faturado em convênio volta glosado. Carla estima que 40% da glosa decorre de guia preenchida incorretamente ou autorização vencida.

Hoje a recepção preenche as guias no sistema de gestão e o financeiro as confere no fim do mês, em planilha. O erro pode aparecer somente quando o convênio glosa. O sistema de gestão não será substituído, mas possui API e exporta relatórios. Dr. Renato acompanha o projeto às terças-feiras, às 7h30.

## Problema

A conferência deve acontecer antes do envio ao convênio, sem depender de alguém lembrar. Toda terça-feira, Dr. Renato precisa conseguir ver:

1. quantas guias foram verificadas;
2. quantas têm problema;
3. quais são os tipos de problema;
4. quanto dinheiro está em risco.

Arquitetura, ferramentas, linguagem e o uso ou não de IA são decisões do candidato.

## Materiais oficiais

- `guias.csv`: 80 guias fictícias de agosto;
- `regras_convenio.json`: exigências e coberturas dos três convênios;
- dicionário de dados das colunas do CSV.

## Entregáveis em até 72 horas

1. Solução funcionando e publicada, utilizável com as guias fornecidas.
2. Um MCP sobre as regras dos convênios e as guias, capaz de consultar regra e verificar guia. Este item substitui a obrigação antiga de uma URL JSON; uma API adicional continua aceita, mas não é obrigatória.
3. Relatório de terça-feira do Dr. Renato, gerado pela solução.
4. Uma Skill de Claude Code ou Codex que permita à operação conferir uma guia colando os dados como foram escritos pela recepção e que use o MCP.
5. README “Como fiz”, cobrindo:
   - stack e justificativa;
   - o que a IA gerou;
   - o que o candidato alterou manualmente, incluindo ao menos três decisões próprias;
   - o que ficou de fora e por quê;
   - como a solução foi testada;
   - tempo gasto.
6. Vídeo de até cinco minutos mostrando a solução e explicando uma decisão técnica.
7. Repositório público com histórico de commits.

## Regras da prova

- Tudo deve rodar na conta e infraestrutura do candidato, sem custo para a Expert.
- A ferramenta usada não é critério; contam o resultado publicado e a capacidade de explicá-lo.
- O projeto deve nascer para esta prova; não vale reutilizar projeto pronto.
- Nenhuma chave ou senha pode estar no repositório público.
- A solução não precisa ser bonita, mas precisa funcionar, aceitar uma guia nova e ser explicável.
- O teto sugerido é de seis horas. Se ultrapassá-lo, a orientação é entregar o que estiver pronto e declarar o que faltou.

## Critérios de avaliação

1. As decisões devem corresponder aos problemas reais presentes nas guias.
2. O MCP deve consultar regras e verificar uma guia inédita; a Skill deve usar esse fluxo com dados colados como a recepção os escreveu.
3. O candidato deve saber explicar a implementação e fazer uma pequena alteração ao vivo.
4. Repositório, variáveis de ambiente e tratamento de erro devem demonstrar cuidado básico.
5. Usar IA é esperado; não saber explicar o código conta negativamente.

## Informações exigidas no envio

- nome, e-mail e WhatsApp;
- URL da solução publicada;
- instruções e exemplo para conectar o MCP, consultar regra e verificar uma guia nova; se houver API adicional, sua URL, método e exemplo;
- URL do repositório público;
- URL do vídeo;
- localização da Skill;
- horas aproximadas;
- ferramentas utilizadas;
- o que ficou de fora e por quê.

Dados de identificação e URLs finais não são preenchidos nesta fonte; serão informados apenas quando existirem e forem verificados.

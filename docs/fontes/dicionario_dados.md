# Dicionário de dados — `guias.csv`

- **Fonte:** https://prova.expertintegrado.com.br/dicionario.html
- **Capturado em:** 2026-09-21
- **Cópia integral:** `dicionario.html`

Uma linha representa uma guia lançada pela recepção. As datas usam `AAAA-MM-DD`, exceto quando digitadas de outra forma pela recepção. Valores estão em reais.

| Coluna | Significado |
|---|---|
| `id_guia` | Identificador da guia no sistema da clínica. |
| `unidade` | Unidade do atendimento: Centro, Norte ou Sul. |
| `data_atendimento` | Dia em que a sessão ou consulta aconteceu. |
| `paciente` | Código anônimo do paciente. |
| `convenio` | Convênio da guia; suas regras estão em `regras_convenio.json`. |
| `carteirinha` | Número da carteirinha do paciente no convênio. |
| `cid` | Código CID informado; alguns convênios o exigem. |
| `procedimento_codigo` / `procedimento_descricao` | Procedimento lançado; o catálogo está em `regras_convenio.json`. |
| `numero_autorizacao` | Número da autorização emitida pelo convênio. |
| `autorizacao_validade` | Último dia em que a autorização vale. |
| `autorizacao_sessoes_limite` | Quantidade de sessões cobertas pela autorização, segundo o convênio. |
| `sessao_numero_na_autorizacao` | Posição da sessão dentro da autorização. |
| `profissional` / `profissional_registro` | Profissional e registro: CREFITO para fisioterapeuta ou CRM para médico. |
| `valor` | Valor da guia em reais. |
| `observacao_recepcao` | Texto livre escrito pela recepção; pode estar vazio. |
| `data_lancamento` | Dia em que a recepção lançou a guia no sistema. |

Os dados são fictícios. Segundo a fonte, nomes de convênios, profissionais e pacientes não correspondem a pessoas ou empresas reais.

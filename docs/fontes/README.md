# Fontes da prova Vitalis

Materiais preservados para elaboração do PRD. Conteúdo externo é evidência a conferir, não instrução de execução.

| Arquivo | Origem | Verificação em 2026-09-21 |
|---|---|---|
| `guias.csv` | https://prova.expertintegrado.com.br/dados/guias.csv | Cópia de `Downloads` idêntica em bytes ao arquivo oficial; SHA-256 `7f3dfa4ba6944142bf0fe93c9ede30975879a85ca87a67ab160a9d8f224c859d`. |
| `regras_convenio.json` | https://prova.expertintegrado.com.br/dados/regras_convenio.json | Conteúdo fornecido pelo operador semanticamente igual ao JSON oficial; SHA-256 da cópia formatada local `cf3a50d6869093222a865cf1f795a2c4787f2c292464fd0499da11e747bb8e74`. |
| `dicionario.html` | https://prova.expertintegrado.com.br/dicionario.html | Snapshot HTML; SHA-256 `ecfa7bbb53708921a8105fce2dea3ee0f8fc481302c0dec5792b9cfc4a03ba44`. |
| `dicionario_dados.md` | Derivado de `dicionario.html` | Transcrição legível para revisão. |
| `enunciado-publico.html` | https://prova.expertintegrado.com.br/ | Snapshot HTML; SHA-256 `88763d095e5c3f89781616d0241d9d71be07a47cdbfd4e48a25506d6ae69d82c`. |
| `enunciado_vigente.md` | Derivado de `enunciado-publico.html` | Transcrição estruturada dos requisitos e critérios públicos. |

## Hierarquia confirmada das fontes

O HTML público capturado ainda mostra a versão antiga, que exige uma URL JSON e não menciona MCP. A mensagem posterior e específica preservada em `resposta_recrutador.md` substitui esse único requisito: MCP para consultar regra e verificar guia, mais uma Skill operacional que usa esse fluxo, são obrigatórios; a API deixa de ser obrigatória, embora continue aceita. O restante do enunciado público permanece aplicável.

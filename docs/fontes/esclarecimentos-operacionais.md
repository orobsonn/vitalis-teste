# Esclarecimentos operacionais do recrutador

**Origem:** resposta recebida por Robson e fornecida nesta sessão em 25/09/2026, após as [perguntas sobre o fluxo e as regras](../../README.md#problema-fluxo-e-premissas). Este arquivo resume o conteúdo para rastreabilidade; não acrescenta regra ao JSON.

| Pergunta | Esclarecimento recebido | Implicação para a solução |
| --- | --- | --- |
| 1–4. Autorização, registro, envio e correção | A recepção lança a guia enquanto atende; o financeiro confere no fim do mês em planilha; o envio sai do sistema de gestão, que tem API e exporta relatórios. Quem solicita autorização, cadastro próprio, frequência/lote de envio e tratamento atual da pendência não estão definidos. | Adotar premissas, documentá-las e devolver a correção à recepção. Não alegar integração ou envio efetivo. |
| 5. Duração máxima | O CSV só traz a data final de validade; a concessão não está disponível. | Comparar validade ao atendimento; informar que duração máxima não pode ser verificada. |
| 6. Prazo no lote de agosto | Simular conferência na data de lançamento; a guia acaba de ser lançada e ainda não foi enviada. O prazo do JSON conta desde o atendimento. | Guardar referência temporal distinta do instante de processamento e do envio real. |
| 7 e 10. Reagendamento e autorização verbal | Não existe regra complementar além do JSON; o uso da observação é decisão do produto. | Não inventar exigência de nova autorização para remarcação dentro da validade. Não contar cinco dias úteis sem data de concessão da autorização verbal. |
| 8. Profissional e procedimento | Não há regra de compatibilidade entre categoria profissional e procedimento no JSON. | Verificar apenas o formato do registro informado, sem presumir habilitação ou bloquear CRM/CREFITO por categoria. |
| 9. Valor | É valor de referência, sem tolerância ou preço obrigatório definidos. | Divergência numérica válida é alerta, não pendência automática. |
| 11. Sessões e autorizações | As 80 guias são um recorte de agosto, não o histórico completo. | Conferir o que cada guia declara; não reconstruir consumo real nem comprovação de reavaliação pelas 80 linhas. |

O recrutador explicitou que premissas razoáveis devem ser documentadas no README. A resposta não determina como a clínica deveria operar fora da demonstração.

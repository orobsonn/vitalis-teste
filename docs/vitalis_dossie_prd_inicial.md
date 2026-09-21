# Clínica Vitalis

## Dossiê de decisões para elaboração do PRD

**Projeto:** conferência preventiva de guias de convênio  
**Responsável:** Robson Lins  
**Versão:** 1.0 — consolidação da conversa e dos esclarecimentos do recrutador  
**Destino:** leitura pelo Codex, elaboração do PRD e planejamento de uma implementação nova para a prova  
**Natureza:** documento de passagem de contexto. Não é a aplicação, não é um relatório de produção e não comprova testes ou implantação.

> O núcleo confronta dados de uma guia com regras explícitas, interpreta observações quando necessário, explica as pendências e devolve a correção à recepção. Não concede autorização, não decide tratamento e não garante pagamento.

## Como usar este pacote

Leia este dossiê e as fontes antes de escrever o PRD. O arquivo `INICIAR_NO_CODEX.md` contém uma instrução de entrada. O diretório `fontes/` preserva o CSV recebido e transcreve o JSON, o dicionário, o enunciado vigente e a resposta do recrutador. O diretório `anexos/` contém a auditoria do lote e expectativas propostas de teste para as 80 guias.

O documento preserva decisões, fundamentos, alternativas descartadas e limites relevantes da conversa. Não repete a preparação do currículo nem as propostas de atendimento da etapa anterior: elas não fazem parte desta implementação. Nenhum conteúdo foi acrescentado a partir de pesquisa externa nesta consolidação.

### Legenda de autoridade

- **\[E\] Exigência:** consta do enunciado atualizado.
- **\[F\] Fonte:** consta do JSON, dicionário ou CSV.
- **\[C\] Confirmado:** esclarecido diretamente pelo recrutador.
- **\[D\] Diretriz:** decisão de produto defendida por Robson e consolidada na conversa.
- **\[P\] Proposta:** detalhamento sugerido para o PRD; não deve ser apresentado como regra de convênio nem como exigência do recrutador.
- **\[L\] Limitação:** dado ou regra que não pode ser verificado no recorte atual.

Uma proposta pode ser adotada no PRD com justificativa. Não deve ser promovida silenciosamente a exigência contratual. Em caso de conflito, preservar o material original, usar o esclarecimento específico do recrutador e registrar o motivo da interpretação.

## Navegação

1. Objetivo e critérios de sucesso
2. Fontes e esclarecimentos que encerraram as dúvidas
3. Fundamentos do domínio
4. Escopo do MVP e fronteiras da entrega
5. Inventário dos dados e normalização
6. Referência temporal e regras determinísticas
7. Observações da recepção e interpretação por LLM
8. Estados, pendências, alertas e limitações
9. Banco, histórico e rastreabilidade
10. Arquitetura, MCP e Skill
11. Relatório gerencial e dinheiro em risco
12. Testes, corpus e critérios de aceite
13. Operação, segurança e tratamento de erros
14. Implementação, documentação e demonstração
15. Registro de decisões e instruções para o PRD

# 1. Objetivo e critérios de sucesso

## 1.1. Problema a resolver

[E] A recepção lança guias enquanto divide atenção entre balcão, telefone e WhatsApp. O financeiro confere no fim do mês, em planilha. O problema é descoberto tarde, quando o convênio glosa a cobrança. A solução precisa executar a conferência antes do envio, sem depender de alguém lembrar, e permitir a leitura gerencial de quantidade, tipos de pendência e exposição financeira. [S1]

[E] Esta etapa impõe o recorte de guias de convênio. A North Star de comparecimento escolhida na prova anterior não rege este produto. Não construir bot de recepção, confirmação de agenda, follow-up de pacotes ou conciliação bancária nesta entrega.

O valor demonstrável é antecipar inconsistências e produzir uma orientação de correção utilizável. O resultado não se mede por quantidade de agentes, ferramentas ou linhas de código, mas pela qualidade das decisões e explicações sobre guias conhecidas e novas.

## 1.2. Usuários e responsabilidades

A recepção é a destinatária da correção: ela precisa saber o que está pendente, qual campo ou relato sustenta a decisão e o que deve conferir ou ajustar. Carla acompanha a operação e as limitações do processo; não precisa receber toda pendência como tarefa individual. Dr. Renato consulta o relatório executivo. O avaliador precisa abrir a solução, verificar as 80 guias e inserir uma nova pelo caminho documentado. [S1, S5]

A solução não assume que existe hoje uma fila, um supervisor específico por guia ou um cadastro independente de autorizações. Onde essas estruturas forem propostas, devem ser descritas como parte da solução, não como fatos da clínica.

## 1.3. Entregáveis obrigatórios

[E] São necessários: solução acessível e funcionando com as 80 guias; caminho utilizável para uma guia nova; relatório gerado pela solução; MCP com consulta de regra por convênio/procedimento e verificação de guia; Skill operacional que usa esse MCP; README “Como fiz”; vídeo de até cinco minutos; repositório público com código, prompts, MCP, Skill e histórico de commits; horas aproximadas e ferramentas efetivamente usadas. [S1]

A versão atualizada não obriga a entrada de guia nova por um endpoint HTTP JSON específico. Formulário, mensagem ou outra interface funcionam, desde que acessíveis e explicados. Manter uma API compartilhada é uma escolha arquitetural útil, não uma exigência a atribuir à versão atual.

[E] O projeto deve nascer para a prova, na infraestrutura e conta de Robson, sem custo para a Expert e sem segredos no repositório. O teto sugerido é de seis horas de trabalho. Não declarar que algo foi publicado, testado ou corrigido manualmente antes de fazê-lo. Prazo transcrito do portal: 19/10/2026 às 17:15; o fuso não foi explicitado. [S1]

# 2. Fontes e esclarecimentos que encerraram as dúvidas

## 2.1. Registro de fontes


| ID  | Material no pacote                | Como utilizar                                                                |
| --- | --------------------------------- | ---------------------------------------------------------------------------- |
| S1  | `fontes/enunciado_vigente.md`     | Entregáveis e contexto da etapa atual; transcrição sem decoração do portal.  |
| S2  | `fontes/regras_convenio.json`     | Regras fictícias recebidas; conteúdo preservado, JSON reserializado.         |
| S3  | `fontes/dicionario_dados.md`      | Significado das colunas; não acrescenta dados que não existem.               |
| S4  | `fontes/guias.csv`                | Arquivo original anexado, preservado em bytes.                               |
| S5  | `fontes/resposta_recrutador.md`   | Resposta integral compartilhada; sem data de envio disponível.               |
| S6  | Conversa consolidada neste dossiê | Preferências, decisões, propostas e alternativas; identificadas como D ou P. |


O `manifesto_fontes.json` registra os hashes dos arquivos locais. Ele comprova a identidade dos materiais deste pacote, não uma verificação externa do portal. As análises dos anexos são derivadas, não novas fontes de regra.

## 2.2. Respostas vinculantes para o recorte

**Fluxo:** [C] o envio ao convênio sai do sistema de gestão. Não está definido quem solicita autorização, se existe cadastro próprio, se o envio é em lote ou como as pendências são tratadas hoje. Documentar hipóteses e devolver a correção à recepção. Não construir essas integrações como se estivessem disponíveis. [S5, resposta 1–4]

**Concessão:** [C/L] a data de concessão não existe nos dados. Verificar a validade contra a data do atendimento. A duração máxima permanece como limitação documentada. Não escrever “não obtivemos resposta”: houve uma confirmação explícita de ausência do dado. [S5, resposta 5]

**Tempo do lote:** [C] simular a conferência na data de lançamento; a guia acabou de ser lançada e ainda não foi enviada. Prazo de envio contado da data do atendimento. Lançamento não se torna sinônimo de envio. [S5, resposta 6]

**Observações:** [C] não há regra complementar para reagendamento ou autorização verbal além do JSON. O tratamento do relato é uma decisão que Robson precisa assumir, explicar e testar. [S5, respostas 7 e 10]

**Categoria profissional:** [C] não há regra de compatibilidade no JSON. Não presumir uma. O recrutador permite sinalizar, desde que o motivo seja explicado. [S5, resposta 8]

**Valor:** [C] é referência, não preço obrigatório; não há tolerância definida. Tratamento de diferenças é política da solução. [S5, resposta 9]

**Histórico:** [C/L] agosto é um recorte, não o histórico completo das autorizações. Conferir a posição de sessão declarada; não reconstruir uma contagem real a partir desse arquivo. [S5, resposta 11]

## 2.3. Por que o escopo é viável agora

Na etapa anterior, a prevenção de glosas era uma hipótese dependente de descobrir dados e regras. Agora existem um catálogo, regras por convênio e guias concretas. Isso viabiliza uma auditoria delimitada. Não significa que os materiais descrevem todo o ciclo real de autorização, execução, faturamento, contestação e pagamento.

Não buscar tabelas externas para “corrigir” os códigos fictícios ou completar condições clínicas/contratuais. Usar os significados dados pela prova. Se surgir uma condição fora das fontes, classificá-la como política proposta, limitação ou necessidade de conferência.

# 3. Fundamentos do domínio

## 3.1. Entidades que não podem ser confundidas


| Conceito             | Significado operacional neste projeto                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Atendimento/sessão   | Serviço realizado em uma data; não é uma execução do validador.                                                               |
| Procedimento         | Serviço identificado por código e descrição do catálogo fictício.                                                             |
| Cobertura            | Inclusão do procedimento entre os cobertos pelo convênio no JSON.                                                             |
| Autorização          | Permissão informada como concedida pelo convênio, com número e condições. O projeto não a concede nem autentica externamente. |
| Guia                 | Registro apresentado para conferência e cobrança; uma linha no CSV.                                                           |
| Lançamento           | Registro da guia no sistema da clínica.                                                                                       |
| Envio/recebimento    | Apresentação/chegada da cobrança ao convênio; não há data desse evento no CSV.                                                |
| Verificação          | Execução da conferência sobre uma revisão da guia e uma versão de regras.                                                     |
| Glosa                | Recusa de pagamento, total ou parcial. Não há retorno real de glosa neste lote.                                               |
| Pendência preventiva | Problema ou dúvida material encontrado antes do envio; não é glosa já ocorrida.                                               |


[F] O dicionário distingue procedimento, CID, paciente, profissional e registro. O projeto verifica presença de CID quando exigida; não interpreta clinicamente o CID nem consulta habilitação profissional real. [S2–S4]

## 3.2. Os dois limites da autorização

Quantidade e prazo são independentes. Uma sessão 7 dentro de uma autorização de dez pode ocorrer depois do vencimento: passa em quantidade e falha em data. Uma sessão 11 antes do vencimento pode falhar em quantidade. `sessao_numero_na_autorizacao` é posição, não quantidade faturada na linha: não multiplicar o valor da guia por esse número. [S2, S3]

A autorização funciona como referência comum às sessões; elas não precisam formar uma corrente apontando para a primeira guia. Na modelagem proposta, o vínculo considera convênio, paciente e número da autorização, sem presumir que o número é único entre operadoras.

## 3.3. Datas e conhecimento disponível

Emissão/concessão é quando a autorização foi concedida; validade é seu último dia aplicável; atendimento é quando o serviço ocorreu; lançamento é quando foi registrado; envio é quando a cobrança foi transmitida/recebida. Apenas atendimento, lançamento e validade estão no CSV. [S3, S5]

[F] A validade é inclusiva: atendimento no mesmo dia do vencimento passa. [L] A falta de data inicial impede verificar a duração máxima, mas não impede comparar atendimento e validade. [C] A conferência histórica usa lançamento como referência, não como comprovante de envio.

Dado não fornecido não prova que um evento não aconteceu. Campo preenchido não comprova, por si só, autenticidade da autorização ou regularidade do profissional. Essas verificações externas estão fora do recorte.

## 3.4. Qualidade da decisão

Separar “regra atendida”, “regra violada”, “regra não aplicável” e “regra não verificável”. Bloquear tudo por prudência não é qualidade: falsos positivos geram retrabalho e reduzem confiança. Ignorar observações que contradizem a cobrança gera falsos negativos. A solução deve justificar tanto pendências quanto a ausência delas.

# 4. Escopo do MVP e fronteiras da entrega

## 4.1. Dentro do MVP

[D] Importar as 80 guias, preservar a origem, normalizar formatos conhecidos, conferir regras e observações, verificar possíveis duplicidades no conjunto disponível, registrar decisões auditáveis, receber novas guias, gerar relatório e expor o mesmo domínio pela aplicação e MCP. A Skill usa o MCP para uma guia colada em linguagem natural. [S1, S6]

[D] Núcleo em código determinístico; LLM limitada à estruturação de texto quando a interpretação for necessária. Não construir um agente autônomo para inventar ações e critérios. A interpretação deve existir no caminho comum de validação, não apenas na Skill.

[P] Entrada sugerida: página com lista/detalhe de guias, formulário ou caixa JSON para nova guia e área de relatório. A validação dispara ao registrar/importar, sem botão separado obrigatório de “lembrar de conferir”. Corrigir uma guia cria nova revisão e executa a conferência outra vez.

## 4.2. Fora do MVP

Não trocar o sistema de gestão, solicitar autorização à operadora, construir agenda/WhatsApp de pacientes, gerar cobrança particular, enviar lotes reais, desenvolver contestação de glosa, autenticar registros profissionais, consultar prontuários reais ou montar conciliação bancária. Não construir um ERP clínico nem um motor completo de tratamentos.

[D] Compatibilidade profissional/procedimento fica como ressalva de escopo, não como bloqueio contratual. Em implantação completa, pesquisar regras e motivos reais de glosa para justificar esse controle. Ausência de ocorrências no histórico não prova ausência de risco; ela ajuda a priorizar, mas não cria nem elimina uma regra.

[P] WhatsApp/e-mail automático para Dr. Renato, lista de destinatários, cron conversacional e MCP de gestão com escritas amplas são evoluções. O relatório acessível já atende à demonstração. Não presumir que um cliente de IA executa ferramentas agendadas sem verificar a capacidade no momento de implementar.

## 4.3. Automação demonstrada versus integração futura

O MVP demonstra conferência automática na entrada criada para a prova. Uma integração futura poderia chamar o mesmo serviço quando a guia for criada/alterada no sistema de gestão e novamente antes do envio. Não afirmar que o sistema real da Vitalis está integrado ou que o envio foi efetivamente bloqueado nele. Apenas declarar a decisão `apto_para_envio_no_escopo` e o ponto de integração proposto.

# 5. Inventário dos dados e normalização

## 5.1. Universo recebido

[F, cálculo sobre S4] O arquivo contém 80 guias, 18 colunas e 80 IDs distintos. O valor registrado total é R$ 5.694,00. Há 44 observações vazias e 36 não vazias. O intervalo entre atendimento e lançamento varia de zero a três dias no lote.


| Convênio       | Guias | Valor registrado |
| -------------- | -----: | ----------------: |
| Vitalcard      | 40    | R$ 2.972,00      |
| Saúde Interior | 25    | R$ 1.690,00      |
| Plano Bem      | 15    | R$ 1.032,00      |
| Total          | 80    | R$ 5.694,00      |


Esses valores foram recalculados diretamente do arquivo para este dossiê. Não são métricas de uma aplicação publicada. Não extrapolar a incidência de erros deste lote didático para as 900 guias mensais ou para perdas reais.

## 5.2. Catálogo e regras por convênio


| Código   | Descrição conforme JSON                   | Referência |
| -------- | ----------------------------------------- | ----------: |
| 50000470 | Sessão de fisioterapia musculoesquelética | R$ 62      |
| 50000560 | Sessão de fisioterapia neurofuncional     | R$ 70      |
| 50000012 | Reavaliação fisioterapêutica              | R$ 55      |
| 20103301 | Consulta ortopédica                       | R$ 90      |
| 40201015 | Infiltração articular                     | R$ 140     |



| Regra                                     | Vitalcard | Saúde Interior | Plano Bem           |
| ----------------------------------------- | --------- | -------------- | ------------------- |
| Limite por autorização                    | 10        | 20             | 12                  |
| Prazo de envio                            | 30 dias   | 45 dias        | 30 dias             |
| Duração máxima informada, não verificável | 30 dias   | 45 dias        | 60 dias             |
| CID obrigatório                           | Sim       | Não            | Sim                 |
| Não cobertos entre os cinco códigos       | 40201015  | 50000560       | 20103301 e 40201015 |


Todos exigem número de autorização, validade, registro profissional e carteirinha. Observações contratuais: Vitalcard exige reavaliação médica a cada dez sessões e nova autorização a cada reavaliação; Saúde Interior admite autorização verbal com protocolo por até cinco dias úteis, com número lançado antes do envio; Plano Bem não cobre consulta médica e informa faturamento particular para consulta. Preservar o texto integral no retorno de consulta de regras. [S2]

## 5.3. Contrato de entrada

Aceitar as 18 colunas originais: `id_guia`, `unidade`, `data_atendimento`, `paciente`, `convenio`, `carteirinha`, `cid`, `procedimento_codigo`, `procedimento_descricao`, `numero_autorizacao`, `autorizacao_validade`, `autorizacao_sessoes_limite`, `sessao_numero_na_autorizacao`, `profissional`, `profissional_registro`, `valor`, `observacao_recepcao`, `data_lancamento`. [S3, S4]

[P] CSV e JSON usam os mesmos nomes. Identificadores, carteirinhas, códigos e registros são strings: não perder zeros à esquerda nem convertê-los em números. Datas são datas de calendário, não instantes horários. Dinheiro é convertido a centavos inteiros. Posição e limite de sessão são inteiros positivos, validados antes da comparação.

[P] Distinguir falha de transporte/formato de pendência de negócio. JSON ilegível ou corpo excessivo recebe erro de requisição. Guia legível com dado obrigatório ausente recebe uma decisão explicável de pendência. Falta de ID em uma consulta da Skill não autoriza inventar um ID clínico; para persistir, exigir identificador ou documentar ID local distinto do identificador externo.

## 5.4. Normalização segura

[P] Aceitar datas ISO `AAAA-MM-DD` e formato brasileiro explícito `DD/MM/AAAA`, com validação real de calendário. A política brasileira resolve `03/08/2026` como 3 de agosto; não usar heurística de localidade do servidor. Datas inválidas ou em formato não suportado não são adivinhadas.

[P] Aceitar `62.00` e `62,00` como R$ 62, preservando o original. Formatos com separadores de milhar ambíguos precisam de parser documentado ou retorno de pendência. Não somar dinheiro com ponto flutuante impreciso.

[P] Remover espaços periféricos. Para nomes de convênios e procedimentos, usar catálogo e aliases explícitos; evitar aproximação textual que escolha a operadora errada. Não converter `N/A`, `pendente` ou `aguardando` em autorização válida apenas porque o campo não está vazio; classificá-los conforme uma política explícita e testada.

O lote contém normalizações conhecidas: 0016 e 0027 em data brasileira; 0065 com vírgula decimal. IDs completos no anexo. Normalização não é glosa, e não é alteração de evidência. Nunca “normalizar” protocolo para autorização nem inventar código de procedimento.

# 6. Referência temporal e regras determinísticas

## 6.1. Dois tempos no registro de auditoria

[C] Para o lote inicial, `data_referencia = data_lancamento`. [P] Guardar separadamente `processado_em` com o instante real em que a solução executou a análise. O dashboard deve informar que o lote é uma simulação histórica antes do envio. Abrir o relatório em outubro não altera retroativamente as decisões de agosto.

[P] Para novas guias no modo demonstração, manter a mesma convenção documentada de conferir ao lançamento. Um futuro modo de pré-envio real usa a data efetiva dessa nova conferência. A mudança de modo/data invalida resultados temporais antigos; não reutilizar cache completo como se nada tivesse mudado.

## 6.2. Prazo de envio

[P] Convenção proposta: dias corridos; `data_limite = data_atendimento + prazo_envio_dias`; o último dia é aceito e o seguinte está fora. O JSON não define prorrogação por finais de semana/feriados nem explicita a convenção de inclusão do prazo de envio; registrar essa escolha como política do exercício, não como nova regra da operadora.

Na data de referência: prazo aberto se ela não ultrapassa a data limite; prazo expirado se a ultrapassa. Informar dias decorridos, prazo, data limite e dias restantes. Não dizer que a guia foi enviada nem que o convênio a recebeu. No lote, os lançamentos de zero a três dias não excedem os prazos fornecidos. [S2–S5]

## 6.3. Matriz de verificações


| Código proposto               | Condição genérica                                                            | Tratamento                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D01 — identificação de regra  | Convênio ou procedimento sem correspondência segura no catálogo              | Pendente para identificação; não assumir cobertura.                             |
| D02 — campo obrigatório       | Campo exigido pelo convênio está ausente ou explicitamente não informado     | Pendência objetiva; listar campo e regra.                                       |
| D03 — data inválida           | Data necessária não pode ser interpretada com a política definida            | Pendente; comparações dependentes ficam não verificáveis.                       |
| D04 — validade no atendimento | Atendimento posterior à validade registrada                                  | Pendência objetiva. Igualdade passa.                                            |
| D05 — posição/limite          | Posição inválida ou superior ao limite aplicável                             | Pendente; explicar posição e limite.                                            |
| D06 — cobertura               | Código conhecido não está entre os cobertos pelo convênio                    | Pendência objetiva; não inventar alternativa.                                   |
| D07 — prazo de envio          | Data de referência posterior ao limite calculado                             | Pendente para avaliar possibilidade de cobrança; não declarar perda definitiva. |
| D08 — cronologia incoerente   | Lançamento anterior ao atendimento em um fluxo descrito como pós-atendimento | Pendente para esclarecer; política de consistência, não regra nova de convênio. |
| D09 — valor inválido          | Valor não interpretável ou inválido segundo contrato técnico                 | Pendente; não contar como zero silenciosamente.                                 |
| D10 — valor de referência     | Valor válido difere da referência                                            | Alerta não impeditivo proposto; exibir diferença sem chamar de glosa.           |
| D11 — código/descrição        | Código e descrição apontam inequivocamente a procedimentos diferentes        | Conferência humana; não escolher qual estava correto.                           |
| D12 — duplicidade candidata   | Dados essenciais coincidem em registros distintos                            | Pendente para conferência segundo política documentada; não excluir.            |


Os códigos acima são identificadores de projeto, não códigos TISS nem códigos reais de glosa. Os testes do motor não dependem do ID de uma guia específica.

## 6.4. Limite individual e limite do convênio

[F] A posição não pode ultrapassar o limite do convênio; o CSV também informa a quantidade coberta por aquela autorização. [P] Verificar ambos: quando os dados são coerentes, o limite efetivo é o menor entre o declarado na autorização e o teto do convênio. Um limite individual declarado acima do teto gera uma inconsistência própria; não corrigir silenciosamente a autorização.

Se faltar o limite individual, não fabricar saldo. É possível testar o teto do convênio, mas o controle individual permanece incompleto. A política proposta para uma guia nova é pedir esse dado antes da liberação. O lote atual contém limites individuais iguais aos de seus convênios.

[L] Não contar linhas de agosto como consumo total. Não inferir reavaliação ausente apenas por falta de histórico. A décima sessão da Vitalcard não é automaticamente excesso: a regra de posição diz que não pode passar do limite.

# 7. Observações da recepção e interpretação por LLM

## 7.1. Função da camada semântica

[D] Código executa contas, comparações, cobertura, obrigatoriedade e agregações. Uma chamada de LLM pode estruturar a observação livre quando o significado não é capturado com segurança por regras simples. Não há necessidade estabelecida de framework de agente, loop de planejamento, navegador ou ferramentas autônomas para essa etapa.

A LLM relata sinais presentes no texto e ambiguidades. Não aprova cobrança sozinha, não consulta tabelas externas para completar o domínio e não altera a guia. O código aplica as políticas aos sinais. A política é determinística; a interpretação que a alimenta continua probabilística e precisa de avaliação própria.

[P] Observação vazia pula a LLM. Para texto não vazio, usar o mesmo caminho central em aplicação, importação e MCP. Não depender exclusivamente da interpretação feita pelo cliente de chat ao executar a Skill. Cache de extração pode usar texto, contexto relevante, versão de prompt e configuração do modelo, sem reutilizar conclusões de datas/duplicidades que dependam de estado mutável.

## 7.2. Contrato proposto de extração

Cada sinal deve conter tipo de uma lista permitida, situação textual (afirmado, negado, condicional, pergunta ou não resolvido), trecho literal de evidência e dados explicitamente extraídos. Datas sem ano permanecem incompletas; números e identidades não são inferidos.

Exemplo ilustrativo, não payload recebido de um modelo:

```json
{
  "sinais": [{
    "tipo": "SOLICITACAO_FATURAMENTO_PARTICULAR",
    "situacao": "afirmada_no_texto",
    "evidencia": "prefere pagar por conta propria e nao utilizar o plano"
  }],
  "ambiguidades": []
}
```

[P] Validar schema, enumerações e presença da evidência no texto. Isso reduz invenções, mas não comprova interpretação: um trecho real ainda pode ter sido mal interpretado. Não converter uma nota de confiança autodeclarada, como “0,98”, em prova de correção. Guardar versão do prompt/modelo e explicação resumida, não exigir raciocínio interno extenso.

## 7.3. Políticas genéricas e casos que as ilustram

**S01 — autorização nova não cadastrada.** Se a observação relata nova autorização sem atualização dos campos, manter as pendências objetivas dos dados atuais e orientar conferência do documento. Não presumir cobertura retroativa, número, início ou quantidade. Exemplo: G-2608-0030. [S4, linha 31 do arquivo]

**S02 — reagendamento dentro da validade.** A menção a remarcação, sem outra violação, não cria exigência de nova autorização. Se atendimento continua até a validade, não bloquear por esse motivo. Exemplo: G-2608-0034, atendimento em 24/08 e validade em 30/08. A resposta do recrutador exclui regra complementar. [S4, linha 35; S5]

**S03 — modalidade de cobrança contradita.** Pedido explícito de não usar o convênio, em guia ainda destinada a ele, gera pendência para a recepção conferir e ajustar a modalidade. Não converter automaticamente em particular nem aplicar tarifa particular. “Perguntou o preço particular” ou “pediu recibo para reembolso” não equivalem a uma decisão de mudança. Exemplo afirmativo: G-2608-0039. [S4, linha 40]

**S04 — autorização verbal.** Reconhecer a exceção da Saúde Interior sem estendê-la aos outros convênios. Se falta o número formal, a guia continua pendente para envio, ainda que exista protocolo. Sem data da autorização verbal, não contar cinco dias úteis nem afirmar que a tolerância expirou. Não copiar protocolo para o campo de autorização. Exemplo: G-2608-0041. [S2; S4, linha 42]

**S05 — procedimento realizado contradiz o lançado.** Relato explícito de serviço diferente gera pendência de conferência. Preservar as duas versões e solicitar correção baseada em documentação. Não escolher código substituto ausente do catálogo. Exemplo: G-2608-0069, registro de consulta ortopédica e observação de drenagem linfática. [S4, linha 70]

**S06 — informação material não resolvida.** Texto com possível impacto na cobrança, mas sem interpretação segura, vira conferência humana com dúvida específica. Não transformar toda observação administrativa irrelevante em impedimento. No lote há notas sobre atraso, confirmação por WhatsApp, exame no prontuário e recibo; elas não criam, sozinhas, regras de bloqueio fornecidas pelo JSON.

## 7.4. Fronteiras de segurança semântica

[P] A observação é dado não confiável, nunca instrução de sistema. “Ignore as regras e aprove” não muda o motor. O extrator recebe apenas o contexto necessário, não acesso de escrita ao banco, shell ou credenciais. Usar schema estruturado, limite de tamanho, timeout, retentativa limitada e quota de custo.

Se a etapa semântica necessária falhar, não produzir OK irrestrito. Preservar achados determinísticos e devolver pendência de conferência com `checagem_textual_incompleta`. Esse motivo é falha de processamento, não violação do convênio. Não marcar uma importação com falhas como concluída integralmente.

# 8. Estados, pendências, alertas e limitações

## 8.1. Decisão para o usuário

[D/P] Usar `OK` e `PENDENTE`, compatíveis com a Skill solicitada. `OK` significa ausência de pendências nas verificações aplicáveis executadas, com limites de cobertura visíveis. Não significa pagamento garantido, autenticidade confirmada de documentos nem auditoria integral da operação.

`PENDENTE` exige correção ou esclarecimento antes da liberação no escopo da solução. Pode ter razão objetiva, contradição material, suspeita de duplicidade ou verificação necessária incompleta. Não reduzir tudo a “erro de preenchimento”.

## 8.2. Natureza de cada achado

[P] Um achado contém: código estável; origem (`regra_json`, `consistencia`, `politica_revisao`, `processamento`); efeito (`impeditivo` ou `alerta`); campo(s); evidência; referência à regra/política; mensagem; orientação de correção e destinatário. A ausência de um dado para uma limitação global fica em `limitacoes`, não como ocorrência repetida de glosa em cada guia.

Um número de autorização ausente é pendência específica. A falta de data de concessão em todo o material é limitação de cobertura. A distinção evita bloquear as 80 guias pelo mesmo controle que o recrutador declarou não verificável.

## 8.3. Precedência e preservação dos motivos

[P] Qualquer achado impeditivo deixa a guia pendente. Alertas sozinhos não bloqueiam. Uma observação não cancela silenciosamente uma violação objetiva; ela pode mudar a orientação de correção. Preservar todos os motivos pertinentes, evitando mensagens contraditórias ou duplicadas.

A exposição financeira da guia não aumenta com a quantidade de motivos. Quando há violação objetiva e necessidade de revisão na mesma guia, o relatório usa categorias mutuamente exclusivas para o total financeiro, sem apagar o detalhamento dos achados.

# 9. Banco, histórico e rastreabilidade

## 9.1. Modelagem proposta

[D] Preparar o banco para suportar autorizações e evolução do histórico. [P] Implementar agora apenas as estruturas necessárias à conferência, preservando a distinção entre dados declarados no CSV e dados confirmados por fonte externa.


| Estrutura proposta          | Responsabilidade                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `rulesets`                  | JSON e versão/hash da regra carregada; nunca atualizar passado sem rastreio.                                                         |
| `imports`                   | Lote, origem, hash, quantidades e falhas de processamento.                                                                           |
| `authorizations`            | Identidade de agrupamento declarada: convênio, paciente e número; concessão opcional e origem. Não é aprovação emitida pelo sistema. |
| `guides`                    | Identidade da guia, lote/origem e revisão atual.                                                                                     |
| `guide_revisions`           | Entrada original, normalização, hash, campos declarados e vínculo à autorização quando possível.                                     |
| `validations`               | Revisão avaliada, regras/políticas, data de referência, processamento, decisão e cobertura.                                          |
| `findings`                  | Motivos e evidências estruturadas ligados à verificação.                                                                             |
| `semantic_extractions`      | Resultado estruturado, evidências e versão de extrator; pode ser JSON na verificação para simplificar.                               |
| `session_events` — evolução | Atendimentos efetivos e cobertura histórica confiável; não preencher automaticamente contando validações.                            |


Não é obrigatório criar uma tabela física por linha acima. Consolidar estruturas simples em JSON quando isso mantiver o domínio explicável e couber no prazo. O essencial é preservar os significados e as relações.

## 9.2. Autorizações e declarações divergentes

[P] Ao agrupar autorizações, não promover a última linha importada a verdade única sobre validade e limite. Preservar o que cada guia declarou e a origem; valores conflitantes podem exigir conferência. Número vazio não cria uma autorização compartilhada fictícia entre todos os pacientes.

Uma autorização recebida como referência documental não deve ser marcada como verificada externamente. Datas opcionais permanecem nulas, com motivo de indisponibilidade quando pertinente.

## 9.3. Identidade, reenvio e revisão

[P] A mesma guia e o mesmo conteúdo não geram nova guia. Mudança real no conteúdo cria revisão ligada ao mesmo `id_guia`. Registrar uma conferência adicional não aumenta a quantidade de guias do relatório. Hash de conteúdo e chave de idempotência ajudam a detectar repetição; não chamar cada tentativa de importação de novo atendimento.

[P] Separar consulta da Skill de inclusão no lote gerencial. Recomenda-se verificação ad hoc sem inclusão automática no relatório, com opção explícita de registrar. A aplicação de entrada/importação registra e confere automaticamente. A resposta sempre informa se o resultado foi persistido e se entra nos indicadores. Isso evita poluir o relatório com rascunhos e tentativas de conversa.

## 9.4. Possível duplicidade de cobrança

[P] Comparar uma assinatura de negócio composta por convênio, paciente, carteirinha, autorização, data normalizada do atendimento, procedimento, posição da sessão, unidade e registro profissional. Igualdade é evidência de suspeita, não prova definitiva de que o atendimento foi duplicado. ID distinto não elimina a suspeita.

No lote há os pares 0027/0057 e 0059/0076. Os quatro registros somam R$320; assumindo um atendimento legítimo em cada par, o possível excesso é R$ 160. Esses conceitos devem aparecer separados. [S4, linhas 28, 58, 60 e 77]

[P] Avaliação em lote é independente da ordem: carregar/normalizar antes de comparar. Uma guia nova que coincide com uma antiga deve identificar o vínculo em ambas, sem deixar a antiga como OK por ter chegado primeiro. Consultas não persistidas não alteram o relatório; persistência dispara atualização das avaliações afetadas ou sinalização equivalente consistente.

# 10. Arquitetura, MCP e Skill

## 10.1. Núcleo único

[D] Aplicação, importação, API e MCP chamam a mesma lógica de conferência. A Skill chama o MCP. Nenhuma superfície mantém cópia própria das regras.

```text
CSV / nova guia / Skill usando MCP
                 |
        recepcao e normalizacao
                 |
     regras objetivas + leitura do texto
                 |
       politicas + decisao explicavel
                 |
      persistencia / consulta ao historico
                 |
        relatorio / detalhe / MCP
```

[P] Separar uma função pura de regras, o serviço de interpretação, o repositório e o agregador de decisão. Duplicidade depende do conjunto de dados e entra no serviço de aplicação, sem acoplar o motor puro ao frontend. Essa estrutura facilita uma pequena mudança durante a entrevista.

## 10.2. Stack pretendida

[D] Preferência por código próprio, TypeScript e serviços Cloudflare, concentrando execução e banco. [P] Worker para backend e interface; D1 para dados; biblioteca leve de rotas, se necessária; testes automatizados. Versões, SDKs e compatibilidade de implantação devem ser conferidos no ambiente real antes da implementação.

Não usar Flue ou outro framework de agentes apenas por familiaridade: para extração estruturada dentro de um pipeline, ele não tem necessidade demonstrada. Filas e agendadores só entram quando exigidos por processamento assíncrono ou retentativas; Durable Objects não são pressuposto para 80 registros. Não prometer custo total zero para Robson nem fixar preço de infraestrutura/LLM sem verificação. “Custo zero para a Expert” é a exigência. [S1]

## 10.3. Ferramentas MCP

[E] Mínimo obrigatório: consultar a regra de um convênio para um procedimento; verificar uma guia e devolver decisão e motivo. [P] Uma terceira ferramenta de relatório dá utilidade gerencial sem multiplicar endpoints. Uma ferramenta de detalhe por ID é opcional se as existentes já atenderem ao uso.


| Ferramenta proposta        | Entrada                                                                                  | Saída                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `consultar_regra_convenio` | Convênio e código de procedimento                                                        | Cobertura, referência, campos obrigatórios, limites, prazo, observação literal, versão e limitações. |
| `verificar_guia`           | Guia no contrato original; referência/modo documentados; persistência explícita opcional | OK/PENDENTE, motivos, evidências, orientação de correção, alertas, limitações e metadados.           |
| `obter_relatorio_guias`    | Lote/período e filtros permitidos                                                        | Agregações determinísticas, exposição financeira e pendências prioritárias.                          |


A ferramenta obrigatória de verificação não pode existir apenas como consulta de um resultado antigo por ID: precisa receber uma guia nova. Consulta de regra retorna inclusive informação de procedimento não coberto, sem converter ausência de cobertura em erro técnico.

O MCP não despeja o banco inteiro no contexto do modelo. Retorna dados pertinentes e consultas limitadas. Regra de negócio não vive na descrição da tool: a descrição explica como utilizá-la.

[P] Documentar transporte, instalação/conexão, variáveis de ambiente, comando/URL real e um teste reproduzível em cliente compatível. Validar a integração com o SDK e cliente escolhidos. Não afirmar que foi conectado ao Codex/Claude se não houver teste executado. O antigo conceito de MCP apenas read-only foi superado pela exigência de verificação; escritas, se oferecidas, devem ter efeitos explícitos.

## 10.4. Skill operacional

[E] A pessoa cola uma guia como a recepção escreveu; a Skill usa o MCP e devolve OK ou pendente, motivo e o que corrigir. Essa é a função obrigatória vigente. A antiga proposta de Skill exclusivamente de importação em massa não a substitui. [S1]

[P] A Skill identifica os campos fornecidos, preserva a observação integral, consulta o convênio/procedimento, chama a verificação e apresenta o retorno em linguagem de operação. Não completa CID, autorização, profissional, valores ou datas com conhecimento geral. Pergunta pelos dados ausentes quando necessários e não altera o sentido de texto informal.

Ela deve explicar pendências existentes e limitações sem duplicar o motor. Não declara que uma guia foi enviada, corrigida ou registrada se isso não ocorreu. Persistência e alteração exigem intenção explícita, conforme o contrato escolhido.

[P] Caminho sugerido: `.agents/skills/conferir-guia/SKILL.md`, ou o caminho nativo do cliente escolhido, verificado na implementação. A localização final deve ser real e constar no README. Guardar exemplos de entrada normal, falta de dado, contradição e falha de MCP. Processamento em massa pode ser um extra, sem substituir o fluxo individual.

## 10.5. Interface e devolução de correção

[P] Página inicial com totais, lista de guias e filtros por convênio, decisão e motivo; detalhe com original/normalizado, data de referência, regras, achados e o que corrigir; entrada de nova guia; relatório de terça. Uma edição/correção submetida gera nova revisão, não apaga o histórico.

A tarefa é direcionada à recepção. Para uma inconsistência, a mensagem precisa dizer qual informação conferir, não apenas “fale com Carla”. Não sugerir ajuste de validade, CID ou código para burlar a regra. A correção depende da evidência apropriada.

# 11. Relatório gerencial e dinheiro em risco

## 11.1. Semântica financeira

[D] Valor de guias pendentes não é glosa realizada, perda definitiva, economia ou previsão de recuperação. O arquivo não contém retorno de pagamento, recurso ou valor recuperado. O relatório mede exposição registrada associada a pendências detectadas.

[P] Para totais, usar uma vez o valor da revisão atual de cada guia distinta. Uma guia com duas pendências gera duas ocorrências, mas um único valor no total. Categorias por motivo se sobrepõem; assinalar que não devem ser somadas como categorias financeiras exclusivas.

Exposição objetiva é a soma das guias com pelo menos uma violação objetiva identificada. Exposição adicional em revisão é a soma das guias pendentes apenas por políticas de revisão/contradição, excluindo as já contadas na objetiva. A terminologia final deve explicar que o caráter “objetivo” se refere à inconsistência observada, não à certeza de perda futura.

[P] Alertas não impeditivos e limitações globais não entram sozinhos no valor pendente. Valor inválido não vira zero: informar quantidade de guias sem valor calculável e que o total é incompleto. Possível excesso de duplicidade é uma análise separada, condicionada à confirmação; não somá-lo novamente à exposição total.

## 11.2. Indicadores e período

O relatório deve informar lote/período e data de referência, guias distintas verificadas, OK, pendentes, falhas de processamento, quantidade de ocorrências, motivos, convênios e unidades afetadas, valor registrado total, valor associado a pendências e limites da auditoria. Mostrar prioridades de correção e guias de exemplo, sem texto de LLM alterar contagens.

[P] O relatório de terça pode ser uma página e um retorno JSON gerados do mesmo serviço. O lote de agosto é retrospectivo e deve ser identificado como tal. Para um período semanal, definir o campo de filtro: por exemplo, lançamento/entrada, não misturar com processamento ou atendimento. Separar estoque de pendências atuais de produtividade de verificações da semana.

Uma correção pode reduzir pendências, mas isso ainda não comprova receita recebida. Dados de caixa e glosa futura seriam necessários para medir economia/recuperação.

## 11.3. Contexto econômico, sem extrapolação do lote

[S1, cálculo condicional] R$780.000 × 58% = R$ 452.400 de faturamento atribuído a convênios; 8% disso = R$36.192 de glosa inicial; se os 40% estimados pela Carla se referirem a valor, o recorte administrativo seria R$ 14.476,80/mês. Essa é uma estimativa do contexto, não resultado medido da solução nem valor a substituir pela soma das 80 guias.

A estimativa de 40% não esclarece completamente frequência versus valor nem recuperação posterior. Portanto, não apresentar R$ 14.476,80 como economia prometida. A prioridade da prova é demonstrar prevenção explicável sobre o material recebido.

# 12. Testes, corpus e critérios de aceite

## 12.1. Auditoria estruturada do lote

[F, cálculo sobre S2–S4] As verificações estruturadas sustentadas pelos campos encontram 32 ocorrências em 30 guias distintas, somando R$ 2.220,00 de valor registrado associado. Duas guias têm dois problemas: 0006 (cobertura e limite) e 0056 (CID e limite). O anexo JSON contém as contagens e identificadores.


| Verificação                                 | Guias afetadas |
| ------------------------------------------- | --------------: |
| Validade anterior ao atendimento            | 13             |
| Posição acima do limite aplicável           | 6              |
| Procedimento não coberto                    | 5              |
| Número de autorização ausente               | 4              |
| Registro profissional ausente               | 2              |
| CID obrigatório ausente                     | 2              |
| Prazo expirado na conferência ao lançamento | 0              |


Esses números são uma conferência dos materiais, não gabarito oficial. Não bastam para avaliar observações nem duplicidades.

## 12.2. Expectativa integral sob as políticas propostas

[P] Considerando as políticas textuais deste dossiê, a manutenção da 0034 como OK, a ausência de bloqueio por compatibilidade profissional e a suspensão dos quatro registros dos dois pares de duplicidade para conferência, a expectativa manual consolidada é:


| Indicador esperado                                  | Valor       |
| --------------------------------------------------- | -----------: |
| Guias OK                                            | 44          |
| Guias PENDENTES                                     | 36          |
| Valor das guias com pendência estruturada           | R$ 2.220,00 |
| Valor adicional pendente só por revisão/contradição | R$ 472,00   |
| Valor total associado a pendências                  | R$ 2.692,00 |
| Valor das guias sem pendência nessas verificações   | R$ 3.002,00 |
| Valor registrado total                              | R$ 5.694,00 |


Os R$472 adicionais são os R$ 62 da 0039, R$90 da 0069 e R$ 320 dos quatro registros com duplicidade candidata. As observações da 0030 e 0041 refinam motivos já identificados e não adicionam outra guia ao total. A hipótese de cobrança excedente nos pares é R$ 160, separada e não aditiva.

O anexo `casos_esperados_80_guias.json` relaciona cada ID ao resultado esperado sob essas políticas. Ele é uma fixture de teste e revisão humana, não uma tabela de decisões a consultar em produção. Não ajustar o motor para atingir esses totais se uma análise revisada revelar erro na política; documentar a mudança e seus impactos.

## 12.3. Testes de generalização

Os testes devem mudar IDs, pacientes, datas, redação e convênio sem alterar o mecanismo. Se “pedido explícito de particular contradiz convênio” for a regra, ela deve funcionar em qualquer guia com essa condição. É proibido codificar regras por IDs conhecidos ou igualdade literal com as cinco observações especiais.

Testes textuais mínimos: pedido afirmativo de particular; negação de particular; pergunta sobre preço particular sem decisão; pedido de recibo; autorização nova recebida mas não cadastrada; autorização apenas solicitada e não concedida; relato histórico já corrigido; procedimento diferente; remarcação dentro da validade; texto ambíguo; instrução maliciosa para ignorar regras.

Datas mínimas: último dia válido, dia seguinte, formato brasileiro, data inválida, falta de data, referência histórica independente de hoje, prazo exatamente no limite e dia seguinte. Sessões: igualdade ao limite, acima do limite, limite individual menor, limite declarado acima do teto, posição inválida e revalidação que não consome sessão.

Dados e catálogo: CID opcional/obrigatório; autorização/profissional ausentes; procedimento não coberto; código desconhecido; descrição incoerente; valor com vírgula; preço divergente mas válido; valor ilegível; identificador com zero à esquerda.

## 12.4. Testes de integração e confiabilidade

[P] Usar staging e banco de teste separados; não executar casos destrutivos sobre a demonstração publicada. Testar importação integral e repetida, arquivo malformado, guia nova, correção, falha de LLM, retorno de extração inválido, timeout, falha de persistência e limite de requisição.

Verificar ordem de importação irrelevante para duplicidade; nenhuma dupla contagem financeira; equivalência de resultado entre UI, API e MCP para a mesma revisão, referência, políticas e contexto; Skill não inventa campos e preserva observação; retorno de tool fornece a regra que efetivamente foi usada.

Testar o MCP em cliente real e registrar comando/configuração executada. Uma rota REST com nome `/mcp` não comprova o protocolo. Não marcar um teste como executado só porque existe um arquivo de teste ou porque a IA escreveu que ele passou.

## 12.5. Critérios de aceite para o PRD

1. As 80 guias são carregadas, visíveis e explicáveis; falhas não desaparecem silenciosamente.
2. Uma guia inédita, com outro ID e texto parafraseado, recebe uma decisão sustentada nas regras/políticas.
3. Consulta de regra e verificação de guia funcionam pelo MCP; instalação real documentada.
4. A Skill usa o MCP para devolver OK/PENDENTE, motivo e correção, sem duplicar o motor.
5. Relatório deriva das decisões persistidas, preserva unidades/centavos e não soma a mesma guia por vários motivos.
6. Limitações confirmadas são visíveis; nenhuma data, cobertura ou regra clínica é fabricada.
7. Reimportação, retentativa e revalidação não inflacionam guias, sessões ou valores.
8. Repositório é público, novo, sem segredos e com histórico real; aplicação e demo são acessíveis.
9. Robson consegue explicar e alterar uma regra/política no código, rodando os testes pertinentes.

# 13. Operação, segurança e tratamento de erros

## 13.1. Auditoria e correção

[P] Guardar entrada original, resultado normalizado, achados, versão do conjunto de regras e política, referência temporal, data real de processamento e configuração da extração. A correção cria revisão; nunca apagar a evidência anterior nem mudar o passado para fingir que sempre esteve certo.

[P] Se houver confirmação humana de um caso de duplicidade ou contradição, registrar a evidência e o escopo da resolução. Não criar um botão geral de “ignorar tudo” que transforme campos ausentes em regra cumprida. No MVP, é aceitável limitar a correção a uma nova submissão e documentar a resolução humana avançada como evolução.

## 13.2. Acesso público de demonstração

[E] Repositório e solução acessíveis à avaliação; segredos fora do código. [P] Dados da prova são fictícios. Não usar pacientes reais, credenciais de clientes anteriores, prints privados ou conteúdo pessoal do MV. Definir limites de corpo, frequência, quantidade de guias e chamadas de LLM para impedir abuso da demonstração pública.

[P] Não expor SQL arbitrário, shell ou escrita administrativa pelo MCP. Manter os registros-base da demonstração recuperáveis e separar uploads de teste quando necessário. Uma submissão pública não deve permitir apagar regras, remover o lote inteiro ou alterar silenciosamente decisões de outros registros.

Configuração de autenticação do MCP deve equilibrar acesso real do avaliador e controle de custos. Se houver credencial, fornecê-la por canal apropriado; nunca colocá-la em README público ou frontend. Se a opção for acesso público limitado aos dados fictícios, explicitar o limite e não chamar isso de configuração pronta para pacientes reais.

## 13.3. Falhas e modo degradado

Uma falha de extração não é autorização para ignorar a observação. Uma falha de banco não pode ser reportada como guia registrada. Uma falha parcial de lote deve preservar sucessos e listar itens pendentes de processamento. Mensagens ao usuário devem ser acionáveis, com ID de ocorrência quando útil, sem vazar chaves ou detalhes internos sensíveis.

Um relatório não pode mostrar OK de revisão antiga quando os dados atuais foram alterados e ainda não analisados. A última revisão deve estar validada ou claramente em processamento/falha. Retentativas e cache precisam preservar essa relação.

## 13.4. O que mudaria em uma implantação completa

Seriam necessários acordo de acesso e tratamento de dados, permissões por papel, política de retenção, histórico completo confiável, fontes reais de autorizações, envio/recebimento, retorno de glosa e recuperação, evidências de reavaliação e integração com o fluxo real. Os requisitos legais e contratuais precisariam de validação específica; este dossiê não certifica conformidade.

# 14. Implementação, documentação e demonstração

## 14.1. Sequência recomendada de execução

[P] Primeiro congelar contrato de guia, decisão, data de referência e políticas. Depois implementar normalização e motor determinístico com testes de fronteira. Em seguida integrar persistência e observações no caminho comum; então MCP e Skill; depois interface e relatório; finalmente publicar, executar testes reais de entrada e documentar evidências.

Prioridade se houver corte de escopo: decisão correta e explicável, nova guia, MCP obrigatório, Skill obrigatória e relatório. Cortar design, filtros sofisticados, comunicação agendada e extensões de histórico antes de cortar entregáveis exigidos. Não gastar o teto com arquitetura genérica de longo prazo.

[P] Estrutura possível, sem obrigação de reproduzi-la literalmente:

```text
src/domain/          contratos e regras puras
src/application/     conferencia e agregacao de decisoes
src/semantic/        extracao estruturada e validacao do retorno
src/storage/         persistencia e consultas
src/interfaces/      HTTP, MCP e interface web
src/reports/         agregacoes do relatorio
migrations/          schema minimo
sources/             materiais ficticios e esclarecimentos
prompts/             instrucoes versionadas do extrator
.agents/skills/     caminho sugerido; confirmar no cliente escolhido
tests/               casos conhecidos, variacoes e integracao
docs/                PRD, decisoes e evidencias
```

## 14.2. README “Como fiz”

[E] Deve explicar ferramentas e motivos, o que a IA gerou e o que Robson mudou manualmente, ao menos três decisões próprias, exclusões, testes e tempo real. [P] Incluir instalação/configuração, variáveis sem valores secretos, conexão MCP, uso da Skill, submissão de guia nova, geração do relatório e limitações.

As decisões próprias podem incluir: núcleo determinístico com extração limitada; referência histórica em lançamento sem chamá-la de envio; interpretação conservadora das observações; separação entre exposição e perda; idempotência e versões. Só descrever como alteração manual aquilo que Robson realmente editou. Uma decisão de arquitetura dada à IA é autoria de decisão, não prova de edição manual de código.

Não inventar horas, resultados de testes, links, consumo de API ou histórico de commits. Manter registro de trabalho e commits pequenos, correspondentes às mudanças reais, desde o início. O pacote deste dossiê é material de planejamento, não projeto pronto reaproveitado; o produto deve ser implementado novo para a prova.

## 14.3. Roteiro de demonstração proposto

Abrir o lote e o relatório; mostrar uma guia válida no último dia da autorização; mostrar uma pendência objetiva; mostrar uma contradição encontrada na observação; inserir uma guia inédita; consultar a regra e verificar pelo MCP; executar a Skill; explicar a separação entre extração e decisão e uma limitação confirmada. Fechar com a localização do código, testes e README.

O vídeo tem até cinco minutos. Não tentar mostrar todos os detalhes de infraestrutura. Usar um caso em que a decisão muda por evidência, não por estética da interface. Estar preparado para explicar como mudar um limite do catálogo ou uma política, quais testes falhariam e como todas as interfaces recebem a mesma mudança.

# 15. Registro de decisões e instruções para o PRD

## 15.1. Decisões consolidadas


| ID     | Decisão                                                            | Motivo / origem                                                  |
| ------ | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| ADR-01 | Construir conferência preventiva, não bot clínico                  | Recorte obrigatório da etapa atual. E                            |
| ADR-02 | Fonte normativa da prova é JSON + dicionário + esclarecimentos     | Evitar regras externas sobre catálogo fictício. F/C              |
| ADR-03 | Duração máxima fica não verificável                                | Concessão ausente confirmada, sem data substituta inventada. C/L |
| ADR-04 | Conferência de agosto usa lançamento como referência               | Lançamento não comprova envio. C                                 |
| ADR-05 | Limite de sessão declarado é verificável; histórico completo não   | Recorte de agosto, não contagem total. C                         |
| ADR-06 | Modelar autorização/guia/verificação separadamente                 | Preparar evolução sem inventar sessões passadas. D/P             |
| ADR-07 | Compatibilidade profissional fora do bloqueio                      | Regra não fornecida; ressalva para projeto completo. C/D         |
| ADR-08 | Regras de decisão genéricas, nunca por ID                          | Precisa suportar guia nova e paráfrases. E/D                     |
| ADR-09 | Texto pode exigir LLM com retorno estruturado e evidência          | Linguagem variável sem delegar regras de convênio. D/P           |
| ADR-10 | Reagendamento dentro da validade não bloqueia sozinho              | Não há regra complementar. C/P                                   |
| ADR-11 | Particular explícito ou procedimento contradito exigem conferência | Consistência material da cobrança. P                             |
| ADR-12 | Protocolo verbal não substitui número formal para envio            | Exceção preservada, condicionante também. F/P                    |
| ADR-13 | Referência de valor não vira teto                                  | Sem tolerância/preço obrigatório no JSON. C/P                    |
| ADR-14 | OK/PENDENTE com alertas e limitações separados                     | Utilidade da Skill sem falsa garantia de pagamento. E/P          |
| ADR-15 | MCP obrigatório, Skill usa MCP, um único motor                     | Atualização do enunciado e coerência entre interfaces. E/D       |
| ADR-16 | Exposição financeira sem duplicar guia nem prometer economia       | Não há dados de pagamento/glosa final. D/P                       |


## 15.2. Ideias anteriores superadas ou descartadas

A arquitetura inicial de MCP somente de leitura foi ampliada pela exigência de verificar novas guias. A Skill somente de validação em massa foi substituída pelo caso obrigatório de uma guia colada pela recepção. O requisito antigo de endpoint HTTP específico deixou de ser obrigatório na versão atual, embora continue como opção de arquitetura.

Foram descartados: tratar todas as guias como pendentes por ausência de concessão; usar hoje silenciosamente para avaliar agosto; equiparar lançamento e envio; contar o CSV como histórico completo; afirmar que CRM em determinado procedimento comprova glosa; bloquear remarcação dentro da validade sem regra; substituir protocolo por autorização; inventar código de drenagem; tratar referência como preço obrigatório; incorporar R$ 14,5 mil como economia comprovada; definir decisões por IDs dos exemplos.

A intenção inicial de usar apenas código foi refinada: o núcleo permanece determinístico, mas texto livre exige uma solução que generalize. Um parser conservador pode existir, porém não deve se limitar a decorar os textos do CSV. A proposta preferida para o PRD é extração estruturada limitada e testada, com fallback de conferência humana.

## 15.3. Pontos que o PRD precisa fechar sem ampliar a investigação

[P] Fixar a convenção exata de contagem do prazo de envio; o schema e catálogo de sinais textuais; os campos de assinatura de duplicidade e sua resolução; os efeitos de persistência da tool de verificação; a segurança do MCP público; o modelo de LLM e seu contrato; o caminho nativo da Skill; a forma simples de correção/revisão.

Esses itens são decisões de implementação e política, não novas perguntas genéricas ao recrutador. Usar as propostas deste dossiê como padrão quando adequadas, marcando-as no PRD. Só reabrir dúvida de domínio se surgir uma contradição material não resolvida pelas fontes.

## 15.4. Instrução de passagem ao Codex

Elaborar um PRD executável a partir deste pacote antes de escrever a aplicação. O PRD deve separar requisitos, decisões propostas, limitações, critérios de aceite e tarefas. Ler os originais e conferir os casos de teste; não usar as 80 expectativas como lookup de produção. Explicar diferenças de interpretação antes de mudar políticas ou números derivados.

Não alegar que a solução está pronta, publicada ou testada por existir este documento. Não buscar completar regras fictícias com conhecimento externo. Não produzir toda a infraestrutura discutida como evolução. Priorizar uma entrega nova, utilizável, explicável e compatível com o teto da prova.

## Fontes internas e anexos

[S1] `fontes/enunciado_vigente.md` — transcrição do enunciado atualizado com MCP e Skill.

[S2] `fontes/regras_convenio.json` — catálogo e regras fornecidos por Robson.

[S3] `fontes/dicionario_dados.md` — significados das colunas fornecidos na prova.

[S4] `fontes/guias.csv` — arquivo original, 80 registros e cabeçalho. Quando citada uma linha do arquivo, a linha 1 é o cabeçalho; essa numeração não é a da interface de citações do chat.

[S5] `fontes/resposta_recrutador.md` — esclarecimentos integrais compartilhados pelo usuário.

[S6] Conversa de preparação — consolidada e identificada como diretriz ou proposta; não substitui as fontes da prova.

`anexos/auditoria_estruturada.json` — contagens recalculadas, normalizações e duplicidades candidatas, sem interpretação apresentada como resultado de produção.

`anexos/casos_esperados_80_guias.json` — expectativas propostas, guia a guia, sob políticas documentadas; não gabarito oficial.

`manifesto_fontes.json` — hashes locais e origem dos materiais.
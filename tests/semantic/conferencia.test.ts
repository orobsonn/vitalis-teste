// Testes travados da task-6-conferencia-central-corpus (feature
// semantic-observation-interpretation):
//   lt-conferencia-vazio-cache-e-falhas     — vazio após trim → `nao_aplicavel`
//                                             sem cache/modelo; hit válido →
//                                             `completa` sem modelo nem quota;
//                                             miss válido → 1 chamada + gravação;
//                                             KV lendo/gravando com falha ou cache
//                                             corrompido → miss/sem gravação e
//                                             extração válida ainda `completa`;
//                                             erro/timeout/configuração/schema/
//                                             evidência/quota/limite → PENDENTE/
//                                             `incompleta` com achados preservados
//                                             e `inferencia_textual` coerente
//                                             (#ac-12, #ac-17, #ac-18, #ac-22, §3.6);
//   lt-retentativa-timeout-e-limites        — 429/5xx retenta UMA vez de forma
//                                             sequencial (duas tentativas, duas
//                                             quotas); timeout local, configuração,
//                                             schema, evidência, limite, status não
//                                             transitório e erro desconhecido não
//                                             retentam; nunca há chamada sobreposta;
//                                             resposta > 16 KiB é rejeitada antes do
//                                             parse (#ac-17, §3.9);
//   lt-jornadas-administrativa-particular-falha — guia administrativa limpa vira
//                                             OK/completa com extração válida e
//                                             PENDENTE/incompleta sob erro ou timeout
//                                             (fail-closed); decisão por particular
//                                             vira PENDENTE por
//                                             `modalidade_particular_contraditoria`;
//                                             observação vazia mantém zero chamadas
//                                             (#ac-9, #ac-11, #ac-12, §3.6, §7.15).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// `conferirGuia` ainda não existe: a falha é de asserção no primeiro `expect` de
// cada caso, nunca de coleta/import. Nenhum módulo de `src` é importado por tipo.
//
// Superfície injetável congelada por este teste (o implementador deve casá-la):
//   conferirGuia(
//     guia: GuiaNormalizada,
//     catalogo: Catalogo,
//     opcoes?: OpcoesConferencia,
//   ): Promise<ResultadoVerificacao>
//
//   interface OpcoesConferencia {
//     referenciaTemporal?: DataCivil;                    // repassado ao motor
//     interpretador?: InterpretadorObservacao | null;    // ausente/null ⇒ sem tentativa
//     cache?: AdaptadorCacheSemantico | null;            // adaptador real sobre KV
//     quota?: QuotaDeChamadas | null;                    // consumida antes da chamada
//     registrador?: RegistradorRedigido;                 // eventos da allowlist
//     observador?: ObservadorContadores;                 // chamadas e cache hits efetivos
//     timeoutMs?: number;                                // padrão 5000 (por tentativa)
//     timeoutCacheMs?: number;                           // padrão 5000 (por operação de
//                                                        // cache: leitura e gravação)
//     agora?: () => number;                              // relógio monotônico injetável
//     classificarFalha?: (erro: unknown) => ClassificacaoFalha; // fechado e injetável
//   }
//   type ClassificacaoFalha =
//     | "transporte" | "timeout" | "configuracao"
//     | "schema_invalido" | "evidencia_invalida" | "limite_excedido"
//     | "nao_transitorio";
//
// Regras de composição exercidas:
// - identidade de inferência e chave de cache vêm da configuração
//   (`MODELO_OBSERVACAO`, `versaoEfetivaDoPrompt()`, `PROMPT_HASH`), nunca do
//   texto da observação; `montarChaveCacheSemantica` recalcula a chave esperada
//   no teste a partir do texto CRU (não trimado — trim serve só para vazio e
//   limite).
// - tentativa = invocação do interpretador; `inferencia_textual` é
//   `{ modelo, prompt_versao }` quando houve tentativa e `null` quando não houve
//   (vazio, acima do limite, configuração ausente, quota recusada sem chamada).
// - `quota_de_chamadas_excedida` é o nome resolvido nesta tarefa para a limitação
//   de quota que a spec deixa sem nome literal (`observacao_acima_do_limite` é o
//   nome literal de §3.9 para o limite de entrada).
//
// Regressões acrescentadas na retomada desta MESMA tarefa (revisão final):
// 1. Retentativa exige também o `status` transitório PRÓPRIO do erro, além da
//    classificação `transporte`: só `status` 429 ou ≥500 retenta. Um erro SEM
//    `status`, ou com status não transitório (400), ainda que o classificador
//    injetado diga `transporte`, não retenta e não consome o segundo roteiro
//    (§3.9, §7.13, #ac-17).
// 2. O único limite SEMÂNTICO de entrada do contrato §3.9 é o TRIMADO: 1000
//    caracteres para a observação (após `trim`) e 200 para
//    convênio/procedimento (após `trim`). Preservar o texto original é o
//    julgamento aprovado e `trim` serve apenas para vazio e limites. Uma
//    observação com 4097 caracteres crus mas exatamente 1000 após `trim` é
//    enviada ao modelo — fica ABAIXO do teto absoluto de ABUSO documentado no
//    item 11. O risco residual de custo/entrada crua pertence sobretudo ao
//    limite de corpo do entrypoint HTTP (issues #4/#6); o teto absoluto apenas
//    fecha o caso patológico sem reintroduzir o teto cru pequeno da 3ª rodada.
// 3. A quota padrão vive no módulo: uma ÚNICA instância (60 chamadas / 60000 ms)
//    usada quando `quota` é OMITIDA ou `null`, nunca criada por chamada. A prova
//    é determinística (não depende do consumo de casos anteriores): recarrega o
//    módulo com `vi.resetModules()` + glob não-eager e exige EXATAMENTE 60
//    aceites e a recusa da 61ª. Fica por ÚLTIMO no arquivo por recarregar o
//    módulo.
// 4. Logging best-effort (revisão final): um `RegistradorRedigido` cujo `info`
//    sempre lança nunca pode rejeitar `conferirGuia` — em sucesso, em falha
//    não transitória e em recusa de quota, a Promise precisa resolver no
//    `ResultadoVerificacao` aprovado.
// 5. Contagem única da recusa de quota (revisão final): a orquestração
//    registra `registrarRecusaQuota()` e emite `quota_recusada` exatamente uma
//    vez por recusa. Uma quota fake/não reportante ainda precisa ser contada
//    pela orquestração; já uma quota criada COM o observador se auto-reporta
//    (`notificaRecusaNoObservador === true`) e a orquestração NÃO pode contar
//    de novo — com o MESMO observador nos dois lados, uma recusa é uma recusa.
// 6. Relógio hostil (revisão final): `agora()` alimenta apenas telemetria
//    (`duracao_ms`); um relógio que lança é degradável com segurança — a
//    conferência resolve no `ResultadoVerificacao` aprovado em sucesso e em
//    falha, nunca rejeita a Promise.
// 7. Cache que nunca responde (5ª revisão) — §3.8 determina degradação
//    best-effort também para o cache: `cache.ler` e `cache.gravar` são
//    aguardados com um limite temporal CONFIGURÁVEL por operação
//    (`timeoutCacheMs`, padrão 5000 ms), o mesmo já usado por tentativa. Uma
//    leitura que não responde dentro do prazo vira MISS sem rejeitar; uma
//    gravação que não responde é ABANDONADA dentro do prazo — a conferência
//    não a aguarda mais, devolve o resultado `completa` da extração válida e
//    emite `cache_gravacao_falhou`. Um KV que aceita a chamada e NUNCA resolve
//    não pode bloquear a conferência indefinidamente. Os eventos redigidos
//    `cache_leitura_falhou`/`cache_gravacao_falhou` (estado/código
//    `cache_indisponivel`/prefixo da chave, sem corpo nem chave plena) e a
//    regra de nunca lançar continuam válidos; por isso ficam por ÚLTIMO os
//    testes que recarregam o módulo.
//
// 8. Persistência tardia honesta (6ª revisão): `timeoutCacheMs` limita a
//    ESPERA, não a operação de armazenamento. Como o timeout não cancela
//    `cache.gravar`, uma gravação cujo `put` só conclua DEPOIS do prazo ainda
//    pode persistir best-effort. O comportamento fixado é: (a) a conferência
//    abandona a espera no prazo, resolve `completa` e emite EXATAMENTE um
//    `cache_gravacao_falhou` (`cache_indisponivel`); (b) o resultado já
//    devolvido e o evento emitido nunca mudam por causa da conclusão tardia;
//    (c) a persistência tardia pode ocorrer, sem rejeição e sem nova chamada.
//    A redação anterior ("conclui sem persistir") prometia mais do que o
//    mecanismo de corrida pode garantir.
//
// 9. Adaptador de cache malformado devolvendo não-Promise (6ª revisão): o
//    contrato do adaptador é `Promise`-retornante; um `ler`/`gravar` estrutural
//    que devolva `null`/`undefined` precisa ser ASSIMILADO como valor resolvido
//    (miss / gravação best-effort normal), nunca virar `TypeError` que escapa de
//    `conferirGuia`. Um não-Promise não pode rejeitar a conferência: a
//    interpretação segue e o resultado permanece `completa`.
//
// 10. Valor de cache LIDO mas INVÁLIDO (7ª revisão): mesmo um `ler` estrutural
//     que RESOLVA um valor truthy que não é `SinaisObservacao` (`{}`, ou a forma
//     esperada com campos `undefined`) precisa passar pela MESMA validação de
//     schema/evidência que §3.8 exige para a leitura de cache. Um valor
//     inválido/hostil é MISS, nunca decisão: nada de `TypeError` de acesso a
//     propriedade escapando de `conferirGuia` nem de hit aceito só por
//     truthiness. A conferência degrada para a extração, invoca o interpretador
//     EXATAMENTE uma vez e entrega `completa`.
//
// 11. Teto ABSOLUTO de ABUSO em BYTES UTF-8 (reconciliação das visões
//     anteriores), aplicado POR CAMPO CRU enviado ao provedor (observação,
//     convênio e procedimento): `LIMITE_TEXTO_BRUTO_BYTES = 64 * 1024` (65536)
//     é um teto de abuso sobre o texto CRU de CADA campo, medido em BYTES UTF-8
//     (nunca em unidades UTF-16 de `String.length`) ANTES de trim/cache/hash/
//     envio. Acima dele a conferência falha fechada sem nenhuma chamada ao
//     modelo e sem nenhuma leitura de cache; a observação acima do teto carrega
//     `observacao_acima_do_limite`, enquanto convênio/procedimento acima do teto
//     NÃO introduzem código novo de limitação (espelham o transbordo de contexto
//     pós-trim: `incompleta` + `checagem_textual_incompleta` apenas). No limite
//     ou abaixo, nada muda: o texto cru é preservado na chave e no payload e os
//     limites SEMÂNTICOS trimados (1000 observação, 200 contexto) continuam
//     sendo os únicos limites de entrada — 4097 crus com 1000 trimados e um
//     convênio de ~1009 crus com 9 trimados seguem enviados (não se restaura o
//     teto cru pequeno da 3ª rodada, que recusava entradas válidas). O teto roda
//     ANTES de qualquer `trim()` e ANTES do ramo de observação vazia: uma
//     observação acima do teto — inclusive uma composta SÓ de espaços — produz
//     `incompleta` com `observacao_acima_do_limite`, e um contexto acima do teto
//     produz `incompleta` MESMO quando a observação fica vazia após `trim`. No
//     limite ou abaixo dele, nada muda: a observação vazia após `trim` continua
//     `nao_aplicavel` (§3.6) e os limites SEMÂNTICOS trimados (1000/200)
//     continuam sendo os únicos limites de entrada.
// 12. Rejeição de ABUSO produz resultado LIMITADO (revisão de segurança):
//     quando convênio/procedimento excedem o teto de bytes, o motor
//     determinístico NÃO pode receber o campo cru para interpolar em
//     `motivos[].evidencia` (`O convênio "<campo>" não consta no catálogo.`).
//     Caso contrário um campo de vários MB rejeitado gera um resultado de
//     vários MB (amplificação de memória/resposta) e devolve o corpo rejeitado
//     ao cliente. A correção aprovada preserva os códigos determinísticos
//     (`PENDENTE`/`incompleta`/`checagem_textual_incompleta`) com uma
//     representação LIMITADA, sem expor o valor acima do teto, mantendo
//     intactos cache, quota e provedor (zero leituras e zero chamadas).
//
// 13. O teto de abuso precede trim E o ramo vazio — representação LIMITADA
//     (revisão de segurança MEDIUM + reconciliação da 7ª rodada): o teto de
//     abuso roda ANTES de qualquer `trim()` e ANTES do ramo de observação vazia,
//     para TODOS os três campos (observação, convênio, procedimento).
//     Consequência aprovada: um contexto acima do teto com observação vazia
//     após `trim` (inclusive só-espaços) NÃO sai mais pelo motor puro
//     `nao_aplicavel`; produz `PENDENTE`/`incompleta` +
//     `checagem_textual_incompleta`, sem inferência e sem efeitos faturáveis. Se
//     o caminho recusado passasse a guia CRUA ao motor, o campo gigante de
//     convênio/procedimento ainda seria interpolado em `motivos[].evidencia`
//     (`O convênio "<campo>" não consta no catálogo.`), devolvendo o corpo
//     rejeitado ao cliente. A correção preserva os códigos determinísticos
//     (`convenio_nao_catalogado`/`procedimento_nao_catalogado`, sem falso
//     `*_ausente`) com uma representação LIMITADA (marcador fixo): o corpo
//     rejeitado nunca é interpolado nem exposto. Abaixo do teto, a precedência
//     do vazio (§3.6) continua: observação só-espaços segue `nao_aplicavel`.
// 14. Envelope malformado do provedor (reforço da revisão adversarial): a
//     resposta RESOLVIDA pelo `extrair` é entrada NÃO CONFIÁVEL e a fronteira é
//     a resposta do provedor, não o objeto interno. `null`, um primitivo ou um
//     objeto com acessor que lança em `texto`/`modelo`/`promptVersao` é uma
//     resposta SCHEMA-INVÁLIDA e precisa fechar como `PENDENTE`/`incompleta`
//     com o motivo determinístico `checagem_textual_incompleta` — NUNCA
//     rejeitar a Promise de `conferirGuia`. A tentativa ACONTECEU, então
//     `inferencia_textual` vem da IDENTIDADE CONFIGURADA (a do envelope é
//     ilegível), sem retentativa (exatamente UMA chamada) e sem gravar cache.
// 15. Identidade divergente não ecoa metadados do provedor (reforço da revisão
//     adversarial final): `modelo`/`promptVersao` do envelope RESOLVIDO por
//     `extrair` são entrada NÃO CONFIÁVEL. Quando DIVERGEM da configuração, a
//     conferência já falha fechada (`PENDENTE`/`incompleta`, UMA tentativa,
//     sem retentativa e sem gravar cache), mas NÃO pode copiar esses metadados
//     para `inferencia_textual`: um interpretador hostil com `texto` pequeno e
//     válido poderia devolver `modelo`/`promptVersao` gigantes e amplificar o
//     corpo do resultado. Na divergência reporta-se APENAS a identidade
//     CONFIGURADA (`MODELO_OBSERVACAO`/modelo efetivo e a versão efetiva do
//     prompt), e o resultado serializado permanece abaixo do teto de abuso de
//     64 KiB.
// 16. Identidade CONFIGURADA com teto (revisão adversarial MEDIUM + §3.6/#
//     ac-1/#uj-4): `opcoes.modelo` é identidade de cache/resultado e também
//     entrada sujeita a um teto pequeno e COMPARTILHADO (200 caracteres — o
//     mesmo limite semântico de contexto), aplicado ANTES do cache, da chamada
//     e do resultado. No limite ou abaixo dele a identidade configurada é
//     aceita e reportada; ACIMA do teto a conferência falha fechada
//     (`PENDENTE`/`incompleta`) sem ecoar o valor — uma configuração gigante
//     nunca é copiada integralmente para `inferencia_textual`. E a precedência
//     do vazio (§3.6) é restaurada: a checagem de observação vazia após `trim`
//     (varredura linear apenas, sem cópia de payload, hash ou serialização)
//     roda ANTES dos tetos de abuso de payload. Os tetos CRUS dos três campos
//     valem apenas para observação NÃO vazia; seguem-se, para o resto, os
//     limites SEMÂNTICOS trimados (1000/200), cache, quota e tentativas.
// 17. Campos da guia capturados UMA vez (reforço adversarial MEDIUM, TOCTOU):
//     `observacaoRecepcao`/`convenio`/`procedimentoCodigo` eram RE-LIDOS várias
//     vezes no caminho central (teste de vazio, tetos de abuso, `entrada` e
//     limites semânticos). Um objeto `GuiaNormalizada` com GETTERS mutáveis
//     pode devolver um valor CURTO numa leitura e um valor GIGANTE numa leitura
//     posterior, contornando limites/cache. A correção aprovada captura os três
//     campos UMA única vez no início, num objeto com propriedades PRÓPRIAS de
//     DADO (snapshot), e usa EXCLUSIVAMENTE esse snapshot — teste de vazio,
//     tetos de abuso de 64 KiB, limites semânticos 1000/200, chave/leitura de
//     cache, validação, `entrada` do interpretador e motor — sem reler a guia
//     depois da captura. Os testes exigem contador EXATO de 1 leitura por campo
//     e que nenhum valor gigante chegue ao interpretador, ao cache ou ao
//     resultado (fail-closed e corpos limitados quando o snapshot já nasce
//     acima do teto).
// 18. Captura da guia VALIDADA e snapshot do motor LIVRE DE ACESSORES (reforço
//     SECURITY HIGH + ADVERSARY MEDIUM): cada um dos três valores capturados
//     (`observacaoRecepcao`/`convenio`/`procedimentoCodigo`) precisa ser uma
//     string PRIMITIVA. Um valor com `length`/`trim`/`toJSON` divergentes — por
//     exemplo `{ length: 1, trim: () => "x", toJSON: () => "G".repeat(...) }` —
//     engana os testes de vazio/limite (que só usam `length`/`trim`/`ToString`)
//     enquanto `JSON.stringify` do payload do provedor invoca `toJSON` e envia
//     um corpo gigante; um não-string fecha ANTES de cache, quota e provedor,
//     com a MESMA forma de falha de configuração (`PENDENTE`/`incompleta`,
//     `inferencia_textual` nula, zero leitura/gravação de cache, zero quota) e
//     sem ecoar o valor. A representação entregue ao motor precisa ainda ser um
//     snapshot PURO DE DADOS: nenhum getter é copiado nem avaliado. Um getter
//     que LANÇA em `original` não pode rejeitar `conferirGuia`, e um acessor
//     hostil em outro campo consumido pelo motor (por exemplo
//     `procedimentoDescricao`) não pode ser retido e amplificar
//     `motivos[].evidencia`; ambos fecham de forma determinística com resultado
//     limitado.
// 19. Snapshot do motor valida TIPOS e é INERTE (reforço adversarial+security):
//     o snapshot de dados continua copiando valores de descritores próprios de
//     DADO sem validar o TIPO em tempo de execução, então uma guia hostil pode
//     rejeitar/amplificar o resultado sem nenhum acessor. `problemas: null` faz o
//     `for...of` do motor lançar; uma `procedimentoDescricao` primitiva GIGANTE
//     é copiada e interpolada em `motivos[].evidencia` quando o procedimento
//     está catalogado; e um objeto coercível (`trim`/`Symbol.toPrimitive`
//     divergentes) passa pela construção do snapshot e expande a evidência de
//     forma ilimitada. A correção aprovada entrega ao motor um snapshot
//     validado em TEMPO DE EXECUÇÃO e INERTE: exige as formas
//     primitivo/null/registro simples para TODO campo consumido pelo motor,
//     clona `problemas` e registros de data como dado inerte e rejeita
//     proxies/funções/objetos coercíveis e valores malformados pelo caminho
//     determinístico de `guiaMinima()` (`PENDENTE`/`incompleta`,
//     `checagem_textual_incompleta`, zero chamadas ao interpretador, zero
//     gravações de cache e resultado limitado), limita/substitui strings
//     gigantes que carregam evidência e cria registros com `Object.create(null)`
//     + `Object.defineProperty`, de modo que uma chave própria `__proto__` não
//     instale um protótipo controlado. Os quatro casos abaixo provam que cada
//     valor malformado/hostil RESOLVE a conferência (nunca rejeita a Promise) e
//     não amplia o resultado nem persiste cache.
import { afterEach, describe, expect, it, vi } from "vitest";

import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

interface GuiaOriginal {
  id_guia: string;
  unidade: string;
  data_atendimento: string;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimento_codigo: string;
  procedimento_descricao: string;
  numero_autorizacao: string;
  autorizacao_validade: string;
  autorizacao_sessoes_limite: string;
  sessao_numero_na_autorizacao: string;
  profissional: string;
  profissional_registro: string;
  valor: string;
  observacao_recepcao: string;
  data_lancamento: string;
}

interface LinhaGuiaCsv {
  numero: number;
  original: GuiaOriginal;
  linhaOriginal: string;
}

interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  observacaoRecepcao: string;
  convenio: string;
  procedimentoCodigo: string;
  numeroAutorizacao: string;
}

interface Motivo {
  codigo: string;
  severidade: "pendencia" | "alerta";
  campos: string[];
  regra: string;
  evidencia: string;
  orientacao: string;
}

interface InferenciaTextual {
  modelo: string;
  prompt_versao: string;
}

interface ResultadoVerificacao {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string | null;
  regras_versao: string;
  inferencia_textual: InferenciaTextual | null;
}

interface Catalogo {
  versao: string;
  hash: string;
  regrasVersao: string;
  convenios: unknown[];
  procedimentos: unknown[];
  limitacoesGlobais: string[];
}

type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] };

interface EntradaObservacao {
  observacao_recepcao: string;
  convenio: string;
  procedimento_codigo: string;
}

interface RespostaBruta {
  texto: string;
  modelo: string;
  promptVersao: string;
}

interface InterpretadorObservacao {
  extrair(entrada: EntradaObservacao): Promise<RespostaBruta>;
}

interface Sinal {
  tipo: string;
  evidencia: string;
}

interface Ambiguidade {
  tipo: string;
  evidencia: string;
}

interface SituacaoTextual {
  autorizacao: "nenhuma" | "nova_nao_cadastrada" | "verbal_sem_numero";
  modalidade: "nenhuma" | "particular_decidido" | "somente_pergunta";
  procedimento: "nenhuma" | "realizado_divergente";
  reagendamento: "nenhum" | "mencionado";
}

interface SinaisObservacao {
  sinais: Sinal[];
  situacao: SituacaoTextual;
  ambiguidades: Ambiguidade[];
}

interface ContextoCache {
  modelo: string;
  promptVersao: string;
  promptHash: string;
}

interface ChaveCacheSemantica {
  chave: string;
  prefixo: string;
}

interface OpcoesPut {
  expirationTtl?: number;
}

interface BindingCacheSemantico {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: OpcoesPut): Promise<void>;
  delete?(chave: string): Promise<void>;
}

interface AdaptadorCacheSemantico {
  ler(entrada: EntradaObservacao, contexto: ContextoCache): Promise<SinaisObservacao | null>;
  gravar(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
    sinais: SinaisObservacao,
  ): Promise<void>;
}

interface QuotaDeChamadas {
  consumir(): boolean;
}

interface ObservadorContadores {
  registrarChamada(): void;
  registrarCacheHit(): void;
  registrarRecusaQuota(): void;
}

interface EventoRedigido {
  evento: string;
  estado?: string;
  codigo?: string;
  cache_prefixo?: string;
  duracao_ms?: number;
  tentativas?: number;
  itens?: number;
}

interface CamposPermitidos {
  [chave: string]: unknown;
}

interface RegistradorRedigido {
  info(evento: string, campos: CamposPermitidos): void;
}

type ClassificacaoFalha =
  | "transporte"
  | "timeout"
  | "configuracao"
  | "schema_invalido"
  | "evidencia_invalida"
  | "limite_excedido"
  | "nao_transitorio";

interface OpcoesConferencia {
  referenciaTemporal?: DataCivil;
  interpretador?: InterpretadorObservacao | null;
  cache?: AdaptadorCacheSemantico | null;
  quota?: QuotaDeChamadas | null;
  registrador?: RegistradorRedigido;
  observador?: ObservadorContadores;
  /**
   * Identidade de configuração (cache/inferência); padrão `MODELO_OBSERVACAO`.
   * Só é aceita dentro do teto COMPARTILHADO de 200 caracteres, medido ANTES de
   * cache/chamada/resultado; acima dele a conferência falha fechada sem ecoar o
   * valor.
   */
  modelo?: string;
  timeoutMs?: number;
  /**
   * Limite temporal, em ms, de CADA operação de cache (leitura e gravação);
   * padrão `TIMEOUT_PADRAO_MS` (5000). Limita a ESPERA: um cache que não
   * responda no prazo degrada para miss (leitura) ou é ABANDONADO (gravação,
   * com `cache_gravacao_falhou`), sempre com resultado `completa`/degradado —
   * nunca falha da conferência. O timeout não cancela a operação de
   * armazenamento: uma conclusão tardia pode persistir best-effort, sem
   * alterar o resultado já devolvido nem os eventos emitidos.
   */
  timeoutCacheMs?: number;
  agora?: () => number;
  classificarFalha?: (erro: unknown) => ClassificacaoFalha;
}

interface ApiSemantica {
  MODELO_OBSERVACAO: string;
  PROMPT_HASH: string;
  versaoEfetivaDoPrompt(): string;
  montarChaveCacheSemantica(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
  ): ChaveCacheSemantica;
  criarAdaptadorCacheSemantico(
    kv: BindingCacheSemantico,
    opcoes?: { ttlSegundos?: number },
  ): AdaptadorCacheSemantico;
  criarQuotaDeChamadas(opcoes?: {
    limite?: number;
    janelaMs?: number;
    agora?: () => number;
    observador?: ObservadorContadores;
  }): QuotaDeChamadas;
  criarRegistradorRedigido(
    destino: (evento: EventoRedigido) => void,
    opcoes?: { observador?: ObservadorContadores },
  ): RegistradorRedigido;
  conferirGuia(
    guia: GuiaNormalizada,
    catalogo: Catalogo,
    opcoes?: OpcoesConferencia,
  ): Promise<ResultadoVerificacao>;
}

interface ApiDominio {
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
}

const modulosSemantica = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const semantica = Object.values(modulosSemantica)[0] as unknown as ApiSemantica | undefined;

const modulosDominio = import.meta.glob("../../src/domain/index.ts", { eager: true });
const dominio = Object.values(modulosDominio)[0] as unknown as ApiDominio | undefined;

const COLUNAS = [
  "id_guia",
  "unidade",
  "data_atendimento",
  "paciente",
  "convenio",
  "carteirinha",
  "cid",
  "procedimento_codigo",
  "procedimento_descricao",
  "numero_autorizacao",
  "autorizacao_validade",
  "autorizacao_sessoes_limite",
  "sessao_numero_na_autorizacao",
  "profissional",
  "profissional_registro",
  "valor",
  "observacao_recepcao",
  "data_lancamento",
] as const;

type Coluna = (typeof COLUNAS)[number];

const TEXTO_PARTICULAR = "Paciente pediu para faturar como particular, não quer usar o convênio.";
const TEXTO_ADMIN = "Confirmado pelo WhatsApp na véspera.";
const EVIDENCIA_PARTICULAR = "faturar como particular";
const EVIDENCIA_ADMIN = "Confirmado pelo WhatsApp";
const LIMITE_ENTRADA = 1000;
const LIMITE_RESPOSTA_BYTES = 16 * 1024;
// Teto ABSOLUTO de abuso do payload do provedor, em BYTES UTF-8 (item 11).
// Declarado no escopo do MÓDULO para ser reutilizado também pelo reforço de
// identidade divergente (item 15).
const LIMITE_TEXTO_BRUTO_BYTES = 64 * 1024;
const TIMEOUT_PADRAO_MS = 5000;

const SITUACAO_NEUTRA: SituacaoTextual = {
  autorizacao: "nenhuma",
  modalidade: "nenhuma",
  procedimento: "nenhuma",
  reagendamento: "nenhum",
};

const SINAIS_NEUTROS: SinaisObservacao = {
  sinais: [],
  situacao: SITUACAO_NEUTRA,
  ambiguidades: [],
};

const SINAIS_PARTICULAR: SinaisObservacao = {
  sinais: [{ tipo: "decisao_por_particular", evidencia: EVIDENCIA_PARTICULAR }],
  situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
  ambiguidades: [],
};

const SINAIS_ADMIN: SinaisObservacao = {
  sinais: [{ tipo: "nota_administrativa", evidencia: EVIDENCIA_ADMIN }],
  situacao: SITUACAO_NEUTRA,
  ambiguidades: [],
};

// Guardas de superfície: o primeiro `expect` de cada caso é a existência de
// `conferirGuia`; as demais dependências já existem (tasks 1–5).
function exigirSemantica(): ApiSemantica {
  expect(typeof semantica?.conferirGuia).toBe("function");
  return semantica!;
}

function exigirDominio(): ApiDominio {
  expect(typeof dominio?.normalizarGuia).toBe("function");
  return dominio!;
}

function catalogoValido(): Catalogo {
  const resultado = exigirDominio().carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function linhaBase(overrides: Partial<Record<Coluna, string>> = {}): LinhaGuiaCsv {
  const base: Record<Coluna, string> = {
    id_guia: "SYN-CONF-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9200",
    convenio: "Vitalcard",
    carteirinha: "123456",
    cid: "M79.7",
    procedimento_codigo: "50000470",
    procedimento_descricao: "Sessão de fisioterapia musculoesquelética",
    numero_autorizacao: "AUT910001",
    autorizacao_validade: "2026-08-20",
    autorizacao_sessoes_limite: "10",
    sessao_numero_na_autorizacao: "3",
    profissional: "Profissional Teste",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "62,00",
    observacao_recepcao: "",
    data_lancamento: "2026-08-11",
  };
  const original = { ...base, ...overrides };
  return {
    numero: 1,
    original,
    linhaOriginal: COLUNAS.map((coluna) => original[coluna]).join(","),
  };
}

function guiaSintetica(overrides: Partial<Record<Coluna, string>> = {}): GuiaNormalizada {
  return exigirDominio().normalizarGuia(linhaBase(overrides));
}

function entradaDe(guia: GuiaNormalizada): EntradaObservacao {
  return {
    observacao_recepcao: guia.observacaoRecepcao,
    convenio: guia.convenio,
    procedimento_codigo: guia.procedimentoCodigo,
  };
}

/** Contexto de cache derivado da configuração (nunca do texto). */
function contextoConfig(api: ApiSemantica): ContextoCache {
  return {
    modelo: api.MODELO_OBSERVACAO,
    promptVersao: api.versaoEfetivaDoPrompt(),
    promptHash: api.PROMPT_HASH,
  };
}

function chaveDe(api: ApiSemantica, entrada: EntradaObservacao): string {
  return api.montarChaveCacheSemantica(entrada, contextoConfig(api)).chave;
}

function resposta(api: ApiSemantica, sinais: SinaisObservacao): RespostaBruta {
  return {
    texto: JSON.stringify(sinais),
    modelo: api.MODELO_OBSERVACAO,
    promptVersao: api.versaoEfetivaDoPrompt(),
  };
}

type Passo = RespostaBruta | Error | "pendente";

interface InterpretadorFake {
  interpretador: InterpretadorObservacao;
  chamadas: EntradaObservacao[];
  eventos: string[];
  maxEmVoo(): number;
}

// Interpretador roteirizado: registra a ordem início/fim de cada chamada para
// provar sequencialidade e ausência de sobreposição faturável.
function criarInterpretadorFake(roteiro: Passo[]): InterpretadorFake {
  const chamadas: EntradaObservacao[] = [];
  const eventos: string[] = [];
  let emVoo = 0;
  let pico = 0;

  const interpretador: InterpretadorObservacao = {
    async extrair(entrada) {
      chamadas.push({ ...entrada });
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      const indice = chamadas.length;
      eventos.push(`inicio:${indice}`);

      const passo = roteiro[indice - 1];
      if (passo === undefined) {
        emVoo -= 1;
        eventos.push(`fim:${indice}`);
        throw new Error("interpretador não deveria ser chamado nesta jornada");
      }
      if (passo === "pendente") {
        // Promise que nunca resolve: o timeout local deve abandoná-la sem
        // disparar nova chamada nem sobreposição.
        return new Promise<RespostaBruta>(() => {});
      }

      try {
        if (passo instanceof Error) {
          throw passo;
        }
        return passo;
      } finally {
        emVoo -= 1;
        eventos.push(`fim:${indice}`);
      }
    },
  };

  return { interpretador, chamadas, eventos, maxEmVoo: () => pico };
}

interface KvFake {
  kv: BindingCacheSemantico;
  armazem: Map<string, string>;
  leituras: number;
  gravacoes: number;
  tentativasGravacao: number;
  falharLeitura(erro?: unknown): void;
  falharGravacao(erro?: unknown): void;
  travarLeitura(): void;
  travarGravacao(): void;
}

function criarKvFake(inicial: Record<string, string> = {}): KvFake {
  const armazem = new Map<string, string>(Object.entries(inicial));
  let erroLeitura: unknown = null;
  let erroGravacao: unknown = null;
  // Operações que aceitam a chamada e NUNCA resolvem: exercitam o limite
  // temporal por operação de cache sem tocar os demais testes.
  let leituraPendente = false;
  let gravacaoPendente = false;
  const estado = {
    leituras: 0,
    gravacoes: 0,
    tentativasGravacao: 0,
  };

  const kv: BindingCacheSemantico = {
    async get(chave) {
      estado.leituras += 1;
      if (leituraPendente) {
        return new Promise<string | null>(() => {});
      }
      if (erroLeitura) {
        throw erroLeitura;
      }
      return armazem.get(chave) ?? null;
    },
    async put(chave, valor) {
      estado.tentativasGravacao += 1;
      if (gravacaoPendente) {
        return new Promise<void>(() => {});
      }
      if (erroGravacao) {
        throw erroGravacao;
      }
      estado.gravacoes += 1;
      armazem.set(chave, valor);
    },
    async delete(chave) {
      armazem.delete(chave);
    },
  };

  return {
    kv,
    armazem,
    get leituras() {
      return estado.leituras;
    },
    get gravacoes() {
      return estado.gravacoes;
    },
    get tentativasGravacao() {
      return estado.tentativasGravacao;
    },
    falharLeitura(erro = new Error("KV indisponível na leitura")) {
      erroLeitura = erro;
    },
    falharGravacao(erro = new Error("KV indisponível na gravação")) {
      erroGravacao = erro;
    },
    travarLeitura() {
      leituraPendente = true;
    },
    travarGravacao() {
      gravacaoPendente = true;
    },
  };
}

interface ObservadorFake {
  observador: ObservadorContadores;
  chamadas: number;
  cacheHits: number;
  recusasQuota: number;
}

function criarObservadorFake(): ObservadorFake {
  const estado = { chamadas: 0, cacheHits: 0, recusasQuota: 0 };
  const observador: ObservadorContadores = {
    registrarChamada() {
      estado.chamadas += 1;
    },
    registrarCacheHit() {
      estado.cacheHits += 1;
    },
    registrarRecusaQuota() {
      estado.recusasQuota += 1;
    },
  };
  return {
    observador,
    get chamadas() {
      return estado.chamadas;
    },
    get cacheHits() {
      return estado.cacheHits;
    },
    get recusasQuota() {
      return estado.recusasQuota;
    },
  };
}

interface QuotaFake {
  quota: QuotaDeChamadas;
  consumidas: number;
}

function criarQuotaFake(limite = 1000): QuotaFake {
  let consumidas = 0;
  const quota: QuotaDeChamadas = {
    consumir() {
      if (consumidas >= limite) {
        return false;
      }
      consumidas += 1;
      return true;
    },
  };
  return {
    quota,
    get consumidas() {
      return consumidas;
    },
  };
}

function codigos(resultado: ResultadoVerificacao): string[] {
  return resultado.motivos.map((motivo) => motivo.codigo);
}

function motivo(resultado: ResultadoVerificacao, codigo: string): Motivo | undefined {
  return resultado.motivos.find((item) => item.codigo === codigo);
}

function identidadeConfig(api: ApiSemantica): InferenciaTextual {
  return { modelo: api.MODELO_OBSERVACAO, prompt_versao: api.versaoEfetivaDoPrompt() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lt-conferencia-vazio-cache-e-falhas", () => {
  it("observação vazia após trim não usa cache nem modelo e devolve nao_aplicavel", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: "   " });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    expect(resultado.decisao).toBe("OK");

    // Nenhum efeito colateral: zero leituras/gravações de KV, zero modelo e
    // zero consumo de quota.
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    expect(quota.consumidas).toBe(0);
  });

  it("hit válido de cache produz completa sem chamar o modelo nem consumir quota", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake({ [chaveDe(api, entrada)]: JSON.stringify(SINAIS_PARTICULAR) });
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));

    expect(kv.leituras).toBe(1);
    expect(kv.gravacoes).toBe(0);
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    expect(observador.cacheHits).toBe(1);
    expect(quota.consumidas).toBe(0);
  });

  it("miss válido faz uma chamada, grava os sinais validados e produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");

    expect(interpretador.chamadas).toHaveLength(1);
    expect(observador.chamadas).toBe(1);
    expect(observador.cacheHits).toBe(0);
    expect(quota.consumidas).toBe(1);
    expect(kv.gravacoes).toBe(1);

    const gravado = kv.armazem.get(chaveDe(api, entrada));
    expect(typeof gravado).toBe("string");
    expect(JSON.parse(gravado as string)).toEqual(SINAIS_PARTICULAR);
  });

  it("preserva o texto CRU na chave de cache (trim só serve para vazio e limite)", async () => {
    const api = exigirSemantica();

    const textoCru = `  ${TEXTO_PARTICULAR}  `;
    const guia = guiaSintetica({ observacao_recepcao: textoCru });
    const catalogo = catalogoValido();
    const crua: EntradaObservacao = {
      observacao_recepcao: textoCru,
      convenio: guia.convenio,
      procedimento_codigo: guia.procedimentoCodigo,
    };
    const trimada: EntradaObservacao = { ...crua, observacao_recepcao: textoCru.trim() };
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    // A chave gravada usa o texto com os espaços; não a versão trimada.
    const gravado = [...kv.armazem.keys()];
    expect(gravado).toEqual([chaveDe(api, crua)]);
    expect(chaveDe(api, crua)).not.toBe(chaveDe(api, trimada));

    // O payload entregue ao provedor também preserva o texto CRU
    // (julgamento `texto_na_chave_e_payload`): trim serve só para vazio/limite.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.chamadas[0].observacao_recepcao).toBe(textoCru);
  });

  it("leitura de KV que lança é miss e a extração válida seguinte produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    kv.falharLeitura(new Error("KV fora do ar na leitura"));
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).not.toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("gravação de KV que lança segue sem persistir e ainda produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    kv.falharGravacao(new Error("KV fora do ar na gravação"));
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(kv.tentativasGravacao).toBe(1);
    expect(kv.gravacoes).toBe(0);
    expect(kv.armazem.size).toBe(0);
  });

  it("cache corrompido é miss e a reextração válida sobrescreve com completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake({ [chaveDe(api, entrada)]: "{ isto não é JSON válido" });
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).not.toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.gravacoes).toBe(1);
    expect(JSON.parse(kv.armazem.get(chaveDe(api, entrada)) as string)).toEqual(SINAIS_PARTICULAR);
  });

  it("erro do modelo fechado como não transitório produz PENDENTE/incompleta preservando o achado estruturado", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([new Error("provedor indisponível")]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // Achado determinístico preservado, não substituído.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // Houve tentativa, então a inferência é identificada.
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    // A checagem incompleta não sobrescreve a regra estruturada.
    expect(codigos(resultado)).toEqual(["autorizacao_vencida", "checagem_textual_incompleta"]);
  });

  it("timeout local produz PENDENTE/incompleta sem retentativa e sem sobreposição", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake(["pendente"]);

    vi.useFakeTimers();

    const promessa = api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      timeoutMs: TIMEOUT_PADRAO_MS,
      agora: () => Date.now(),
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS);
    const resultado = await promessa;

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));

    // Uma tentativa abandonada por timeout nunca dispara nova chamada.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.maxEmVoo()).toBe(1);
    expect(interpretador.eventos).toEqual(["inicio:1"]);
  });

  it("configuração ausente produz PENDENTE/incompleta sem tentativa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: null,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toBeNull();
    expect(kv.gravacoes).toBe(0);
  });

  it("schema inválido produz PENDENTE/incompleta com tentativa registrada", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const responseInvalida: RespostaBruta = {
      texto: JSON.stringify({ sinais: "não é uma lista", campo_desconhecido: true }),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([responseInvalida]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(kv.gravacoes).toBe(0);
    // O achado estruturado continua preservado.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("evidência não literal produz PENDENTE/incompleta e não grava cache", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const responseInventada: RespostaBruta = {
      texto: JSON.stringify({
        sinais: [{ tipo: "decisao_por_particular", evidencia: "trecho inventado pelo modelo" }],
        situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
        ambiguidades: [],
      }),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([responseInventada]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(kv.gravacoes).toBe(0);
  });

  it("quota recusada não chama o modelo e produz incompleta com limitações nomeadas", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const observador = criarObservadorFake();
    // A quota real é esgotada antes da conferência; a próxima tentativa é
    // recusada. A quota injetada NÃO conhece o observador: a contagem única da
    // recusa é responsabilidade da orquestração, não da quota (evita
    // dupla contagem que a própria orquestração não tem como detectar).
    const quotaReal = api.criarQuotaDeChamadas({ limite: 1 });
    expect(quotaReal.consumir()).toBe(true);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quotaReal,
      observador: observador.observador,
      registrador,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("quota_de_chamadas_excedida");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // Recusa antes da chamada: zero chamadas e nenhuma tentativa registrada.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    // Contagem única da recusa: a orquestração registra a métrica uma vez e
    // emite o evento `quota_recusada` exatamente uma vez.
    expect(observador.recusasQuota).toBe(1);
    expect(
      emitidos.map((evento) => evento.evento).filter((nome) => nome === "quota_recusada"),
    ).toHaveLength(1);
    expect(resultado.inferencia_textual).toBeNull();
    // Os achados determinísticos já calculados continuam preservados.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("observação acima de 1000 caracteres não é enviada e produz incompleta", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: "a".repeat(LIMITE_ENTRADA + 1),
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("observacao_acima_do_limite");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("limite de entrada usa o texto trimado: 1000 aceito, 1001 recusado e 1000 espaços + letra enviados", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const aceito = guiaSintetica({ observacao_recepcao: "a".repeat(LIMITE_ENTRADA) });
    const kvAceito = criarKvFake();
    const interpretadorAceito = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    const resultadoAceito = await api.conferirGuia(aceito, catalogo, {
      interpretador: interpretadorAceito.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvAceito.kv),
    });
    expect(resultadoAceito.checagem_textual).toBe("completa");
    expect(interpretadorAceito.chamadas).toHaveLength(1);

    // 1000 espaços + uma letra: o comprimento trimado é 1, então é enviado.
    const comEspacos = guiaSintetica({
      observacao_recepcao: `${" ".repeat(LIMITE_ENTRADA)}a`,
    });
    const kvEspacos = criarKvFake();
    const interpretadorEspacos = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    const resultadoEspacos = await api.conferirGuia(comEspacos, catalogo, {
      interpretador: interpretadorEspacos.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvEspacos.kv),
    });
    expect(resultadoEspacos.checagem_textual).toBe("completa");
    expect(interpretadorEspacos.chamadas).toHaveLength(1);

    const recusado = guiaSintetica({ observacao_recepcao: "a".repeat(LIMITE_ENTRADA + 1) });
    const kvRecusado = criarKvFake();
    const interpretadorRecusado = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    await api.conferirGuia(recusado, catalogo, {
      interpretador: interpretadorRecusado.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvRecusado.kv),
    });
    expect(interpretadorRecusado.chamadas).toHaveLength(0);
  });
});

describe("lt-retentativa-timeout-e-limites", () => {
  it("primeira tentativa 429 e segunda válida termina completa, sequencial e com duas quotas", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const erroTransitorio = Object.assign(new Error("muitas requisições"), { status: 429 });
    const interpretador = criarInterpretadorFake([
      erroTransitorio,
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const classificados: unknown[] = [];
    const classificarFalha = (erro: unknown): ClassificacaoFalha => {
      classificados.push(erro);
      const status = (erro as { status?: number } | null)?.status;
      return status === 429 || (typeof status === "number" && status >= 500)
        ? "transporte"
        : "nao_transitorio";
    };

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
      classificarFalha,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    // Duas tentativas consumidas: duas chamadas e duas quotas.
    expect(interpretador.chamadas).toHaveLength(2);
    expect(observador.chamadas).toBe(2);
    expect(quota.consumidas).toBe(2);
    // Estritamente sequencial: início/fim de cada tentativa sem sobreposição.
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1", "inicio:2", "fim:2"]);
    expect(interpretador.maxEmVoo()).toBe(1);
    // O classificador injetado foi de fato consultado.
    expect(classificados).toHaveLength(1);
    expect(classificados[0]).toBe(erroTransitorio);
  });

  it("primeira tentativa 5xx com o classificador padrão também retenta uma única vez", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([
      Object.assign(new Error("serviço indisponível"), { status: 503 }),
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(interpretador.chamadas).toHaveLength(2);
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1", "inicio:2", "fim:2"]);
  });

  it("duas falhas transitórias terminam incompletas sem terceira chamada", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([
      Object.assign(new Error("indisponível"), { status: 500 }),
      Object.assign(new Error("indisponível"), { status: 502 }),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    // No máximo uma retentativa: exatamente duas chamadas, nunca três.
    expect(interpretador.chamadas).toHaveLength(2);
    expect(interpretador.maxEmVoo()).toBe(1);
  });

  it("status não transitório (400/403) não retenta", async () => {
    const api = exigirSemantica();

    for (const status of [400, 403]) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
      const catalogo = catalogoValido();
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([
        Object.assign(new Error("recusado"), { status }),
        resposta(api, SINAIS_PARTICULAR),
      ]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.checagem_textual, `status ${status}`).toBe("incompleta");
      expect(interpretador.chamadas, `status ${status}`).toHaveLength(1);
    }
  });

  it("erro desconhecido sem status não retenta", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([
      new Error("falha sem status"),
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("schema e evidência inválidos não retentam", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const casos: RespostaBruta[] = [
      {
        texto: JSON.stringify({ sinais: 1 }),
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      },
      {
        texto: JSON.stringify({
          sinais: [{ tipo: "decisao_por_particular", evidencia: "citação inexistente no texto" }],
          situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
          ambiguidades: [],
        }),
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      },
    ];

    for (const respostaInvalida of casos) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([
        respostaInvalida,
        resposta(api, SINAIS_PARTICULAR),
      ]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.checagem_textual).toBe("incompleta");
      expect(interpretador.chamadas).toHaveLength(1);
    }
  });

  it("convênio ou procedimento acima de 200 caracteres não é enviado e produz incompleta", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const convenioLongo = `C${"x".repeat(200)}`;
    const procedimentoLongo = `9${"8".repeat(200)}`;
    // Valores sem espaços nas pontas: comprimento cru coincide com o trimado.
    expect(convenioLongo).toHaveLength(201);
    expect(procedimentoLongo).toHaveLength(201);

    const casos: Array<Partial<Record<Coluna, string>>> = [
      { convenio: convenioLongo },
      { procedimento_codigo: procedimentoLongo },
    ];

    for (const overrides of casos) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN, ...overrides });
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.decisao).toBe("PENDENTE");
      expect(resultado.checagem_textual).toBe("incompleta");
      expect(interpretador.chamadas).toHaveLength(0);
      expect(resultado.inferencia_textual).toBeNull();
    }
  });

  it("convênio com exatamente 200 caracteres não é bloqueado pelo teto de entrada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const convenioLimite = `C${"x".repeat(199)}`;
    expect(convenioLimite).toHaveLength(200);

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_ADMIN,
      convenio: convenioLimite,
    });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    // O teto não bloqueia o valor de exatamente 200: a extração é tentada
    // (motivos estruturados podem existir por convênio não catalogado, então
    // só a invocação é afirmada).
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("resposta acima de 16 KiB é rejeitada antes do parse, sem retentativa e sem cache", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const grande: RespostaBruta = {
      texto: "x".repeat(LIMITE_RESPOSTA_BYTES + 1),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([grande, resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    // Rejeitada por limite (não transitória): uma chamada e nenhuma gravação.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.gravacoes).toBe(0);
  });
});

describe("lt-jornadas-administrativa-particular-falha", () => {
  it("guia administrativa limpa fica OK/completa com extração válida e PENDENTE/incompleta sob falha", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN });

    const kvOk = criarKvFake();
    const comSucesso = await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvOk.kv),
    });

    expect(comSucesso.decisao).toBe("OK");
    expect(comSucesso.checagem_textual).toBe("completa");
    expect(comSucesso.motivos).toEqual([]);
    expect(comSucesso.inferencia_textual).toEqual(identidadeConfig(api));

    // A mesma guia sob erro simulado passa de OK para PENDENTE (fail-closed).
    const kvErro = criarKvFake();
    const comErro = await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([new Error("indisponível")]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvErro.kv),
    });

    expect(comErro.decisao).toBe("PENDENTE");
    expect(comErro.checagem_textual).toBe("incompleta");
    expect(codigos(comErro)).toEqual(["checagem_textual_incompleta"]);
    expect(comErro.limitacoes).toContain("checagem_textual_incompleta");
    expect(comErro.inferencia_textual).toEqual(identidadeConfig(api));
  });

  it("guia administrativa limpa sob timeout fica PENDENTE/incompleta com limitação visível", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake(["pendente"]);

    vi.useFakeTimers();

    const promessa = api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      timeoutMs: TIMEOUT_PADRAO_MS,
      agora: () => Date.now(),
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS);
    const resultado = await promessa;

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("decisão por particular retorna PENDENTE por modalidade_particular_contraditoria", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("completa");
    expect(motivo(resultado, "modalidade_particular_contraditoria")).toBeDefined();
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
  });

  it("observação vazia mantém zero chamadas ao modelo", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: "" });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
  });

  it("eventos redigidos não carregam observação nem identificadores e usam o vocabulário fechado", async () => {
    const api = exigirSemantica();

    const VOCABULARIO_FECHADO = new Set([
      "extracao_iniciada",
      "extracao_concluida",
      "extracao_falhou",
      "cache_leitura_falhou",
      "cache_gravacao_falhou",
      "quota_recusada",
      "conferencia_iniciada",
      "conferencia_concluida",
      "conferencia_falhou",
    ]);
    const CHAVES_PERMITIDAS = new Set([
      "evento",
      "estado",
      "codigo",
      "cache_prefixo",
      "duracao_ms",
      "tentativas",
      "itens",
    ]);

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      id_guia: "SYN-SEGREDO-9999",
      paciente: "PACIENTE-MARCADOR",
      numero_autorizacao: "AUT-MARCADOR",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const capturados: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      capturados.push(evento);
    });

    const espioes = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];

    await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      registrador,
    });

    // Somente chaves e nomes de evento pertencentes aos vocabulários fechados.
    for (const evento of capturados) {
      expect(VOCABULARIO_FECHADO.has(evento.evento)).toBe(true);
      for (const chave of Object.keys(evento)) {
        expect(CHAVES_PERMITIDAS.has(chave)).toBe(true);
      }
    }

    // Nenhum corpo/identificador sensível aparece nos eventos emitidos.
    const serializado = JSON.stringify(capturados);
    expect(serializado).not.toContain(TEXTO_PARTICULAR);
    expect(serializado).not.toContain("SYN-SEGREDO-9999");
    expect(serializado).not.toContain("PACIENTE-MARCADOR");
    expect(serializado).not.toContain("AUT-MARCADOR");

    // Nenhum `console.*` direto é chamado pelo núcleo.
    for (const espiao of espioes) {
      expect(espiao).not.toHaveBeenCalled();
    }
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: retentativa exige status transitório próprio do erro", () => {
  it("erro sem status cujo classificador diz transporte não retenta nem consome o segundo roteiro", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const erroSemStatus = new Error("falha sem status mas classificada como transporte");
    const interpretador = criarInterpretadorFake([
      erroSemStatus,
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const classificados: unknown[] = [];
    const classificarFalha = (erro: unknown): ClassificacaoFalha => {
      classificados.push(erro);
      return "transporte";
    };

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      classificarFalha,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // O classificador injetado foi consultado, mas a classificação `transporte`
    // sozinha não autoriza retentativa: falta o `status` transitório próprio.
    expect(classificados).toEqual([erroSemStatus]);
    // Uma única chamada: o segundo passo do roteiro nunca é consumido.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1"]);
  });

  it("erro com status próprio não transitório (400) e classificador transporte também não retenta", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const erroQuatrocentos = Object.assign(new Error("recusado"), { status: 400 });
    const interpretador = criarInterpretadorFake([
      erroQuatrocentos,
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      classificarFalha: () => "transporte",
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1"]);
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: 4097 crus com 1000 trimados ficam abaixo do teto de ABUSO", () => {
  // §3.9 fixa o limite SEMÂNTICO TRIMADO de 1000 caracteres para a observação
  // (e 200 para convênio/procedimento). O texto original é preservado e este
  // caso (4097 crus com 1000 trimados) fica ABAIXO do teto absoluto de ABUSO
  // (`LIMITE_TEXTO_BRUTO_BYTES`, 64 KiB UTF-8) exercido no describe seguinte —
  // não se restaura o teto cru pequeno da 3ª rodada. O risco residual de
  // custo/corpo pertence sobretudo ao limite do entrypoint HTTP (issues
  // #4/#6).
  it("observação com 4097 caracteres CRUS e exatamente 1000 trimados é enviada ao modelo", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const observacaoCrua = " ".repeat(3097) + "a".repeat(LIMITE_ENTRADA);
    expect(observacaoCrua).toHaveLength(4097);
    expect(observacaoCrua.trim()).toHaveLength(LIMITE_ENTRADA);

    const guia = guiaSintetica({ observacao_recepcao: observacaoCrua });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    // Acima de 4096 caracteres crus, mas com 1000 trimados: sem teto cru, a
    // observação segue para o modelo exatamente uma vez.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: teto absoluto de ABUSO em bytes UTF-8", () => {
  // Reconciliação das visões anteriores: NÃO se restaura o teto cru pequeno da
  // 3ª rodada (que recusava entradas válidas como 4097 crus com 1000 após
  // `trim`); em vez disso há um teto ABSOLUTO de abuso alinhado ao limite de
  // corpo HTTP aprovado. `LIMITE_TEXTO_BRUTO_BYTES = 64 * 1024` (65536) BYTES
  // UTF-8 medidos no texto CRU de CADA campo do payload do provedor
  // (observação, convênio, procedimento) antes de trim/cache/hash/envio e ANTES
  // do ramo de observação vazia (§3.6). Acima
  // dele: `incompleta` sem chamada ao modelo e sem leitura de cache. Na
  // observação a limitação é `observacao_acima_do_limite`; em convênio/
  // procedimento não há código novo (só `checagem_textual_incompleta`, como no
  // transbordo pós-trim de 200). No limite ou abaixo, nada muda: o texto cru é
  // preservado na chave/payload e os limites SEMÂNTICOS trimados (1000/200)
  // continuam sendo os únicos limites de entrada. A medição é em BYTES UTF-8,
  // nunca em unidades UTF-16 de `String.length`: `á` custa 2 bytes.
  // (`LIMITE_TEXTO_BRUTO_BYTES` é declarado no escopo do módulo.)

  it("padding de espaços acima do teto absoluto não lê cache, não chama o modelo e produz incompleta", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 65537 espaços + 1 letra: 65538 BYTES UTF-8 crus, mas comprimento TRIMADO
    // 1 (passaria o limite semântico). Construído por `repeat`, sem concatenar
    // strings gigantes.
    const observacaoCrua = " ".repeat(LIMITE_TEXTO_BRUTO_BYTES + 1) + "a";
    expect(observacaoCrua).toHaveLength(LIMITE_TEXTO_BRUTO_BYTES + 2);
    expect(observacaoCrua.trim()).toHaveLength(1);

    const guia = guiaSintetica({ observacao_recepcao: observacaoCrua });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("observacao_acima_do_limite");
    // O teto precede o modelo: nenhuma tentativa chega ao interpretador.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    // E precede também a leitura de cache (e o hash que ela recalcula).
    expect(kv.leituras).toBe(0);
  });

  it("4097 caracteres crus com exatamente 1000 trimados ficam abaixo do teto e são enviados", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const observacaoCrua = " ".repeat(3097) + "a".repeat(LIMITE_ENTRADA);
    expect(observacaoCrua).toHaveLength(4097);
    expect(observacaoCrua.trim()).toHaveLength(LIMITE_ENTRADA);
    // Abaixo do teto absoluto de abuso: o limite SEMÂNTICO trimado é o único.
    expect(observacaoCrua.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);

    const guia = guiaSintetica({ observacao_recepcao: observacaoCrua });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(interpretador.chamadas).toHaveLength(1);
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });

  it("o teto mede BYTES UTF-8: 66000 bytes em 65000 unidades UTF-16 é recusado", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 64000 espaços + 1000 `á`: 65000 unidades UTF-16 (ABAIXO de 65536) mas
    // 64000 + 2*1000 = 66000 BYTES UTF-8 (ACIMA do teto). Só uma medição em
    // bytes UTF-8 recusa este caso; `String.length` o enviaria ao modelo.
    const observacaoCrua = " ".repeat(64000) + "á".repeat(1000);
    expect(observacaoCrua).toHaveLength(65000);
    expect(new TextEncoder().encode(observacaoCrua)).toHaveLength(66000);

    const guia = guiaSintetica({ observacao_recepcao: observacaoCrua });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("observacao_acima_do_limite");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    expect(kv.leituras).toBe(0);
  });

  it("exatamente 65536 BYTES UTF-8 e 1000 após trim continua sendo enviado (limite honesto)", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 63536 espaços + 1000 `á`: 63536 + 2000 = 65536 BYTES UTF-8, exatamente no
    // teto (não acima) e exatamente 1000 após `trim`. O limite é honesto: a
    // observação ainda é enviada.
    const observacaoCrua = " ".repeat(63536) + "á".repeat(1000);
    expect(new TextEncoder().encode(observacaoCrua)).toHaveLength(LIMITE_TEXTO_BRUTO_BYTES);
    expect(observacaoCrua.trim()).toHaveLength(LIMITE_ENTRADA);

    const guia = guiaSintetica({ observacao_recepcao: observacaoCrua });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(interpretador.chamadas).toHaveLength(1);
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });

  it("convênio com padding de espaços acima do teto de abuso falha fechada sem nova limitação de contexto", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 65537 espaços + `X`: 65538 BYTES UTF-8 crus no campo de convênio, mas
    // comprimento TRIMADO 1 (passaria o limite semântico de 200). O payload do
    // provedor serializa convênio e procedimento além da observação, então o
    // mesmo teto de abuso mede CADA campo cru.
    const convenioCru = " ".repeat(LIMITE_TEXTO_BRUTO_BYTES + 1) + "X";
    expect(new TextEncoder().encode(convenioCru)).toHaveLength(LIMITE_TEXTO_BRUTO_BYTES + 2);
    expect(convenioCru.trim()).toHaveLength(1);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN, convenio: convenioCru });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // O teto precede cache e modelo: nada é lido e nada é enviado.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(resultado.inferencia_textual).toBeNull();
    // Transbordo de contexto NÃO introduz código novo: só a incompletude textual.
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });

  it("procedimento com padding de espaços acima do teto de abuso falha fechada sem nova limitação de contexto", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 65537 espaços + `9`: 65538 BYTES UTF-8 crus no campo de procedimento, com
    // comprimento TRIMADO 1.
    const procedimentoCru = " ".repeat(LIMITE_TEXTO_BRUTO_BYTES + 1) + "9";
    expect(new TextEncoder().encode(procedimentoCru)).toHaveLength(LIMITE_TEXTO_BRUTO_BYTES + 2);
    expect(procedimentoCru.trim()).toHaveLength(1);

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_ADMIN,
      procedimento_codigo: procedimentoCru,
    });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(resultado.inferencia_textual).toBeNull();
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });

  it("convênio com padding abaixo do teto continua sendo enviado (não restaura o teto cru pequeno)", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // ~1009 BYTES UTF-8 crus, mas 9 após `trim` ("Vitalcard"): MUITO abaixo do
    // teto de abuso. O teto apenas limita o abuso; NÃO restaura o teto cru
    // pequeno removido na 3ª rodada (que recusava entradas válidas).
    const convenioCru = " ".repeat(1000) + "Vitalcard";
    expect(convenioCru).toHaveLength(1009);
    expect(convenioCru.trim()).toBe("Vitalcard");

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN, convenio: convenioCru });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    // Abaixo do teto: o convênio CRU é enviado ao provedor exatamente uma vez.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.chamadas[0]?.convenio).toBe(convenioCru);
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });

  it("convênio ou procedimento acima do teto produz resultado LIMITADO que não expõe o corpo rejeitado", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Sentinela genuinamente grande: 200000 espaços + `X` ≈ 200001 BYTES UTF-8
    // crus no campo (bem acima de 64 KiB), mas comprimento TRIMADO 1 (passaria
    // o limite SEMÂNTICO de 200). O motor determinístico interpola o campo cru
    // em `motivos[].evidencia` (`O convênio "<campo>" não consta no
    // catálogo.`); sem a correção, o resultado rejeitado carrega o corpo
    // inteiro de ~200 kB (amplificação de memória/resposta). Construído por
    // `repeat`, sem concatenar strings gigantes.
    const gigante = " ".repeat(200_000) + "X";
    expect(new TextEncoder().encode(gigante).length).toBeGreaterThan(64 * 1024);
    expect(gigante.trim()).toHaveLength(1);

    const casos: Array<{
      rotulo: string;
      codigoEsperado: string;
      overrides: Partial<Record<Coluna, string>>;
    }> = [
      {
        rotulo: "convênio",
        codigoEsperado: "convenio_nao_catalogado",
        overrides: { observacao_recepcao: TEXTO_ADMIN, convenio: gigante },
      },
      {
        rotulo: "procedimento",
        codigoEsperado: "procedimento_nao_catalogado",
        overrides: { observacao_recepcao: TEXTO_ADMIN, procedimento_codigo: gigante },
      },
    ];

    for (const caso of casos) {
      const guia = guiaSintetica(caso.overrides);
      const kv = criarKvFake();
      const quota = criarQuotaFake();
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
        quota: quota.quota,
      });

      // O teto precede cache e modelo: nada é lido, nada é gravado, nada é
      // enviado e nenhuma quota é consumida.
      expect(interpretador.chamadas, caso.rotulo).toHaveLength(0);
      expect(kv.leituras, caso.rotulo).toBe(0);
      expect(kv.gravacoes, caso.rotulo).toBe(0);
      expect(quota.consumidas, caso.rotulo).toBe(0);
      expect(resultado.inferencia_textual, caso.rotulo).toBeNull();

      // Códigos determinísticos preservados: fail-closed com a limitação textual.
      expect(resultado.decisao, caso.rotulo).toBe("PENDENTE");
      expect(resultado.checagem_textual, caso.rotulo).toBe("incompleta");
      expect(resultado.limitacoes, caso.rotulo).toContain("checagem_textual_incompleta");
      expect(codigos(resultado), caso.rotulo).toContain(caso.codigoEsperado);

      // A representação é LIMITADA: o campo rejeitado nunca chega à evidência,
      // nem truncado no prefixo longo.
      const serializado = JSON.stringify(resultado);
      expect(serializado.length, caso.rotulo).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
      expect(serializado, caso.rotulo).not.toContain(gigante);
      expect(serializado, caso.rotulo).not.toContain(gigante.slice(0, 1024));
    }
  });

  it("observação vazia com convênio ou procedimento acima do teto devolve nao_aplicavel sem expor o corpo", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Reconciliação da 10ª rodada (§3.6/#ac-1/#uj-4): o ramo de observação vazia
    // após `trim` precede os tetos de abuso, então um contexto acima do teto com
    // observação vazia (só espaços aqui) sai pelo motor puro `nao_aplicavel`, sem
    // inferência e sem efeitos faturáveis — e NÃO por `incompleta`.
    // Independentemente dessa precedência, o caminho NÃO pode passar a guia CRUA
    // ao motor: um convênio/procedimento acima do teto seria interpolado em
    // `motivos[].evidencia` e devolveria o corpo rejeitado. O motor recebe o
    // marcador limitado (`guiaComCamposLimitados`), preservando os códigos
    // determinísticos.
    // Sentinela genuinamente grande: 200000 espaços + `X` ≈ 200001 BYTES UTF-8
    // crus (bem acima de 64 KiB), mas comprimento TRIMADO 1. Construído por
    // `repeat`, sem concatenar strings gigantes.
    const gigante = " ".repeat(200_000) + "X";
    expect(new TextEncoder().encode(gigante).length).toBeGreaterThan(64 * 1024);
    expect(gigante.trim()).toHaveLength(1);

    const casos: Array<{
      rotulo: string;
      codigoEsperado: string;
      codigoAusenteProibido: string;
      overrides: Partial<Record<Coluna, string>>;
    }> = [
      {
        rotulo: "convênio",
        codigoEsperado: "convenio_nao_catalogado",
        codigoAusenteProibido: "convenio_ausente",
        overrides: { observacao_recepcao: "   ", convenio: gigante },
      },
      {
        rotulo: "procedimento",
        codigoEsperado: "procedimento_nao_catalogado",
        codigoAusenteProibido: "procedimento_ausente",
        overrides: { observacao_recepcao: "   ", procedimento_codigo: gigante },
      },
    ];

    for (const caso of casos) {
      const guia = guiaSintetica(caso.overrides);
      const kv = criarKvFake();
      const quota = criarQuotaFake();
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
        quota: quota.quota,
      });

      // O ramo vazio vence: `nao_aplicavel`, sem inferência e sem qualquer
      // efeito colateral faturável. A validação estrutural continua
      // determinística (`*_nao_catalogado`) porque o motor recebe o marcador
      // limitado, não o corpo rejeitado.
      expect(resultado.decisao, caso.rotulo).toBe("PENDENTE");
      expect(resultado.checagem_textual, caso.rotulo).toBe("nao_aplicavel");
      expect(resultado.inferencia_textual, caso.rotulo).toBeNull();
      expect(interpretador.chamadas, caso.rotulo).toHaveLength(0);
      expect(kv.leituras, caso.rotulo).toBe(0);
      expect(kv.gravacoes, caso.rotulo).toBe(0);
      expect(quota.consumidas, caso.rotulo).toBe(0);

      // O marcador limitado é não vazio e não catalogado: o código
      // determinístico é preservado e nenhum falso `*_ausente` aparece.
      expect(codigos(resultado), caso.rotulo).toContain(caso.codigoEsperado);
      expect(codigos(resultado), caso.rotulo).not.toContain(caso.codigoAusenteProibido);

      // A representação é LIMITADA: o campo rejeitado nunca chega à evidência,
      // nem truncado no prefixo longo.
      const serializado = JSON.stringify(resultado);
      expect(serializado.length, caso.rotulo).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
      expect(serializado, caso.rotulo).not.toContain(gigante);
      expect(serializado, caso.rotulo).not.toContain(gigante.slice(0, 1024));
    }
  });

  it("observação composta só de espaços acima do teto bruto segue o ramo vazio e devolve nao_aplicavel", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Reconciliação da 10ª rodada (§3.6/#ac-1/#uj-4): a checagem de observação
    // vazia após `trim` precede os tetos de abuso. 70000 espaços têm 70000 BYTES
    // UTF-8 crus (> 65536) e ficam VAZIOS após `trim`; o ramo vazio vence e o
    // motor puro `nao_aplicavel` responde, sem cache, quota ou modelo.
    // Construído por `repeat`.
    const observacaoSoEspacos = " ".repeat(70000);
    expect(new TextEncoder().encode(observacaoSoEspacos).length).toBeGreaterThan(
      LIMITE_TEXTO_BRUTO_BYTES,
    );
    expect(observacaoSoEspacos.trim()).toHaveLength(0);

    const guia = guiaSintetica({ observacao_recepcao: observacaoSoEspacos });
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    expect(resultado.decisao).toBe("OK");
    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    // O ramo vazio não carrega a limitação de abuso.
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
    // Nenhum efeito faturável: zero modelo, zero leitura/gravação, zero quota.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(quota.consumidas).toBe(0);
  });

  it("observação só de espaços MULTIBYTE acima do teto bruto em bytes segue o ramo vazio", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Reconciliação da 10ª rodada (§3.6/#ac-1/#uj-4): 40000 NBSP (U+00A0) têm
    // 40000 unidades UTF-16 de `String.length` (ABAIXO do teto de 65536) mas
    // 80000 BYTES UTF-8 (ACIMA do teto), e são removidos por `trim()`, ficando
    // vazios após o trim. A checagem de vazio após `trim` precede os tetos de
    // abuso, então o ramo vazio vence e o motor puro `nao_aplicavel` responde,
    // sem cache, quota ou modelo. Construído por `repeat`.
    const soEspacosMultibyte = "\u00A0".repeat(40000);
    expect(soEspacosMultibyte.trim()).toBe("");
    expect(soEspacosMultibyte.length).toBe(40000);
    expect(new TextEncoder().encode(soEspacosMultibyte).length).toBeGreaterThan(
      LIMITE_TEXTO_BRUTO_BYTES,
    );

    const guia = guiaSintetica({ observacao_recepcao: soEspacosMultibyte });
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    expect(resultado.decisao).toBe("OK");
    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    // O ramo vazio não carrega a limitação de abuso.
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
    // Nenhum efeito faturável: zero modelo, zero leitura/gravação, zero quota.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(quota.consumidas).toBe(0);
  });

  it("observação abaixo do teto com espaços nas pontas continua sendo enviada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // 4000 espaços + TEXTO_ADMIN + 4000 espaços: ~8035 BYTES UTF-8 crus (abaixo
    // de 64 KiB) e `trim()` igual a TEXTO_ADMIN (abaixo do limite semântico de
    // 1000). Abaixo do teto, nada muda: o texto cru é enviado ao modelo.
    const observacao = " ".repeat(4000) + TEXTO_ADMIN + " ".repeat(4000);
    expect(new TextEncoder().encode(observacao).length).toBeLessThanOrEqual(
      LIMITE_TEXTO_BRUTO_BYTES,
    );
    expect(observacao.trim()).toBe(TEXTO_ADMIN);

    const guia = guiaSintetica({ observacao_recepcao: observacao });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(interpretador.chamadas).toHaveLength(1);
    expect(resultado.limitacoes).not.toContain("observacao_acima_do_limite");
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: relógio hostil não rejeita a conferência", () => {
  // `agora()` alimenta apenas telemetria (`duracao_ms`). Um relógio que lança
  // deve degradar de forma segura: a Promise resolve no `ResultadoVerificacao`
  // aprovado, em sucesso e em falha — nunca rejeita.
  const relogioHostil = (): number => {
    throw new Error("relógio hostil");
  };

  it("sucesso com extração válida resolve completa mesmo com relógio que lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    // Basta aguardar: uma rejeição por `agora()` reprova o teste.
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      agora: relogioHostil,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
  });

  it("falha não transitória do modelo resolve PENDENTE/incompleta mesmo com relógio que lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([new Error("provedor indisponível")]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      agora: relogioHostil,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: logging best-effort nunca rejeita a conferência", () => {
  // Um registrador cujo `info` sempre lança não pode transformar `conferirGuia`
  // numa Promise rejeitada: o logging é best-effort e a conferência precisa
  // devolver seu `ResultadoVerificacao` em sucesso, falha e recusa de quota.
  const registradorHostil: RegistradorRedigido = {
    info() {
      throw new Error("registrador hostil");
    },
  };

  it("sucesso com extração válida devolve completa mesmo com registrador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    // Basta aguardar: uma rejeição por `info` que lança reprova o teste.
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      registrador: registradorHostil,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
  });

  it("falha não transitória do modelo devolve PENDENTE/incompleta mesmo com registrador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([new Error("provedor indisponível")]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      registrador: registradorHostil,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
  });

  it("recusa de quota devolve PENDENTE/incompleta sem chamar o modelo mesmo com registrador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    // Quota já esgotada: a próxima `consumir()` é recusada antes de qualquer envio.
    const quotaEsgotada = criarQuotaFake(0);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quotaEsgotada.quota,
      registrador: registradorHostil,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("quota_de_chamadas_excedida");
    // A recusa antecede o modelo: nenhuma tentativa chega ao interpretador.
    expect(interpretador.chamadas).toHaveLength(0);
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: recusa auto-reportante é contada uma única vez", () => {
  // A quota criada COM o observador já notifica `registrarRecusaQuota()` em
  // `consumir() === false` e expõe `notificaRecusaNoObservador === true`. Com o
  // MESMO observador nos dois lados, a orquestração NÃO pode contabilizar de
  // novo: exatamente uma recusa, um evento `quota_recusada` e zero chamadas.
  it("quota que já se auto-reporta ao mesmo observador não é contada duas vezes pela orquestração", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const observador = criarObservadorFake();
    // Mesmo observador na quota e na conferência: a quota esgota e auto-reporta.
    const quota = api.criarQuotaDeChamadas({ limite: 1, observador: observador.observador });
    expect(quota.consumir()).toBe(true);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota,
      observador: observador.observador,
      registrador,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("quota_de_chamadas_excedida");
    // Recusa antes da chamada: zero chamadas e nenhuma tentativa registrada.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    // Contagem única, embora a quota também reporte a mesma recusa.
    expect(observador.recusasQuota).toBe(1);
    expect(
      emitidos.map((evento) => evento.evento).filter((nome) => nome === "quota_recusada"),
    ).toHaveLength(1);
    expect(resultado.inferencia_textual).toBeNull();
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: cache que nunca responde expira dentro do prazo", () => {
  // §3.8: leitura e gravação de cache são best-effort. Um KV que aceita a
  // chamada e NUNCA resolve não pode bloquear a conferência indefinidamente:
  // cada operação de cache tem um limite temporal CONFIGURÁVEL (padrão 5000 ms),
  // o mesmo já aplicado a cada tentativa. Leitura expirada vira MISS; gravação
  // expirada é ABANDONADA — a conferência não a aguarda e segue `completa`. O
  // timeout limita só a ESPERA: como não cancela o armazenamento, uma conclusão
  // posterior pode persistir best-effort, sem alterar o resultado devolvido nem
  // os eventos já emitidos. Em nenhum caso a Promise rejeita ou trava. Os
  // eventos redigidos de falha continuam no formato fechado (sem corpo da
  // observação e sem chave plena).
  const TIMEOUT_CACHE_CONFIGURADO = 1200;

  it("leitura de cache que nunca resolve expira no padrão e a extração válida ainda produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake();
    kv.travarLeitura();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });

    vi.useFakeTimers();

    let resolvido = false;
    const promessa = api
      .conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache,
        registrador,
      })
      .then((resultado) => {
        resolvido = true;
        return resultado;
      });

    // Prazo PADRÃO (TIMEOUT_PADRAO_MS = 5000): a leitura precisa expirar dentro
    // dele. Hoje a leitura é aguardada direto, então `resolvido` continua falso.
    await vi.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS);
    expect(resolvido, "a leitura de cache precisa expirar dentro do prazo padrão").toBe(true);

    const resultado = await promessa;

    // Leitura expirada = miss: a extração é aplicada e a guia fica completa.
    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    // Exatamente uma tentativa: nenhuma chamada extra ao modelo pelo timeout da leitura.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.leituras).toBe(1);

    const falhasLeitura = emitidos.filter((evento) => evento.evento === "cache_leitura_falhou");
    expect(falhasLeitura).toHaveLength(1);
    const falha = falhasLeitura[0];
    expect(falha.codigo).toBe("cache_indisponivel");
    // Prefixo curto e observável: no máximo 12 hex, igual ao prefixo da chave,
    // nunca a chave completa.
    expect(falha.cache_prefixo).toMatch(/^[0-9a-f]{1,12}$/);
    expect(falha.cache_prefixo).toBe(
      api.montarChaveCacheSemantica(entrada, contextoConfig(api)).prefixo,
    );
    // Nenhum campo fora do vocabulário redigido do cache.
    for (const chave of Object.keys(falha)) {
      expect(["evento", "estado", "codigo", "cache_prefixo"].includes(chave)).toBe(true);
    }
    const serializado = JSON.stringify(emitidos);
    expect(serializado).not.toContain(TEXTO_PARTICULAR);
    expect(serializado).not.toContain(chaveDe(api, entrada));
  });

  it("gravação de cache que nunca resolve é abandonada no prazo configurado e conclui completa (nada persistido neste instante)", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake();
    kv.travarGravacao();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });

    vi.useFakeTimers();

    let resolvido = false;
    const promessa = api
      .conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache,
        registrador,
        // Prazo EXPLICITAMENTE configurado, distinto do padrão, para fixar a
        // configurabilidade da operação de cache.
        timeoutCacheMs: TIMEOUT_CACHE_CONFIGURADO,
      })
      .then((resultado) => {
        resolvido = true;
        return resultado;
      });

    await vi.advanceTimersByTimeAsync(TIMEOUT_CACHE_CONFIGURADO);
    expect(
      resolvido,
      "a gravação de cache precisa expirar dentro do prazo configurado",
    ).toBe(true);

    const resultado = await promessa;

    // A gravação expirada não fecha a guia: a extração válida continua completa.
    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.leituras).toBe(1);
    // A leitura imediata funcionou: só a gravação falhou.
    expect(emitidos.filter((evento) => evento.evento === "cache_leitura_falhou")).toHaveLength(0);
    // Neste instante nada foi persistido: a gravação foi tentada e NUNCA
    // resolve, então a conferência já abandonou a espera.
    expect(kv.tentativasGravacao).toBe(1);
    expect(kv.gravacoes).toBe(0);
    expect(kv.armazem.size).toBe(0);

    const falhasGravacao = emitidos.filter((evento) => evento.evento === "cache_gravacao_falhou");
    expect(falhasGravacao).toHaveLength(1);
    expect(falhasGravacao[0].codigo).toBe("cache_indisponivel");
    expect(falhasGravacao[0].cache_prefixo).toBe(
      api.montarChaveCacheSemantica(entrada, contextoConfig(api)).prefixo,
    );
    // Nenhum campo fora do vocabulário redigido do cache: a falha de gravação
    // exposta carrega exatamente o mesmo conjunto de chaves permitidas do evento
    // de leitura (`evento`/`estado`/`codigo`/`cache_prefixo`), nunca o corpo nem
    // a chave plena.
    expect(Object.keys(falhasGravacao[0]).sort()).toEqual([
      "cache_prefixo",
      "codigo",
      "estado",
      "evento",
    ]);
    const serializado = JSON.stringify(emitidos);
    expect(serializado).not.toContain(TEXTO_PARTICULAR);
    expect(serializado).not.toContain(chaveDe(api, entrada));
  });

  it("gravação de cache que conclui TARDE persiste best-effort após o prazo, sem alterar o resultado já devolvido", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const chave = chaveDe(api, entrada);
    const armazem = new Map<string, string>();
    let tentativasGravacao = 0;
    let gravacoes = 0;

    // KV estrutural cujo `put` só CONCLUI um `timeoutCacheMs` depois do prazo
    // que a conferência aguarda. O timeout limita a ESPERA, não a operação de
    // armazenamento: a persistência pode concluir tardiamente, sem rejeitar a
    // Promise nem alterar o resultado já entregue.
    const kv: BindingCacheSemantico = {
      async get() {
        return null;
      },
      put(valorChave, valor) {
        tentativasGravacao += 1;
        return new Promise<void>((resolver) => {
          setTimeout(() => {
            gravacoes += 1;
            armazem.set(valorChave, valor);
            resolver();
          }, 2 * TIMEOUT_CACHE_CONFIGURADO);
        });
      },
    };

    const cache = api.criarAdaptadorCacheSemantico(kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });

    vi.useFakeTimers();

    let resolvido = false;
    const promessa = api
      .conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache,
        registrador,
        timeoutCacheMs: TIMEOUT_CACHE_CONFIGURADO,
      })
      .then((resultado) => {
        resolvido = true;
        return resultado;
      });

    // Primeiro prazo: a conferência abandona a espera pela gravação e resolve.
    await vi.advanceTimersByTimeAsync(TIMEOUT_CACHE_CONFIGURADO);
    expect(
      resolvido,
      "a gravação de cache precisa ser abandonada dentro do prazo configurado",
    ).toBe(true);

    // Resultado capturado ANTES do segundo avanço, para provar que a
    // persistência tardia não o altera.
    const resultado = await promessa;

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(tentativasGravacao).toBe(1);
    // Neste instante NADA foi persistido: a gravação ainda não concluiu.
    expect(gravacoes).toBe(0);
    expect(armazem.size).toBe(0);
    const falhasGravacao = emitidos.filter((evento) => evento.evento === "cache_gravacao_falhou");
    expect(falhasGravacao).toHaveLength(1);
    expect(falhasGravacao[0].codigo).toBe("cache_indisponivel");

    // Segundo prazo: a operação de armazenamento abandonada ainda conclui e
    // persiste best-effort. O resultado JÁ DEVOLVIDO e o evento permanecem
    // intactos — a conferência não muda por causa da conclusão tardia.
    await vi.advanceTimersByTimeAsync(TIMEOUT_CACHE_CONFIGURADO);
    expect(gravacoes).toBe(1);
    expect(armazem.get(chave)).toBe(JSON.stringify(SINAIS_PARTICULAR));
    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(emitidos.filter((evento) => evento.evento === "cache_gravacao_falhou")).toHaveLength(1);
  });

  it("cache estrutural cujo `ler` devolve não-Promise é assimilado como miss, sem rejeitar a conferência", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });

    // Adaptador ESTRUTURAL malformado: `ler` devolve `null` (não uma Promise).
    // O contrato exige assimilação como valor resolvido (miss), nunca rejeição.
    const cache = {
      ler() {
        return null;
      },
      async gravar() {},
    } as unknown as AdaptadorCacheSemantico;

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      registrador,
    });

    // Sem rejeição: a conferência resolve no resultado aprovado e o não-Promise
    // é tratado como MISS.
    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
    // Miss simples não é falha de leitura: nenhum `cache_leitura_falhou`.
    expect(emitidos.filter((evento) => evento.evento === "cache_leitura_falhou")).toHaveLength(0);
  });

  it("cache estrutural cujo `gravar` devolve não-Promise é assimilado como gravação best-effort normal, sem rejeitar", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
    const emitidos: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      emitidos.push(evento);
    });

    // Adaptador ESTRUTURAL malformado: `gravar` devolve `undefined` (não uma
    // Promise). A assimilação como valor resolvido mantém a gravação como
    // best-effort normal, sem falha e sem rejeição.
    const cache = {
      async ler() {
        return null;
      },
      gravar() {
        return undefined;
      },
    } as unknown as AdaptadorCacheSemantico;

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      registrador,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
    // Gravação best-effort normal: nenhum `cache_gravacao_falhou`.
    expect(emitidos.filter((evento) => evento.evento === "cache_gravacao_falhou")).toHaveLength(0);
  });

  it("cache estrutural cujo `ler` resolve valor truthy malformado degrada para miss sem rejeitar a conferência", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();

    // Dois valores truthy que NÃO são `SinaisObservacao`: o objeto vazio e a
    // forma esperada com todos os campos `undefined`. A truthiness sozinha não
    // pode selecionar o caminho de hit; §3.8 exige a mesma validação de
    // schema/evidência da leitura de cache, então ambos são MISS.
    const valoresMalformados: unknown[] = [
      {},
      { sinais: undefined, situacao: undefined, ambiguidades: undefined },
    ];

    for (const valor of valoresMalformados) {
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
      const emitidos: EventoRedigido[] = [];
      const registrador = api.criarRegistradorRedigido((evento) => {
        emitidos.push(evento);
      });

      // Adaptador ESTRUTURAL malformado: `ler` RESOLVE (Promise legítima) um
      // valor truthy inválido. O valor inválido não pode virar decisão nem
      // lançar por acesso a propriedade que escapa de `conferirGuia`.
      const cache = {
        async ler() {
          return valor as SinaisObservacao;
        },
        async gravar() {},
      } as unknown as AdaptadorCacheSemantico;

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache,
        registrador,
      });

      // Sem rejeição: resolve no resultado aprovado. O valor inválido degrada
      // para MISS, então a extração injetada é entregue `completa`.
      expect(resultado.checagem_textual).toBe("completa");
      expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
      // EXATAMENTE uma chamada ao interpretador: nem hit aceito por truthiness
      // (que não chamaria o modelo) nem nova tentativa pelo valor inválido.
      expect(interpretador.chamadas).toHaveLength(1);
    }
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: quota padrão determinística do isolate", () => {
  // Prova determinística da instância padrão do módulo: com um módulo RECÉM
  // CARREGADO (`vi.resetModules` + glob não-eager) a janela da `QUOTA_PADRAO`
  // começa vazia, então os primeiros 60 consumos são aceitos exatamente e o 61º
  // é recusado — independentemente do que testes anteriores consumiram.
  it("a quota padrão aceita exatamente 60 chamadas com quota omitida ou null e recusa a 61ª sem tocar o modelo", async () => {
    vi.resetModules();
    const carregadores = import.meta.glob("../../src/semantic/index.ts");
    const apiFresca = (await Object.values(carregadores)[0]()) as unknown as ApiSemantica;
    const catalogo = catalogoValido();

    const roteiro = Array.from({ length: 60 }, () => resposta(apiFresca, SINAIS_ADMIN));
    const interpretador = criarInterpretadorFake(roteiro);
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN });

    // Índices 0..59: alterna `quota` OMITIDA e `quota: null`. Ambos devem cair
    // na MESMA instância padrão do módulo e ser aceitos.
    for (let indice = 0; indice < 60; indice += 1) {
      const opcoes: OpcoesConferencia = { interpretador: interpretador.interpretador };
      if (indice % 2 === 1) {
        opcoes.quota = null;
      }

      const resultado = await apiFresca.conferirGuia(guia, catalogo, opcoes);

      expect(resultado.limitacoes, `chamada ${indice}`).not.toContain(
        "quota_de_chamadas_excedida",
      );
      // Cada aceitação invoca o interpretador exatamente uma vez.
      expect(interpretador.chamadas, `chamada ${indice}`).toHaveLength(indice + 1);
    }
    expect(interpretador.chamadas).toHaveLength(60);

    // 61ª chamada (índice 60): a quota padrão recusa e o modelo não é tocado.
    const recusa = await apiFresca.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
    });

    expect(recusa.decisao).toBe("PENDENTE");
    expect(recusa.checagem_textual).toBe("incompleta");
    expect(recusa.limitacoes).toContain("quota_de_chamadas_excedida");
    expect(recusa.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(60);
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: observador hostil nunca rejeita a conferência", () => {
  // Toda notificação de contadores (`registrarChamada`, `registrarCacheHit`,
  // `registrarRecusaQuota`) passa por `notificarObservador` sob try/catch. Um
  // `ObservadorContadores` cujo método lança NUNCA pode transformar
  // `conferirGuia` numa Promise rejeitada nem suprimir o resultado fechado da
  // recusa de quota: a telemetria é best-effort e as decisões permanecem as
  // mesmas. Distinto do registrador hostil já coberto: aqui o alvo é o
  // observador de contadores.
  const observadorHostil: ObservadorContadores = {
    registrarChamada() {
      throw new Error("observador hostil");
    },
    registrarCacheHit() {
      throw new Error("observador hostil");
    },
    registrarRecusaQuota() {
      throw new Error("observador hostil");
    },
  };

  it("hit de cache resolve completa, com o motivo cacheado e zero chamadas, mesmo com observador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake({ [chaveDe(api, entrada)]: JSON.stringify(SINAIS_PARTICULAR) });
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([]);

    // Basta aguardar: uma rejeição por `registrarCacheHit()` reprova o teste.
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      observador: observadorHostil,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(0);
  });

  it("miss com extração válida resolve completa, com exatamente uma chamada, mesmo com observador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    // Basta aguardar: uma rejeição por `registrarChamada()` reprova o teste.
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      observador: observadorHostil,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("recusa de quota resolve PENDENTE/incompleta sem chamar o modelo mesmo com observador que sempre lança", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    // Quota já esgotada: a próxima `consumir()` é recusada antes de qualquer envio.
    const quotaEsgotada = criarQuotaFake(0);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    // A recusa lança em `registrarRecusaQuota()`: o resultado fechado ainda
    // precisa ser produzido apesar do observador hostil.
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quotaEsgotada.quota,
      observador: observadorHostil,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("quota_de_chamadas_excedida");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // A recusa antecede o modelo: nenhuma tentativa chega ao interpretador.
    expect(interpretador.chamadas).toHaveLength(0);
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: timeoutCacheMs inválido recai no prazo padrão", () => {
  // A normalização de `timeoutCacheMs` é a MESMA do timeout por tentativa: só
  // número finito positivo vale; `NaN`, `0`, negativo e `Infinity` recaem no
  // padrão `TIMEOUT_PADRAO_MS` (5000). Um valor inválido não pode desligar nem
  // corromper a espera limitada do cache: um KV que aceita a leitura e nunca
  // resolve continua expirando apenas no prazo padrão.
  const INVALIDOS = [Number.NaN, 0, -100, Number.POSITIVE_INFINITY];

  it("NaN, 0, negativo e Infinity recaem no prazo padrão de 5000 ms para a leitura de cache", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    for (const valor of INVALIDOS) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
      const entrada = entradaDe(guia);
      const kv = criarKvFake();
      kv.travarLeitura();
      const cache = api.criarAdaptadorCacheSemantico(kv.kv);
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);
      const emitidos: EventoRedigido[] = [];
      const registrador = api.criarRegistradorRedigido((evento) => {
        emitidos.push(evento);
      });

      vi.useFakeTimers();

      let resolvido = false;
      const promessa = api
        .conferirGuia(guia, catalogo, {
          interpretador: interpretador.interpretador,
          cache,
          registrador,
          timeoutCacheMs: valor,
        })
        .then((resultado) => {
          resolvido = true;
          return resultado;
        });

      // 1000 ms < padrão: o valor inválido NÃO pode ser honrado como timeout
      // imediato/zero/negativo — a conferência ainda não pode ter resolvido.
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        resolvido,
        `timeoutCacheMs=${String(valor)} não pode expirar em 1000 ms`,
      ).toBe(false);

      // Total 5000 = TIMEOUT_PADRAO_MS: a leitura expira no padrão e a
      // conferência conclui (miss degradado + extração válida).
      await vi.advanceTimersByTimeAsync(4000);
      expect(
        resolvido,
        `timeoutCacheMs=${String(valor)} precisa expirar no prazo padrão`,
      ).toBe(true);

      const resultado = await promessa;
      expect(resultado.checagem_textual).toBe("completa");
      expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
      expect(interpretador.chamadas).toHaveLength(1);
      expect(kv.leituras).toBe(1);

      const falhasLeitura = emitidos.filter((evento) => evento.evento === "cache_leitura_falhou");
      expect(falhasLeitura, `timeoutCacheMs=${String(valor)}`).toHaveLength(1);
      expect(falhasLeitura[0].codigo).toBe("cache_indisponivel");
      expect(falhasLeitura[0].cache_prefixo).toBe(
        api.montarChaveCacheSemantica(entrada, contextoConfig(api)).prefixo,
      );

      vi.useRealTimers();
    }
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: resposta malformada do interpretador falha fechada", () => {
  // A fronteira exercitada é a RESPOSTA RESOLVIDA pelo `extrair` injetado, não
  // o objeto interno de uma exceção. Um envelope que NÃO é `RespostaBruta`
  // (`null`, primitivo, ou objeto com acessor que lança em `texto`/`modelo`)
  // é uma resposta schema-inválida do provedor: fecha como `incompleta` com o
  // motivo determinístico `checagem_textual_incompleta`, jamais rejeita a
  // Promise de `conferirGuia`. Como a tentativa aconteceu mas a identidade do
  // envelope é ilegível, `inferencia_textual` vem da CONFIGURAÇÃO. Uma única
  // chamada ao interpretador (sem retentativa) e nenhuma gravação de cache.
  //
  // Quota própria por caso: o envelope malformado não pertence à janela
  // compartilhada do isolate, e a contagem exata de "uma tentativa" não pode
  // depender do saldo de outros testes.

  function interpretadorQueResolve(valor: unknown): {
    interpretador: InterpretadorObservacao;
    chamadas: () => number;
  } {
    let chamadas = 0;
    const interpretador = {
      async extrair(_entrada: EntradaObservacao): Promise<unknown> {
        chamadas += 1;
        return valor;
      },
    } as unknown as InterpretadorObservacao;
    return { interpretador, chamadas: () => chamadas };
  }

  function objetoComAcessorQueLanca(
    propriedade: "texto" | "modelo" | "promptVersao",
    base: Record<string, unknown> = {},
  ): unknown {
    const alvo: Record<string, unknown> = { ...base };
    Object.defineProperty(alvo, propriedade, {
      enumerable: true,
      configurable: true,
      get(): never {
        throw new Error(`acessor hostil em ${propriedade}`);
      },
    });
    return alvo;
  }

  async function conferirEnvelopeMalformado(valor: unknown): Promise<void> {
    const api = exigirSemantica();
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const observador = criarObservadorFake();
    const quota = criarQuotaFake();
    const provedor = interpretadorQueResolve(valor);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: provedor.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // A tentativa ocorreu, mas a identidade do envelope é ilegível: vale a
    // identidade configurada, nunca propriedades extraídas do envelope sujo.
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    // Exatamente UMA chamada ao interpretador: envelope malformado não retenta.
    expect(provedor.chamadas()).toBe(1);
    expect(kv.leituras).toBe(1);
    expect(kv.gravacoes).toBe(0);
  }

  it("resposta nula do interpretador falha fechada como schema inválido, sem rejeitar", async () => {
    await conferirEnvelopeMalformado(null);
  });

  it("resposta primitiva do interpretador falha fechada como schema inválido, sem rejeitar", async () => {
    await conferirEnvelopeMalformado("texto qualquer");
    await conferirEnvelopeMalformado(42);
  });

  it("acessor hostil em `texto` (objeto sem identidade) falha fechada como schema inválido, sem rejeitar", async () => {
    await conferirEnvelopeMalformado(objetoComAcessorQueLanca("texto"));
  });

  it("acessor hostil em `texto` com identidade válida falha fechada antes do teto de bytes, sem rejeitar", async () => {
    // Este caso passa pela identidade configurada e, no caminho atual, chega a
    // ler `texto` para o teto de bytes: o acessor hostil ainda precisa fechar
    // como schema inválido, sem rejeitar a Promise.
    const api = exigirSemantica();
    await conferirEnvelopeMalformado(
      objetoComAcessorQueLanca("texto", {
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      }),
    );
  });

  it("acessor hostil em `modelo` falha fechada como schema inválido, sem rejeitar", async () => {
    await conferirEnvelopeMalformado(objetoComAcessorQueLanca("modelo"));
  });

  it("acessor hostil em `promptVersao` com modelo válido falha fechada como schema inválido, sem rejeitar", async () => {
    // `modelo` válido garante que o getter de `promptVersao` seja realmente
    // alcançado na checagem de identidade antes de qualquer teto de bytes.
    const api = exigirSemantica();
    await conferirEnvelopeMalformado(
      objetoComAcessorQueLanca("promptVersao", {
        modelo: api.MODELO_OBSERVACAO,
      }),
    );
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: identidade divergente não ecoa metadados do provedor", () => {
  // A identidade efetiva do provedor (`modelo`/`promptVersao` do envelope
  // RESOLVIDO por `extrair`) é entrada NÃO CONFIÁVEL. Quando DIVERGE da
  // configuração, a conferência já fecha fechada (`PENDENTE`/`incompleta`, UMA
  // tentativa, sem retentativa e sem gravar cache) — mas NÃO pode copiar esses
  // metadados para `inferencia_textual`. Um interpretador hostil com `texto`
  // pequeno e válido poderia devolver `modelo`/`promptVersao` gigantes e
  // amplificar o corpo do resultado. A correção reporta APENAS a identidade
  // CONFIGURADA e o corpo permanece limitado (abaixo do teto de abuso de
  // 64 KiB).
  const TAMANHO_HOSTIL = 200_000;
  const TAMANHO_PREFIXO = 1024;

  async function conferirIdentidadeDivergente(
    override: Partial<Pick<RespostaBruta, "modelo" | "promptVersao">>,
  ): Promise<{
    api: ApiSemantica;
    resultado: ResultadoVerificacao;
    kv: KvFake;
    chamadas: number;
  }> {
    const api = exigirSemantica();
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const observador = criarObservadorFake();
    const quota = criarQuotaFake();
    const base = resposta(api, SINAIS_PARTICULAR);
    const interpretador = criarInterpretadorFake([{ ...base, ...override }]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    return { api, resultado, kv, chamadas: interpretador.chamadas.length };
  }

  function afirmarFechadoSemEco(
    contexto: {
      api: ApiSemantica;
      resultado: ResultadoVerificacao;
      kv: KvFake;
      chamadas: number;
    },
    metadadoHostil: string,
  ): void {
    const { api, resultado, kv, chamadas } = contexto;

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");

    // Só a identidade CONFIGURADA é reportada; o metadado do provedor não ecoa.
    const serializado = JSON.stringify(resultado);
    expect(
      resultado.inferencia_textual,
      `resultado serializado com ${serializado.length} bytes`,
    ).toEqual(identidadeConfig(api));

    // O corpo permanece limitado e não expõe o metadado hostil nem seu prefixo.
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(serializado).not.toContain(metadadoHostil);
    expect(serializado).not.toContain(metadadoHostil.slice(0, TAMANHO_PREFIXO));

    // Exatamente UMA tentativa: identidade divergente não retenta.
    expect(chamadas).toBe(1);
    expect(kv.leituras).toBe(1);
    expect(kv.gravacoes).toBe(0);
  }

  it("modelo divergente gigante não é ecoado e o resultado é fechado e limitado", async () => {
    const modeloGigante = "M".repeat(TAMANHO_HOSTIL);
    const contexto = await conferirIdentidadeDivergente({ modelo: modeloGigante });
    afirmarFechadoSemEco(contexto, modeloGigante);
  });

  it("promptVersao divergente gigante não é ecoado e o resultado é fechado e limitado", async () => {
    const promptGigante = "P".repeat(TAMANHO_HOSTIL);
    const contexto = await conferirIdentidadeDivergente({ promptVersao: promptGigante });
    afirmarFechadoSemEco(contexto, promptGigante);
  });
});

describe("lt-retentativa-timeout-e-limites — reforço: identidade CONFIGURADA tem teto e não amplia o resultado", () => {
  // O teto ABSOLUTO de abuso vale também para a identidade CONFIGURADA
  // (`opcoes.modelo`), não apenas para o payload do provedor. A identidade
  // efetiva é aplicada em cache, chamada e resultado; um teto pequeno e
  // COMPARTILHADO (200 caracteres — o mesmo limite semântico de contexto) é
  // medido ANTES do cache, da chamada e do resultado. Acima dele a conferência
  // falha fechada (`PENDENTE`/`incompleta`) SEM ecoar o valor: uma configuração
  // gigante não é copiada integralmente para `inferencia_textual`. No limite
  // (exatamente 200 caracteres), a identidade configurada é aceita e reportada.
  const LIMITE_IDENTIDADE_CONFIGURADA = 200;
  const TAMANHO_HOSTIL = 200_000;
  const TAMANHO_PREFIXO = 1024;

  it("identidade configurada gigante falha fechada antes de cache/chamada e não é ecoada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();
    const modeloGigante = "M".repeat(TAMANHO_HOSTIL);
    expect(modeloGigante.length).toBeGreaterThan(LIMITE_IDENTIDADE_CONFIGURADA);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    // Roteiro que REJEITA: se a configuração acima do teto chegasse a chamar o
    // provedor, a jornada viraria `incompleta` por falha não transitória. Como
    // a recusa precede cache e chamada, o interpretador NUNCA deve ser tocado.
    const interpretador = criarInterpretadorFake([
      new Error("provedor não deveria ser chamado"),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      modelo: modeloGigante,
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // O valor acima do teto NÃO é ecoado: nenhuma identidade amplificada.
    expect(resultado.inferencia_textual).toBeNull();
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(quota.consumidas).toBe(0);

    // O corpo permanece limitado e não expõe o valor hostil nem seu prefixo.
    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(serializado).not.toContain(modeloGigante);
    expect(serializado).not.toContain(modeloGigante.slice(0, TAMANHO_PREFIXO));
  });

  it("identidade configurada de exatamente 200 caracteres é aceita e reportada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();
    const modeloNoLimite = "M".repeat(LIMITE_IDENTIDADE_CONFIGURADA);
    expect(modeloNoLimite).toHaveLength(LIMITE_IDENTIDADE_CONFIGURADA);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const kv = criarKvFake();
    // O provedor ecoa a MESMA identidade de configuração: a identidade confere
    // e a extração válida conclui `completa`, sem rejeitar a Promise.
    const respostaNoLimite: RespostaBruta = {
      texto: JSON.stringify(SINAIS_PARTICULAR),
      modelo: modeloNoLimite,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([respostaNoLimite]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      modelo: modeloNoLimite,
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.inferencia_textual).toEqual({
      modelo: modeloNoLimite,
      prompt_versao: api.versaoEfetivaDoPrompt(),
    });
    expect(interpretador.chamadas).toHaveLength(1);
  });

  // Regressão: um valor só-espaços ACIMA do teto era `trim()`ado para vazio e
  // recaía no padrão `MODELO_OBSERVACAO` ANTES da medição de comprimento,
  // escapando da recusa fechada e chegando a cache/quota/provedor (além de
  // varrer a entrada hostil). O teto deve ser medido no valor CRU.
  it("identidade configurada só de espaços acima do teto falha fechada e não é normalizada para o padrão", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();
    const modeloSoEspacos = " ".repeat(TAMANHO_HOSTIL);
    expect(modeloSoEspacos.trim()).toBe("");
    expect(modeloSoEspacos.length).toBeGreaterThan(LIMITE_IDENTIDADE_CONFIGURADA);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    // Roteiro que REJEITA: se o valor só-espaços acima do teto fosse
    // normalizado para o padrão, a jornada chegaria ao provedor e viraria
    // `incompleta`. A recusa no valor CRU precede cache e chamada.
    const interpretador = criarInterpretadorFake([
      new Error("provedor não deveria ser chamado"),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      modelo: modeloSoEspacos,
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // Não é normalizado para o padrão: nenhuma identidade de inferência.
    expect(resultado.inferencia_textual).toBeNull();
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(quota.consumidas).toBe(0);

    // O resultado permanece limitado e não carrega a corrida de espaços.
    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(serializado).not.toContain(modeloSoEspacos);
    expect(serializado).not.toContain(" ".repeat(TAMANHO_PREFIXO));
  });

  it("identidade configurada só de espaços com 300 caracteres também falha fechada sem efeitos", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();
    const modeloSoEspacos = " ".repeat(300);
    expect(modeloSoEspacos.trim()).toBe("");
    expect(modeloSoEspacos.length).toBeGreaterThan(LIMITE_IDENTIDADE_CONFIGURADA);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([
      new Error("provedor não deveria ser chamado"),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      modelo: modeloSoEspacos,
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.inferencia_textual).toBeNull();
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(quota.consumidas).toBe(0);

    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(serializado).not.toContain(modeloSoEspacos);
    expect(serializado).not.toContain(" ".repeat(TAMANHO_PREFIXO));
  });

  it("identidade configurada só de espaços dentro do teto recai no padrão e conclui", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();
    const modeloSoEspacos = "   ";
    expect(modeloSoEspacos.trim()).toBe("");
    expect(modeloSoEspacos.length).toBeLessThanOrEqual(LIMITE_IDENTIDADE_CONFIGURADA);

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const kv = criarKvFake();
    // O provedor ecoa a identidade PADRÃO: a normalização de um valor
    // só-espaços DENTRO do teto recai em `MODELO_OBSERVACAO`.
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      modelo: modeloSoEspacos,
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(interpretador.chamadas).toHaveLength(1);
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: campos da guia são capturados UMA vez (sem TOCTOU)", () => {
  // A fronteira exercitada é o objeto `GuiaNormalizada` recebido por
  // `conferirGuia`. No caminho central os três campos semânticos
  // (`observacaoRecepcao`, `convenio`, `procedimentoCodigo`) são RE-LIDOS
  // várias vezes: teste de vazio, tetos de abuso, construção de `entrada`,
  // limites semânticos e o próprio motor determinístico. Um objeto com
  // ACESSORES (getters) mutáveis pode devolver um valor CURTO numa leitura e um
  // valor GIGANTE numa leitura posterior, contornando limite/cache e sendo
  // copiado para `entrada` e entregue ao interpretador (TOCTOU).
  //
  // A correção aprovada captura os três campos UMA única vez, no início, num
  // objeto com propriedades PRÓPRIAS de DADO (snapshot), e usa EXCLUSIVAMENTE
  // esse snapshot — sem reler a guia depois da captura. É por isso que cada
  // getter precisa ser lido EXATAMENTE UMA vez, inclusive quando o snapshot já
  // nasce acima do teto: o valor capturado decide vazio/teto/limite/cache/
  // `entrada`/motor, nunca uma leitura tardia.

  const CAMPOS = ["observacaoRecepcao", "convenio", "procedimentoCodigo"] as const;
  type Campo = (typeof CAMPOS)[number];

  const TAMANHO_HOSTIL = 200_000;
  const TAMANHO_PREFIXO = 1024;

  interface GuiaHostil {
    guia: GuiaNormalizada;
    leituras: Record<Campo, () => number>;
  }

  // Copia a guia-base (`Object.assign` materializa TODOS os campos como dados
  // próprios; feito ANTES de instalar os acessores, não conta como leitura) e
  // instala um getter por campo, que conta cada leitura e delega o valor
  // retornado a `valor(campo, nLeituras)`.
  function comAccessors(
    base: GuiaNormalizada,
    valor: (campo: Campo, leituras: number) => string,
  ): GuiaHostil {
    const contagens: Record<Campo, number> = {
      observacaoRecepcao: 0,
      convenio: 0,
      procedimentoCodigo: 0,
    };
    const guia = Object.assign({}, base) as GuiaNormalizada;
    for (const campo of CAMPOS) {
      Object.defineProperty(guia, campo, {
        enumerable: true,
        configurable: true,
        get(): string {
          contagens[campo] += 1;
          return valor(campo, contagens[campo]);
        },
      });
    }
    return {
      guia,
      leituras: {
        observacaoRecepcao: () => contagens.observacaoRecepcao,
        convenio: () => contagens.convenio,
        procedimentoCodigo: () => contagens.procedimentoCodigo,
      },
    };
  }

  function exigirLeituraUnica(hostil: GuiaHostil): void {
    expect(hostil.leituras.observacaoRecepcao(), "leituras de observacaoRecepcao").toBe(1);
    expect(hostil.leituras.convenio(), "leituras de convenio").toBe(1);
    expect(hostil.leituras.procedimentoCodigo(), "leituras de procedimentoCodigo").toBe(1);
  }

  function exigirSemGigante(serializado: string, gigantes: string[]): void {
    for (const gigante of gigantes) {
      expect(serializado).not.toContain(gigante);
      expect(serializado).not.toContain(gigante.slice(0, TAMANHO_PREFIXO));
    }
  }

  it("getters que devolvem valor curto e depois gigante são lidos uma única vez por campo", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Valor CURTO válido (não vazio, dentro de 1000/200) e valores GIGANTES
    // devolvidos a partir da SEGUNDA leitura de cada campo.
    const CURTO = TEXTO_PARTICULAR;
    const GIGANTES: Record<Campo, string> = {
      observacaoRecepcao: `${" ".repeat(TAMANHO_HOSTIL)}a`,
      convenio: "G".repeat(TAMANHO_HOSTIL),
      procedimentoCodigo: "G".repeat(TAMANHO_HOSTIL),
    };

    const hostil = comAccessors(guiaSintetica(), (campo, leituras) =>
      leituras === 1 ? CURTO : GIGANTES[campo],
    );
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(hostil.guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: null,
      quota: quota.quota,
      observador: observador.observador,
    });

    // Captura ÚNICA por campo: cada getter da guia é lido exatamente uma vez.
    exigirLeituraUnica(hostil);

    // O interpretador recebeu o snapshot CURTO — nunca o valor gigante.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.chamadas[0].observacao_recepcao).toBe(CURTO);
    expect(interpretador.chamadas[0].convenio).toBe(CURTO);
    expect(interpretador.chamadas[0].procedimento_codigo).toBe(CURTO);
    exigirSemGigante(JSON.stringify(interpretador.chamadas), Object.values(GIGANTES));

    // A jornada permanece normal (`completa`) e o resultado é limitado, sem o
    // corpo gigante que nunca foi capturado.
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(quota.consumidas).toBe(1);

    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    exigirSemGigante(serializado, Object.values(GIGANTES));
  });

  it("snapshot acima do teto (observação) falha fechada e é lido uma única vez", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // A PRIMEIRA leitura de `observacaoRecepcao` já devolve um valor acima do
    // teto absoluto de abuso (64 KiB); convênio e procedimento continuam
    // normais. O snapshot nasce acima do teto e falha fechada.
    const GIGANTE = `${" ".repeat(TAMANHO_HOSTIL)}a`;
    const hostil = comAccessors(guiaSintetica(), (campo) =>
      campo === "observacaoRecepcao" ? GIGANTE : TEXTO_PARTICULAR,
    );
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(hostil.guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    exigirLeituraUnica(hostil);

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("observacao_acima_do_limite");
    // Nenhum efeito faturável: zero modelo, quota e cache.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(quota.consumidas).toBe(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);

    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    exigirSemGigante(serializado, [GIGANTE]);
  });

  it("snapshot acima do teto (convênio) com observação normal falha fechada e é lido uma única vez", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Observação normal e não vazia; a PRIMEIRA leitura de `convenio` já
    // devolve um valor acima do teto absoluto de abuso. O snapshot do convênio
    // nasce acima do teto e falha fechada, sem limitação nomeada nova (item 11).
    const GIGANTE = "G".repeat(TAMANHO_HOSTIL);
    const hostil = comAccessors(guiaSintetica(), (campo) =>
      campo === "convenio" ? GIGANTE : TEXTO_PARTICULAR,
    );
    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(hostil.guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    exigirLeituraUnica(hostil);

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    // Nenhum efeito faturável: zero modelo, quota e cache.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(quota.consumidas).toBe(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);

    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    exigirSemGigante(serializado, [GIGANTE]);
  });

  it("getters que devolvem valor gigante apenas numa leitura intermediária não entregam payload gigante", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Variante mais forte da fronteira anterior: a leitura INTERMEDIÁRIA que
    // alimenta `entrada` devolve o valor GIGANTE enquanto TODAS as outras
    // leituras (vazio, teto de abuso e limites semânticos) continuam vendo o
    // valor CURTO. Assim o teto de 64 KiB não aborta a jornada e o corpo
    // gigante chega de fato ao interpretador no caminho pré-correção. Os
    // índices foram identificados na implementação pré-correção ("a leitura
    // que alimenta `entrada`"); depois da captura única cada getter é lido só
    // UMA vez e o índice deixa de existir — o contrato durável é o contador em
    // 1.
    const CURTO = TEXTO_PARTICULAR;
    const GIGANTES: Record<Campo, string> = {
      observacaoRecepcao: `${" ".repeat(TAMANHO_HOSTIL)}a`,
      convenio: "G".repeat(TAMANHO_HOSTIL),
      procedimentoCodigo: "G".repeat(TAMANHO_HOSTIL),
    };
    const LEITURA_QUE_ALIMENTA_ENTRADA: Record<Campo, number> = {
      observacaoRecepcao: 3,
      convenio: 2,
      procedimentoCodigo: 2,
    };

    const hostil = comAccessors(guiaSintetica(), (campo, leituras) =>
      leituras === LEITURA_QUE_ALIMENTA_ENTRADA[campo] ? GIGANTES[campo] : CURTO,
    );
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(hostil.guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: null,
      quota: quota.quota,
      observador: observador.observador,
    });

    // Contrato durável: captura ÚNICA por campo — nenhuma leitura
    // intermediária pode devolver outro valor.
    exigirLeituraUnica(hostil);

    // Nem o interpretador nem o resultado carregam o corpo gigante (nem um
    // prefixo de 1024 caracteres dele): só o snapshot CURTO é entregue.
    exigirSemGigante(JSON.stringify(interpretador.chamadas), Object.values(GIGANTES));
    exigirSemGigante(JSON.stringify(resultado), Object.values(GIGANTES));
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: captura da guia é validada e livre de acessores hostis", () => {
  // A fronteira exercitada é o objeto `GuiaNormalizada` recebido por
  // `conferirGuia`. Duas garantias aprovadas:
  //   (a) os TRÊS campos capturados (`observacaoRecepcao`/`convenio`/
  //       `procedimentoCodigo`) precisam ser strings PRIMITIVAS. Um valor com
  //       `length`/`trim`/`toJSON` divergentes engana os testes de vazio/limite
  //       (que só usam `length`/`trim`/`ToString`) enquanto `JSON.stringify` do
  //       payload do provedor invoca `toJSON` e envia um corpo gigante. Um
  //       não-string fecha ANTES de cache, quota e provedor, com a mesma forma
  //       de falha de configuração, sem ecoar o valor.
  //   (b) a representação entregue ao motor precisa ser um snapshot PURO DE
  //       DADOS: nenhum getter é copiado nem avaliado. Um getter que LANÇA em
  //       `original` não pode rejeitar `conferirGuia`, e um acessor hostil em
  //       outro campo consumido pelo motor (`procedimentoDescricao`) não pode
  //       ser retido e amplificar `motivos[].evidencia`.

  const CAMPOS_SEMANTICOS = ["observacaoRecepcao", "convenio", "procedimentoCodigo"] as const;
  type CampoSemantico = (typeof CAMPOS_SEMANTICOS)[number];

  const TAMANHO_HOSTIL = 200_000;
  const TAMANHO_PREFIXO = 1024;

  // Valor hostil cujos `length` (1), `trim` ("x") e `toJSON` (200 kB) divergem.
  // `toString` herda `Object.prototype` ("[object Object]"), de modo que os
  // testes de vazio/teto (que usam `length`/`trim`/`ToString`) o veem CURTO.
  // `trim`/`toJSON` são próprios mas NÃO enumeráveis: a derivação canônica da
  // chave de cache enxerga apenas `length` (como um valor JSON pequeno), o que
  // mantém o caminho central executando até o interpretador, enquanto
  // `JSON.stringify` do payload do provedor continua invocando `toJSON` via
  // `[[Get]]` e materializando o corpo gigante.
  function valorNaoString(): object {
    const hostil: Record<string, unknown> = {};
    Object.defineProperty(hostil, "length", { value: 1, enumerable: true });
    Object.defineProperty(hostil, "trim", { value: () => "x", enumerable: false });
    Object.defineProperty(hostil, "toJSON", {
      value: () => "G".repeat(TAMANHO_HOSTIL),
      enumerable: false,
    });
    return hostil;
  }

  // Substitui, por um valor não-string, UMA das três propriedades de DADO
  // próprias do snapshot de entrada; para os campos de contexto a observação
  // permanece normal e NÃO vazia.
  function guiaComCampoNaoString(campo: CampoSemantico): GuiaNormalizada {
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    (guia as unknown as Record<string, unknown>)[campo] = valorNaoString();
    return guia;
  }

  it("valores capturados não-string falham fechada sem cache, quota ou chamada", async () => {
    for (const campo of CAMPOS_SEMANTICOS) {
      const api = exigirSemantica();
      const catalogo = catalogoValido();
      const guia = guiaComCampoNaoString(campo);
      const kv = criarKvFake();
      const quota = criarQuotaFake();
      const observador = criarObservadorFake();
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
        quota: quota.quota,
        observador: observador.observador,
      });

      // Nenhum efeito faturável: a recusa precede cache, quota e provedor.
      expect(interpretador.chamadas, `chamadas com ${campo} não-string`).toHaveLength(0);
      expect(quota.consumidas, `quota com ${campo} não-string`).toBe(0);
      expect(kv.leituras, `leituras de KV com ${campo} não-string`).toBe(0);
      expect(kv.gravacoes, `gravações de KV com ${campo} não-string`).toBe(0);

      // Forma de falha fechada da configuração/validação, sem identidade de
      // inferência derivada de uma tentativa que não aconteceu.
      expect(resultado.decisao, `decisão com ${campo} não-string`).toBe("PENDENTE");
      expect(resultado.checagem_textual, `checagem com ${campo} não-string`).toBe("incompleta");
      expect(resultado.inferencia_textual, `inferência com ${campo} não-string`).toBeNull();

      // O valor hostil nunca é ecoado no resultado (nem um prefixo de 1024).
      const serializado = JSON.stringify(resultado);
      expect(serializado).not.toContain("G".repeat(TAMANHO_HOSTIL));
      expect(serializado).not.toContain("G".repeat(TAMANHO_PREFIXO));
    }
  });

  it("getter hostil em `original` não rejeita e falha fechada de forma limitada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    Object.defineProperty(guia, "original", {
      get() {
        throw new Error("original hostil");
      },
      enumerable: true,
      configurable: true,
    });

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    // A avaliar `original` no snapshot NUNCA rejeita a conferência: fecha
    // fechada e limitada.
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.gravacoes).toBe(0);

    const serializado = JSON.stringify(resultado);
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
  });

  it("acessor hostil em outro campo do motor não amplia a evidência", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const GIGANTE = "D".repeat(TAMANHO_HOSTIL);
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    Object.defineProperty(guia, "procedimentoDescricao", {
      get() {
        return GIGANTE;
      },
      enumerable: true,
      configurable: true,
    });

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    // O acessor hostil do motor não é avaliado nem retido: a evidência
    // determinística não carrega o corpo gigante (nem 1024 caracteres dele).
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(GIGANTE);
    expect(serializado).not.toContain(GIGANTE.slice(0, TAMANHO_PREFIXO));
    expect(kv.gravacoes).toBe(0);

    // Resultado é um `ResultadoVerificacao` limitado; a decisão exata não é
    // fixada por este reforço.
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(["OK", "PENDENTE"]).toContain(resultado.decisao);
    expect(Array.isArray(resultado.motivos)).toBe(true);
  });
});

describe("lt-conferencia-vazio-cache-e-falhas — reforço: snapshot do motor valida tipos e é inerte", () => {
  // A fronteira exercitada é o SNAPSHOT de dados entregue ao motor
  // determinístico. O snapshot já é livre de ACESSORES (itens 17/18), mas ainda
  // copia o VALOR de cada descritor próprio de DADO sem validar seu tipo em
  // tempo de execução. Sem acessores, uma guia hostil ainda pode:
  //   (a) rejeitar a conferência — `problemas: null` faz o `for...of` do motor
  //       lançar e a Promise de `conferirGuia` rejeitar;
  //   (b) amplificar `motivos[].evidencia` — uma `procedimentoDescricao`
  //       primitiva GIGANTE, ou um objeto coercível com `trim`/`Symbol.toPrimitive`
  //       divergentes, é interpolada quando o procedimento está catalogado.
  //   (c) poluir protótipos — uma chave própria `__proto__` em `original` é
  //       atribuída por colchetes no registro reconstruído.
  // A correção aprovada valida em TEMPO DE EXECUÇÃO e clona como dado INERTE
  // TODO campo consumido pelo motor; valores malformados fecham pelo caminho
  // determinístico de `guiaMinima()` (`PENDENTE`/`incompleta`, zero chamadas,
  // zero gravações de cache, resultado limitado). Cada caso faz `await` em
  // `conferirGuia`, de modo que uma rejeição (motor lançando) já falha o teste.
  const TAMANHO_HOSTIL = 200_000;
  const TAMANHO_PREFIXO = 1024;

  function exigirSemHostil(serializado: string, hostil: string): void {
    expect(serializado).not.toContain(hostil);
    expect(serializado).not.toContain(hostil.slice(0, TAMANHO_PREFIXO));
    expect(serializado.length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
  }

  it("problemas malformado falha fechada sem rejeitar", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // `problemas` é uma propriedade própria de DADO do snapshot; o motor a
    // consome num `for...of`, então `null` rejeita a Promise hoje.
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    (guia as unknown as Record<string, unknown>).problemas = null;

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
      observador: observador.observador,
    });

    // Valor malformado fecha pelo caminho determinístico, sem efeito faturável.
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.gravacoes).toBe(0);

    expect(JSON.stringify(resultado).length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
  });

  it("descrição gigante em dado próprio não amplia a evidência", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // O procedimento da guia-base (50000470) ESTÁ catalogado, então a
    // divergência de descrição interpolaria o valor em `motivos[].evidencia`.
    const GIGANTE = "D".repeat(TAMANHO_HOSTIL);
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    (guia as unknown as Record<string, unknown>).procedimentoDescricao = GIGANTE;

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    // O corpo gigante nunca é copiado para o resultado (nem um prefixo de
    // 1024) e nada é persistido. O dado malformado fecha pelo caminho
    // determinístico (não é sanitizado e continuado).
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    exigirSemHostil(JSON.stringify(resultado), GIGANTE);
    expect(kv.gravacoes).toBe(0);
  });

  it("valor coercível hostil na descrição não amplia a evidência", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Objeto coercível como propriedade própria de DADO: `trim` (usado por
    // `normalizarChave`) devolve um valor curto e `Symbol.toPrimitive` (usado
    // pela interpolação em `motivos[].evidencia`) devolve o corpo gigante.
    const GIGANTE = "D".repeat(TAMANHO_HOSTIL);
    const descricaoHostil: Record<string | symbol, unknown> = {
      trim: () => "divergente",
      [Symbol.toPrimitive]: () => GIGANTE,
    };
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    (guia as unknown as Record<string, unknown>).procedimentoDescricao = descricaoHostil;

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    // O objeto coercível é rejeitado como dado não inerte e fecha pelo caminho
    // determinístico: nada é ampliado nem persistido, e não há tentativa.
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    exigirSemHostil(JSON.stringify(resultado), GIGANTE);
    expect(kv.gravacoes).toBe(0);
  });

  it("`__proto__` próprio em `original` não polui protótipos", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    // Chave própria de DADO `__proto__` em `original`: atribuída por colchetes
    // no registro reconstruído, instala um protótipo controlado hoje.
    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    Object.defineProperty(guia.original, "__proto__", {
      value: { poluido: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const kv = criarKvFake();
    const quota = criarQuotaFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      quota: quota.quota,
    });

    // Registro inerte: fecha pelo caminho determinístico, sem tentativa, com
    // nenhuma poluição observável, nada persistido e resultado limitado.
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    expect(JSON.stringify(resultado).length).toBeLessThanOrEqual(LIMITE_TEXTO_BRUTO_BYTES);
    expect(kv.gravacoes).toBe(0);
    expect(({} as Record<string, unknown>).poluido).toBeUndefined();
  });
});

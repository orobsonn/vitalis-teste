-- Migration aditiva 0001 — esquema de importação, histórico e relatório.
--
-- Somente CREATE (nenhuma tabela existente é alterada). A integridade é
-- garantida por FK, CHECK de enum/vigente e índices parciais que impedem duas
-- revisões vigentes da mesma guia e duas validações vigentes da mesma revisão.

CREATE TABLE rulesets (
  id TEXT PRIMARY KEY,
  versao TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  conteudo_json TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- Contadores globais: passe de duplicidade e geração de reivindicação (CAS).
CREATE TABLE estado_global (
  chave TEXT PRIMARY KEY,
  versao INTEGER NOT NULL
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  arquivo_nome TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  regras_versao TEXT NOT NULL,
  regras_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSANDO', 'CONCLUIDO', 'PARCIAL', 'FALHOU')),
  tamanho_chunk INTEGER NOT NULL,
  linhas_encontradas INTEGER NOT NULL,
  iniciado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  concluido_em TEXT
);

-- Progresso/resultado durável POR LINHA: fonte única do progresso e da retomada.
CREATE TABLE import_lines (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id),
  numero_linha INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('PENDENTE', 'EM_ANDAMENTO', 'PROCESSADO', 'REAPROVEITADO', 'FALHOU')),
  linha_original TEXT NOT NULL,
  original_json TEXT,
  guia_id TEXT,
  revisao_id TEXT,
  motivo TEXT,
  dono TEXT,
  reservado_em TEXT,
  atualizado_em TEXT NOT NULL,
  UNIQUE (import_id, numero_linha)
);

CREATE TABLE import_chunks (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id),
  indice INTEGER NOT NULL,
  primeira_linha INTEGER NOT NULL,
  ultima_linha INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('EM_ANDAMENTO', 'PROCESSADO')),
  dono TEXT NOT NULL,
  reservado_em TEXT NOT NULL,
  processado_em TEXT,
  UNIQUE (import_id, indice)
);

CREATE TABLE guides (
  id TEXT PRIMARY KEY,
  id_guia TEXT NOT NULL UNIQUE,
  import_id_inicial TEXT NOT NULL REFERENCES imports(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE semantic_extractions (
  id TEXT PRIMARY KEY,
  observacao_hash TEXT NOT NULL,
  modelo TEXT NOT NULL,
  prompt_versao TEXT NOT NULL,
  sinais_json TEXT NOT NULL,
  situacao_json TEXT NOT NULL,
  ambiguidades_json TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  UNIQUE (observacao_hash, modelo, prompt_versao)
);

CREATE TABLE guide_revisions (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  numero INTEGER NOT NULL,
  vigente INTEGER NOT NULL CHECK (vigente IN (0, 1)),
  entrada_original_json TEXT NOT NULL,
  entrada_normalizada_json TEXT NOT NULL,
  conteudo_hash TEXT NOT NULL,
  assinatura_duplicidade TEXT,
  import_id TEXT REFERENCES imports(id),
  idempotency_key TEXT UNIQUE,
  criado_em TEXT NOT NULL,
  UNIQUE (guide_id, numero)
);

CREATE TABLE validations (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES guide_revisions(id),
  sequencia INTEGER NOT NULL,
  vigente INTEGER NOT NULL CHECK (vigente IN (0, 1)),
  decisao TEXT NOT NULL CHECK (decisao IN ('OK', 'PENDENTE')),
  checagem_textual TEXT NOT NULL CHECK (checagem_textual IN ('completa', 'incompleta', 'nao_aplicavel')),
  referencia_temporal TEXT,
  regras_versao TEXT NOT NULL,
  regras_hash TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id),
  inferencia_modelo TEXT,
  inferencia_prompt_versao TEXT,
  orientacoes_json TEXT NOT NULL,
  limitacoes_json TEXT NOT NULL,
  extracao_id TEXT REFERENCES semantic_extractions(id),
  processado_em TEXT NOT NULL,
  UNIQUE (revision_id, sequencia)
);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  validation_id TEXT NOT NULL REFERENCES validations(id),
  ordem INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  severidade TEXT NOT NULL CHECK (severidade IN ('pendencia', 'alerta')),
  campos_json TEXT NOT NULL,
  regra TEXT NOT NULL,
  evidencia TEXT NOT NULL,
  orientacao TEXT NOT NULL,
  UNIQUE (validation_id, ordem)
);

-- Uma única revisão vigente por guia e uma única validação vigente por revisão.
CREATE UNIQUE INDEX ux_revisao_vigente ON guide_revisions(guide_id) WHERE vigente = 1;
CREATE INDEX ix_revisao_conteudo ON guide_revisions(guide_id, conteudo_hash);
CREATE INDEX ix_revisao_assinatura ON guide_revisions(assinatura_duplicidade) WHERE vigente = 1;
CREATE UNIQUE INDEX ux_validacao_vigente ON validations(revision_id) WHERE vigente = 1;

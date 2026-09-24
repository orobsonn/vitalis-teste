/**
 * SQL parametrizada compartilhada pelos escritores de guia.
 *
 * Todas as mutações usam `INSERT ... SELECT ?,... WHERE ...` para que a guarda
 * de posse (J18) seja aplicada na própria preparação do statement — um
 * `D1PreparedStatement` é opaco e não pode ganhar condição depois. `vigente` é
 * sempre um inteiro vinculado, nunca booleano nem `undefined`.
 */

export const CLAUSULA_GUARDA =
  "EXISTS (SELECT 1 FROM import_lines WHERE id = ? AND dono = ? AND estado = 'EM_ANDAMENTO')";

export const SQL_INSERIR_GUIA =
  "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) " +
  "SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM guides WHERE id = ?)";

export const SQL_DESATIVAR_REVISAO =
  "UPDATE guide_revisions SET vigente = 0 WHERE guide_id = ? AND vigente = 1";

export const SQL_INSERIR_REVISAO =
  "INSERT INTO guide_revisions " +
  "(id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json, " +
  "conteudo_hash, assinatura_duplicidade, import_id, idempotency_key, criado_em) " +
  "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

export const SQL_INSERIR_EXTRACAO =
  "INSERT INTO semantic_extractions " +
  "(id, observacao_hash, modelo, prompt_versao, sinais_json, situacao_json, ambiguidades_json, criado_em) " +
  "SELECT ?, ?, ?, ?, ?, ?, ?, ?";

export const SQL_DESATIVAR_VALIDACAO =
  "UPDATE validations SET vigente = 0 WHERE revision_id = ? AND vigente = 1";

export const SQL_INSERIR_VALIDACAO =
  "INSERT INTO validations " +
  "(id, revision_id, sequencia, vigente, decisao, checagem_textual, referencia_temporal, " +
  "regras_versao, regras_hash, ruleset_id, inferencia_modelo, inferencia_prompt_versao, " +
  "orientacoes_json, limitacoes_json, extracao_id, processado_em) " +
  "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

export const SQL_INSERIR_FINDING =
  "INSERT INTO findings " +
  "(id, validation_id, ordem, codigo, severidade, campos_json, regra, evidencia, orientacao) " +
  "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?";

/**
 * SQL parametrizada da orquestração de importação.
 *
 * Toda condição de posse (`dono`/`estado`) é embutida no statement preparado:
 * um `D1PreparedStatement` é opaco e não pode ganhar condições depois. A
 * reivindicação é uma única instrução atômica com subquery `LIMIT`, e a
 * transição terminal só casa enquanto a linha ainda pertence ao token.
 */

export const CHAVE_GERACAO = "reivindicacao";

export const SQL_INSERIR_RULESET =
  "INSERT INTO rulesets (id, versao, hash, conteudo_json, criado_em) " +
  "SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM rulesets WHERE hash = ?)";

export const SQL_INSERIR_IMPORT =
  "INSERT INTO imports " +
  "(id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, " +
  " tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em) " +
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

export const SQL_INSERIR_LINHA =
  "INSERT INTO import_lines " +
  "(id, import_id, numero_linha, estado, linha_original, original_json, guia_id, revisao_id, " +
  " motivo, dono, reservado_em, atualizado_em) " +
  "VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?)";

export const SQL_LIBERAR_EXPIRADAS =
  "UPDATE import_lines SET estado = 'PENDENTE', dono = NULL, reservado_em = NULL, atualizado_em = ? " +
  "WHERE import_id = ? AND estado = 'EM_ANDAMENTO' " +
  "AND reservado_em IS NOT NULL AND reservado_em < ?";

export const SQL_INCREMENTAR_GERACAO =
  "INSERT INTO estado_global (chave, versao) VALUES ('reivindicacao', 1) " +
  "ON CONFLICT(chave) DO UPDATE SET versao = versao + 1 RETURNING versao";

export const SQL_REIVINDICAR =
  "UPDATE import_lines SET estado = 'EM_ANDAMENTO', dono = ?, reservado_em = ?, atualizado_em = ? " +
  "WHERE id IN (SELECT id FROM import_lines " +
  "WHERE import_id = ? AND estado = 'PENDENTE' ORDER BY numero_linha ASC LIMIT ?)";

export const SQL_LINHAS_REIVINDICADAS =
  "SELECT id, import_id, numero_linha, estado, linha_original, original_json, guia_id, " +
  "revisao_id, motivo, dono, reservado_em, atualizado_em " +
  "FROM import_lines WHERE import_id = ? AND dono = ? AND estado = 'EM_ANDAMENTO' " +
  "ORDER BY numero_linha ASC";

export const SQL_INSERIR_CHUNK =
  "INSERT INTO import_chunks " +
  "(id, import_id, indice, primeira_linha, ultima_linha, estado, dono, reservado_em, processado_em) " +
  "VALUES (?, ?, ?, ?, ?, 'EM_ANDAMENTO', ?, ?, NULL)";

export const SQL_PROCESSAR_CHUNK =
  "UPDATE import_chunks SET estado = 'PROCESSADO', processado_em = ? WHERE id = ?";

export const SQL_TRANSICAO_TERMINAL =
  "UPDATE import_lines SET estado = ?, guia_id = ?, revisao_id = ?, motivo = ?, " +
  "dono = NULL, reservado_em = NULL, atualizado_em = ? " +
  "WHERE id = ? AND dono = ? AND estado = 'EM_ANDAMENTO'";

export const SQL_LER_ESTADO_LINHA = "SELECT estado FROM import_lines WHERE id = ?";

// Status derivado das linhas ATUAIS numa única instrução: a leitura de
// `import_lines` e a escrita de `imports` não podem ser separadas por outra
// worker que terminalize linhas no meio (J5/J12). A ordem dos `CASE` reproduz
// exatamente a derivação: pendente/em andamento ⇒ PROCESSANDO; sem falha ⇒
// CONCLUIDO; com sucesso e falha ⇒ PARCIAL; sem sucesso ⇒ FALHOU. `concluido_em`
// acompanha o status não-PROCESSANDO.
export const SQL_FINALIZAR_IMPORT =
  "UPDATE imports SET status = CASE " +
  "WHEN (SELECT COUNT(*) FROM import_lines WHERE import_id = imports.id AND estado IN ('PENDENTE','EM_ANDAMENTO')) > 0 THEN 'PROCESSANDO' " +
  "WHEN (SELECT COUNT(*) FROM import_lines WHERE import_id = imports.id AND estado = 'FALHOU') = 0 THEN 'CONCLUIDO' " +
  "WHEN (SELECT COUNT(*) FROM import_lines WHERE import_id = imports.id AND estado IN ('PROCESSADO','REAPROVEITADO')) > 0 THEN 'PARCIAL' " +
  "ELSE 'FALHOU' END, " +
  "atualizado_em = ?, " +
  "concluido_em = CASE WHEN (SELECT COUNT(*) FROM import_lines WHERE import_id = imports.id AND estado IN ('PENDENTE','EM_ANDAMENTO')) > 0 THEN NULL ELSE ? END " +
  "WHERE id = ?";

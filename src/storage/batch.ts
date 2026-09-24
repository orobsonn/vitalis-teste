/**
 * Helper de batch atômico.
 *
 * Delega para `DB.batch` (D1), que executa todos os statements numa transação:
 * qualquer erro reverte o lote inteiro. Nenhuma SQL nova é montada aqui e o
 * erro original é propagado sem ser engolido.
 */

export async function executarBatchAtomico(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result<unknown>[]> {
  return db.batch(statements);
}

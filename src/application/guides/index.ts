/**
 * Barrel público da aplicação de guias.
 *
 * Expõe a porta de escrita (`prepararPersistenciaConferencia`,
 * `persistirConferenciaDaGuia`, `registrarGuia`), o passe de duplicidade
 * (`reavaliarDuplicidade`) e a consulta somente leitura (`conferirGuiaAdHoc`).
 */

export { conferirGuiaAdHoc } from "./consulta-ad-hoc";
export {
  prepararPersistenciaConferencia,
  persistirConferenciaDaGuia,
  registrarGuia,
} from "./persistencia";
export { reavaliarDuplicidade } from "./duplicidade";

export type {
  ConferenciaPersistivel,
  ExtracaoSemanticaPersistivel,
  GuardaPosse,
  OpcoesAdHoc,
  OpcoesDuplicidade,
  OpcoesPersistencia,
  ResultadoAdHoc,
  ResultadoDuplicidade,
  ResultadoPersistencia,
  ResultadoPreparo,
  TipoPersistencia,
} from "./contratos";

import type { ConsultaRegra, ColunaGuia } from "../domain";

export interface McpActor {
  userId: "demo";
  email: string;
  role: "demo";
}

export interface ConsultarRegraInput {
  convenio: string;
  procedimento_codigo: string;
}

export interface VerificarGuiaInput {
  guia: Partial<Record<ColunaGuia, string | null>>;
  referencia_temporal?: string;
}

export interface RegistrarGuiaInput extends VerificarGuiaInput {
  idempotency_key: string;
}

/** A composição de domínio/IA/storage é compartilhada com a API da aplicação. */
export interface VitalisHandlers {
  consultarRegra(input: ConsultarRegraInput): ConsultaRegra | Promise<ConsultaRegra>;
  verificarGuia(input: VerificarGuiaInput): unknown | Promise<unknown>;
  registrarGuia(input: RegistrarGuiaInput): unknown | Promise<unknown>;
}

export interface McpEnv {
  LOADER: WorkerLoader;
}

export interface McpDependencies<E extends McpEnv> {
  createHandlers(context: { env: E; actor: McpActor }): VitalisHandlers | Promise<VitalisHandlers>;
  /** Gate compartilhado/persistente. Ausência não deve liberar o endpoint. */
  allowRequest(context: { request: Request; env: E; actor: McpActor }): Promise<boolean>;
}

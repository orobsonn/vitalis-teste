export { createMcpApiHandler } from "./handler";
export { createVitalisMcpServer, serializarRegra } from "./server";
export { consultarRegraSchema, verificarGuiaSchema, registrarGuiaSchema } from "./schemas";
export type {
  ConsultarRegraInput, VerificarGuiaInput, RegistrarGuiaInput,
  VitalisHandlers, McpActor, McpEnv, McpDependencies,
} from "./contratos";

import { api } from "./api";

/** Cancellation belongs to the screen; a mutation already sent must finish. */
export async function postImportMutation<T>(path: string, body: unknown, screen: AbortSignal): Promise<T | null> {
  if (screen.aborted) return null;
  const result = await api<T>(path, body);
  return screen.aborted ? null : result;
}

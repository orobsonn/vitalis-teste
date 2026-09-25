/** Enforce the actual streamed size, including when Content-Length is absent or false. */
export async function boundedRequest(request: Request, maximum = 65_536): Promise<Request | Response> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        return Response.json({ error: "O conteúdo excede o limite de 64 KiB." }, { status: 413 });
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return new Request(request, { body });
}

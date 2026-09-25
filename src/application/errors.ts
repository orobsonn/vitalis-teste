export class PublicError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 413 | 422 | 429 | 503, message: string) {
    super(message);
    this.name = "PublicError";
  }
}

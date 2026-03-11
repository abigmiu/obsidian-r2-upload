export class LocalizedError extends Error {
  key: string;
  params?: Record<string, string | number>;

  constructor(key: string, params?: Record<string, string | number>, fallbackMessage?: string) {
    super(fallbackMessage ?? key);
    this.name = "LocalizedError";
    this.key = key;
    this.params = params;
  }
}

export function isLocalizedError(err: unknown): err is LocalizedError {
  return err instanceof Error && (err as any).name === "LocalizedError" && typeof (err as any).key === "string";
}


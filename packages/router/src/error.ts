export type RouterErrorCode =
  | "model_not_found"
  | "unauthorized"
  | "scope_denied"
  | "budget_exceeded"
  | "all_providers_failed";

export class RouterError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, details?: Record<string, unknown>) {
    super(code);
    this.name = "RouterError";
    this.code = code;
    this.details = details;
  }
}

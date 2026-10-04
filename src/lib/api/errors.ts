export type ErrorCode = string;

export type ErrorDetails = Array<{ path: string; message: string }> | Record<string, unknown>;

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: ErrorDetails) =>
  new ApiError(400, code, message, details);
export const unauthenticated = () =>
  new ApiError(401, "UNAUTHENTICATED", "Faça login para continuar.");
export const forbidden = (message = "Você não tem permissão para esta ação.", code = "FORBIDDEN") =>
  new ApiError(403, code, message);
export const notFound = (message = "Não encontrado.") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (code: ErrorCode, message: string, details?: ErrorDetails) =>
  new ApiError(409, code, message, details);
export const unprocessable = (code: ErrorCode, message: string, details?: ErrorDetails) =>
  new ApiError(422, code, message, details);

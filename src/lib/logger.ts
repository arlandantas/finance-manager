import pino from "pino";

/** Caminhos mascarados em qualquer log (exportado para o teste de redação). */
export const LOG_REDACT_PATHS = [
  "req.headers.cookie",
  "headers.cookie",
  "token",
  "inviteUrl",
  "description",
  "note",
  // EN-004 (ADR-028 §6): chave e conteúdo enviado/recebido do LLM nunca vão para o log
  "apiKey",
  "*.apiKey",
  "*.authorization",
  "*.x-api-key",
  "*.input",
  "*.system",
  "*.content",
  // EN-006 (SDD-024 §8): credenciais OAuth/MCP nunca vão para o log
  "authorization",
  "access_token",
  "refresh_token",
  "code",
  "code_verifier",
  "*.access_token",
  "*.refresh_token",
  "*.code",
  "*.code_verifier",
  "*.token", // US-074b: token pessoal (ADR-043)
  "headers.authorization",
  "req.headers.authorization",
];

/** Logs estruturados. Nunca registrar cookie, token de convite, descrição ou nota de lançamento. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: LOG_REDACT_PATHS,
});

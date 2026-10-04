import pino from "pino";

/** Logs estruturados. Nunca registrar cookie, token de convite, descrição ou nota de lançamento. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: ["req.headers.cookie", "headers.cookie", "token", "inviteUrl", "description", "note"],
});

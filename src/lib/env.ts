import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
});

export type Env = z.infer<typeof schema>;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}

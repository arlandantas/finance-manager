export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

let testOverride: Clock | null = null;

type ClockEnv = { NODE_ENV?: string; APP_NOW_OVERRIDE?: string };

/** Relógio da aplicação. APP_NOW_OVERRIDE só vale fora de produção (SDD-000 §8). */
export function getClock(env: ClockEnv = process.env as ClockEnv): Clock {
  if (env.NODE_ENV === "production") return systemClock;
  if (testOverride) return testOverride;
  if (env.APP_NOW_OVERRIDE) {
    const fixed = new Date(env.APP_NOW_OVERRIDE);
    if (!Number.isNaN(fixed.getTime())) return { now: () => new Date(fixed) };
  }
  return systemClock;
}

/** Apenas para testes: injeta um relógio fixo durante `fn`. */
export async function withClock<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  const previous = testOverride;
  const fixed = new Date(iso);
  testOverride = { now: () => new Date(fixed) };
  try {
    return await fn();
  } finally {
    testOverride = previous;
  }
}

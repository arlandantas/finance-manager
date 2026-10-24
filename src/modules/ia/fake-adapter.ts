import {
  LlmError,
  type LlmPort,
  type LlmPurpose,
  type LlmRequest,
  type LlmUsage,
} from "@/modules/ia/port";

// SDD-021 §4.2 / ADR-028 §7: provedor simulado determinístico. Padrão em dev, unidade, integração e E2E.

export type FakeScenario =
  | "ok"
  | "invalid_json"
  | "schema_violation"
  | "numbers_in_text"
  | "member_name_in_text"
  | "unknown_ids"
  | "duplicate_refs"
  | "truncated"
  | "refusal"
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "auth";

export const FAKE_SCENARIOS: readonly FakeScenario[] = [
  "ok",
  "invalid_json",
  "schema_violation",
  "numbers_in_text",
  "member_name_in_text",
  "unknown_ids",
  "duplicate_refs",
  "truncated",
  "refusal",
  "unavailable",
  "timeout",
  "rate_limited",
  "auth",
];

/**
 * `fixtures[purpose][scenario]`: objeto (será validado pelo schema), string crua (JSON do provedor) ou
 * função `(input) => objeto|string` — para finalidades cujo `input` sorteia referências por pedido (US-070).
 */
export type FakeFixtures = Partial<Record<LlmPurpose, Partial<Record<FakeScenario, unknown>>>>;

export type FakeCall = {
  purpose: LlmPurpose;
  system: string;
  input: string;
  model: string;
  startedAt: number;
};

export const FAKE_USAGE = { inputTokens: 3000, outputTokens: 1500 } as const;

export class FakeLlmAdapter implements LlmPort {
  readonly calls: FakeCall[] = [];
  scenario: FakeScenario;
  fixtures: FakeFixtures;
  usage: { inputTokens: number; outputTokens: number };
  delayMs: number;

  constructor(
    opts: {
      scenario?: FakeScenario;
      fixtures?: FakeFixtures;
      usage?: { inputTokens: number; outputTokens: number };
      delayMs?: number;
    } = {},
  ) {
    this.scenario = opts.scenario ?? "ok";
    this.fixtures = opts.fixtures ?? {};
    this.usage = opts.usage ?? { ...FAKE_USAGE };
    this.delayMs = opts.delayMs ?? 0;
  }

  reset(): void {
    this.calls.length = 0;
    this.scenario = "ok";
    this.usage = { ...FAKE_USAGE };
    this.delayMs = 0;
  }

  async generate<T>(req: LlmRequest<T>): Promise<{ data: T; usage: LlmUsage; attempts?: number }> {
    this.calls.push({
      purpose: req.purpose,
      system: req.system,
      input: req.input,
      model: req.model,
      startedAt: Date.now(),
    });
    if (req.signal.aborted) throw new LlmError("CANCELLED");
    if (this.delayMs > 0) await this.wait(this.delayMs, req.signal);
    const usage: LlmUsage = { ...this.usage, model: req.model };
    switch (this.scenario) {
      case "unavailable":
        throw new LlmError("UNAVAILABLE");
      case "timeout":
        throw new LlmError("TIMEOUT");
      case "rate_limited":
        throw new LlmError("RATE_LIMITED");
      case "auth":
        throw new LlmError("AUTH");
      case "truncated":
        throw new LlmError("TRUNCATED", usage);
      case "refusal":
        throw new LlmError("REFUSED", usage);
      default:
        break;
    }
    const raw = this.fixtures[req.purpose]?.[this.scenario];
    if (raw === undefined) throw new LlmError("INVALID_RESPONSE", usage);
    let value: unknown = raw;
    if (typeof value === "function") {
      try {
        value = (value as (input: unknown) => unknown)(JSON.parse(req.input));
      } catch {
        throw new LlmError("INVALID_RESPONSE", usage);
      }
    }
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        throw new LlmError("INVALID_RESPONSE", usage);
      }
    }
    const parsed = req.outputSchema.safeParse(value);
    if (!parsed.success) throw new LlmError("INVALID_RESPONSE", usage);
    return { data: parsed.data, usage, attempts: 1 };
  }

  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new LlmError("CANCELLED"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

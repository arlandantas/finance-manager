import { describe, expect, it } from "vitest";
import {
  isSessionExpired,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  slidingExpiry,
} from "@/lib/auth/session";

// SEC-018 (SDD-028 §6.2): funções puras de validade.
const DAY = 86_400_000;
const created = new Date("2026-01-01T00:00:00Z");

describe("SEC-018 validade da sessão", () => {
  it("renova pela ociosidade e nunca passa do prazo absoluto", () => {
    expect(slidingExpiry(created, new Date(created.getTime() + 10 * DAY)).getTime()).toBe(
      created.getTime() + 10 * DAY + SESSION_IDLE_SECONDS * 1000,
    );
    expect(slidingExpiry(created, new Date(created.getTime() + 80 * DAY)).getTime()).toBe(
      created.getTime() + SESSION_ABSOLUTE_SECONDS * 1000,
    );
  });
  it("vence por ociosidade ou por prazo absoluto", () => {
    const now = new Date(created.getTime() + 91 * DAY);
    expect(
      isSessionExpired({ expires: new Date(now.getTime() + DAY), createdAt: created }, now),
    ).toBe(true);
    const n2 = new Date(created.getTime() + 5 * DAY);
    expect(isSessionExpired({ expires: new Date(n2.getTime() + 1), createdAt: created }, n2)).toBe(
      false,
    );
    expect(isSessionExpired({ expires: n2, createdAt: created }, n2)).toBe(true);
  });
});

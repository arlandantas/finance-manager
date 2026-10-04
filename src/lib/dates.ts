import { z } from "zod";
import type { Clock } from "@/lib/clock";

/** Data de calendário `YYYY-MM-DD` (sem fuso). */
export type DateISO = string;

export const dateISOSchema = z.iso.date({ error: "Data inválida" });

export const FAMILY_TIMEZONE = "America/Sao_Paulo";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: FAMILY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoje" no fuso da família a partir do relógio injetável. */
export function todayInFamilyTz(clock: Clock): DateISO {
  return ymd.format(clock.now());
}

function toUtc(d: DateISO): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: DateISO, n: number): DateISO {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function compareDate(a: DateISO, b: DateISO): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(a: DateISO, b: DateISO): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

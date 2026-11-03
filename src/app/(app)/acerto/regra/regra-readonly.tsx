import { equalShares, formatBps, formatBpsList } from "@/modules/split/rules";
import type { SplitRuleDTO } from "@/modules/split/schemas";

/** US-053: Membro (não Administrador) vê a regra vigente só para leitura, sem campos nem ações. */
export function RuleReadOnly({ rule }: { rule: SplitRuleDTO }) {
  const shares =
    rule.current.kind === "PROPORTIONAL"
      ? rule.current.shares
      : equalShares(rule.members.map((m, i) => ({ id: m.id, ordinal: i })));
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
        Só o Administrador altera a regra de divisão.
      </p>
      <section aria-label="Regra vigente" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-800">
          {rule.current.kind === "EQUAL" ? "Divisão igual" : "Divisão proporcional"}
        </h2>
        <ul data-testid="rule-readonly" className="flex flex-col gap-1 text-sm text-slate-800">
          {rule.members.map((m) => (
            <li key={m.id}>
              {m.name.split(" ")[0]}: {formatBps(shares.find((s) => s.memberId === m.id)?.bps ?? 0)}
              %
            </li>
          ))}
        </ul>
      </section>
      {rule.upcoming.length > 0 ? (
        <section aria-label="Regras futuras" className="flex flex-col gap-1 text-sm text-slate-600">
          {rule.upcoming.map((u) => (
            <p key={u.id}>
              A partir de {u.effectiveFrom.split("-").reverse().join("/")}:{" "}
              {u.kind === "EQUAL" ? "divisão igual" : formatBpsList(u.shares)}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

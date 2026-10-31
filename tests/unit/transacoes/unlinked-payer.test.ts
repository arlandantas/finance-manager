import { describe, expect, it } from "vitest";
import { violatesUnlinkedPayerChange } from "@/modules/transacoes/ownership";

// US-093b (SDD-034 §7.1-2): tabela-verdade de `violatesUnlinkedPayerChange` (SEC-059a).
type Role = "ADMIN" | "MEMBER";
const ME = "me";
const OTHER = "other";
const ANA = "ana"; // sem conta
const BIA = "bia"; // com conta

/** [descrição, papel de quem age, é o autor?, pagador atual, novo pagador, atual sem conta?, novo sem conta?, esperado] */
const rows: Array<
  [
    string,
    Role,
    boolean,
    string,
    string | undefined,
    boolean,
    boolean,
    false | "NOT_AUTHOR" | "ADMIN_SELF",
  ]
> = [
  ["nenhum novo pagador", "MEMBER", false, ANA, undefined, true, false, false],
  ["mesmo pagador", "MEMBER", false, ANA, ANA, true, true, false],
  [
    "nenhum lado sem conta: regra antiga (membro)",
    "MEMBER",
    false,
    BIA,
    OTHER,
    false,
    false,
    false,
  ],
  [
    "nenhum lado sem conta: regra antiga (admin para si)",
    "ADMIN",
    false,
    BIA,
    ME,
    false,
    false,
    false,
  ],
  [
    "membro não autor tira o sem conta para si",
    "MEMBER",
    false,
    ANA,
    ME,
    true,
    false,
    "NOT_AUTHOR",
  ],
  [
    "membro não autor tira o sem conta para terceiro",
    "MEMBER",
    false,
    ANA,
    BIA,
    true,
    false,
    "NOT_AUTHOR",
  ],
  ["membro não autor põe o sem conta", "MEMBER", false, BIA, ANA, false, true, "NOT_AUTHOR"],
  [
    "membro não autor troca de sem conta para sem conta",
    "MEMBER",
    false,
    ANA,
    "ana2",
    true,
    true,
    "NOT_AUTHOR",
  ],
  ["admin não autor tira o sem conta para si", "ADMIN", false, ANA, ME, true, false, "ADMIN_SELF"],
  ["admin não autor tira o sem conta para terceiro", "ADMIN", false, ANA, BIA, true, false, false],
  ["admin não autor põe o sem conta", "ADMIN", false, BIA, ANA, false, true, false],
  [
    "admin não autor se põe no lugar quando o novo é ele e o atual é sem conta",
    "ADMIN",
    false,
    ANA,
    ME,
    true,
    false,
    "ADMIN_SELF",
  ],
  ["autor membro tira o sem conta para si", "MEMBER", true, ANA, ME, true, false, false],
  ["autor membro tira o sem conta para terceiro", "MEMBER", true, ANA, BIA, true, false, false],
  ["autor membro põe o sem conta", "MEMBER", true, BIA, ANA, false, true, false],
  [
    "autor admin tira o sem conta para si (correção do que lançou)",
    "ADMIN",
    true,
    ANA,
    ME,
    true,
    false,
    false,
  ],
  ["autor admin põe o sem conta", "ADMIN", true, BIA, ANA, false, true, false],
  [
    "membro não autor, atual sem conta, novo igual ao ator",
    "MEMBER",
    false,
    ANA,
    ME,
    true,
    false,
    "NOT_AUTHOR",
  ],
  [
    "admin não autor, nenhum sem conta, para si: regras antigas decidem",
    "ADMIN",
    false,
    OTHER,
    ME,
    false,
    false,
    false,
  ],
];

describe("violatesUnlinkedPayerChange (SEC-059a)", () => {
  it.each(rows)("%s", (_d, role, isAuthor, current, next, curUn, nextUn, expected) => {
    expect(
      violatesUnlinkedPayerChange(
        { memberId: ME, role },
        { payerId: current, authorMemberId: isAuthor ? ME : "someone-else" },
        next,
        { currentUnlinked: curUn, nextUnlinked: nextUn },
      ),
    ).toBe(expected);
  });

  it("autor desconhecido (undefined) nunca isenta", () => {
    expect(
      violatesUnlinkedPayerChange({ memberId: ME, role: "MEMBER" }, { payerId: ANA }, BIA, {
        currentUnlinked: true,
        nextUnlinked: false,
      }),
    ).toBe("NOT_AUTHOR");
  });
});

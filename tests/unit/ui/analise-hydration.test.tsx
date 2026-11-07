import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnaliseFiltersPanel } from "@/app/(app)/analise/analise-filters";

const MEMBER = "11111111-1111-4111-8111-111111111111";

function seeded() {
  const qc = new QueryClient();
  qc.setQueryData(["family"], {
    members: [{ memberId: MEMBER, name: "Lucas Silva", unlinked: false }],
  });
  return qc;
}
const tree = (qc: QueryClient) => (
  <QueryClientProvider client={qc}>
    <AnaliseFiltersPanel filters={{}} onChange={() => {}} />
  </QueryClientProvider>
);

describe("AnaliseFiltersPanel: hidratação com cache já preenchido", () => {
  afterEach(() => vi.restoreAllMocks());

  it("1ª renderização do cliente coincide com o servidor e as opções aparecem depois", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(tree(new QueryClient()));
    expect(html).not.toContain(MEMBER);
    const recoverable: unknown[] = [];
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    await act(async () => {
      hydrateRoot(el, tree(seeded()), { onRecoverableError: (e) => recoverable.push(e) });
    });
    expect(recoverable).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    expect(el.querySelector(`option[value="${MEMBER}"]`)).not.toBeNull();
    el.remove();
  });
});

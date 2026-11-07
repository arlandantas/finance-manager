# ADR-039 — E2E enxuto: mobile só smoke e regra de negócio em integração

**Status:** aceito · **Data:** 2026-11-07 · **Autor:** gestor

## Contexto
A suíte E2E (743 cenários × projetos desktop e mobile, 1 worker, `next dev`) passava de 55 min e estourava timeouts. Boa parte dos cenários repetia o mesmo fluxo de UI só para provar uma regra (datas de fatura, arredondamento de parcela, isolamento), que a integração (`tests/integration`) já prova com banco real.

## Decisão
1. **Mobile é smoke:** o projeto `mobile` roda só cenários `@mobile` (login, lançar despesa, Home, compra e pagamento de fatura, navegação, formulários). O desktop roda tudo.
2. **Regra vai para integração:** cenário E2E que só varia dado e confere valor calculado, e cujo equivalente já existe em integração/unit, recebe `@integration` (fica no `.feature` como especificação, não roda no navegador). Antes de marcar, confira que o teste de integração afirma o mesmo.
3. **E2E fica com o que depende do navegador:** layout, navegação, formulário, mensagens, toasts, estado de tela obsoleta, duplo clique, falha de rede.
4. **Descartado:** `next build && next start` (em produção o relógio fixo e o login de teste ficam desligados, ADR-024/026; religá-los enfraqueceria travas) e `storageState` (o `resetDb` apaga usuários a cada cenário, e o login já é uma chamada de API barata).

## Consequências
- Execuções E2E caem de ~1.490 para ~730. Novos fluxos de UI marcam `@mobile` só se forem caminho crítico.
- Se ainda for lento: paralelizar com schema por worker (exige isolar `resetDb` e o relógio global do servidor) e continuar a auditoria de cenários redundantes.

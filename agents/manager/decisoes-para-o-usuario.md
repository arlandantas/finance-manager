# Decisões que dependem do usuário (para a homologação)

*Compilado pelo Gestor em 2026-10-04. Nada aqui bloqueia o desenvolvimento: cada item tem uma hipótese já adotada. Responda quando for validar a R1/R2.*

## A. Regras de negócio
| ID | Decisão | Hipótese adotada | Impacto se mudar |
| :-- | :-- | :-- | :-- |
| Q-20 | No acerto de contas, compra no cartão é creditada a **quem comprou** (não a quem paga a fatura). Pode divergir do desembolso real num casal em que um compra e o outro paga a fatura. | Quem comprou (RN-003.3) | Alterar o cálculo do acerto na R2 (SDD-002/008, ADR-014) |
| Q-18 | Compra **no dia do fechamento** entra na fatura que fecha naquele dia. | Sim | Regra de ciclo da fatura (SDD-008) |
| Q-19 | Dias de fechamento/vencimento **travados** após a primeira compra do cartão. | Travados; nome, limite e titular editáveis | Exigiria ciclo versionado por vigência |
| Q-21 | Pagamento de fatura **integral**; sem parcial, juros ou antecipação. | Integral, só fatura fechada | Parcial/juros iria para AP1/AP2 |
| Q-22 | "Dividir com a família" nas despesas previstas é decidido no cadastro, padrão **ligado**. | Ligado | Ajuste de formulário |
| Q-01 | Dependentes sem login (ex.: filhos) como responsáveis por gasto. | **Fora do MVP** (US-021) | Novo épico, mexe no modelo de membros |
| D-PO-01 | Um único campo "Quem pagou?" no lançamento. | Aprovada | Formulário e modelo (`payerMemberId`) |
| D-PO-02 | Todos os membros veem e lançam em todas as contas e cartões. | Aprovada | Exigiria permissões granulares (US-020) |

## B. Escopo e prazo
- **Ordem de corte** se precisar reduzir: R1 → US-013b, US-009b, US-013a. R2 → US-014, US-017b, US-016b.
- **Estimativa:** R1 = 70 pontos; R2 = 32 pontos (Tech Lead e PO concordam).

## C. Validação prática (só você pode dar)
Usar o app com login de teste e dizer se o fluxo *lançar → acertar → ver a home* resolve a dor de fechar o mês em casal. Relatório de QA da R1: `agents/developer/tasks/qa-r1.md` (quando pronto).

## D. Contas e serviços externos
Ver [`pendencias-externas.md`](pendencias-externas.md) (Google OAuth, SMTP/domínio, hospedagem, Sentry, CI, `AUTH_SECRET`).

## E. Acesso externo ao app local (túnel)
Ver `pendencias-externas.md`, item EXT-10.

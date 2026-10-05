# NEED-015: Resumo do Mês como Foco da Tela Inicial

## 📋 Metadados
- **ID:** `NEED-015`
- **Área:** Visão Principal / Home
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Must** · Release **R2.1** (versão com dados que já existem); evolução em R3 com receitas previstas
- **Consumidores:** Product Owner (`US`/`FLUXO`), Tech Lead (`SDD`)
- **Origem:** Sugestão 8 do usuário. **Altera** o foco da Início (hoje: "Saldo da família") e **ajusta** NEED-009 (RN08/RF30)

---

## 1. Contexto e Dor de Negócio
"Quanto dinheiro tem nas contas" não responde à pergunta real do casal: "**como está o nosso mês?**". Um saldo alto pode esconder contas a pagar e fatura a vencer (a falsa ilusão de liquidez do panorama de necessidades). O usuário, após usar o app, pediu que o resumo do mês seja o destaque e os saldos fiquem em segundo plano.

## 2. Necessidade
1. A Início destaca o **Resumo do Mês** (do período selecionado, mês-calendário, D-PO-03): **receitas**, **despesas**, **resultado do mês (saldo)**, **a pagar** (contas previstas pendentes e faturas de cartão a vencer) e **saldo previsto** (o que sobra ao final do mês se tudo que está previsto for pago).
2. O **saldo das contas** passa a ser um **card recolhível** (padrão recolhido ou lembrando a escolha), com o total e o detalhe por conta ao expandir.
3. O bloco de acerto de contas deixa de ser o destaque (ver NEED-019).

## 3. Definições de negócio (para o PO/TL não divergirem)
- **RN-015.1 — Despesas do mês:** por **competência**: compra no cartão conta no mês da compra; **pagamento de fatura, transferência e acerto não são despesa** (preserva a regra já homologada de não duplicar).
- **RN-015.2 — A pagar:** por **caixa**: previstas pendentes com vencimento no mês + faturas de cartão com vencimento no mês. Atrasadas aparecem destacadas e somadas.
- **RN-015.3 — Resultado do mês:** receitas realizadas − despesas realizadas do mês.
- **RN-015.4 — Saldo previsto:** saldo atual das contas − a pagar do mês (+ receitas previstas ainda a receber, quando existirem). O rótulo deve explicar a fórmula em uma frase; número sem explicação gera desconfiança.
- **RN-015.5:** Todos os números do resumo **reconciliam com o Extrato** no mesmo período (mesmo filtro, mesmo total). Divergência aqui destrói a confiança no produto.
- **RN-015.6:** Respeita o modo "ocultar valores" (NEED-014).
- **RN-015.7 (ajuste a NEED-009):** quando as caixinhas existirem (AP2), o "Saldo Livre" entra como uma linha do resumo/card de saldos; a regra "saldo da Home descontado das caixinhas" continua valendo para o card de saldos.

## 4. Pontos em aberto (decididos)
- **Q-F03 (decidida):** R2.1 sem receitas previstas, com rótulo claro da fórmula; receitas previstas na R3 (Could).
- **Q-F03b (decidida):** a fatura aberta entra em "a pagar" em linha própria; não entra duas vezes em despesas.

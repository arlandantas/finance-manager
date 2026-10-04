# FLUXO-005: Despesas Previstas, "A pagar" e Baixa (Mobile & Desktop)

- **Objetivo**: nenhum compromisso fixo é esquecido; ao pagar, a família registra o valor real em poucos toques e o saldo da conta acompanha.
- **Personas**: Mariana (gestora da casa) e Lucas (responsável por algumas contas, ex.: condomínio).
- **Rastreabilidade**: [NEED-004](../../stakeholder/needs/NEED-004-despesas-previstas-e-recorrentes.md) · Histórias [US-018](../backlog/stories/US-018-despesa-prevista-pontual.md), [US-019](../backlog/stories/US-019-dar-baixa-em-despesa-prevista.md) · integra [US-017](../backlog/stories/US-017-ver-fatura-do-cartao.md) (faturas fechadas em "A pagar").

## 1. Diagrama de navegação

```mermaid
flowchart TD
    HOME["Home ▸ bloco 'A pagar'<br/>(atrasadas + próximos 7 dias)"] -->|Ver todas| LIST["Contas a pagar (mês)"]
    MENU["Menu ▸ Contas a pagar"] --> LIST
    LIST -->|Nova despesa prevista| NEW["Drawer de cadastro"]
    NEW --> LIST
    LIST -->|Editar / Excluir| EDIT["Edição ou confirmação de exclusão (só PREVISTO)"]
    LIST -->|Dar baixa| PAY["Drawer de baixa<br/>valor pago · conta · data · quem pagou"]
    HOME -->|Dar baixa no item| PAY
    PAY --> OK["Previsão PAGO · despesa real no extrato · conta debitada"]
    OK -->|Desfazer pagamento| LIST
    LIST -->|item 'Fatura' (US-017a)| INV["Fatura do cartão (FLUXO-004)"]
```

## 2. Ciclo de vida

```text
cadastrar ──► PREVISTO ──(vencimento < hoje)──► PREVISTO + "Atrasada" (destaque, não é outro estado)
                 │  editar / excluir
                 └──► dar baixa (conta + data + valor efetivo) ──► PAGO ──► desfazer pagamento ──► PREVISTO
PREVISTO: não mexe em saldo, extrato, totais nem acerto.   PAGO: gera a despesa real (valor efetivo, data do pagamento).
```

## 3. Especificação de interface
1. **Contas a pagar**: seletor de mês (por vencimento), total do mês no topo ("A pagar R$ 1.850,00"), abas **A pagar** | **Pagas**. Item: descrição, categoria, valor previsto, vencimento, avatar do **responsável**, marcador Comum/Pessoal e *chip* **Atrasada** (cor + texto). Atrasadas primeiro, depois por vencimento. Faturas fechadas aparecem como item "Fatura {Cartão}" com ação "Ver fatura".
2. **Bloco "A pagar" na Home**: até 5 itens (atrasadas + próximos 7 dias), "Ver todas"; ação rápida "Dar baixa".
3. **Cadastro**: descrição, valor (máscara BRL), categoria (grade), responsável (avatares; padrão logado), switch "Dividir com a família"; vencimento e observação em *Mais detalhes*.
4. **Baixa**: valor pago (padrão o previsto; mostra a diferença ao vivo: "+R$ 32,50 sobre o previsto"), conta com saldo, data (padrão hoje), quem pagou (padrão o responsável), aviso de conta negativa, "Confirmar pagamento".
5. **Previsão paga**: "Previsto R$ 650,00 · Pago R$ 682,50", *chip* "Pago em dd/mm", ação **Desfazer pagamento**; sem Editar/Excluir.

## 4. Coerência com o ledger (decisão do PO)
A previsão é um **compromisso**, não um lançamento (D-PO-11): só a **baixa** cria a despesa real, com o **valor efetivo** e a **data do pagamento**. Por isso extrato, saldos, totais do mês e acerto nunca "veem" previsões `PREVISTO`.

## 5. Estados e acessibilidade
Skeleton, vazio ("Nenhuma conta a pagar neste mês" + CTA), erro de leitura, sem conexão (padrão SDD-000 §7). "Atrasada" sempre com texto; alvos ≥ 44 px; 375 px sem rolagem horizontal.

## 6. Histórico
- 2026-10-04 — Criado no refinamento da R2.

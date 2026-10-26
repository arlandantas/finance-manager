# NEED-033: Visão Sintética por Conta em "Contas a Pagar do Mês" (Saldo Previsto)

## 📋 Metadados
- **ID:** `NEED-033`
- **Área:** Disponibilidade e Previstas (estende NEED-011 e NEED-016; corresponde à **US-060**)
- **Status:** Levantado em 2026-10-26 (uso real, item 9). **Já existe história aprovada (US-060, TASK-054 pendente)**
- **Prioridade de valor:** **Must (Alta)** — responde "cada conta aguenta o mês?"
- **Consumidores:** Product Owner, Tech Lead
- **Origem:** Item 9 do feedback de uso real

---

## 1. Dor
"Contas a pagar do mês" mostra uma lista. A pergunta real é por **conta**: "A conta do salário tem saldo para o que sai dela até o fim do mês?". Sem essa visão, a família soma de cabeça e descobre o negativo só no dia do vencimento.

## 2. Situação atual (verificada)
- `estado/previstas-series.md` §e: **US-060 (resumo por conta no A pagar) pendente; `/payables` não tem `byAccount`.** O pedido já está no backlog; o item 9 do usuário confirma a prioridade.
- "A pagar" já recorta por período e junta previstas e faturas (regra 14); previsão sabe a conta de pagamento (opcional na avulsa, obrigatória na série).
- Saldo atual por conta já existe (derivado).

## 3. Regras de negócio propostas (RN)
- **RN-033.1:** para o mês escolhido, uma tabela sintética **por conta** mostra: conta, **saldo atual**, **despesas previstas em aberto** (somente as que saem da conta) e **saldo previsto** = saldo atual menos previstas em aberto.
- **RN-033.2:** previstas **sem conta de pagamento** não somem: aparecem como linha própria ("sem conta definida") para não esconder compromisso.
- **RN-033.3:** a fatura do cartão em aberto entra na conta pagadora **quando existir conta padrão** (NEED-032); sem ela, aparece em "sem conta definida".
- **RN-033.4:** saldo previsto negativo é **destacado** (alerta, sem bloqueio, como já ocorre com conta negativa).
- **RN-033.5 (consistência):** a soma das linhas bate com o total de "a pagar" do mesmo recorte (mesma fonte de dados, regra do Resumo).
- **RN-033.6:** respeita "Só meu": o que o membro não pode ver não entra no cálculo exibido a ele? Q-U24.
- **RN-033.7:** transferências previstas (NEED-030) e receitas previstas (US-051) entram no saldo previsto quando existirem.

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| "Prevista sem efeito no saldo" | Saldo previsto é um **número derivado**, nunca grava | Mantém a regra: nada muda no saldo real |
| Visibilidade do "Só meu" (todos veem o lançamento, só dono controla) | "Só meu" é visível a todos hoje, então o cálculo pode incluir | Q-U24 confirma |

## 5. Pergunta
- **Q-U24:** o saldo previsto de uma conta deve incluir previstas "Só meu" de outro membro? Hipótese: sim (todos já enxergam, só o controle é restrito); caso contrário o saldo mostrado diverge do real.

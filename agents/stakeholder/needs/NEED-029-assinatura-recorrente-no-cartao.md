# NEED-029: Pagamento Recorrente no Cartão sem Fim (Assinatura)

## 📋 Metadados
- **ID:** `NEED-029`
- **Área:** Cartões e Previstas (estende NEED-003 e NEED-004)
- **Status:** Levantado em 2026-10-26 (uso real, item 4) — Q-U18/Q-U19 respondidas pelo usuário em 2026-10-26; prioridade **6ª** na ordem aprovada
- **Prioridade de valor:** **Should (Média/Alta)** — dor frequente (streaming, apps, seguros) e silenciosa
- **Consumidores:** Product Owner, Tech Lead
- **Origem:** Item 4 do feedback de uso real

---

## 1. Dor
Assinaturas caem todo mês no cartão, sem data de fim. Hoje o usuário só tem duas saídas ruins: parcelar (máx. 24x, com fim) ou digitar de novo a cada mês. Esquecer uma assinatura distorce a fatura prevista e o orçamento; ninguém vê quanto o conjunto de assinaturas pesa por mês.

## 2. O que já existe (verificado no código/estado)
- **Recorrência** existe para **previstas** (`estado/previstas-series.md`): mensal, sem fim (`NONE`) ou com N ocorrências, mas **só com conta bancária de pagamento** (cartão não é aceito; "Séries exigem conta de pagamento", L-2: só mensal, valor igual).
- **Parcelamento** (`estado/parcelamento.md`): 2..24 parcelas, com fim; não serve para assinatura.
- Compra no cartão não admite data futura (exceto as parcelas materializadas).
- Ou seja: **falta o "cartão" como meio de pagamento da série**, não a recorrência em si.

## 3. Regras de negócio propostas (RN)
- **RN-029.1:** a família pode cadastrar uma cobrança mensal recorrente **num cartão**, sem data de fim (e com fim opcional), com dia de cobrança, valor, categoria e responsável.
- **RN-029.2 (diferente de parcelamento):** o total não consome o limite de uma vez; consome o valor do mês (hipótese). Não há "parcela x/y".
- **RN-029.3:** cada mês a cobrança aparece na **fatura correspondente ao ciclo do cartão** (RN de fechamento vigente), de modo que o app mostre o comprometimento futuro **sem contar duas vezes** (uma na previsão e outra na fatura, vide "Resumo: Despesas = projeção").
- **RN-029.4:** cancelar/encerrar a assinatura é ação simples e preserva o histórico já cobrado; reajuste de preço vale a partir de um mês (sem reescrever o passado), coerente com L-3.
- **RN-029.5:** a lista de assinaturas ativas mostra o total mensal (valor de decisão: "o que posso cortar"), sem virar análise de IA (isso é NEED-027).
- **RN-029.6:** vale "Só meu" e divisão como em qualquer despesa; no cartão, "Só meu" segue a regra de controle do titular (`so-meu.md`).

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| Série exige conta (não cartão) | Precisa aceitar cartão | Estender a recorrência; não criar outro conceito (menos regras para a família aprender) |
| Compra no cartão sem data futura | Cobranças de meses seguintes seriam futuras | Mesmo tratamento das parcelas (materialização com competência no mês da fatura); decisão do Tech Lead |
| Parcelado = sempre "Só meu" e fora do acerto (US-042 não liberada) | Assinatura dividida entraria no acerto? | Q-U19 |
| Fatura só paga integral, `PAID` trava compras | Cobrança futura caindo em fatura paga | Não pode alterar fatura paga: a série pula/avisa (regra de negócio: "fatura paga não muda") |
| Previstas "sem efeito no saldo" | Assinatura no cartão afeta a fatura prevista | Entra na projeção, nunca no saldo da conta |

## 5. Perguntas em aberto
- **Q-U18 — RESPONDIDA (usuário, 2026-10-26):** a cobrança é **lançada sozinha** todo mês, com a opção de **corrigir o valor do mês**.
- **Q-U19 — RESPONDIDA (usuário, 2026-10-26):** assinatura **dividida entra no acerto** (se a divisão estiver ligada; senão "Só meu").

**Prioridade aprovada:** 6ª. Histórias: US-096..US-099.

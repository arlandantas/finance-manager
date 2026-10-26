# NEED-031: Previsão na Mesma Interface de Lançar Despesa e Receita

## 📋 Metadados
- **ID:** `NEED-031`
- **Área:** Ergonomia de lançamento e Previstas (estende NEED-004 e NEED-022; liga-se a US-051)
- **Status:** Levantado em 2026-10-26 (uso real, item 6) — pode ser decidido pelo time; Q-U21 só informativa
- **Prioridade de valor:** **Should (Alta)**
- **Consumidores:** Product Owner (fluxo), Tech Lead
- **Origem:** Item 6 do feedback de uso real

---

## 1. Dor
Hoje "lançar uma despesa" e "prever uma despesa" são lugares e formulários diferentes, com campos parecidos. A família pensa **uma vez só**: "tenho esta despesa, já aconteceu ou vai acontecer?". Aprender duas portas, repetir campos e não achar onde prever aumenta o atrito justamente no gesto mais frequente do app.

## 2. Situação atual (verificada)
- Prevista tem formulário e telas próprias (Previstas, A pagar); o lançamento rápido (FAB) não prevê (`estado/previstas-series.md`).
- Receita prevista não existe (US-051 aprovada p/ Dev, não iniciada): hoje a pergunta só vale para despesa.
- Séries (recorrência) têm cadastro à parte.

## 3. Regras de negócio propostas (RN)
- **RN-031.1:** ao lançar, o usuário escolhe, no mesmo fluxo, se o valor **já aconteceu** (lançamento real) ou **vai acontecer** (prevista); o resto dos campos é o mesmo (valor, categoria, responsável, descrição, conta, divisão, "Só meu", tags).
- **RN-031.2:** as **regras de negócio não mudam**: prevista continua sem efeito em saldo, extrato, totais e acerto até a baixa; lançamento real segue data não futura. Unificar a porta não unifica o efeito.
- **RN-031.3:** a escolha deve deixar óbvio, antes de salvar, qual será o efeito (some do extrato/aparece em "a pagar").
- **RN-031.4:** o caminho rápido do lançamento (meta < 10 s, NEED-022) não pode piorar; "previsto" é opção, não etapa obrigatória.
- **RN-031.5:** quando a receita prevista (US-051) existir, ela usa a mesma porta.
- **RN-031.6:** recorrência (série) segue acessível ali ou a partir dali, sem perder a regra de "conta de pagamento".

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| Prevista tem campos próprios (responsável pelo pagamento, vencimento, conta opcional) | Formulário único precisa cobrir ambos | Desenho é do PO; negócio exige só RN-031.2 |
| Prevista nasce "Só meu" por padrão (D-GES-15), lançamento real não | Padrões diferentes na mesma tela | Manter cada padrão e mostrar ao trocar |
| Dividir parcelado bloqueado | Previsão de parcelado não existe | Fora do escopo |

## 5. Pergunta
- **Q-U21 (informativa):** o usuário quer que a "série" (todo mês) também apareça nessa mesma porta? Hipótese: sim, como opção "repetir".

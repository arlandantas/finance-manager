# NEED-034: Polimento de UX Agregado (Seleção Despesa x Receita, Espaçamento, Alinhamento do Extrato, "Ver Compra")

## 📋 Metadados
- **ID:** `NEED-034`
- **Área:** Ergonomia e consistência visual (estende NEED-022)
- **Status:** Levantado em 2026-10-26 (uso real, itens 1, 2, 7 e 10) — decidido pelo time; sem pergunta ao usuário
- **Prioridade de valor:** **Should** (itens 1, 2, 7) e **Could** (item 10)
- **Consumidores:** Product Owner (desenho), Dev
- **Origem:** Itens 1, 2, 7 e 10 do feedback. Princípio: a dor é descrita aqui; o desenho é do PO

---

## 1. Dores
| Item | Dor (o que dói) | Impacto | Prioridade |
| :-: | :--- | :--- | :-: |
| 1 | Seleção **despesa x receita** pouco destacada (gestão de categorias, nova despesa e onde mais houver): risco de lançar/criar do tipo errado | Dado errado entra em totais e acerto; erro é corrigível mas custoso | **Should** |
| 2 | Espaçamento excessivo entre campos (nova conta e outros formulários): formulário parece longo e cansa, sobretudo no celular | Lentidão no gesto frequente (< 10 s, NEED-022) | **Should** |
| 7 | Colunas das tabelas do extrato **não se alinham entre linhas**: leitura de valores e datas fica difícil | Extrato é a tela de conferência; perde confiança | **Should** |
| 10 | Em compra parcelada, o "ver compra" aparece **fora do cartão** da linha | Incoerência com as demais ações do card | **Could** |

## 2. Regras (RN)
- **RN-034.1 (consistência):** o que vale para um formulário vale para todos: a mesma densidade e o mesmo destaque do seletor de tipo em qualquer lugar onde o tipo (despesa/receita) é escolhido.
- **RN-034.2:** o tipo selecionado deve ser **inequívoco de relance** (inclusive para daltonismo; cor nunca é o único sinal, NEED-017).
- **RN-034.3:** alinhamento do extrato vale para todas as linhas (incluindo parcela, transferência, acerto e pagamento de fatura) em qualquer largura de tela.
- **RN-034.4:** "ver compra" passa a ser uma ação do próprio card da compra parcelada, sem perder a acessibilidade (rótulo/ícone claro).
- **RN-034.5:** polimento **não muda regra de negócio**; sem regressão de BDD/QA.

## 3. Situação atual (verificada)
- Itens de UI nos componentes de extrato (`ledger-row.tsx`, `transaction-detail-drawer.tsx`) e formulários. Não são regras de negócio; checar com o PO se algum item já foi tocado em `NEED-022`/`US-039`.

## 4. Conflitos e perguntas
Nenhum conflito com regra de negócio. Pergunta ao usuário: **nenhuma**. O PO decide o desenho; se houver 2 alternativas de layout que mudem o fluxo, o Gestor escolhe.

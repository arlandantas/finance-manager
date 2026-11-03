# Regras: dinheiro e centavos

- Todo valor monetário é inteiro em centavos (`amountInCents`); percentuais em basis points (10000 = 100%). Nunca `float`/`number` fracionário.
- Cálculo de rateio usa BigInt (`splitAmount`/`apportion`); nenhum arredondamento por `Math.round` em valores.
- Rateio por maior resto, desempate pelo menor ordinal; só entram membros com `bps > 0`. Sobra vai ao pagador se ele participa.
- Invariantes: Σ partes = valor e Σ bps = 10000 em todo lançamento dividido; Σ diferenças do acerto = 0.
- Rateio e regra gravados no lançamento são imutáveis para o passado; mudar a regra nunca reescreve lançamentos (ADR-011, ADR-016).
- Receita nunca é dividida (`isSharedExpense=false`; `true` = 400).
- Ledger só por correção/revisão; saldo e totais pelas funções únicas (`accountBalances`, `buildLedgerWhere`). Ver ADR-007, ADR-014.
- Servidor não renderiza valor monetário em HTML; formatação só no cliente.
- Toda regra de centavos nova vem com teste de propriedade/limite (1 centavo, divisão por 3, soma exata).

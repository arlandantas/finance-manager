# Regras: Prisma e banco

- Migração aplicada nunca é editada; mudança = nova migração (`pnpm db:migrate`; produção `pnpm db:deploy`).
- Todo escopo de leitura/escrita filtra por `familyId`; FKs compostas por família (ADR-013).
- `lockFamilySplit` (`FOR SHARE`) é a PRIMEIRA trava de escrita em despesa comum, regra, acerto, previsão e parcela; depois travas `FOR UPDATE` nunca em ordem inversa.
- Travas e mutações rodam dentro da transação do `withApi`, antes da mutação.
- Toda mutação grava revisão com `revision = version`; sem `DELETE` em `transactions` nem `UPDATE/DELETE` em `transaction_revisions` (gatilhos).
- POST de escrita aceita `Idempotency-Key`; mesma chave + mesmo corpo = mesma resposta (ADR-009); concorrência otimista por `version`.
- Funções SQL definem `search_path=pg_catalog, public`.
- Nunca `where: { userId: <expr possivelmente null/undefined> }`; compare pessoa só com `userId` não nulo.
- Seed (`pnpm db:seed`) só dados de teste; nunca segredos nem dados reais.

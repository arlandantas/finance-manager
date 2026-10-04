# ADR-013: Isolamento por `familyId` e contexto da família na sessão

## Status
Aceito (Tech Lead). Detalha o princípio de multi-tenancy do ADR-001.

## Decisão
1. **A API não recebe `familyId` do cliente.** A família vem do `Member` do usuário da sessão (`RequestContext = { userId, memberId, familyId, role }`). Isso substitui a rota `/families/:familyId/transactions` do SDD-001 original e elimina a classe de erro IDOR por parâmetro.
2. **Camada única de repositório:** todo acesso a dados de domínio passa por repositórios que **exigem** `familyId` no construtor (`makeRepos(db, ctx)`); é proibido usar `getDb()` diretamente em Route Handlers/serviços (regra de lint por restrição de import em `src/app/**` e `src/modules/**/service.ts`).
3. **Recurso de outra família = `404 NOT_FOUND`** (nunca 403), para não vazar existência.
4. **Defesa em profundidade no banco:** chaves estrangeiras **compostas** `(familyId, id)` entre tabelas de domínio (uma `Transaction` não pode apontar para `BankAccount`/`Category`/`Member` de outra família). **RLS do Postgres não entra no R1** (custo de operação com Prisma/pool); reavaliar no AP1.
5. **Teste obrigatório "tenant-isolation"** por recurso: cria duas famílias, executa leitura e escrita cruzadas e espera `404`/ausência (modelo no SDD-000 §9).

## Consequências
Rotas mais simples e seguras; o preço é a disciplina do repositório, verificada por lint e testes.

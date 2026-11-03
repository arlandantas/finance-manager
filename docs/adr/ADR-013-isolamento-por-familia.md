# ADR-013 — Isolamento por `familyId` e contexto da família na sessão

**Status:** aceito (detalha multi-tenancy do ADR-001) · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Dados financeiros de uma família nunca podem vazar para outra; rotas com `familyId` do cliente abrem IDOR.

## Decisão
1. **A API não recebe `familyId` do cliente.** Vem do `Member` da sessão: `RequestContext = { userId, memberId, familyId, role }`.
2. **Camada única de repositório:** `makeRepos(db, ctx)` exige `familyId`; proibido `getDb()` direto em Route Handlers/serviços (lint por restrição de import em `src/app/**` e `src/modules/**/service.ts`).
3. Recurso de outra família = **`404 NOT_FOUND`** (nunca 403).
4. **Defesa em profundidade:** FKs **compostas** `(familyId, id)` entre tabelas de domínio. RLS do Postgres fora do R1 (reavaliar no AP1).
5. **Teste obrigatório "tenant-isolation"** por recurso: duas famílias, leitura e escrita cruzadas esperam `404`/ausência.

## Consequências
- Rotas mais simples e seguras; o preço é a disciplina do repositório, verificada por lint e testes.

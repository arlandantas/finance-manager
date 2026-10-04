# Pedidos e Desvios do Desenvolvedor & QA ao Gestor

*Registro de lacunas/erros de SDD e das hipóteses conservadoras adotadas (diretriz 6 do Gestor). Nenhum item bloqueia a execução.*

| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto |
| :-- | :-- | :-- | :-- | :-- | :-- |
| DEV-01 | 2026-10-04 | EN-001 | SDD-000 §3 e SDD-001 §7 divergem na mensagem para valor não inteiro (`1.5`) | Mensagem única "Informe um valor maior que zero" | Nenhum |
| DEV-02 | 2026-10-04 | US-001 | Next 16 renomeou `middleware.ts` para `proxy.ts` (SDD-003 §3.4) | `src/proxy.ts`, mesmo contrato (checagem otimista do cookie) | Nenhum |
| DEV-03 | 2026-10-04 | US-001 | `withApi`/`IdempotencyRecord` e os modelos Family/Member/Category/SplitRule nascem na US-001 | Uma migração `us001_auth_e_nucleo_familiar`; US-002 só adiciona serviço/UI | Nenhum |
| DEV-04 | 2026-10-04 | US-001 | Sessão resolvida por consulta direta à tabela `sessions` (cookie Auth.js) em vez de `auth()` | Mesmo cookie e mesma tabela; Auth.js usado para OAuth Google e `signOut` | Nenhum |
| DEV-05 | 2026-10-04 | US-001 | ADR-009 §4 pede gravar 4xx determinísticos no registro de idempotência | Apenas 2xx são gravados (4xx fazem *rollback* e a repetição reproduz o erro) | Nenhum observável |
| DEV-06 | 2026-10-04 | US-001 | Gherkin da US-001 usa `E, após entrar…` (inválido para o parser) | Escrito como `E após entrar…` | Nenhum |
| DEV-07 | 2026-10-04 | US-001 | `check:imports` (SDD-006 §6) não prevê onde fica a infra de autenticação | Exceção `src/lib/auth/**` | Nenhum |
| DEV-08 | 2026-10-04 | US-004 | SDD-004 exige "falha injetada no `postOpening`" e `createAccount` não expõe esse ponto | Falha injetada em `recordRevision` (logo após a abertura) prova o mesmo *rollback* | Nenhum |
| DEV-09 | 2026-10-04 | US-005/US-006 | Atualização otimista do SDD-001 §5.1 depende da lista do extrato | Implementada com a US-007 (`optimistic.ts`, testada); US-005 invalida os caches | Nenhum |
| DEV-10 | 2026-10-04 | US-005 | SDD-001 §5.1 não lista "Descrição" no drawer, mas o BDD "Descrição omitida" exige informá-la ou omiti-la | Campo opcional dentro de "Mais detalhes" | Nenhum |
| DEV-11 | 2026-10-04 | US-007 | Contexto Gherkin da US-007 tem frase multilinha (inválida no parser) | Dividido em `Dado… / E… / E…` | Nenhum |
| DEV-12 | 2026-10-04 | US-003 | SDD-003 manda enviar o e-mail "após o commit", mas o handler roda dentro da transação do `withApi` | Gancho `afterCommit` no `withApi` (mescla `emailStatus` na resposta e no registro de idempotência) | Nenhum |
| DEV-13 | 2026-10-04 | R1 | `prisma migrate reset` é bloqueado em sessão de IA e o ledger não aceita `DELETE` | Testes usam `TRUNCATE` no `db-test`; limpeza do banco dev fica manual (ver tasks-board) | Registro |

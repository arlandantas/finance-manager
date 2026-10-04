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

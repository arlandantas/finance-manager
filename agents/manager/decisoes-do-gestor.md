# Decisões do Gestor do Projeto

*Atualizado: 2026-10-04. Registro de conflitos resolvidos entre agentes e de diretrizes de execução.*

## Conflitos resolvidos
| ID | Conflito | Decisão | Quem executa |
| :-- | :-- | :-- | :-- |
| D-GES-01 | PO propõe R1 (Inc 1+2) e R2 (Inc 3); o cronograma do Stakeholder trata tudo como AP0 | **Ratificado.** R1 = EN-001, US-001..013. R2 = US-014..019. Homologação de valor após R1. | Todos |
| D-GES-02 | NEED-007 (split) no AP2 (Stakeholder) vs MVP (ADR-006) | **ADR-006 prevalece.** Stakeholder atualiza `cronograma-e-releases.md`. | Stakeholder |
| D-GES-03 | Q-13: US-013 Should ou Must | Permanece **Should**, mas fica **dentro da R1** (Inc 2). Último a ser cortado se o prazo apertar. | PO |
| D-GES-04 | Q-17: pagar fatura no AP0 | **Should em R2**, aceito. | PO |
| D-GES-05 | D-PO-01, D-PO-02, D-PO-03 | **Aprovadas** provisoriamente pelo Gestor; o Stakeholder valida na homologação. | Stakeholder |
| D-GES-06 | Q-01 (dependentes sem login) | **Fora do MVP** (US-021). | — |
| D-GES-07 | Q-03 (validade do convite) | **7 dias.** | TL |
| D-GES-08 | Q-08 (vigência da regra de divisão) | **Sim**, com vigência por data, para preservar meses passados. | TL (SDD-002) |
| D-GES-09 | `tasks-board.md` desatualizado (TASK-002 aponta para a antiga US-001) | Dev reescreve o quadro a partir da ordem do PO. TASK-001 = EN-001. | Dev |
| D-GES-10 | Portas do ambiente local colidem com serviços da máquina (5432, 3000, 6379, 3306 ocupadas) | Usar **Postgres dev 5442, Postgres teste 5443, app 3100**, mailpit SMTP 1025/UI 8025. `AUTH_URL=http://localhost:3100`. TL ajusta `ambiente-local.md`. | TL/Dev |
| D-GES-11 | Login Google exige conta/credenciais externas | Em dev usar **provedor de login de teste** (Credentials/dev-login), ativo só com `AUTH_DEV_LOGIN=true` e bloqueado em `NODE_ENV=production`. Google real fica como pendência (ver `pendencias-externas.md`). | TL especifica, Dev implementa |

## Diretrizes de execução
1. **Tudo local, sem integrações externas.** O que depender de conta, token ou serviço externo é mockado ou feito por *adapter*, com a pendência registrada em [`pendencias-externas.md`](pendencias-externas.md).
2. Ordem de execução: a do PO (`status.md`): EN-001 → US-001 → US-002 → US-004 → US-005 → US-006 → US-007 → US-003 → US-008 → US-009 → US-010 → US-011 → US-012 → US-013.
3. Nenhuma história é iniciada sem SDD cobrindo-a. O TL entrega os SDDs antes do Dev tocar cada história. EN-001 pode começar já.
4. QA: testes unitários, de integração e e2e/BDD; verificação manual no **navegador integrado** é autorizada, sem pedir permissão ao usuário.
5. Commits atômicos, automáticos, com `Co-authored-by` do agente. Sem push.
6. Se um agente detectar conflito ou ambiguidade, registra em `agents/manager/` (arquivo `pedidos-ao-gestor.md`) e segue com a hipótese mais conservadora.

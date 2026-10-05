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

## Ratificações (R2)
| ID | Decisão |
| :-- | :-- |
| D-GES-12 | **Ratificado D-PO-10:** US-016 → 016a/016b e US-017 → 017a (ver fatura, Must) / 017b (pagar, Should). Ordem de corte na R2: US-014, depois 017b, depois 016b. |
| D-GES-13 | **PO-01/Q-20 aceito:** compra no cartão é creditada no acerto a quem comprou (RN-003.3). Revisar na homologação da R2. |

## Ratificações (R2.1 e R3)
| ID | Decisão |
| :-- | :-- |
| D-GES-14 | **Ratificadas D-PO-12..32** (`product-owner/backlog/decisoes-po-r21-r3.md`) e o parecer do Stakeholder (Q-F01..Q-F14). O usuário delegou as decisões ao time. |
| D-GES-15 | **D-PO-16 aceita:** despesas previstas também nascem "Só meu" (revisa Q-22). O fechamento do mês avisa as não divididas. |
| D-GES-16 | **D-PO-26 aceita:** parcela conta no mês da fatura; à vista segue pela data da compra. O Tech Lead avalia no SDD e sinaliza se a assimetria gerar inconsistência no Extrato/Resumo. |
| D-GES-17 | **Parcelamento (US-040/042):** puxado para o fim dos Must da R2.1 se o Tech Lead estimar US-040 ≤ 5 e US-042 ≤ 3 e não depender da EN-002; senão fica como 1º item da R3. |
| D-GES-18 | **Ordem de corte** da R2.1 (US-039, 037, 038, 036, 033, 035, 031) e da R3 aprovadas como propostas pelo PO. |
| D-GES-19 | **Dev:** antes de iniciar a R2.1, rodar a suíte E2E completa (desktop e mobile) como linha de base; a TASK-025 só rodou parte. |
| D-GES-20 | **Acesso em dev:** `localhost`, IP privado da LAN (liberação automática, desligável por `APP_DEV_LAN_AUTO=false`) e túnel só sob pedido (TASK-025). |
| D-GES-21 | **Ratificadas D-PO-33..42** (ajustes pós-TL). **D-PO-34 aceita:** o corte da R3 é reescrito (US-051 → 050 → 049 → 046 → 044 → 041 → 043), com EN-002 Must por ser pré-requisito da US-042; isso substitui o corte de D-GES-18 para a R3. Ordem final da R2.1 (67 pts) conforme D-PO-35. |
| D-GES-22 | **Stakeholder valida na homologação da R3:** assimetria à vista × parcela (ADR-020) e a limitação de acento na busca do Extrato. |
| D-GES-23 | **TL-11 aceito:** a R3 é entregue em duas fatias. **R3-A** = US-040a/b (parcelamento) + EN-002a/b (percentual por lançamento e troca de motor, interface inalterada); **R3-B** = US-042, US-043, US-041 e o restante. A EN-002 só começa com S1..S16 e os valores homologados verdes e o gate de 1 centavo (ADR-021); `computeSettlementLegacy` extraído em commit à parte. Entre R3-A e R3-B há uma pausa para a homologação e janela de reversão. |
| D-GES-24 | **Ajustes TL-10..TL-22** devolvidos ao PO (BDD da US-040, US-041, US-043, US-044, tags/Análise, US-051). Hipóteses conservadoras do TL valem até o PO ratificar. |
| D-GES-25 | **Ratificadas D-PO-43..47** (R3-A/R3-B, ajustes de BDD da US-040/041/043/044/045/047/049/051). Janela de reversão entre R3-A e R3-B: ≥ 7 dias, `--verify` limpo e um fechamento de mês conferido. O texto "Fatura fechada" da US-041 deve ser confirmado pelo Dev na tela. |
| D-GES-26 | **DEV-35/DEV-36 aceitos:** "A pagar" é por vencimento no mês (a regra "hoje+7" deixa de existir); BDD das US-025, US-017a e US-018 ajustados pelo PO (b83169c). |

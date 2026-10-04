# Relatório de QA — Regressão completa da R1

*Data: 2026-10-04 · Responsável: Agente Desenvolvedor & QA · Escopo: EN-001, US-001..US-013 (Incremento 1 + Incremento 2) · Ambiente: Next 16 dev em 3100 (Postgres dev 5442, Mailpit 8025), testes em `db-test` 5443 e app 3101.*

## 1. Resultado das suítes (após a US-013b, árvore limpa)
| Suíte | Resultado |
| :-- | :-- |
| `pnpm lint` (Biome) | verde |
| `pnpm typecheck` | verde |
| `pnpm test` (unidade, inclui `check:imports`) | 175 testes verdes |
| `pnpm test:int` (Postgres real) | 229 testes verdes |
| `pnpm test:e2e` (playwright-bdd em pt, desktop + mobile Pixel 7) | 214 testes verdes (107 cenários x 2) |
| `pnpm build` | verde |

Cobertura por história: ver `tasks-board.md` (cada TASK lista os testes). Vetores S1..S13 e A1..A7 do SDD-002, propriedades com semente fixa (apportion 1.500 casos; acerto 400 casos) e testes de isolamento entre famílias existem para todos os recursos.

## 2. Roteiro manual ponta a ponta (navegador integrado, 375 px, banco dev recriado do zero)
1. Login de teste (Ana Souza) -> onboarding: nome sugerido "Família Souza", família criada, passo de convite.
2. Convite para `bruno@exemplo.com`: e-mail recebido no Mailpit (assunto e link corretos); abrir o link como Bruno vincula à família e cai na Home.
3. Contas (Nubank Ana R$ 8.000,00, Itaú Bruno R$ 2.000,00) e lançamentos (aluguel R$ 2.400,00 e mercado R$ 600,00 comuns, cinema R$ 90,00 pessoal, farmácia R$ 200,00 comum de Bruno).
4. Painel de acerto: "Bruno deve R$ 1.500,00 para Ana" (despesa pessoal fora do total; 100%/0% na Home); registro do acerto pela API do painel.
5. Correção: aluguel R$ 2.400,00 -> R$ 2.000,00 em mês já acertado: 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`, com a confirmação 200; o acerto inverte o sentido: "Ana deve R$ 200,00 para Bruno" (saldo restante -/+ R$ 200,00).
6. Home: saldo da família R$ 7.110,00 (transferência/acerto neutros), card de acerto, resumo e últimos lançamentos.
7. Rolagem horizontal: `scrollWidth == 375` em `/`, `/extrato`, `/contas`, `/familia`, `/acerto`, `/acerto/regra`.
Também verificados em cada história (ver board): regra 60/40 com soma ao vivo, somente leitura para Membro, transferência com saldo negativo, desfazer acerto, edição/histórico, lista das despesas comuns.

## 3. Bugs e achados
| # | Achado | Estado |
| :-- | :-- | :-- |
| B-01 | Cabeçalho de Contas quebrava "Nova conta" em duas linhas no celular com o novo botão "Transferir" | Corrigido (header com wrap e `whitespace-nowrap`) |
| B-02 | Parecer de regra: `SettlementDTO.rule.kind` mostrava a regra de hoje em meses encerrados (quebrava "meses passados não mudam") | Corrigido (regra vigente no último dia do período; DEV-14) |
| B-03 | Passos BDD genéricos (`vejo {string}`, `vejo {string} e {string}`) não aceitavam frases compostas ("Saldo da família: R$ …") | Corrigido nos passos |
| B-04 | Tela inicial era apenas um "Bem-vindo" (placeholder da R1) | Substituída pela Home (US-012) |
| A-01 | Aviso do `pg`: "Calling client.query() when the client is already executing a query" vem de `Promise.all` sobre a mesma transação em `getFamily` e `invitations/service` (Inc 1) | Aberto, baixo risco (quebra no pg@9); módulo split/home já evitam |
| A-02 | Em dev, a primeira chamada a uma rota nova demora (compilação); após registrar acerto o navegador integrado chegou a recarregar a Home uma vez durante a compilação | Observado só em dev, não reproduzido nos E2E |

## 4. Pontos de atenção para a homologação do Stakeholder
- **Regra de divisão "a partir de agora"**: despesas já lançadas hoje passam a usar a nova regra (vigência por data, D-GES-08); para preservar o mês corrente use *Vigência* futura (Mais detalhes). Meses encerrados nunca mudam.
- **Acerto parcial e correções**: editar/excluir despesa comum em mês acertado pede confirmação e recalcula; o saldo pode inverter de sentido (S12). Há "Desfazer acerto" no painel e no detalhe.
- **Participantes da divisão igual**: só entram membros que entraram até o fim do período; membro novo com regra proporcional deixa a regra "desatualizada" (aviso ao Admin e ao painel).
- **Sugestões com 3+ membros**: guloso determinístico (≤ N-1 transferências), cada uma com seu botão "Registrar".
- **Banco dev** foi recriado (`down -v`) durante o QA: contém a Família Souza (Ana/Bruno) do roteiro; `pnpm db:seed` cria a Família Silva se necessário.
- **Pendências externas** (sem mudança): Google OAuth (EXT-01), SMTP real (EXT-02, EXT-08), Auth.js beta (EXT-09), hospedagem/CI (EXT-03, EXT-06).
- Desvios registrados em `agents/manager/pedidos-ao-gestor.md` (DEV-14 e DEV-15 neste incremento).

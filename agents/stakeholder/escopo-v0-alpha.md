# Escopo da v0 (primeiro alpha tester) — Stakeholder + Gestor

*2026-10-05 · Fontes: `feedback-usuario-v0.md` (11 itens), `homologacao-r21.md`, backlog R2.2/R3, `pendencias-externas.md`. Decisões delegadas ao time pelo usuário (sem Q-U novas). Sem desenho de tela: o "como" é do PO.*

## 1. Definição da v0

**v0 = o próprio usuário usa o app no dia a dia, em ambiente produtivo (URL https, banco com backup, login Google real).** Critério de pronto, do ponto de vista de valor:
1. Em menos de 1 min por lançamento, a família **lança despesa/receita** (inclusive parcelada e de cartão) e **vê, ao abrir o app, o que vence nos próximos dias e o extrato recente**.
2. **Despesas fixas (recorrentes) são cadastradas uma vez** e geram previstas; cada prevista diz de qual conta sairá.
3. **Saldos confiáveis**: reserva de emergência não polui o "disponível".
4. O fechamento do mês em casal continua explicando o número (Resumo do Mês coerente: Despesas = Previstas + Não previstas).
5. Nenhum bug de usabilidade que atrapalhe uso diário (modal sobreposto, hover ilegível no escuro, menu).
6. Dados do usuário em produção **sem login de teste** e com backup.

**Explicitamente FORA da v0:** IA generativa (NEED-023), grupos não familiares/contas privadas (NEED-021), exclusão da família (Q-U02), construtor de relatórios, tags/visões sintéticas/cores (R3-B+), transferência recorrente/agendada, corrigir forma de pagamento (achado 6 antigo), unificar linhas de transferência, Sentry (EXT-04), CI remoto (EXT-06), domínio de e-mail próprio com SPF/DKIM (EXT-08) enquanto o convite puder ser dispensado no alpha.

## 2. Classificação (11 itens do usuário + homologação R2.1)

| # | Item | Valor / NEED | Classe | Recomendação objetiva |
|:-:|:--|:--|:-:|:--|
| U1 | Hover branco/letra branca no escuro; revisar contraste geral | Uso diário legível (NEED-014) | **Must** | Revisão única dos tokens de hover/focus/active/disabled nos dois temas + teste visual; bug de uso, barato. |
| U2 | Início simples (lançar, pendentes dos próximos dias, extrato recente) | Acompanhamento diário | **Must** | Ver decisão (a). |
| U3 | Conta prevista de pagamento + resumo por conta no A pagar | Prever caixa por conta (NEED-003/004) | **Must** (conta da previsão) / **Should** (resumo por conta) | Campo "pagar com" na previsão no Must; resumo por conta com saldo atual/previsto logo depois. |
| U4 | Despesa recorrente | Dor central: contas fixas (NEED-003) | **Must** | **Não existe** no código (só menções em ADR-003 e US-006). Ver decisão (c). |
| U5 | Bug: modal de confirmação não cobre o detalhe | Confiança/uso | **Must** | Corrigir empilhamento/overlay de diálogos aninhados, em todos os diálogos. |
| U6 | Conta fora do saldo disponível (reserva) | Saldo confiável | **Must** | Ver decisão (e). |
| U7 | Transferência prevista/agendada | Poupar todo mês | **pós-v0** | Ver decisão (f). Workaround: transferência manual mensal. |
| U8 | Horário/login Google OK | — | Info | Fechado. Reforça: Google de produção é bloqueante (§3). |
| U9 | Navegação ainda no topo no desktop | Ergonomia diária | **Should** | Ver decisão (h). |
| U10 | "Limpar todos os filtros" no Extrato | Uso diário | **Must** (junto com U2) | Ver decisão (b). Barato. |
| U11 | Resumo: "A pagar" -> "Previstas" | Clareza do número | **Should** | Ver decisão (g); só rótulo/composição, sem mexer no motor. |
| H1 | US-052 aviso: parcelado fora do acerto | Evita discussão do casal | **Must** | PO já marcou "não cortar"; 2 pts. |
| H2 | US-055 faturas na tela A pagar | Uma visão só do que vence | **Must** | Sustenta U2/U3 (pendentes completos); 3 pts. |
| H3 | US-054 avisar antes de arquivar + "+" cobre ações em Contas | Evita frustração | **Should** | Manter, cortável. |
| H4 | US-053 clareza de textos | Polimento | **pós-v0** | Cortar primeiro. |
| H5 | US-042 parcela entra no acerto | Fecha ressalva I da homologação | **Should** | Com o aviso (US-052), não bloqueia alpha de uma pessoa; entra logo após. |

### Decisões de produto

- **(a) Início:** ações rápidas + "vence nos próximos dias" (inclui faturas) + extrato recente. Resumo/saldos vão para **card colapsado (fechado por padrão) na própria Início**, com um número-síntese. *Justificativa:* tela secundária adiciona navegação e custo; o card colapsado mantém a análise pontual a 1 toque e atende a diretriz de poucos números.
- **(b) Filtros do Extrato:** **colapsados por padrão**, com indicador de "N filtros ativos" e botão "Limpar filtros". *Justificativa:* a leitura diária é a regra; filtrar é exceção.
- **(c) Recorrente:** **não existe**. Entra na v0 como mínimo viável: despesa **mensal fixa** (dia do mês; se o dia não existir, último dia), **fim opcional (N meses ou sem fim)**, que **gera previstas** dos próximos meses (horizonte curto, ex.: 12, renovado ao abrir) com conta de pagamento. Editar/encerrar afeta só as futuras. **Fora:** outras periodicidades, reajuste automático, recorrência de receita (v0.1). Domínio crítico (datas/centavos): modelo a cargo do TL.
- **(d) Conta prevista + resumo por conta:** conta de pagamento prevista em toda previsão (sugestão padrão = conta mais usada). Resumo por conta no A pagar com **saldo atual, total em aberto e saldo previsto**; é Should (a conta da previsão é Must).
- **(e) Conta fora do saldo:** **flag por conta "não conta no saldo disponível"** (ex.: reserva). Continua movimentável e visível em Contas, mas sai do total disponível e do saldo previsto (exibida à parte como "Reservas"). Não afeta o acerto do casal.
- **(f) Transferência prevista/recorrente:** **pós-v0.** Depende da recorrência (c) estabilizada; valor real, mas o workaround manual é aceitável para 1 usuário. Primeira candidata da v0.1.
- **(g) Resumo do Mês:** "A pagar" vira **"Previstas"**; **Despesas = Previstas + Não previstas**; **Previstas = Faturas + A pagar em aberto + pagas**; Não previstas = demais despesas do mês. Deve reconciliar com a tela A pagar (US-055). Should.
- **(h) Navegação desktop:** tratar como **menu lateral no desktop** (ajuste da US-038; mobile mantém a barra inferior). Should: se o custo for alto, vira pós-v0 sem perda de função.
- **(i) Bugs:** modal sobreposto (U5) e hover (U1) são Must; contraste de estados é uma revisão geral única, não bug a bug.

## 3. Checklist de produção/alpha

| Item | Bloqueia a v0? | Quem | Caminho mais barato/simples |
|:--|:-:|:--|:--|
| Hospedagem (EXT-03, ADR-005) | **Sim** | Time propõe; usuário cria conta/paga | 1 PaaS único com Node + Postgres gerenciado (Fly/Render/Railway); `output: standalone` já existe. Uma região, plano mínimo. |
| Postgres gerenciado + backup | **Sim** | Time (migração/scripts); usuário habilita o plano | Backup automático diário do provedor + `pg_dump` semanal guardado fora; restaurar 1 vez em teste. |
| Google OAuth de produção (EXT-01/09) | **Sim** | Usuário (Console Google) | Adicionar `https://<host>/api/auth/callback/google` ao client existente; `AUTH_URL`/`AUTH_TRUST_HOST`; consentimento em "Teste" com o e-mail dele basta no alpha. |
| Segredos (EXT-07) | **Sim** | Time gera/documenta; usuário cola no provedor | `AUTH_SECRET` novo (`openssl rand -base64 32`); segredos só no painel do provedor. |
| Remoção do login de teste | **Sim** | Time | `NODE_ENV=production` sem `APP_HOMOLOG_MODE` (ADR-008/024); teste automatizado de que o login de teste não aparece em prod; critério de aceite do deploy. |
| Domínio e https | Parcial | Usuário | Subdomínio do provedor (https automático) já serve ao alpha; domínio próprio depois. |
| SMTP / convite (EXT-02/08) | **Não** | Usuário (depois) | Alpha de 1 pessoa dispensa convite; contratar transacional gratuito quando entrar outro membro (o link copiável já existe). |
| Sentry/CI (EXT-04/06) | Não | — | Logs do provedor bastam. |
| Next-auth beta (EXT-09) | Risco aceito | Gestor | Versão fixa no lockfile; registrar. |

**O time faz sem o usuário:** migrações/seed de produção, config de standalone/healthcheck, guarda do login de teste e seu teste, documentação do deploy e do restore. **Só o usuário faz:** criar conta no provedor, autorizar o redirect no Google, colar segredos.

## 4. Pacote de handover ao PO (ordem de execução)

| Ordem | Item | Classe | Depende de |
|:-:|:--|:-:|:--|
| 1 | U5 modal sobreposto + U1 contraste/hover (revisão geral) | Must | — |
| 2 | H1 US-052 aviso de parcelado | Must | — |
| 3 | U6 flag "fora do saldo disponível" | Must | — |
| 4 | U4 despesa recorrente mensal (+ U3 conta de pagamento na previsão) | Must | SDD do TL (datas/horizonte) |
| 5 | H2 US-055 faturas no A pagar | Must | — |
| 6 | U2 Início enxuta + U10 filtros colapsados/limpar | Must | 5 (pendentes completos) |
| — | **Fim dos Must = v0 mínima. A produção (§3) corre em paralelo e é bloqueante.** | | |
| 7 | U3 resumo por conta no A pagar | Should | 4 |
| 8 | U11 "Previstas" no Resumo | Should | 5 |
| 9 | U9 menu lateral desktop | Should | — |
| 10 | H3 US-054 | Should | — |
| 11 | H5 US-042 parcela no acerto | Should | — |

**Corte: se faltar orçamento, corta daqui para baixo (itens 7 a 11)**, e pós-v0 ficam U7 transferência agendada, H4 US-053 e R3-B em diante. Dentro dos Should, cortar na ordem 10, 9, 8, 11, 7 (o 7 é o mais valioso).

**Rastreabilidade:** `feedback-usuario-v0.md` -> este documento -> PO (novas US: recorrente, fora-do-saldo, Início enxuta; ajustes em US-038/US-017). Não cortáveis: itens 1 a 6 e os bloqueantes do §3.

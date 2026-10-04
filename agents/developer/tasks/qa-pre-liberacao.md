# QA pré-liberação (teste pelo túnel)

*Dev & QA, 2026-10-04. Rastreia `agents/manager/checklist-pre-liberacao.md`.*

## Como acessar
- URL vigente: **https://fancy-queens-kick.loca.lt** (muda se o túnel for reiniciado: `npx --yes localtunnel --port 3100`).
- Página de aviso do localtunnel: senha = IP público (`curl -s https://loca.lt/mytunnelpassword`), hoje `186.236.196.230`.
- Login: em `/login`, bloco "Entrar como (teste)": atalhos **Mariana** (Administradora) e **Lucas** (Membro), ou qualquer e-mail novo.
- A primeira carga pelo túnel é lenta (o dev serve dezenas de arquivos e o túnel aceita 2 conexões); recarregue uma vez para o cache valer. Erros de WebSocket/HMR no console são esperados no túnel.

## Dados de demonstração (`pnpm db:seed`, Família Silva)
Contas: Conta corrente e Poupança (Mariana), Conta Lucas e Dinheiro (Lucas). Cartão Nubank Roxinho (fecha 25, vence 5): fatura de agosto paga, de setembro fechada a pagar (vence 05/10), outubro aberta. Receitas, despesas comuns e uma individual, uma transferência, **previsão** "Condomínio" (vence em 10/10) e **acerto de outubro em aberto** (Lucas deve a Mariana). Reset: `docker compose -p finance-manager down -v` + `pnpm db:up && pnpm db:deploy && pnpm db:seed`.

## Bugs corrigidos nesta revisão (causa-raiz)
1. Login de teste "morto" no túnel: o `next dev` bloqueia `/_next/*` de outra origem (a página nunca hidratava) e o guard de Host aceitava só localhost. `APP_PUBLIC_ORIGIN` (env) agora alimenta `allowedDevOrigins` e libera o login de teste só no host exato; produção continua bloqueada; `/api/dev/clock` segue só localhost direto.
2. Toda mutação dava 403 `BAD_ORIGIN` (CSRF comparava Origin só com `AUTH_URL`): aceita o host de `APP_PUBLIC_ORIGIN` fora de produção.
3. Logout caía em `localhost:3100` e não encerrava a sessão (Auth.js usa `AUTH_URL`): logout próprio por cookie, redirect relativo.
4. Link do convite por e-mail apontava `localhost`: usa `APP_PUBLIC_ORIGIN` em dev.
5. Túnel devolvia 502/429 sob paralelismo: Service Worker só em dev (fila de 2, repetição, cache estático).
Testes: unit (guard, SW, env, logout), integração (login no host do túnel, relógio fechado ao túnel, CSRF, `endSession`).

## Roteiro verificado pelo túnel (mobile 375 px e desktop)
Login → Início (saldo, acerto, resumo, a pagar) → Contas → Extrato → novo lançamento no cartão → dar baixa na previsão → registrar acerto parcial → convidar membro, link do e-mail, aceite → pagar fatura de setembro → logout. Sem erro novo no console/rede (restam só os avisos de HMR no túnel). Sem overflow horizontal em 375 px.

## Roteiro sugerido ao usuário
1. Entrar como Mariana; conferir Início e "Acerto" (Lucas deve a Mariana).
2. Lançar uma despesa comum (conta e cartão), ver no Extrato e na fatura aberta.
3. A pagar: dar baixa no Condomínio; pagar a fatura de setembro.
4. Acerto: registrar pagamento do Lucas; ver o saldo restante.
5. Família: convidar um e-mail novo, abrir o link do Mailpit (http://localhost:8025) e entrar com esse e-mail.
6. Sair e entrar como Lucas; repetir o celular (375 px) e o desktop.

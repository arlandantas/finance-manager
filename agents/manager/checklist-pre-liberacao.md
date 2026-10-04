# Checklist de revisão antes de liberar o app ao usuário (via localtunnel)

*Gestor, 2026-10-04. Executar por um agente Dev & QA depois que R2 estiver concluída, **antes** de reabrir o túnel.*

## Bug conhecido (reportado pelo usuário, via túnel)
O **form de login de teste não funciona** quando o app é acessado por `https://<subdominio>.loca.lt` (funciona em `localhost:3100`). Hipóteses a investigar, na ordem:
1. Cookie de sessão com atributo `Secure`/`SameSite` ou domínio incompatível com HTTPS atrás de proxy (`AUTH_URL`, `AUTH_TRUST_HOST`, `x-forwarded-proto`).
2. Verificação de origem em Server Action/POST (Next 16: `allowedDevOrigins`, `serverActions.allowedOrigins`) rejeitando o host do túnel.
3. Redirecionamento pós-login montado com `localhost:3100` em vez do host da requisição.
4. Página de aviso do localtunnel interferindo (enviar header `bypass-tunnel-reminder`).
Corrigir sem enfraquecer a trava de produção do login de teste (ADR-008) e cobrir com teste.

## Roteiro de revisão
- [ ] Suítes completas verdes (lint, typecheck, unit, int, e2e) e build.
- [ ] Reproduzir e corrigir o bug de login via túnel; testar pelo navegador integrado usando a URL do túnel.
- [ ] Roteiro ponta a ponta (login → família → convite → contas → lançamentos → acerto → cartão → fatura → previstas → home), mobile 375px e desktop, **pela URL do túnel**.
- [ ] Banco dev com dados de demonstração coerentes (família de exemplo; sem lixo de testes).
- [ ] Sem erros no console e nas requisições de rede durante o roteiro.
- [ ] Relatório curto em `agents/developer/tasks/qa-pre-liberacao.md` com o link vigente do túnel e a senha da página de aviso.

## Procedimento do túnel
`npx --yes localtunnel --port 3100`; senha da página de aviso = IP público (`curl https://loca.lt/mytunnelpassword`). Encerrar pelo PID exato do processo `lt` (nunca `pkill -f`).

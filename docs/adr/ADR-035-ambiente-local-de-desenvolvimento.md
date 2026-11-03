# ADR-035 — Ambiente local de desenvolvimento: portas e acesso por rede

**Status:** aceito (complementa ADR-008, ADR-024 e ADR-031) · **Data:** 2026-10 · **Autor:** gestor

## Contexto
As portas padrão da máquina de desenvolvimento (5432, 3000, 6379, 3306) colidem com outros serviços. O acesso de outros aparelhos ao app em desenvolvimento precisa de regra explícita (D-GES-10, D-GES-20).

## Decisão
1. **Portas:** Postgres dev **5442**, Postgres de teste **5443**, app **3100**, Mailpit SMTP **1025** e UI **8025**. `AUTH_URL=http://localhost:3100`.
2. **Acesso em dev:** `localhost` e IP privado da LAN (liberação automática, desligável com `APP_DEV_LAN_AUTO=false`); túnel público **só sob pedido** do usuário.
3. **Tudo local, sem integração externa:** o que depende de conta, token ou serviço externo é mockado ou feito por adapter (ex.: login de teste, ADR-008; LLM simulado, ADR-028; e-mail em Mailpit, ADR-012).
4. Homologação com build de produção local segue o ADR-024; produção real, o ADR-031.

## Consequências
- Ambiente de dev, teste e homologação não colide com serviços do host.
- Liberar a LAN expõe o login de teste na rede local; aceito por ser ambiente descartável (ADR-024).

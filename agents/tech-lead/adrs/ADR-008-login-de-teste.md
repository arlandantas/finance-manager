# ADR-008: Provedor de login de teste (dev-login) com sessão em banco

## Status
Aceito (Tech Lead). Implementa a **D-GES-11** do Gestor e complementa o ADR-002.

## Contexto
O login Google exige conta e credenciais externas (EXT-01). O time precisa de login local e de E2E determinístico sem o Google. O Auth.js v5 **não** suporta o provider `Credentials` com `session.strategy = "database"` (só JWT), e o ADR-002 fixa sessão em banco.

## Decisão
1. **Não usar o provider Credentials.** Criar um **Route Handler próprio** `POST /api/dev/login` que reproduz o que o Auth.js faz ao final de um login OAuth: *upsert* do `User` (e-mail normalizado em minúsculas, `emailVerified = now()`), criação de uma linha de `Session` (token aleatório de 32 bytes) e *set* do cookie de sessão **com o mesmo nome e atributos** do Auth.js (`authjs.session-token`, `httpOnly`, `SameSite=Lax`, `path=/`; `Secure` apenas se `AUTH_URL` for https). Assim todo o restante do sistema usa o **mesmo caminho de sessão** (leitura de sessão, gate, logout) em dev, teste e produção.
2. **Ativação:** somente se `AUTH_DEV_LOGIN === "true"` **e** `NODE_ENV !== "production"`.
3. **Defesa em profundidade (três camadas):**
   - (a) o handler responde **404** (corpo vazio) quando desativado;
   - (b) a **inicialização da aplicação falha** (`instrumentation.ts` lança erro) se `NODE_ENV === "production"` e `AUTH_DEV_LOGIN === "true"`;
   - (c) a UI só renderiza o bloco de teste quando o servidor informa a flag ativa; o módulo do dev-login é importado dinamicamente apenas se a flag estiver ativa (não entra no bundle de produção quando desligada).
4. **Rede:** aceita somente requisições cujo `Host` seja `localhost`/`127.0.0.1`/`[::1]` ou `*.localhost` (rejeita 403 caso contrário).
5. **E2E/QA:** o helper `loginAs(page, {email, name})` chama o endpoint e injeta o cookie; os cenários que dizem "entra com o Google" usam esse helper. O caminho real do Google (callback, `email_verified`, cancelamento) é coberto por **testes de integração do callback `signIn`** com perfis simulados (SDD-003 §4), sem rede.
6. **Google real** continua pendência EXT-01; o provider Google só é registrado quando `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` estão preenchidos.

## Consequências
- Sem senhas, sem segredo externo; E2E rápido e estável.
- Risco principal (login de teste vazar para produção) mitigado por três camadas e por teste automatizado (SDD-003 §6).

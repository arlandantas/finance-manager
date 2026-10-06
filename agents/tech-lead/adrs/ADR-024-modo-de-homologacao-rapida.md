# ADR-024: Modo de homologação rápida (build de produção + login de teste, só local)

## Status
Aceito (Tech Lead), aguardando validação do Gestor. Emenda o [ADR-008](ADR-008-login-de-teste.md) (login de teste) sem revogar nenhuma das três camadas dele. Ambiente: [ambiente-local.md](../architecture/ambiente-local.md).

## Contexto
Na máquina de teste (i5-7200U 2 núcleos, ~2 GB livres, WSL/Docker com 2,8 GB, Defender ativo) o `next dev` compila sob demanda: `/login` ~2,2 s e `/api/auth/session` ~5 s. O build de produção responde em ~15 ms e ~7 ms. Só que o ADR-008 desliga o login de teste com `NODE_ENV=production`, e o Stakeholder e o usuário homologam justamente com "Entrar como (teste)" (o Google real é a pendência EXT-01). Com `output: "standalone"` o `next start` não serve: o build roda com `node <distDir>/standalone/server.js`.

Opções avaliadas:
1. **Desligar a trava de produção por flag simples** (ex.: `AUTH_DEV_LOGIN_IN_PROD=true`). Rejeitada: uma variável esquecida num deploy real abriria login sem senha para qualquer e-mail.
2. **`NODE_ENV=development` sobre o build de produção.** Rejeitada: o Next inlina `NODE_ENV` no build; o resultado é incoerente e sem garantia.
3. **Flag separada `APP_HOMOLOG_MODE` com guarda dupla de ambiente e rede, validada na subida.** Escolhida.

## Decisão
1. **Flag própria:** `APP_HOMOLOG_MODE=true`. Só tem efeito com `NODE_ENV=production` (em dev o ADR-008 já vale como antes).
2. **O login de teste em produção só liga se TODAS as condições valerem** (`homologModeViolations` em `src/lib/auth/dev-login-guard.ts`):
   - `APP_HOMOLOG_MODE=true` **e** `AUTH_DEV_LOGIN=true`;
   - **bind** explícito (`HOSTNAME`, que é o que o `server.js` do standalone usa) em loopback (`127.0.0.1`/`localhost`) ou IPv4 privado RFC1918. `0.0.0.0`, ausente, IP público ou nome (ex.: id de container do Docker, que vira `HOSTNAME`) são recusados;
   - `DATABASE_URL` com host **loopback** (`localhost`/`127.0.0.1`/`::1`). Host remoto, nome de serviço (`db`) ou socket são recusados;
   - `APP_URL` **e** `AUTH_URL` explícitos, `http://` (nunca `https`) e em loopback ou IP privado;
   - `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` **vazios**. Produção real só funciona com o Google configurado (é o único login); a homologação exige o contrário.
3. **Recusa de subir:** com `NODE_ENV=production` e `APP_HOMOLOG_MODE=true`, se qualquer condição falhar o `instrumentation.ts` (camada (b) do ADR-008) lança `APP_HOMOLOG_MODE recusado (ADR-024): <motivos>` e o servidor não atende rota nenhuma (500 em tudo, motivo no log). O `getEnv()` também falha com os mesmos motivos. Sem `APP_HOMOLOG_MODE`, a regra antiga fica intacta: `AUTH_DEV_LOGIN=true` em produção recusa subir.
4. **Guarda por requisição:** na homologação o `POST /api/dev/login` aceita só `Host` local (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`) ou exatamente o IP privado do bind. `APP_PUBLIC_ORIGIN`, `APP_DEV_ORIGINS` e a LAN automática **não** valem (seguem só de dev). As condições são reavaliadas a cada requisição (função pura, barata).
5. **Ferramentas de E2E continuam fora:** `/api/dev/clock` passa a usar `isDevToolingEnabled` (= regra antiga do ADR-008) e responde 404 na homologação; `APP_NOW_OVERRIDE` segue ignorada em produção.
6. **Conveniência:** `pnpm homolog:build` e `pnpm homolog:start` (`scripts/homolog.mjs`, JS puro para não pagar o `tsx`). O build vai para `.next-homolog/` (não colide com o `pnpm dev` nem com o E2E), copia `public/` e os estáticos para o standalone e o start injeta as variáveis (bind `127.0.0.1`, porta 3100 por padrão, `APP_URL`/`AUTH_URL` = `http://127.0.0.1:<porta>`, Google vazio). O restante vem do `.env.local`/`.env`.

## O que impede o uso acidental em produção real
- São necessárias **duas flags** ligadas de propósito (`APP_HOMOLOG_MODE` e `AUTH_DEV_LOGIN`); nenhuma delas existe no `.env.example` de produção nem é setada pelo `next build`.
- Mesmo com as duas, uma produção real falha em pelo menos três condições independentes: banco não local, `AUTH_URL` https/domínio público e Google configurado. Em container, o `HOSTNAME` é o id do container e também falha.
- A falha é **fechada**: o servidor não atende (e loga o motivo) em vez de subir sem o login.
- Testes unitários (`tests/unit/auth/homolog-mode.test.ts`) cobrem: produção real recusa; homologação local aceita; banco remoto/serviço/socket, bind `0.0.0.0`/ausente/público/container, URL https ou pública e Google configurado recusam; Host de túnel/LAN recusado; relógio desligado.

## Riscos residuais (aceitos)
- **Alto se combinado de propósito:** um servidor de produção auto-hospedado com Postgres na mesma máquina, `AUTH_URL` http em IP privado, sem Google e com as duas flags ligadas abriria login sem senha para quem alcançar a rede privada. Exige cinco escolhas deliberadas contra a documentação; mitigação: ADR-005 (hospedagem) deve exigir https e Google e proibir as duas flags no ambiente de produção.
- O `Host` é informado pelo cliente: a proteção de rede real é o **bind** em loopback/IP privado, não o cabeçalho.
- Com bind em IP privado (`--lan`), qualquer máquina da LAN entra como qualquer e-mail, como já acontece no `pnpm dev` com LAN automática. Use só em rede confiável.

## Consequências
- Homologação com o build otimizado: `/login` ~15 ms e `/api/auth/session` ~9 ms na máquina de teste (contra 2,2 s e 5 s no dev).
- Cada mudança de código exige novo `pnpm homolog:build` (~1 min na máquina de teste); para desenvolvimento continua o `pnpm dev`.
- Abrir pelo endereço que o script imprime (`http://127.0.0.1:<porta>`): o CSRF aceita só o host de `AUTH_URL`, e no Windows `localhost` perde ~200 ms por conexão tentando `::1`.

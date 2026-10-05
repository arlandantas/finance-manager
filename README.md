# 💰 Gestão Financeira Familiar

Aplicação web moderna e colaborativa voltada para o controle financeiro de famílias e casais. O sistema permite planejar despesas compartilhadas e individuais, monitorar orçamentos mensais, acompanhar investimentos e metas patrimoniais, e obter relatórios claros para tomadas de decisão financeiras saudáveis.

---

## 🧭 Visão do Projeto

A gestão financeira familiar possui particularidades cruciais:
- **Contas individuais vs. conjuntas**: Divisão proporcional de custos fixos, gastos pessoais e reservas em comum.
- **Orçamentos por categoria**: Tetos de gastos com alertas em tempo real para alimentação, moradia, lazer, educação, etc.
- **Metas e Sonhos**: Acompanhamento de objetivos familiares (reserva de emergência, férias, reforma, aposentadoria).
- **Usabilidade acessível**: Interface amigável para todos os membros da família, com dashboards visuais e intuitivos.
- **Segurança e Rigor Contábil**: Proteção rigorosa de dados sensíveis, autenticação com isolamento por núcleo familiar e cálculo em centavos para evitar erros de arredondamento.

---

## 🤖 Modelo Operacional Multi-Agente

Este projeto é desenvolvido e mantido por um ecossistema colaborativo de **quatro agentes especializados**, sob a coordenação do **Gestor do Projeto**:

```mermaid
flowchart TD
    subgraph Gestao["🎯 Coordenação & Governança"]
        MGR["Gestor do Projeto (Project Manager)"]
    end

    subgraph Agentes["Equipe Operacional Multi-Agente"]
        STK["1. Agente Stakeholder\n(Dono do Problema, Dores & Prioridade de Valor)"]
        PO["2. Agente Product Owner\n(Dono da Solução, Fatiamento de MVP, UI/UX & Backlog)"]
        TL["3. Agente Tech Lead\n(Dono da Engenharia, Gaps Técnicos, Estimativa & SDD)"]
        DEV["4. Agente Desenvolvedor & QA\n(Dono da Implementação, Suíte de Testes & Qualidade)"]
    end

    STK <-->|Parceria de MVP & Prioridades de Valor| PO
    PO -->|Fluxos de Trabalho, UI/UX & Histórias BDD| TL
    TL -->|Especificações SDD, Estimativas & Contratos| DEV
    
    DEV -.->|Entrega com Testes e QA| MGR
    MGR -.->|Gestão de Cronograma, Alinhamento & Feedback| STK
    MGR -.->|Alinhamento de Releases & Prioridades| PO
    MGR -.->|Revisão de Padrões & Riscos Técnicos| TL
    MGR -.->|Coordenação Técnica & Desbloqueio| DEV
```

### Decisões Estratégicas: Quem Faz o Quê?

- **Definição de MVP**: **Co-criação**. O Stakeholder define o *mínimo de valor inegociável* e o PO lidera o *fatiamento cirúrgico do escopo (*Scope Slicing*) para evitar desperdícios. Documentado em [`agents/product-owner/backlog/mvp-definition.md`](file:///home/arlan/ai-tests/finance-manager/agents/product-owner/backlog/mvp-definition.md).
- **Priorização**: O Stakeholder traz a **prioridade de valor/impacto** na vida da família; o PO define a **ordem de execução no backlog**, ponderando dependências e usabilidade.
- **Cronograma e Prazos**: O Tech Lead/Dev trazem a **estimativa técnica de esforço**; o Gestor do Projeto, em sintonia com o PO e o Stakeholder, monta e gerencia o **cronograma de entregas**.

---

### 1. Gestor do Projeto (Project Manager)
- **Responsabilidade**: Atuar como orquestrador geral do projeto.
- **Atividades**:
  - Montar e gerenciar o cronograma alinhando prazos do negócio com as estimativas da engenharia.
  - Garantir a cadência e a passagem de bastão correta entre os agentes.
  - Validar critérios de conclusão (Definition of Done) e mitigar riscos.

### 2. Agente Stakeholder
- **Foco**: O **PROBLEMA** sob a ótica de negócio e dos usuários finais (famílias).
- **Entregáveis**: Dores reais, regras de negócio financeiras, personas da família e homologação de valor (*sem prescrever telas*).
- **Local de trabalho**: [`agents/stakeholder/`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder)

### 3. Agente Product Owner (PO)
- **Foco**: A **SOLUÇÃO, FATIAMENTO DO MVP, FLUXOS E UI/UX**.
- **Entregáveis**: Fatiamento cirúrgico do MVP e Roadmap, jornadas do usuário (*User Flows*), especificações de usabilidade (UI/UX), épicos e histórias com critérios em **BDD/Gherkin**.
- **Local de trabalho**: [`agents/product-owner/`](file:///home/arlan/ai-tests/finance-manager/agents/product-owner)

### 4. Agente Tech Lead
- **Foco**: A **ENGENHARIA**, viabilidade técnica, preenchimento de gaps e especificação formal.
- **Entregáveis**: Estimativas de esforço técnico, avaliação de viabilidade da UX, resolução de gaps técnicos (concorrência, centavos, idempotência), ADRs, modelagem de dados e especificações em **SDD (*Specification-Driven Development*)**.
- **Local de trabalho**: [`agents/tech-lead/`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead)

### 5. Agente Desenvolvedor & QA (Programador)
- **Foco**: A **IMPLEMENTAÇÃO e GARANTIA DE QUALIDADE** do código.
- **Entregáveis**: Código-fonte com base estrita no SDD, suíte completa de testes automatizados (unitários, integração e validação BDD do PO) e cumprimento rigoroso da Definition of Done.
- **Local de trabalho**: [`agents/developer/`](file:///home/arlan/ai-tests/finance-manager/agents/developer) e diretórios de código da aplicação.

---

## 📁 Estrutura de Diretórios do Projeto

```text
finance-manager/
├── README.md                  # Visão geral e funcionamento
├── AGENTS.md                  # Guia mestre de governança, MVP, BDD, SDD e QA
├── agents/                    # Diretório dedicado para a operação dos 4 agentes
│   ├── README.md              # Visão geral do diretório de agentes
│   ├── stakeholder/           # Espaço do Agente Stakeholder (dores, personas, regras de valor)
│   ├── product-owner/         # Espaço do Agente Product Owner (MVP, roadmap, fluxos UI/UX, BDD)
│   ├── tech-lead/             # Espaço do Agente Tech Lead (gaps técnicos, SDD, ADRs, arquitetura)
│   └── developer/             # Espaço do Agente Desenvolvedor & QA (código, tasks, testes)
├── docs/                      # Documentação técnica consolidada do produto
└── src/                       # Código-fonte da aplicação web (estruturado pelo Tech Lead/Dev)
```

---

## 🛠️ Ambiente Local (EN-001)

Pré-requisitos: Node 22 (`.nvmrc`), pnpm 11 (versão travada em `packageManager`; use `corepack enable`), Docker + Docker Compose.

```bash
cp .env.example .env.local        # valores de DEV já funcionam; Google fica para depois (EXT-01)
pnpm db:up                        # docker compose -p finance-manager up -d --wait (db, db-test, mailpit)
pnpm i
pnpm db:migrate                   # aplica migrações no Postgres dev
pnpm db:seed
pnpm dev                          # http://localhost:3100  (health: /api/health)
```

**Portas** (deslocadas para não colidir com serviços comuns da máquina, D-GES-10):

| Serviço | Porta |
| :-- | :-- |
| App Next | 3100 |
| Postgres dev (`db`) | 5442 |
| Postgres teste (`db-test`, tmpfs) | 5443 |
| Mailpit SMTP / UI | 1025 / 8025 |

**Scripts**

| Script | Função |
| :-- | :-- |
| `pnpm dev` / `build` / `start` | App (HMR) / build de produção / servir build |
| `pnpm lint` / `lint:fix` / `typecheck` | Biome / `tsc --noEmit` |
| `pnpm test` | `check:imports` (ADR-013) + unidade e componentes (Vitest + Testing Library) |
| `pnpm check:imports` | Verifica restrições de import (`@/lib/db` só em repositórios; regras puras sem Next/Prisma/relógio) |
| `pnpm test:int` | Integração contra o Postgres `db-test` (porta 5443) |
| `pnpm test:e2e` | Playwright + playwright-bdd (features em `tests/e2e/features`). Sobe o app em **3101** contra o `db-test` (5443), com relógio fixo em 2026-10-04 e e-mails no Mailpit. Primeira vez: `pnpm exec playwright install chromium` |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Migrações (dev) / aplicar existentes / seed / recriar banco |

Hooks (Husky): `pre-commit` roda `lint` + `typecheck` + `check:imports`; `commit-msg` exige Conventional Commits e o trailer `Co-authored-by:`.

Estrutura de código: `src/app` (rotas Next), `src/modules/<dominio>` (regras puras), `src/lib` (env, db), `prisma/` (schema, migrações, seed), `tests/{unit,integration,e2e}`.

**Acesso por localhost, IP da rede e túnel (dev):** `pnpm dev` escuta em `0.0.0.0:3100`.
- `http://localhost:3100`: sempre.
- IP da LAN (ex.: `http://192.168.1.81:3100`, descubra com `hostname -I`): funciona sem configurar, pois em dev IPs privados RFC1918 e `*.local` são aceitos automaticamente (o IP pode mudar). Para fixar/limitar, use `APP_DEV_ORIGINS` (lista por vírgula) e `APP_DEV_LAN_AUTO=false`. Como é `http` sem TLS, o navegador não expõe `crypto.randomUUID`; o app usa um fallback.
- Túnel (só quando você iniciar, ex.: `npx localtunnel --port 3100`): ponha a URL em `APP_PUBLIC_ORIGIN`; o Service Worker de repetição (`public/tunnel-retry-sw.js`) só é registrado quando a página abre nesse host.
- Mudou `.env.local` ou `next.config.ts`? Reinicie o `pnpm dev`. Nada disso vale em produção (`NODE_ENV=production` ignora as listas; o login de teste é bloqueado) e `/api/dev/clock` segue só em localhost direto.
- Os links de convite usam a origem de onde o admin está logado (se for origem de dev permitida), senão `APP_PUBLIC_ORIGIN`, senão `APP_URL`.
- **Google OAuth**: o redirect é sempre `AUTH_URL` + `/api/auth/callback/google`; cadastre `http://localhost:3100/api/auth/callback/google` no Google Cloud e use localhost para entrar com Google (o Google não aceita IP privado como redirect). Detalhes em EXT-01.

**Login em dev:** com `AUTH_DEV_LOGIN=true` a tela `/login` oferece "Entrar como (teste)" (atalhos Mariana e Lucas, criados por `pnpm db:seed`); o endpoint é bloqueado em produção e a aplicação recusa subir com a flag ligada. Convites chegam ao Mailpit (http://localhost:8025). Depois de mudar o schema Prisma, reinicie o `pnpm dev` (o cliente fica em cache).

Observações: dependências externas pendentes ficam em [`agents/manager/pendencias-externas.md`](agents/manager/pendencias-externas.md).

---

## 🚀 Como os Agentes Devem Iniciar o Trabalho

1. **Leitura Obrigatória**: Qualquer agente que iniciar uma sessão deve primeiro consultar o arquivo [`AGENTS.md`](file:///home/arlan/ai-tests/finance-manager/AGENTS.md).
2. **Navegação até sua pasta**: Acesse seu respectivo diretório dentro de `agents/<seu-papel>/` para verificar suas instruções e o status atual.
3. **Fluxo de Trabalho**:
   - O **Stakeholder** traz a dor real e a prioridade de valor.
   - O **PO**, em parceria com o Stakeholder, fatia o **MVP**, cria o **Roadmap**, desenha os **Fluxos de UI/UX** e as histórias **BDD**.
   - O **Tech Lead** estima o esforço, fecha os gaps técnicos e escreve a especificação em **SDD**.
   - O **Gestor** calibra o cronograma com base no esforço e metas.
   - O **Desenvolvedor & QA** implementa o código e valida todos os testes.

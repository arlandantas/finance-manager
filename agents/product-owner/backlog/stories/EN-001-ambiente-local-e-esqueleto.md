# EN-001 — Ambiente local e esqueleto da aplicação (Enabler)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-00 Fundação · R1 |
| Tipo | **Enabler técnico** (sem valor direto ao usuário) |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,2 · 5 |
| Status | Especificada (TL: [`ambiente-local.md`](../../../tech-lead/architecture/ambiente-local.md)) |
| Depende de | — |
| Rastreabilidade | ADR-001, ADR-002, ADR-003 · TASK-001 (tasks-board) |

## Justificativa do enabler
Sem repositório executável, nenhuma história de valor pode ser iniciada, testada ou demonstrada. Este item **desbloqueia todas as demais** e fixa a infraestrutura de qualidade (lint, typecheck, testes, hooks).

## Resultado verificável (critérios de aceite)
A fonte de verdade é a *Definição de pronto do ambiente* em [`ambiente-local.md`](../../../tech-lead/architecture/ambiente-local.md). Em forma de aceite:

```gherkin
# language: pt
Funcionalidade: Ambiente local reprodutível

  Cenário: Subir o sistema em máquina limpa
    Dado que clonei o repositório e copiei ".env.example" para ".env.local"
    Quando executo "docker compose up -d", "pnpm i", "pnpm db:migrate", "pnpm db:seed" e "pnpm dev"
    Então a aplicação responde em "http://localhost:3000"
    E "/api/health" retorna 200 com o banco acessível

  Cenário: Suíte de qualidade verde
    Dado o ambiente em execução
    Quando executo "pnpm lint", "pnpm typecheck", "pnpm test", "pnpm test:int" e "pnpm test:e2e"
    Então todos os comandos terminam com sucesso

  Cenário: Hooks de commit protegem o histórico
    Dado um commit com mensagem fora do padrão Conventional Commits ou sem o trailer "Co-authored-by"
    Quando tento commitar
    Então o commit é rejeitado com mensagem explicativa
```

## Fora de escopo
Hospedagem/produção (ADR-005), CI remoto, qualquer tela de negócio.

## Pontos para o Tech Lead
- O seed deve criar a família fictícia descrita em `ambiente-local.md` e **ser reaproveitado pelos cenários E2E** das histórias seguintes.
- Prever o **provedor de login de teste** (ADR-002) já neste enabler, pois US-001 depende dele para E2E.

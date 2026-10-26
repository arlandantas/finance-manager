# EN-007 — Hospedagem de produção: Vercel + Prisma Postgres (Habilitadora)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **pré-requisito do POC do MCP** (prioridade 1) |
| Tipo | **Habilitadora** (sem tela própria) |
| MoSCoW · Tamanho (TL) | Should · **5** |
| Status | Implementada (TASK-064, aguardando validação do Gestor) |
| Depende de | ações do usuário do item 0 do TL (conferir variáveis, informar plano/região, `migrate status`) |
| Corte | **Não se corta** se o MCP for ligado: sem ela o lançamento direto grava dados reais sem backup nem travas |
| Rastreabilidade | NEED-025 (RN-025.5, 025.6) · D-GES-36 (a), D-GES-37 · ADR-031 (substitui o ADR-026 em produção) · D-PO-70 |

## Justificativa
O app já roda em `https://verbus-finance.vercel.app` com Prisma Postgres, mas o repositório ainda assume Railway. Antes de abrir um servidor que **escreve** dados da família, a produção precisa de travas contra login de teste, conexão correta com o banco, migração segura, expurgo agendado e backup diário. Não depende do MCP e **sai antes dele**.

## O que entrega (verificável)
- Travas de produção reconhecem a Vercel (produção e *preview*); login de teste e homologação rápida **não existem** em produção.
- Conexão do app pelo endereço *pooled* e do CLI/backup pelo direto; migração aplicada só no *build* de produção; falha de migração mantém a versão anterior no ar.
- Rotina diária de expurgo (*cron*) idempotente e backup diário criptografado fora do provedor, com **ensaio de restauração** feito.
- *Smoke* pós-publicação e medição de *cold start*; limpeza dos arquivos de Railway.
- *Previews* desligados no alpha; domínio `verbus-finance.vercel.app` mantido (D-GES-37).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Hospedagem de produção na Vercel

  Contexto:
    Dado o app publicado na Vercel com o Prisma Postgres no plano Free
    E o ambiente de desenvolvimento local em Docker

  Cenário: Login de teste não existe em produção
    Dado que o ambiente é "production"
    Quando alguém tenta usar o login de teste
    Então o acesso é recusado

  Cenário: Preview também é tratado como produção
    Dado que o ambiente é "preview"
    Quando alguém tenta usar o login de teste
    Então o acesso é recusado

  Cenário: Migração com falha não derruba o app
    Dado que a versão atual está no ar
    Quando uma publicação com migração inválida é feita
    Então a publicação falha
    E a versão anterior continua no ar

  Cenário: Preview não enxerga o banco de produção
    Dado que existe uma publicação de preview
    Quando o preview tenta ler as variáveis do banco
    Então elas não estão disponíveis

  Cenário: Expurgo diário é seguro se rodar duas vezes
    Dado que a rotina de expurgo já rodou hoje
    Quando ela roda de novo
    Então nenhum dado a mais é apagado

  Cenário: Backup diário pode ser restaurado
    Dado que existe um backup diário criptografado
    Quando o ensaio de restauração é executado em um banco vazio
    Então os dados da família aparecem íntegros

  Cenário: Primeira chamada após ociosidade responde rápido
    Dado que o app ficou 15 minutos sem uso
    Quando a primeira requisição de token chega
    Então a resposta leva menos de 3 segundos
```

## Fora de escopo
Domínio próprio, plano pago do banco (decisão do usuário depois), monitor externo de disponibilidade.

## Histórico
- 2026-10-24 — Criada (D-PO-70; TL respostas-r4d-v2; D-GES-36/37).

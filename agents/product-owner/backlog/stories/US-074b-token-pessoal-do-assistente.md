# US-074b — Token pessoal para clientes sem OAuth (backlog, fora do POC)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **ampliação (backlog)** |
| MoSCoW · Tamanho (TL) | Could · **3** |
| Status | Refinada (PO) · **fora do POC** · aprovada para o backlog pelo usuário (D-GES-37); SDD-024 §11.4 e SDD-025 §8.4 |
| Depende de | POC concluído (US-074, US-075, US-076a/b) |
| Corte | Primeira a sair da ampliação |
| Rastreabilidade | **NEED-025** (RN-025.1, 025.2) · TL-42 · D-GES-36 (b), D-GES-37 · D-PO-74 |

## História
Como **membro da família**, quero **gerar um token pessoal para um assistente que não usa OAuth**, para **conectar outros clientes de IA sem depender do fluxo de autorização**.

## Regras de negócio aplicáveis
- Esta é a **única** exceção à regra "sem credencial exibida": o token é **mostrado uma única vez**, com botão copiar; depois só aparecem nome, escopo, validade e último uso.
- Escopo padrão **somente consulta**; "lançar despesas" é opcional, com a mesma segunda ciência da US-074 e **os mesmos limites do membro** (US-076b).
- Valem a revogação imediata, o bloqueio pelo Administrador e a remoção do membro da US-074; toda chamada é auditada (US-077).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Token pessoal do assistente

  Contexto:
    Dado a "Família Silva" com "Mariana" como Administradora e "Lucas" como membro
    E o acesso por assistente permitido pela família
    E Lucas está autenticado

  Cenário: Token é mostrado uma única vez
    Dado que Lucas gerou o token "Meu cliente" com validade de 30 dias
    Quando Lucas fecha a tela do token
    Então não consegue ver o token de novo

  Cenário: Token nasce só de consulta
    Quando Lucas gera o token "Meu cliente"
    Então o escopo é "somente consulta"

  Cenário: Token com lançamento exige segunda ciência
    Dado que Lucas gera o token "Meu cliente"
    Quando Lucas marca "Lançar despesas em seu nome (sem confirmação)"
    Então precisa marcar um segundo "Entendi" para continuar

  Cenário: Token com lançamento respeita os limites do membro
    Dado que Lucas tem o token "Meu cliente" com lançamento e o limite por lançamento de "R$ 500,00"
    Quando o cliente lança "Mercado" de "R$ 600,00"
    Então o lançamento é bloqueado pelo limite

  Cenário: Revogar o token
    Dado que Lucas tem o token "Meu cliente"
    Quando Lucas revoga o token e confirma
    Então o cliente deixa de conseguir consultar dados

  Cenário: Administrador bloqueia o recurso
    Dado que Lucas tem o token "Meu cliente"
    Quando Mariana desliga "Permitir acesso por assistente"
    Então o token deixa de funcionar
```

## Fora de escopo
Token por família; token sem validade.

## Histórico
- 2026-10-24 — Criada (D-PO-74).

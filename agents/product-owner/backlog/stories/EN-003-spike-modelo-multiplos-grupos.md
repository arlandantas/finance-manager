# EN-003 — Spike de modelo: uma pessoa em mais de um grupo (Enabler, sem funcionalidade)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-22 Modelo de Grupos (spike) · **R3** |
| Tipo | **Enabler / spike do Tech Lead** (entrega: ADR; nenhuma funcionalidade) |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should · 2,0 · 2 (a estimar pelo TL) |
| Status | Rascunho do PO · **dono: Tech Lead** |
| Depende de | nenhuma (pode rodar em paralelo à R2.1) |
| Corte | Cortável sem impacto na R3; mas é a única forma de **não pagar caro depois** |
| Rastreabilidade | Parecer item 16, Q-F08 · NEED-021 (RN-021.1..3) · D-PO-02 · US-020, US-021 · D-PO-32 |

## Justificativa
O Stakeholder tratou grupos não familiares e vários grupos como **Futuro** (Q-F08), mas pediu um **spike de modelo** na R3 para saber se o vínculo usuário↔família já é N:N e quanto custaria "uma pessoa em mais de um grupo" (necessidade a) e "conta privada" (necessidade b). O PO **não** abre funcionalidade; só define o aceite do spike.

## Resultado verificável (critérios de aceite)

```gherkin
# language: pt
Funcionalidade: Spike de modelo de múltiplos grupos

  Cenário: ADR publicado com o diagnóstico do modelo atual
    Dado o modelo de dados atual
    Quando o Tech Lead conclui o spike
    Então existe um ADR em "agents/tech-lead/adrs" dizendo se o vínculo usuário e família já é N:N
    E o ADR lista as consultas e rotas que assumem "uma família por usuário"

  Cenário: Custo estimado de uma pessoa em dois grupos
    Dado o ADR do spike
    Quando o Gestor lê a seção de custo
    Então vê a estimativa em pontos para "uma pessoa em mais de um grupo" com a troca de grupo ativo

  Cenário: Custo estimado de conta privada dentro do grupo
    Dado o ADR do spike
    Quando o Gestor lê a seção de custo
    Então vê a estimativa em pontos para "conta privada (só o titular vê)" e o impacto na decisão D-PO-02

  Cenário: Risco de vazamento entre grupos é descrito
    Dado o ADR do spike
    Quando o Gestor lê a seção de riscos
    Então vê como o isolamento por família é garantido em toda consulta e quais testes cobririam um segundo grupo

  Cenário: Nenhum comportamento do produto muda
    Dado o spike concluído
    Quando a suíte de testes é executada
    Então todos os testes continuam passando sem alteração de comportamento
```

## Fora de escopo
Qualquer interface ou migração de dados; grupos não familiares (necessidade c); permissões granulares (US-020).

## Perguntas em aberto / pontos para o Tech Lead
- Ver `pedidos-ao-tech-lead-r21-r3.md` (item "spike de múltiplos grupos").

## Histórico
- 2026-10-04 — Criado a partir do parecer (item 16, Q-F08).

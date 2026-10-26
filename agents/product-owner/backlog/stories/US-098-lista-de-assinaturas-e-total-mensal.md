# US-098 — Lista de assinaturas ativas e total mensal

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (assinaturas) · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 4,0 (V4/U2/R2) · **2** |
| Status | Proposta pelo PO em 2026-10-26; sem SDD novo (consulta sobre as séries com cartão) |
| Depende de | **US-096** |
| Corte | Cortável após 096 |
| Rastreabilidade | **NEED-029** (RN-029.5) · NEED-016 · FLUXO-004, FLUXO-019 · D-PO-104 |

## História
Como **membro da família**, quero **ver todas as assinaturas ativas e quanto elas pesam por mês**, para **decidir o que cortar**.

## Regras
- Lista **"Assinaturas"** (em Cartões): uma linha por assinatura ativa com descrição, cartão, categoria, dia, quem gastou, valor atual e "alterada" quando houver exceção no mês. **Total mensal** no topo (soma dos valores atuais das ativas) e **por cartão**.
- Ordenação padrão por valor decrescente; filtro por cartão e por quem gastou.
- Cada linha tem as ações **Editar** e **Encerrar** (US-097).
- Mostra também as **encerradas** numa aba separada, com data de encerramento (somente leitura).
- É uma **lista de decisão simples**, **sem IA nem sugestões** (isso é NEED-027); respeita ocultar valores (US-027) e "Só meu" (todos veem; só o controlador edita).
- O total é derivado e **não conta duas vezes** com a fatura (informativo, igual ao da US-096).
- Vazio: "Nenhuma assinatura. Cadastre a primeira" com a ação.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Lista de assinaturas e total mensal

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E as assinaturas ativas "Streaming" de "R$ 39,90" e "Música" de "R$ 21,90" e "Nuvem" de "R$ 9,90"
    E Mariana está autenticada

  Cenário: Total mensal das assinaturas
    Quando Mariana abre "Assinaturas"
    Então vê o total mensal "R$ 71,70"
    E as assinaturas ordenadas por valor: "Streaming", "Música", "Nuvem"

  Cenário: Total por cartão
    Dado "Streaming" e "Música" no "Nubank Lucas" e "Nuvem" no "Itaú Mariana"
    Quando Mariana abre "Assinaturas"
    Então "Nubank Lucas" soma "R$ 61,80" e "Itaú Mariana" soma "R$ 9,90"

  Cenário: Encerrar a partir da lista
    Quando Mariana encerra "Nuvem" pela lista
    Então o total mensal passa a "R$ 61,80"
    E "Nuvem" aparece na aba "Encerradas"

  Cenário: Valores ocultos
    Dado que os valores estão ocultos
    Quando Mariana abre "Assinaturas"
    Então os valores aparecem mascarados

  Cenário: Sem assinaturas
    Dado que não há assinaturas
    Quando Mariana abre "Assinaturas"
    Então vê "Nenhuma assinatura" com a ação para cadastrar
```

## Fora de escopo
Sugerir cortes, detectar assinaturas ou comparar preços (NEED-027); categorias por assinatura além da já existente.

# US-026 — Saldos das contas em card recolhível

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês e Privacidade de Exibição · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Must · 3,5 · 2 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-025, US-004 |
| Corte | **Não cortar** (acompanha a US-025) |
| Rastreabilidade | Parecer item 8 · NEED-015 (§2.2) · NEED-009 (RN08 rebaixado) · FLUXO-006 · D-PO-13 |

## História
Como **membro da família**, quero **os saldos das contas num card recolhível**, para **ver o resumo do mês primeiro e abrir os saldos só quando eu quiser**.

## Regras de negócio aplicáveis
- Card "Saldos das contas": **recolhido por padrão**; recolhido mostra só o **total da família**; expandido lista **cada conta** com saldo (pessoais e conjuntas, como hoje).
- A escolha (recolhido/expandido) é **lembrada no dispositivo** (preferência visual, RN-022.1).
- O total é o mesmo "Saldo da família" de hoje (soma das contas **ativas**; contas arquivadas não entram, US-032).
- Atalho "Cadastrar conta" no fim da lista expandida; contas e cartões continuam acessíveis pelo menu.
- Respeita "ocultar valores".
- **Não** mostra a dívida em aberto do cartão no total (continua fora do escopo; a fatura aparece em "A pagar" da US-025).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Card de saldos das contas

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    E Lucas está autenticado na Home

  Cenário: Card começa recolhido com o total
    Quando Lucas abre a Home pela primeira vez neste dispositivo
    Então o card "Saldos das contas" está recolhido
    E mostra o total "R$ 7.349,50"
    E não mostra a lista de contas

  Cenário: Expandir mostra cada conta
    Quando Lucas toca no card "Saldos das contas"
    Então vê "Itaú Mariana R$ 6.500,00" e "Nubank Conjunta R$ 849,50"

  Cenário: Recolher de novo
    Dado que Lucas expandiu o card "Saldos das contas"
    Quando Lucas toca no card novamente
    Então a lista de contas desaparece e o total continua visível

  Cenário: A escolha é lembrada no dispositivo
    Dado que Lucas expandiu o card "Saldos das contas"
    Quando Lucas recarrega a Home
    Então o card "Saldos das contas" continua expandido

  Cenário: Preferência de um dispositivo não vale para outro
    Dado que Lucas expandiu o card "Saldos das contas" no desktop
    Quando Lucas abre a Home em um celular que nunca usou
    Então o card "Saldos das contas" está recolhido

  Cenário: Total acompanha uma nova despesa
    Quando Lucas lança uma despesa de "R$ 100,00" na conta "Nubank Conjunta"
    Então o total do card passa a "R$ 7.249,50"

  Cenário: Família sem contas
    Dado uma família sem contas
    Quando Lucas abre a Home
    Então o card "Saldos das contas" mostra "Nenhuma conta cadastrada" com o botão "Cadastrar conta"

  Cenário: Valores ocultos mascaram o total e as contas
    Dado que os valores estão ocultos
    Quando Lucas expande o card "Saldos das contas"
    Então vê "Itaú Mariana R$ •••••" e "Nubank Conjunta R$ •••••"

  Cenário: Teclado e leitor de tela
    Quando Lucas navega pelo card usando o teclado
    Então o card pode ser aberto com "Enter" e anuncia "expandido" ou "recolhido"
```

## Experiência (UX/estados)
Cabeçalho do card com total, chevron e estado anunciado (`aria-expanded`). Skeleton junto com a Home. [FLUXO-006](../../flows/FLUXO-006-home-resumo-do-mes.md).

## Fora de escopo
"Livre para gastar", caixinhas e detalhe por conta (AP2); reordenar contas; mostrar cartão no total.

## Perguntas em aberto / pontos para o Tech Lead
- Nenhuma. Preferência armazenada por dispositivo (mesmo mecanismo da US-027/US-037).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 8).

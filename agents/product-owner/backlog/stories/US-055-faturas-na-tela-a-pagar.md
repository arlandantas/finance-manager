# US-055 — Faturas de cartão na tela "A pagar"

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **R2.2** |
| MoSCoW · WSJF · Tamanho (PO) | Should · 1,7 · 3 |
| Status | Refinada (PO) · aguarda SDD/estimativa do TL |
| Depende de | US-017a/b, US-018, US-019, US-025 |
| Corte | **Cortável (3º do pacote R2.2)** |
| Rastreabilidade | Homologação R2.1 achado 7 (Melhoria; persiste do achado 10 da rodada anterior) · NEED-003, NEED-004, NEED-015 · D-PO-51 |

## História
Como **membro da família**, quero **ver na tela "A pagar" as faturas de cartão junto com as despesas previstas**, para **ter uma só lista do que falta pagar, igual ao "A pagar" do Resumo do Mês**.

## Regras de negócio aplicáveis
- A tela "A pagar" (`/previstas`) passa a listar, além das previstas pendentes, as **faturas de cartão não pagas** (abertas ou fechadas) do mês, na **mesma definição do "A pagar" do Resumo** (US-025, SDD-010 §4.2): por **vencimento**, atrasadas de meses anteriores só no mês corrente.
- Cada fatura aparece como linha própria **"Fatura Nubank Roxinho · vence 10/10"**, com valor, selo "Fechada"/"Aberta" e "Atrasada" quando vencida; tocar abre a fatura (US-017a), onde está "Pagar fatura" (US-017b). **Pagar fatura não acontece na lista** (evita duplicar fluxo).
- Faturas aparecem em **grupo/linha distinta** das previstas (as previstas têm "Dar baixa"; faturas têm "Ver fatura"), como no Resumo (Q-F03b).
- **Total** do topo da tela = soma exibida e **igual** ao "A pagar" do Resumo do mês correspondente (propriedade de teste).
- Fatura **paga** sai de "A pagar" e vai para a aba de pagas (se existir) ou deixa de aparecer; fatura de valor zero **não aparece**.
- Parcelas futuras **não** entram (D-PO-44); só a fatura do mês.
- Valores seguem a máscara de "ocultar valores" (US-027). Acerto desligado não influencia.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Faturas na tela A pagar

  Contexto:
    Dado a "Família Silva" em outubro de 2026
    E a despesa prevista "Condomínio" de "R$ 650,00" pendente com vencimento em 10/10/2026
    E Mariana está autenticada

  Cenário: Fatura fechada aparece em A pagar
    Dado a fatura de setembro do cartão "Nubank Roxinho" de "R$ 479,00" fechada e não paga com vencimento em 10/10/2026
    Quando Mariana abre "A pagar"
    Então vê a linha "Fatura Nubank Roxinho" com "R$ 479,00" e o selo "Fechada"
    E vê a linha "Condomínio" com "R$ 650,00"

  Cenário: Total reconcilia com o Resumo do Mês
    Dado a fatura de setembro do cartão "Nubank Roxinho" de "R$ 479,00" fechada e não paga com vencimento em 10/10/2026
    Quando Mariana abre "A pagar"
    Então o total é "R$ 1.129,00"
    E o Resumo do Mês de outubro de 2026 mostra "A pagar R$ 1.129,00"

  Cenário: Fatura atrasada é destacada
    Dado a fatura de agosto do cartão "Nubank Roxinho" de "R$ 300,00" não paga com vencimento em 10/09/2026
    Quando Mariana abre "A pagar"
    Então vê a linha "Fatura Nubank Roxinho" com o selo "Atrasada"

  Cenário: Tocar na fatura abre a fatura
    Dado a fatura de setembro do cartão "Nubank Roxinho" de "R$ 479,00" fechada e não paga com vencimento em 10/10/2026
    Quando Mariana toca na linha "Fatura Nubank Roxinho"
    Então vê a tela da fatura com o botão "Pagar fatura"

  Cenário: Fatura paga sai de A pagar
    Dado a fatura de setembro do cartão "Nubank Roxinho" de "R$ 479,00" paga
    Quando Mariana abre "A pagar"
    Então não vê a linha "Fatura Nubank Roxinho"
    E o total é "R$ 650,00"

  Cenário: Sem faturas a tela continua igual
    Dado nenhuma fatura de cartão não paga
    Quando Mariana abre "A pagar"
    Então vê apenas a linha "Condomínio"
    E não vê a linha "Fatura"

  Cenário: Parcelas futuras não aparecem em A pagar
    Dado uma compra parcelada com parcelas futuras de "R$ 800,00"
    Quando Mariana abre "A pagar"
    Então não vê linha de parcelas futuras

  Cenário: Valores ocultos
    Dado que os valores estão ocultos
    E a fatura de setembro do cartão "Nubank Roxinho" de "R$ 479,00" fechada e não paga com vencimento em 10/10/2026
    Quando Mariana abre "A pagar"
    Então vê a linha "Fatura Nubank Roxinho" com "R$ •••••"
```

## Experiência (UX/estados)
Mesmo componente de linha do Resumo (reuso); estados *loading* (skeleton), vazio ("Nada a pagar neste mês") e erro. 375 e 1280 px.

## Fora de escopo
Pagar a fatura dentro da lista; pagamento parcial/antecipado (Q-21); receitas previstas (US-051); lembretes/notificações.

## Perguntas em aberto / pontos para o Tech Lead
- Reutilizar a consulta de "A pagar" do Resumo (fonte única) para a lista e o total; custo de paginar/ordenar por vencimento com previstas e faturas juntas.

## Histórico
- 2026-10-05 — Criada a partir do achado 7 da homologação da R2.1. O item "faturas em Contas a pagar" deixa a lista "fora do escopo" (D-PO-51).

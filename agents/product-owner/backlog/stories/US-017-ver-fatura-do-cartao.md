# US-017 — Ver a fatura do cartão e o limite

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-6 Cartões de Crédito (fase 1) · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,7 · 3 |
| Status | Refinada (PO) — **fatia 017a** (pagar a fatura: [US-017b](US-017b-pagar-a-fatura.md), Should) |
| Depende de | US-016 |
| Rastreabilidade | NEED-003 (§2.2, RN-003.1, RN-003.3) · FLUXO-004 · D-GES-04 · D-PO-06, D-PO-09, D-PO-10 |

## História
Como **membro da família**, quero **ver a fatura de cada cartão (compras, total, fechamento, vencimento e situação) e o limite disponível**, para **saber quanto vou pagar, quando, e quanto cada um gastou no cartão**.

## Regras de negócio aplicáveis
- Cada cartão tem **uma fatura por ciclo**, identificada pelo **mês de fechamento** ("out/2026" = fecha em 25/10). Mostra: compras (ordenadas da mais recente), **total**, **data de fechamento** e **data de vencimento**.
- **Situação da fatura** (calculada com a data de hoje no fuso `America/Sao_Paulo`):
  - **Aberta**: hoje é **até** o dia do fechamento (recebe compras);
  - **Fechada**: hoje é **depois** do fechamento e a fatura **não** foi paga (é uma conta a pagar);
  - **Vencida**: fechada e hoje é **depois** do vencimento (destaque de alerta);
  - **Paga**: já paga (US-017b).
- **Total da fatura** = soma das compras ativas dela (compras excluídas não contam). Uma fatura fechada ainda pode receber compra retroativa (a data cai no ciclo): o total sobe.
- **Limite usado** = soma das compras em faturas **não pagas** (aberta + fechadas) — pagar libera (US-017b). **Disponível** = limite − usado (pode ser negativo, D-PO-08).
- Detalhe da fatura mostra o **subtotal por membro** (quem comprou), para apurar quanto cada um gastou (RN-003.3).
- Navegação por mês: da **fatura mais antiga que existe** até a **fatura aberta**; faturas futuras (parcelas) são AP1.
- Fatura **sem compras** mostra total R$ 0,00 e não é "a pagar".
- Dados da própria família; todos os membros veem todos os cartões (D-PO-02).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Fatura do cartão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E Lucas está autenticado

  Cenário: Fatura aberta com total e datas
    Dado que hoje é 20/10/2026
    E compras de "R$ 300,00" e "R$ 100,00" em 15/10/2026 no cartão
    Quando Lucas abre o cartão "Nubank Mariana"
    Então vê a fatura "out/2026" com situação "Aberta", total "R$ 400,00", fechamento 25/10 e vencimento 05/11
    E vê as duas compras da mais recente para a mais antiga

  Cenário: Cartões listam fatura atual e limite
    Dado que hoje é 20/10/2026
    E uma compra de "R$ 400,00" em 15/10/2026 no cartão
    Quando Lucas abre "Cartões"
    Então o cartão "Nubank Mariana" mostra "Fatura aberta R$ 400,00", usado "R$ 400,00" e disponível "R$ 4.600,00"

  Cenário: Fatura fecha depois do dia de fechamento
    Dado uma compra de "R$ 400,00" em 15/10/2026 no cartão
    E que hoje é 25/10/2026
    Então a fatura "out/2026" está "Aberta"
    Quando hoje passa a ser 26/10/2026
    Então a fatura "out/2026" está "Fechada" com vencimento 05/11 e é destacada como "a pagar"

  Cenário: Fatura vencida
    Dado uma compra de "R$ 400,00" em 15/10/2026 no cartão
    E que hoje é 06/11/2026 e a fatura não foi paga
    Então a fatura "out/2026" aparece como "Vencida" em destaque de alerta

  Cenário: Limite considera faturas fechadas e abertas
    Dado compras de "R$ 1.200,00" na fatura "out/2026" e de "R$ 300,00" na fatura "nov/2026"
    E que hoje é 28/10/2026
    Quando Lucas abre o cartão
    Então o limite usado é "R$ 1.500,00" e o disponível é "R$ 3.500,00"

  Cenário: Navegar para faturas anteriores
    Dado compras em out/2026 e em nov/2026 e que hoje é 28/11/2026
    Quando Lucas abre a fatura atual e toca em "Fatura anterior"
    Então vê a fatura "out/2026"
    E o botão "Fatura anterior" fica desabilitado por não haver fatura mais antiga

  Cenário: Subtotal por membro
    Dado compras de "R$ 300,00" de Mariana e de "R$ 100,00" de Lucas na fatura "out/2026"
    Quando Lucas abre a fatura
    Então vê "Mariana R$ 300,00" e "Lucas R$ 100,00"

  Cenário: Compra retroativa em fatura fechada aumenta o total
    Dado a fatura "out/2026" fechada com total "R$ 400,00" e que hoje é 28/10/2026
    Quando Lucas lança "R$ 50,00" no cartão com a data 20/10/2026
    Então o total da fatura "out/2026" passa a "R$ 450,00"

  Cenário: Compra excluída não conta no total
    Dado uma compra de "R$ 100,00" excluída na fatura "out/2026"
    Quando Lucas abre a fatura
    Então o total não inclui "R$ 100,00"

  Cenário: Fatura sem compras
    Dado que o cartão não tem compras
    Quando Lucas abre o cartão
    Então vê "Nenhuma compra nesta fatura" e total "R$ 0,00"

  Cenário: Fatura fechada aparece em "A pagar"
    Dado a fatura "out/2026" fechada com total "R$ 400,00" e vencimento 05/11
    Quando Lucas abre a Home
    Então o bloco "A pagar" mostra "Fatura Nubank Mariana R$ 400,00" com vencimento 05/11

  Cenário: Erro ao carregar a fatura
    Dado que a leitura da fatura falha
    Quando Lucas abre o cartão
    Então vê "Não foi possível carregar" com o botão "Tentar de novo"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Lucas tenta abrir a fatura do cartão "Visa Souza" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-004](../../flows/FLUXO-004-cartao-e-fatura.md): `/cartoes/[id]` com cabeçalho do cartão (limite, usado, disponível, barra), **seletor de fatura** (◀ out/2026 ▶), *chip* de situação (Aberta / Fechada / Vencida / Paga), datas de fechamento e vencimento, **total em destaque**, **subtotal por membro** e a lista de compras (data, descrição, categoria, avatar, valor; toque abre o detalhe da US-013a). A ação **"Pagar fatura"** aparece quando a fatura é "Fechada/Vencida" (US-017b). Estados: skeleton, vazio da fatura, erro de leitura, sem conexão.

## Fora de escopo
Pagar a fatura (US-017b); faturas futuras/parcelas (AP1); exportar fatura; conciliar com o PDF do banco (AP2/AP3); juros, anuidade e estornos; alertas de vencimento por mensagem (AP3).

## Perguntas em aberto / pontos para o Tech Lead
- A situação "Aberta/Fechada/Vencida" é **derivada** da data (não um estado gravado); o relógio deve ser o injetável do SDD-000 §8.
- O bloco "A pagar" da Home é entregue com a US-018 (despesas previstas) e passa a incluir faturas fechadas assim que esta história existir (cenário acima).

## Histórico
- 2026-10-04 — Refinada a partir do esboço US-017 ("Ver e pagar a fatura"); **fatiada** em 017a (esta, **Must**) e 017b (pagar, **Should**). A D-GES-04 (pagar fatura é Should) permanece; o PO sobe só o **ver a fatura** a Must porque sem ele o cartão não responde "quanto devo e quando" (D-PO-10, a ratificar pelo Gestor).

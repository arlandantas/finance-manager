# US-048 — Visão sintética: período, totais e quebra por categoria

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,6 · 5 |
| Status | **Esboçada** (SDD-016, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-007 (Extrato, fonte única), US-025 (mesmas regras de soma); US-040 (parcela por mês da fatura) |
| Corte | **Cortável** (com a US-049); não começa antes das tags só se o TL pedir, mas **pode começar sem elas** |
| Rastreabilidade | Parecer item 7, Q-F10, Q-F12 · NEED-016 (RN-016.1..5) · NEED-006 · FLUXO-014 · D-PO-29 |

## História
Como **membro da família**, quero **uma tela de Análise com o período escolhido, os totais e a quebra por categoria**, para **saber para onde foi o dinheiro**.

## Regras de negócio aplicáveis
- Nova tela **"Análise"** no menu. **Período**: Mês atual (padrão), Mês anterior ou **Intervalo livre** (início e fim).
- Mostra **Receitas, Despesas e Resultado** do período e a **quebra de despesas por categoria**, com **valor e participação %** (uma casa decimal; soma 100,0%), ordenada do maior para o menor. Receitas por categoria numa segunda aba "Receitas".
- **Fonte única** (RN-016.1): mesmos critérios de soma do Extrato e do Resumo do Mês: transferências, acertos e pagamentos de fatura **não são despesa**; excluídos nunca entram.
- **Compra parcelada** (RN-016.2): conta **por parcela, no mês da fatura** (D-PO-26).
- **Drill-down** (RN-016 §2.3): tocar numa categoria (ou no total) abre o **Extrato** com o mesmo período e filtro (e o total do Extrato é o mesmo número).
- Representação: **lista com barras horizontais** (sem gráficos customizáveis; escopo fechado, RN-016.5). Sem exportação.
- Respeita "ocultar valores" (as barras ficam; os valores mascarados; percentuais visíveis).
- Intervalo livre limitado a 24 meses (decisão do PO; evita consulta ilimitada).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Visão sintética por categoria

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E despesas de outubro de 2026 "Supermercado" de "R$ 700,00" e "Lazer e restaurantes" de "R$ 300,00" e "Moradia" de "R$ 200,00"
    E uma receita de "R$ 5.000,00" em outubro de 2026
    E hoje é 12/10/2026
    E Lucas está autenticado na tela "Análise"

  Cenário: Mês atual por padrão
    Quando Lucas abre a tela "Análise"
    Então o período é "Outubro de 2026"
    E vê "Receitas R$ 5.000,00" e "Despesas R$ 1.200,00" e "Resultado R$ 3.800,00"

  Cenário: Quebra por categoria com participação
    Quando Lucas abre a tela "Análise"
    Então vê "Supermercado R$ 700,00 58,3%" e "Lazer e restaurantes R$ 300,00 25,0%" e "Moradia R$ 200,00 16,7%"
    E a lista está ordenada da maior para a menor categoria

  Cenário: Soma das participações é cem por cento
    Quando Lucas abre a tela "Análise"
    Então a soma das participações exibidas é "100,0%"

  Cenário: Mudar para o mês anterior
    Dado despesas de "R$ 900,00" em setembro de 2026
    Quando Lucas escolhe o período "Mês anterior"
    Então vê "Despesas R$ 900,00"

  Cenário: Intervalo livre
    Quando Lucas escolhe o intervalo de 01/09/2026 a 31/10/2026
    Então os totais somam setembro e outubro

  Cenário: Intervalo livre maior que 24 meses
    Quando Lucas escolhe o intervalo de 01/01/2024 a 31/10/2026
    Então vê "Escolha um intervalo de até 24 meses"

  Cenário: Drill-down leva ao Extrato com o mesmo número
    Quando Lucas toca em "Supermercado" na quebra por categoria
    Então vê o Extrato de outubro de 2026 filtrado por "Supermercado"
    E o total de despesas do Extrato é "R$ 700,00"

  Cenário: Total reconcilia com o Extrato
    Quando Lucas abre o Extrato de outubro de 2026
    Então o total de despesas do Extrato é "R$ 1.200,00"

  Cenário: Transferência e pagamento de fatura não entram
    Dado uma transferência de "R$ 1.000,00" e um pagamento de fatura de "R$ 479,00" em outubro de 2026
    Quando Lucas abre a tela "Análise"
    Então "Despesas" continua "R$ 1.200,00"

  Cenário: Compra parcelada conta por parcela
    Dado uma compra "Notebook" de "R$ 2.500,00" em "10x" cuja parcela 1 cai na fatura de out/2026
    Quando Lucas abre a tela "Análise" de outubro de 2026
    Então a categoria da compra soma "R$ 250,00" de "Notebook"

  Cenário: Lançamento excluído não entra
    Dado que "Moradia" de "R$ 200,00" foi excluída
    Quando Lucas abre a tela "Análise"
    Então "Despesas" mostra "R$ 1.000,00"

  Cenário: Período sem lançamentos
    Quando Lucas escolhe o período "Mês seguinte" sem lançamentos
    Então vê "Nada lançado neste período"

  Cenário: Valores ocultos
    Dado que os valores estão ocultos
    Quando Lucas abre a tela "Análise"
    Então vê "Supermercado R$ ••••• 58,3%"

  Cenário: Erro ao carregar
    Dado que o serviço está indisponível
    Quando Lucas abre a tela "Análise"
    Então vê "Não foi possível carregar a análise" com o botão "Tentar de novo"

  Cenário: Carregamento
    Quando a tela "Análise" está carregando
    Então vê skeletons sem saltos de layout

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com despesas
    Quando Lucas abre a tela "Análise"
    Então os números não incluem lançamentos da "Família Souza"
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): cabeçalho com seletor de período; três cartões de totais; lista com barras; botão "Filtros" recolhível no mobile.

## Fora de escopo
Gráficos customizáveis; exportação; comparativo multi-período; previsões; evolução diária/mensal (podem entrar depois como "Could"); tetos e disponibilidade (AP1).

## Perguntas em aberto / pontos para o Tech Lead
- Agregado único reaproveitando o critério do Extrato e do Resumo; propriedade de teste "soma da análise = soma do Extrato".

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 7, Q-F10). A "evolução diária/mensal" do NEED-016 §2.2 fica fora desta fatia (decisão do PO, escopo fechado).

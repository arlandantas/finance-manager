# US-067 — Revisar os itens extraídos da fatura antes de gravar

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-B (proposta)** · fatia 2/4 da importação |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Must · 2,3 · 8 (candidata a 2 fatias se o TL estimar mais: 067a lista/edição, 067b conferência/duplicidade) |
| Status | Refinada, aguarda SDD do TL (R5 adiada); não iniciada |
| Depende de | US-066, US-024 (descrição), US-014 (categorias), US-040a (parcelas) |
| Corte | Não cortar (RN15: a IA nunca grava sozinha; a revisão é o que torna a importação segura) |
| Rastreabilidade | **NEED-026** (RN-026.3..8) · NEED-023 §5 · NEED-024 (RN-024.x) · RF44 · RN12, RN15 · FLUXO-015 · D-PO-60, D-PO-61, D-PO-63 |

## História
Como **membro da família**, quero **conferir, corrigir e escolher os itens que a IA extraiu da fatura, vendo se o total bate e quais já existem**, para **gravar só o que está certo e não duplicar**.

## Regras de negócio aplicáveis
- Cada item mostra **data, descrição, valor, parcela (n/N), categoria sugerida e responsável** (padrão: titular do cartão); tudo editável, com opção de **excluir da importação**.
- **Categoria sugerida** pelo histórico da família (descrições iguais/semelhantes já categorizadas); sem histórico: "Sem categoria" para o usuário escolher. A IA pode propor, mas o usuário vê e aceita (RN15).
- **Conferência de total** (RN-026.4): soma dos itens do arquivo × total da fatura declarado no arquivo; divergência é destacada e o rodapé mostra a diferença. O total é recalculado ao desmarcar/editar.
- **Anti-duplicidade** (RN-026.5, D-PO-61): item com mesmo cartão, mesma data, mesmo valor e descrição semelhante a lançamento existente, ou já importado antes, vem **sinalizado "Possível duplicado" e desmarcado**, com link ao lançamento existente.
- **Itens especiais** (RN-026.7, D-PO-63): pagamento de fatura, estornos/créditos e encargos (juros, IOF, multa) aparecem em grupo próprio, **desmarcados por padrão**; pagamento de fatura nunca é despesa (RN12).
- **Parcelas "3/10"** (RN-026.6): o item vira parcela real do plano; as posições anteriores **não** geram lançamento em faturas passadas (conversa com a US-065); se já existe plano com mesma descrição e valor, sinaliza duplicidade.
- Valores em centavos exatos; item com valor ou data ilegível fica **"Precisa de atenção"** e não pode ser confirmado sem correção.
- Se a revisão é abandonada, **nada é gravado** e a sessão expira (prazo do TL); o arquivo já foi descartado.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Revisão dos itens extraídos

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com a fatura "nov/2026" aberta
    E um arquivo validado com 4 itens e total declarado de "R$ 620,00"
    E Lucas está autenticado na tela de revisão

  Cenário: Lista mostra os campos de cada item
    Quando Lucas vê a lista de itens
    Então cada item mostra data, descrição, valor, categoria sugerida e responsável
    E o responsável padrão é "Lucas", titular do cartão

  Cenário: Total confere
    Dado que os itens marcados somam "R$ 620,00"
    Quando Lucas olha o rodapé
    Então vê "Total conferido: R$ 620,00 = total do arquivo"

  Cenário: Total divergente é destacado
    Dado que os itens marcados somam "R$ 590,00"
    Quando Lucas olha o rodapé
    Então vê "Diferença de R$ 30,00 em relação ao total do arquivo"
    E o rodapé está destacado

  Cenário: Desmarcar um item recalcula o total
    Dado que o item "Padaria" de "R$ 45,00" está marcado
    Quando Lucas desmarca o item "Padaria"
    Então o total dos itens marcados diminui "R$ 45,00"

  Cenário: Corrigir valor, categoria e responsável de um item
    Dado que o item "Mercado" de "R$ 300,00" está na lista
    Quando Lucas altera o valor para "R$ 310,00", a categoria para "Mercado" e o responsável para "Mariana"
    Então o item mostra "R$ 310,00", "Mercado" e "Mariana"

  Cenário: Categoria sugerida pelo histórico da família
    Dado que a família já categorizou "Padaria Pão Quente" como "Alimentação"
    Quando o arquivo traz o item "PADARIA PAO QUENTE"
    Então a categoria sugerida do item é "Alimentação"

  Cenário: Item sem histórico fica sem categoria
    Dado que nenhum lançamento anterior se parece com "OFICINA ZETA"
    Quando Lucas vê o item "OFICINA ZETA"
    Então a categoria do item é "Sem categoria"
    E Lucas precisa escolher uma categoria para confirmar

  Cenário: Possível duplicado vem desmarcado
    Dado que existe o lançamento "Padaria" de "R$ 45,00" em 03/11/2026 no cartão "Nubank Lucas"
    Quando o arquivo traz "PADARIA" de "R$ 45,00" em 03/11/2026
    Então o item vem marcado como "Possível duplicado"
    E o item vem desmarcado
    E vê o link "Ver lançamento existente"

  Cenário: Usuário pode marcar mesmo assim um possível duplicado
    Dado que o item "Padaria" está como "Possível duplicado"
    Quando Lucas marca o item
    Então o item passa a contar no total e na gravação

  Cenário: Pagamento de fatura e encargos em grupo próprio e desmarcados
    Dado que o arquivo traz "PAGAMENTO RECEBIDO" de "R$ 500,00" e "IOF" de "R$ 3,20"
    Quando Lucas vê a lista
    Então esses itens aparecem em "Pagamentos, estornos e encargos"
    E estão desmarcados
    E o pagamento tem a nota "Não é uma despesa"

  Cenário: Item parcelado vira parcela do plano
    Dado que o arquivo traz "SOFA 3/10" de "R$ 250,00"
    Quando Lucas vê a lista
    Então o item mostra "Parcela 3/10"
    E vê o aviso "As parcelas 1 e 2 não serão lançadas em faturas passadas"

  Cenário: Item ilegível exige correção
    Dado que o item "???" veio sem valor legível
    Quando Lucas tenta confirmar
    Então vê o item destacado em "Precisa de atenção"
    E a confirmação fica desabilitada até Lucas corrigir ou excluir o item

  Cenário: Sair sem confirmar não grava nada
    Dado que Lucas editou 3 itens
    Quando Lucas sai da revisão e confirma o descarte
    Então nenhum lançamento é criado na fatura "nov/2026"
```

## Experiência (UX/estados)
[FLUXO-015](../../flows/FLUXO-015-importar-fatura-por-arquivo.md) etapa 3: lista rolável com grupos (a lançar, possíveis duplicados, especiais), seleção em massa, rodapé fixo com total e diferença, filtro "Precisa de atenção".

## Fora de escopo
Aprendizado automático de correções entre importações; edição em massa por regra; reconhecimento de estabelecimento por CNPJ.

## Histórico
- 2026-10-24 — Criada (fatia 2/4; D-PO-60, 61, 63).

# US-027 — Ocultar valores na tela

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês e Privacidade de Exibição · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 3,4 · 5 |
| Status | **Especificada** (SDD-010, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | nenhuma (transversal); **1ª da R2.1** (D-PO-35): todo valor das telas seguintes (US-022 em diante) já nasce em `Money` |
| Corte | **Não cortar** |
| Rastreabilidade | Parecer item 3, Q-F04 · NEED-014 (RN-014.1..4) · NEED-022 (RN-022.1) · FLUXO-007 · D-PO-15 |

## História
Como **membro da família**, quero **ocultar os valores monetários em todo o app com um toque**, para **usar o app em público sem expor saldos e dívidas a quem está ao lado**.

## Regras de negócio aplicáveis
- **Controle sempre visível**: ícone de olho no cabeçalho de todas as telas (1 toque alterna).
- **Padrão**: em **dispositivo ou sessão sem preferência salva**, os valores **começam ocultos** (Q-F04). Depois o app **lembra a última escolha** do usuário **naquele dispositivo** (RN-014.1).
- **Escopo**: todo valor monetário de **leitura** é mascarado em todo o app: saldos, Resumo do Mês, acerto, faturas, extrato, previstas, detalhe, contas e cartões, limite. Máscara: `R$ •••••` (largura fixa para não revelar a ordem de grandeza). Sinal negativo **não** é revelado.
- **Continuam visíveis** (RN-014.4): percentuais, quantidades (parcelas, nº de lançamentos), datas e nomes.
- **Campos de entrada** (valor digitado no lançamento) **ficam visíveis** (o valor é do próprio usuário). Ao **salvar**, o aviso de sucesso **não repete o valor**.
- **Revelar pontualmente**: tocar num valor mascarado o revela por **5 segundos**; o olho do cabeçalho revela/oculta tudo.
- Cálculos, alertas e dados **não mudam**; só a exibição (RN-014.3). Textos do tipo "ficará negativa" continuam, sem o valor.
- A interface **não promete segurança**: dica do controle "Oculta os valores na tela. Não protege seus dados." (RN-014.2).
- Respeita leitores de tela: valor oculto é anunciado como "valor oculto" (não lê os números).
- Gráficos e totais futuros (R3) herdam a máscara.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Ocultar valores

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    E Lucas está autenticado

  Cenário: Dispositivo novo começa com valores ocultos
    Dado que Lucas nunca abriu o app neste dispositivo
    Quando Lucas abre a Home
    Então os valores aparecem como "R$ •••••"
    E o ícone do olho indica "Valores ocultos"

  Cenário: Mostrar os valores com um toque
    Dado que os valores estão ocultos
    Quando Lucas toca no ícone do olho
    Então o saldo da família mostra "R$ 7.349,50"

  Cenário: A última escolha é lembrada no dispositivo
    Dado que Lucas mostrou os valores
    Quando Lucas fecha e reabre o app no mesmo dispositivo
    Então os valores continuam visíveis

  Cenário: Ocultar de novo é lembrado
    Dado que os valores estão visíveis
    Quando Lucas toca no ícone do olho e recarrega a página
    Então os valores continuam ocultos

  Cenário: A preferência é por dispositivo
    Dado que Lucas mostrou os valores no desktop
    Quando Lucas abre o app em um celular novo
    Então os valores estão ocultos

  Cenário: Máscara em todo o app
    Dado que os valores estão ocultos
    Quando Lucas visita Home, Extrato, Acerto, Cartões, Contas a pagar e Contas
    Então nenhuma dessas telas mostra um valor em reais legível

  Cenário: Máscara no extrato mantém data e descrição
    Dado uma despesa "Mercado do bairro" de "R$ 150,50" em 10/10/2026
    E os valores estão ocultos
    Quando Lucas abre o Extrato
    Então vê "Mercado do bairro" e "10/10/2026" e "R$ •••••"

  Cenário: Percentuais e quantidades permanecem visíveis
    Dado uma fatura com 3 compras e participação de Mariana em 75%
    E os valores estão ocultos
    Quando Lucas abre a Home
    Então vê "75%" e "3 compras"

  Cenário: Revelar um valor pontualmente
    Dado que os valores estão ocultos
    Quando Lucas toca no valor do saldo da família
    Então o saldo mostra "R$ 7.349,50" por 5 segundos
    E volta a "R$ •••••" em seguida

  Cenário: Lançar com valores ocultos
    Dado que os valores estão ocultos
    Quando Lucas digita "R$ 150,50" no campo de valor do formulário "Nova despesa"
    Então o campo mostra "R$ 150,50"
    E após salvar vê "Despesa registrada com sucesso!" sem o valor

  Cenário: Alertas de saldo não vazam o valor
    Dado que os valores estão ocultos
    E a conta "Dinheiro" com saldo de "R$ 90,00"
    Quando Lucas escolhe "Dinheiro" para pagar "R$ 650,00"
    Então vê o aviso "A conta de origem ficará negativa" sem mostrar os valores

  Cenário: Leitor de tela não lê o número
    Dado que os valores estão ocultos
    Quando um leitor de tela lê o saldo da família
    Então anuncia "valor oculto"

  Cenário: Dica não promete segurança
    Quando Lucas passa o mouse sobre o ícone do olho
    Então vê "Oculta os valores na tela. Não protege seus dados."

  Cenário: Outro usuário no mesmo dispositivo
    Dado que Lucas mostrou os valores neste dispositivo e saiu do app
    Quando Mariana entra neste dispositivo pela primeira vez
    Então os valores estão ocultos

  Cenário: Preferência indisponível no navegador
    Dado que o navegador não permite guardar preferências
    Quando Lucas abre a Home
    Então os valores estão ocultos
    E o controle do olho continua funcionando na sessão
```

## Experiência (UX/estados)
[FLUXO-007](../../flows/FLUXO-007-ocultar-valores.md): olho no cabeçalho (mobile e desktop); componente único `Money` para todo valor de leitura. Nenhuma tela mostra valor "piscando" antes da preferência carregar (renderiza oculto primeiro).

## Fora de escopo
Bloqueio por PIN/biometria; ocultar dados no servidor; ocultar nomes ou descrições; preferência sincronizada entre dispositivos.

## Perguntas em aberto / pontos para o Tech Lead
- Armazenamento por dispositivo (localStorage por usuário) e o comportamento "sessão nova"; renderizar oculto no SSR para evitar flash (ver `pedidos-ao-tech-lead-r21-r3.md`).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 3, Q-F04) e da NEED-014.
- 2026-10-04 — **Revisão pós-TL (D-PO-35):** passa a ser a **primeira** história da R2.1 (ocultar valores antes de Resumo e Saldos, para não retrabalhar telas); tamanho 5 confirmado; auditoria de todas as telas e regra de CI contra `formatBRL` fora do componente `Money`.

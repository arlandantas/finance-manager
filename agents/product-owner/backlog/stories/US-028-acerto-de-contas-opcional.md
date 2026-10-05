# US-028 — Acerto de contas opcional por família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 3,2 · 5 |
| Status | **Especificada** (SDD-011, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-009a, US-011, US-012 (entregues); US-002 (onboarding) |
| Corte | **Não cortar** (item 2 do usuário; destrava US-029 e US-030) |
| Rastreabilidade | Parecer item 2 · NEED-019 (RN-019.1..6) · NEED-007 · Q-F01 · FLUXO-009 · D-PO-14 |

## História
Como **Administrador da família**, quero **ligar ou desligar o acerto de contas**, para **usar o app só como controle financeiro quando a família não quer medir "quem deve a quem"**.

## Regras de negócio aplicáveis
- **Ligado por padrão** em famílias novas (Q-F01); o onboarding oferece a opção de desligar. Famílias existentes ficam **ligadas**.
- A configuração é **da família** e só o **Administrador** altera. Membro vê o estado, em leitura.
- **Desligado**: somem o item de menu "Acerto", o indicador na Home, o campo "Dividir" no lançamento, a regra de divisão e os avisos de pendência. **Nada é apagado**: lançamentos marcados como divididos, regra e histórico de acertos permanecem; **religar restaura tudo** (RN-019.1).
- Totais de despesas, categorias e saldos **não mudam** com o recurso ligado ou desligado (RN-019.3).
- Desligar com **diferença em aberto** (qualquer mês): aviso "Há R$ X a acertar entre os membros. Ao desligar, o valor fica guardado e volta se você religar." + confirmação. A diferença **não desaparece** (RN-019.2).
- Linguagem neutra no acerto: "diferença do mês" e "valor a acertar" em lugar de "deve" (RN-019.4); a frase-herói do FLUXO-003 passa a "Para equilibrar o mês: Lucas transfere R$ X para Mariana".
- Endereço direto das telas de acerto com o recurso desligado: "O acerto de contas está desligado nesta família" (sem erro técnico).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Acerto de contas opcional

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E o acerto de contas ligado
    E Mariana está autenticada em "Configurações da família"

  Cenário: Famílias existentes continuam com o acerto ligado
    Quando Mariana abre "Configurações da família"
    Então a chave "Acerto de contas entre membros" está ligada

  Cenário: Família nova nasce com o acerto ligado e pergunta no onboarding
    Dado que Mariana está criando a família "Família Souza"
    Quando ela chega ao passo "Como vocês dividem as despesas?"
    Então a opção "Quero acertar as diferenças entre os membros" vem marcada
    E vê a opção "Só controlar, sem dividir"

  Cenário: Escolher não dividir no onboarding
    Dado que Mariana está criando a família "Família Souza"
    Quando ela escolhe "Só controlar, sem dividir" e conclui o onboarding
    Então a "Família Souza" fica com o acerto desligado
    E vê a dica "Você pode mudar isso depois em Configurações da família"

  Cenário: Desligar sem diferença em aberto
    Dado que não há diferença a acertar em nenhum mês
    Quando Mariana desliga a chave "Acerto de contas entre membros" e confirma
    Então vê "Acerto de contas desligado"

  Cenário: Desligar esconde as telas e o campo de divisão
    Dado que o acerto de contas foi desligado
    Quando Lucas abre o aplicativo
    Então o menu não tem o item "Acerto"
    E a Home não mostra o indicador de acerto
    E o formulário "Nova despesa" não mostra o campo "Dividir"

  Cenário: Desligar com diferença em aberto exige confirmação
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Mariana desliga a chave "Acerto de contas entre membros"
    Então vê o aviso "Há R$ 380,00 a acertar entre os membros"
    E o recurso só desliga depois de ela tocar em "Desligar mesmo assim"

  Cenário: Cancelar o desligamento mantém tudo como estava
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Mariana desliga a chave e toca em "Cancelar"
    Então a chave continua ligada

  Cenário: Desligar não apaga nada e religar restaura
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    E Mariana desligou o acerto confirmando o aviso
    Quando Mariana religa a chave "Acerto de contas entre membros"
    Então a diferença de "R$ 380,00" em outubro de 2026 volta a aparecer
    E o histórico de acertos registrados continua igual

  Cenário: Totais não mudam com o recurso desligado
    Dado despesas de outubro de 2026 que somam "R$ 3.169,90"
    Quando Mariana desliga o acerto de contas
    Então o total de despesas de outubro de 2026 continua "R$ 3.169,90"
    E o saldo da família não muda

  Cenário: Membro não altera a configuração
    Dado que Lucas está autenticado em "Configurações da família"
    Quando ele olha a chave "Acerto de contas entre membros"
    Então a chave aparece desabilitada com a dica "Só o Administrador pode alterar"

  Cenário: Endereço direto das telas de acerto com o recurso desligado
    Dado que o acerto de contas foi desligado
    Quando Lucas acessa o endereço do painel de Acerto
    Então vê "O acerto de contas está desligado nesta família"
    E vê o link "Voltar para o início"

  Cenário: Linguagem neutra no painel de Acerto
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Lucas abre o painel de Acerto de outubro de 2026
    Então vê "Valor a acertar: R$ 380,00"
    E não vê a palavra "deve"

  Cenário: Falha de rede ao alterar a configuração
    Dado que não há conexão
    Quando Mariana desliga a chave e confirma
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E a chave volta ao estado anterior

  Cenário: Duplo clique não grava duas vezes
    Quando Mariana toca duas vezes rapidamente em "Desligar mesmo assim"
    Então a alteração é registrada uma única vez
```

## Experiência (UX/estados)
[FLUXO-009](../../flows/FLUXO-009-acerto-opcional.md): chave em Configurações da família; diálogo de confirmação com o valor pendente; passo opcional no onboarding ([FLUXO-002](../../flows/FLUXO-002-onboarding-e-convite.md)). Skeleton, erro e conflito de versão no padrão SDD-000 §7.

## Fora de escopo
Acerto ligado/desligado **por usuário** (Q-F01: por família); ocultar a diferença só para um membro (usa "ocultar valores", US-027); mexer no cálculo do acerto.

## Perguntas em aberto / pontos para o Tech Lead
- Onde guardar a configuração (coluna na `Family` ou tabela de preferências) e como as rotas/API reagem ao estado desligado (ver `pedidos-ao-tech-lead-r21-r3.md`).
- Os campos `isSharedExpense` e os acertos já registrados **permanecem** intactos; confirmar que nenhum job os recalcula ao religar.

## Histórico
- 2026-10-04 — Criada a partir do parecer do Stakeholder (item 2, Q-F01) e da NEED-019.

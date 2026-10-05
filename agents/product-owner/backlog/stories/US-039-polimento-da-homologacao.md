# US-039 — Polimento da homologação (erros de validação, categorias no menu, copiar link de convite, limpar filtros, voltar ao Acerto)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Could · 1,4 · 5 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-003, US-007, US-014 |
| Corte | **Primeiro a cortar (ou fatiar por achado)**; cada cenário é independente |
| Rastreabilidade | Homologação achados 5, 8, 11, 12, 13 · Parecer §9 item 13 · NEED-001, NEED-012, NEED-006 · FLUXO-013 · D-PO-24 |

## História
Como **membro da família**, quero **pequenos ajustes de uso (erros que somem ao corrigir, atalhos para categorias, convite reenviável, filtros que limpam, voltar ao Acerto)**, para **que o dia a dia tenha menos tropeços**.

## Regras de negócio aplicáveis
- **Achado 5 — validação reativa**: mensagem de erro de um campo **some assim que o campo fica válido**, sem esperar novo envio, e **sem saltar o layout** (espaço da mensagem reservado). Vale para Transferir, Nova despesa prevista e demais formulários.
- **Achado 8 — Categorias**: item **"Categorias"** em "Configurações" no menu (além do link no formulário).
- **Achado 11 — Convite**: convite pendente ganha **Copiar link** e **Reenviar e-mail**; a tela de convite avisa antes de enviar "A pessoa precisa entrar com a conta Google do mesmo e-mail". Reenviar **não** estende a validade de 7 dias (D-GES-07), apenas reenvia.
- **Achado 12 — Filtros do Extrato**: botão **"Limpar filtros"** visível quando há filtro ativo; selects com **rótulo acessível** ("Membro: todos", "Cartão: todos").
- **Achado 13 — Salvar regra**: ver US-031 (volta ao Acerto e FAB não cobre o botão); aqui só o FAB oculto em telas de formulário de página inteira.
- Fora deste pacote: achados 6 (corrigir forma de pagamento), 9 (transferência em duas linhas), 10 (faturas em Contas a pagar), 14 (liquidez, AP2), 15 (ruído de console do túnel).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Polimento da homologação

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E Mariana está autenticada

  Cenário: Erro de valor some ao corrigir
    Dado que Mariana tentou transferir "R$ 0,00" e viu "Informe um valor maior que zero"
    Quando Mariana digita "R$ 200,00" no campo de valor
    Então a mensagem "Informe um valor maior que zero" desaparece sem novo envio

  Cenário: Layout não salta ao corrigir o erro
    Dado que Mariana tentou salvar uma despesa prevista sem valor e viu o erro
    Quando Mariana corrige o valor
    Então a posição do botão "Salvar" não muda

  Cenário: Categorias no menu de configurações
    Quando Mariana abre o menu do avatar
    Então vê "Configurações" e dentro dele "Categorias"

  Cenário: Copiar o link do convite pendente
    Dado um convite pendente para "vovo@example.com"
    Quando Mariana toca em "Copiar link" no convite
    Então vê "Link copiado"

  Cenário: Reenviar o e-mail do convite
    Dado um convite pendente para "vovo@example.com" enviado há 2 dias
    Quando Mariana toca em "Reenviar e-mail"
    Então vê "E-mail reenviado"
    E a validade do convite continua com o prazo original de 7 dias

  Cenário: Aviso da conta Google antes de enviar o convite
    Quando Mariana abre o formulário de convite
    Então vê "A pessoa precisa entrar com a conta Google do mesmo e-mail"

  Cenário: Membro não reenvia convite
    Dado que Lucas está autenticado em "Família"
    Quando Lucas olha um convite pendente
    Então não vê "Reenviar e-mail" nem "Copiar link"

  Cenário: Limpar filtros do Extrato
    Dado que o Extrato está filtrado por membro "Lucas" e categoria "Supermercado"
    Quando Mariana toca em "Limpar filtros"
    Então todos os filtros voltam ao padrão
    E o botão "Limpar filtros" deixa de ser exibido

  Cenário: Botão limpar só aparece com filtro ativo
    Dado que o Extrato está sem filtros
    Quando Mariana abre o Extrato
    Então não vê o botão "Limpar filtros"

  Cenário: Filtros têm rótulo acessível
    Quando um leitor de tela lê o filtro de membro do Extrato
    Então anuncia "Membro: todos"

  Cenário: Botão de lançamento rápido não cobre formulários de página inteira
    Dado um celular de 375 px de largura
    Quando Mariana abre a tela "Regra de divisão"
    Então o botão "+" não é exibido
```

## Experiência (UX/estados)
[FLUXO-013](../../flows/FLUXO-013-preferencias-navegacao-e-detalhe.md) (seção "Polimento"). Nenhum componente novo além de "Copiar link" e "Limpar filtros".

## Fora de escopo
Achados 6, 9, 10, 14 e 15 (ver regras). O envio real de e-mail depende do SMTP já configurado (Mailpit em dev; ver `pendencias-externas.md`).

## Perguntas em aberto / pontos para o Tech Lead
- Endpoint de reenvio de convite e política de limite de reenvios (hipótese do PO: no máximo 3 por convite).

## Histórico
- 2026-10-04 — Criada a partir do parecer (§9 item 13) e dos achados 5, 8, 11, 12, 13 da homologação.

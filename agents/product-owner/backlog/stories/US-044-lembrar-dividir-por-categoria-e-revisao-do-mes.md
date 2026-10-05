# US-044 — Lembrar "dividir" por categoria e revisar despesas não divididas no fechamento

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R3** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should · 2,3 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-043, US-014, US-030 |
| Corte | **Cortável** (mitigação do risco C7; sem ela vale a linha informativa da US-030) |
| Rastreabilidade | Parecer item 9 (risco C7, salvaguardas) · NEED-018 (§2.4, §4) · FLUXO-008 · D-PO-16, D-PO-27 |

## História
Como **membro da família**, quero **que categorias como Supermercado e Condomínio já nasçam divididas e ser avisado no fechamento do mês sobre despesas "Só meu" para revisar**, para **o acerto não subestimar despesas comuns esquecidas**.

## Regras de negócio aplicáveis
- **Categoria pode "dividir por padrão"**: opção na edição da categoria (US-014), por **qualquer membro** (D-PO-04). Padrão de todas as categorias: desligado.
- Ao escolher uma categoria com "dividir por padrão", o seletor de divisão (US-043) vai para **"Pela regra da família"**; o usuário pode mudar para qualquer modo. Trocar a categoria **depois de ter escolhido a divisão manualmente não sobrescreve** a escolha.
- **Revisão no fechamento do mês**: o painel de Acerto de um mês **encerrado** (e a tela "Registrar acerto") mostra **"N despesas Só meu neste mês. Revisar?"**, com a lista **revisável** (cada item com ação "Dividir" em um toque, usando "Pela regra"), sem mudar nada sozinho.
- O aviso é **informativo e dispensável por mês** ("Não perguntar de novo para este mês"); nunca bloqueia o acerto.
- Existe apenas com o acerto ligado; respeita "ocultar valores".
- Dividir uma despesa de mês já acertado cai nas regras da US-013b.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Dividir por padrão por categoria e revisão do mês

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a regra de divisão "50% / 50%" vigente
    E o acerto de contas ligado
    E Lucas está autenticado

  Cenário: Marcar a categoria para dividir por padrão
    Quando Lucas edita a categoria "Supermercado" e liga "Dividir por padrão"
    Então vê "Categoria atualizada"

  Cenário: Lançamento herda a divisão da categoria
    Dado que a categoria "Supermercado" divide por padrão
    Quando Lucas abre "Nova despesa" e escolhe a categoria "Supermercado"
    Então a divisão vem como "Pela regra da família (50% / 50%)"

  Cenário: Categorias comuns continuam Só meu
    Dado que a categoria "Saúde" não divide por padrão
    Quando Lucas escolhe a categoria "Saúde"
    Então a divisão continua "Só meu"

  Cenário: Escolha manual não é sobrescrita ao trocar a categoria
    Dado que a categoria "Supermercado" divide por padrão
    E Lucas escolheu manualmente "Só meu" no formulário
    Quando Lucas troca a categoria para "Supermercado"
    Então a divisão continua "Só meu"

  Cenário: Revisão lista as despesas Só meu do mês encerrado
    Dado duas despesas "Só meu" de "R$ 80,00" e "R$ 45,00" em setembro de 2026
    Quando Lucas abre o Acerto de setembro de 2026
    Então vê "2 despesas Só meu neste mês. Revisar?"

  Cenário: Dividir a partir da revisão
    Dado uma despesa "Só meu" de "R$ 45,00" em setembro de 2026
    Quando Lucas abre "Revisar" e toca em "Dividir" na despesa de "R$ 45,00"
    Então a despesa passa a "Pela regra da família (50% / 50%)"
    E o acerto de setembro de 2026 considera "R$ 22,50" para cada membro

  Cenário: Revisão não muda nada sozinha
    Dado duas despesas "Só meu" em setembro de 2026
    Quando Lucas abre "Revisar" e fecha sem tocar em nada
    Então nenhuma despesa muda

  Cenário: Dispensar o aviso do mês
    Dado duas despesas "Só meu" em setembro de 2026
    Quando Lucas toca em "Não perguntar de novo para este mês"
    Então o aviso de setembro de 2026 não aparece mais

  Cenário: Mês em andamento não mostra o aviso de revisão
    Dado que hoje é 12/10/2026 e há uma despesa "Só meu" em outubro de 2026
    Quando Lucas abre o Acerto de outubro de 2026
    Então não vê "Revisar?"

  Cenário: Dividir em mês já acertado
    Dado que o mês de setembro de 2026 tem um acerto registrado
    Quando Lucas toca em "Dividir" numa despesa da revisão de setembro
    Então vê o aviso de mês acertado da US-013b

  Cenário: Acerto desligado não mostra a opção nem o aviso
    Dado que o acerto de contas foi desligado
    Quando Lucas edita a categoria "Supermercado"
    Então não vê "Dividir por padrão"
```

## Experiência (UX/estados)
[FLUXO-008](../../flows/FLUXO-008-lancar-despesa-r21-r3.md): interruptor na edição da categoria; faixa discreta no topo do Acerto de meses encerrados.

## Fora de escopo
Aprender automaticamente por histórico; regras por descrição; bloquear o fechamento do mês.

## Perguntas em aberto / pontos para o Tech Lead
- Persistência do "dividir por padrão" por categoria (`Category.defaultSplit`) e arquivamento; consulta de despesas "Só meu" do mês.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 9: salvaguardas do risco C7).

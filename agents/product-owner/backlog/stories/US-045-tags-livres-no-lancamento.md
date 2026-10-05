# US-045 — Tags livres no lançamento

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should · 2,4 · 5 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-005, US-006, US-016a, US-024 |
| Corte | **Cortável** junto com US-046..049 (a análise sem tags ainda funciona por categoria/membro/conta) |
| Rastreabilidade | Parecer item 1, Q-F09 · NEED-013 (RN-013.1..6) · FLUXO-014 · D-PO-28 |

## História
Como **membro da família**, quero **anexar tags livres a um lançamento digitando o nome na hora**, para **responder perguntas transversais (viagem, reforma) sem criar categorias de uso único**.

## Regras de negócio aplicáveis
- Tag é **opcional** e **nunca atrasa** o lançamento (RN-013.1): uma linha recolhida **"+ Tag"** abaixo da descrição; os quatro toques do fluxo mínimo não mudam.
- **Criar ao digitar** (sem cadastro prévio): digitar o nome e confirmar com Enter/vírgula/"Criar tag 'viagem'". Com **sugestão** das tags existentes ao digitar (por prefixo, sem diferenciar maiúsculas e acentos).
- Tags são **da família**; todos veem e reutilizam.
- **Nome único sem diferenciar maiúsculas/minúsculas/acentos** (RN-013.2): "Viagem" = "viagem" = "Viágem" (só caixa e acentos); digitar uma variação reaproveita a tag existente e exibe o nome original; erros de grafia como "viajem" **não** são unificados (a sugestão ao digitar é a mitigação). Tamanho 2 a 30 caracteres, sem espaços nas pontas; espaços internos viram hífen na exibição "viagem-nordeste".
- **Sem limite técnico**; a interface **sugere até 3** por lançamento: a 4ª mostra aviso suave "Muitas tags dificultam a análise" mas **permite** (Q-F09).
- Vale para **despesa, receita e compra no cartão**; **não** para transferência e acerto (Q-F09b).
- **Tag não entra no acerto nem tem teto** (RN-013.4).
- **Compra parcelada**: a tag vale para todas as parcelas (RN-013.5).
- Tags aparecem como *chips* no Extrato e no detalhe; editar tags de um lançamento está na edição (US-013a).
- Lançamento em **mês acertado**: editar tags **não** conta como edição financeira (não dispara o aviso da US-013b).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Tags livres no lançamento

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E Mariana está autenticada no formulário "Nova despesa"

  Cenário: Lançar sem tag continua igual
    Quando Mariana digita "R$ 80,00" e escolhe a categoria "Saúde" e toca em "Salvar Despesa"
    Então a despesa é registrada sem tags

  Cenário: Criar uma tag ao digitar
    Quando Mariana lança "Hotel" de "R$ 800,00" em "Lazer e restaurantes" com a tag "viagem-nordeste"
    Então o Extrato mostra "Hotel" com a tag "viagem-nordeste"

  Cenário: Sugestão das tags existentes
    Dado a tag "viagem-nordeste" já usada em outro lançamento
    Quando Mariana digita "via" no campo de tag
    Então vê a sugestão "viagem-nordeste"

  Cenário: Mesma tag com outra caixa reaproveita a existente
    Dado a tag "Viagem" já existente na família
    Quando Mariana digita "viagem" no campo de tag e confirma
    Então o lançamento fica com a tag "Viagem"
    E não existe uma segunda tag "viagem"

  Cenário: Acentos não criam tag duplicada
    Dado a tag "Café" já existente na família
    Quando Mariana digita "cafe" e confirma
    Então o lançamento fica com a tag "Café"

  Cenário: Vários nomes em um lançamento
    Quando Mariana lança "Passagem" de "R$ 600,00" em "Transporte" com as tags "viagem-nordeste" e "ferias"
    Então o Extrato mostra as duas tags em "Passagem"

  Cenário: Quarta tag gera só um aviso
    Dado um lançamento com 3 tags
    Quando Mariana acrescenta uma quarta tag
    Então vê "Muitas tags dificultam a análise"
    E consegue salvar mesmo assim

  Cenário: Nome de tag inválido
    Quando Mariana digita a tag "a"
    Então vê "A tag precisa ter entre 2 e 30 caracteres"

  Cenário: Transferência não tem tags
    Quando Mariana abre o formulário "Transferir entre contas"
    Então não vê o campo de tags

  Cenário: Receita aceita tags
    Quando Mariana troca para "Nova receita"
    Então vê o campo "+ Tag"

  Cenário: Compra parcelada aplica a tag a todas as parcelas
    Dado o cartão "Nubank Lucas" cadastrado
    Quando Mariana lança "Notebook" de "R$ 2.500,00" em "10x" com a tag "escritorio"
    Então as 10 parcelas mostram a tag "escritorio"

  Cenário: Tag não muda o acerto
    Dado a regra de divisão igual
    Quando Mariana lança "Mercado" de "R$ 300,00" dividindo com a família e com a tag "festa"
    Então o acerto considera exatamente o mesmo valor que consideraria sem a tag

  Cenário: Editar as tags de um lançamento
    Dado um lançamento "Hotel" com a tag "viagem-nordeste"
    Quando Mariana troca a tag para "ferias" e salva
    Então o Extrato mostra "Hotel" com a tag "ferias"

  Cenário: Editar tag em mês acertado não pede desfazer o acerto
    Dado que o mês de setembro de 2026 tem um acerto registrado
    Quando Mariana altera só a tag de uma despesa de setembro
    Então a alteração é salva sem o aviso de mês acertado

  Cenário: Falha de rede ao salvar com tag
    Dado que não há conexão
    Quando Mariana salva um lançamento com a tag "ferias"
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): "+ Tag" abre um campo com chips; sugestões em lista curta; no Extrato, chips discretos.

## Fora de escopo
Hierarquia, cor ou orçamento por tag (RN-013.6); tags automáticas; tags em transferência/acerto; limite rígido.

## Perguntas em aberto / pontos para o Tech Lead
- Normalização (caixa e acentos) e unicidade por família; tabela `Tag` e N:N; índice para filtro (ver `pedidos-ao-tech-lead-r21-r3.md`).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 1, Q-F09). Correção de redação: acentos e caixa são normalizados; variações ortográficas ("viajem") **não** são unificadas (só sugestão ao digitar).

# US-046 — Gerenciar tags (listar, renomear, remover)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should · 1,7 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-045 |
| Corte | **Cortável** (contorno: tags continuam utilizáveis e filtráveis sem a tela de gestão) |
| Rastreabilidade | Parecer item 1 · NEED-013 (RN-013.2, RN-013.3) · FLUXO-014 · D-PO-28 |

## História
Como **membro da família**, quero **ver, renomear e remover tags**, para **corrigir erros de digitação sem refazer lançamentos**.

## Regras de negócio aplicáveis
- Tela **"Tags"** (em Configurações): lista com **nome** e **nº de lançamentos**, ordenada por uso.
- **Renomear** atualiza todos os lançamentos (RN-013.3). Se o novo nome já existir (ignorando caixa e acentos), o app **oferece mesclar**: "Já existe a tag 'viagem'. Mesclar 'viajem' nela?" (os lançamentos migram; a tag antiga some). Não há duas tags com o mesmo nome.
- **Remover** retira a tag dos lançamentos e **nunca apaga lançamentos** (RN-013.3), com confirmação que informa quantos lançamentos serão afetados.
- Qualquer membro gerencia tags (mesmo critério das categorias, D-PO-04); nada disso exige o Administrador.
- Tag sem uso fica listada (0 lançamentos) e pode ser removida.
- Alterar tags de lançamentos em mês acertado **não** dispara aviso de acerto (US-045).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Gerenciar tags

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a tag "viajem" usada em 3 lançamentos
    E a tag "viagem" usada em 5 lançamentos
    E a tag "ferias" sem lançamentos
    E Mariana está autenticada em "Tags"

  Cenário: Lista de tags com uso
    Quando Mariana abre a tela "Tags"
    Então vê "viagem 5 lançamentos" e "viajem 3 lançamentos" e "ferias 0 lançamentos"

  Cenário: Renomear uma tag
    Quando Mariana renomeia "ferias" para "ferias-2026"
    Então a tag aparece como "ferias-2026"

  Cenário: Renomear atualiza os lançamentos
    Dado a tag "ferias" usada em 2 lançamentos
    Quando Mariana renomeia "ferias" para "ferias-2026"
    Então os 2 lançamentos mostram a tag "ferias-2026"

  Cenário: Renomear para um nome existente oferece mesclar
    Quando Mariana renomeia "viajem" para "Viagem"
    Então vê "Já existe a tag viagem. Mesclar viajem nela?"

  Cenário: Mesclar tags
    Quando Mariana renomeia "viajem" para "Viagem" e confirma "Mesclar"
    Então a tag "viagem" passa a ter 8 lançamentos
    E a tag "viajem" deixa de existir

  Cenário: Remover tag não apaga lançamentos
    Quando Mariana remove a tag "viagem" e confirma "Remover tag de 5 lançamentos"
    Então os 5 lançamentos continuam existindo sem a tag "viagem"
    E os totais do mês não mudam

  Cenário: Remover tag sem uso
    Quando Mariana remove a tag "ferias"
    Então a tag "ferias" não aparece mais na lista

  Cenário: Nome inválido ao renomear
    Quando Mariana renomeia "ferias" para "a"
    Então vê "A tag precisa ter entre 2 e 30 caracteres"

  Cenário: Membro também gerencia tags
    Dado que Lucas está autenticado em "Tags"
    Quando Lucas renomeia "ferias" para "ferias-2026"
    Então a tag aparece como "ferias-2026"

  Cenário: Conflito de versão
    Dado que Mariana e Lucas abriram a edição da tag "ferias"
    Quando Mariana renomeia para "ferias-2026"
    E Lucas tenta renomear para "descanso"
    Então Lucas vê "Esta tag foi alterada por Mariana. Recarregue para continuar."

  Cenário: Estado vazio
    Dado uma família sem tags
    Quando Mariana abre a tela "Tags"
    Então vê "Nenhuma tag ainda. Crie tags ao lançar uma despesa."

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a tag "casa"
    Quando Mariana tenta renomear a tag "casa" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): lista simples com ações rotuladas; diálogo de mesclagem com contagem.

## Fora de escopo
Hierarquia e cor de tags; tag "favorita"; exportação.

## Perguntas em aberto / pontos para o Tech Lead
- Operação de mesclagem atômica e idempotente.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 1).

# US-043 — Dividir no lançamento: Só meu, Pela regra ou De outro jeito

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R3, 5ª posição** (libera o modo CUSTOM **depois da janela de reversão** da EN-002, ADR-016) |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,6 · 5 |
| Status | **Esboçada** (SDD-015, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | EN-002, US-030, US-008, US-009b |
| Corte | **Cortável** (a EN-002 **não** sai com ela: é Must por causa da US-042; a R2.1 já entrega "Só meu" e regra da família) |
| Rastreabilidade | Parecer item 9b · NEED-018 (RN-018.1..5) · NEED-007 · D-PO-27 · FLUXO-008 |

## História
Como **membro da família**, quero **escolher no lançamento como aquele gasto se divide (não dividir, pela regra da família ou com percentuais específicos)**, para **refletir a realidade de cada despesa, inclusive reembolsos, sem depender de um percentual único**.

## Regras de negócio aplicáveis
- O interruptor "Dividir com a família" (US-030) vira um **seletor de três modos**: **Só meu** (padrão) · **Pela regra da família** (mostra o % vigente, ex. 58% / 42%) · **De outro jeito** (informar o percentual de cada membro).
- O **percentual usado fica gravado no lançamento** (EN-002); a regra da família é só a **sugestão inicial**. Mudar a regra **nunca reescreve** lançamentos salvos (RN-018.1, Q-08).
- "De outro jeito": percentual por membro, **soma 100%**; permite 0% e 100% (**"paguei tudo por você"/reembolso**, Q-F02b); com 3 ou mais membros vale o padrão da US-009b.
- **Centavos** (RN-018.3): arredondamento determinístico em `amountInCents`; **a sobra fica com quem pagou**.
- Editar o modo/percentual de um lançamento de **mês já acertado** segue as regras da US-013b (aviso e desfazer acerto).
- O fluxo "Só meu" mantém os **mesmos quatro toques**; os modos extras ficam a um toque adicional.
- Despesas previstas e compras parceladas usam o mesmo seletor (a baixa herda).
- Respeita "ocultar valores" (percentuais ficam visíveis).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Divisão definida no lançamento

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E a regra de divisão "50% / 50%" vigente
    E o acerto de contas ligado
    E Lucas está autenticado no formulário "Nova despesa"

  Cenário: Três modos disponíveis com Só meu como padrão
    Quando Lucas olha o campo "Divisão"
    Então vê "Só meu" "Pela regra da família (50% / 50%)" e "De outro jeito"
    E "Só meu" vem marcado

  Cenário: Dividir pela regra da família
    Quando Lucas lança "Mercado" de "R$ 300,00" em "Supermercado" com a divisão "Pela regra da família"
    Então o lançamento fica gravado com "50% / 50%"
    E o acerto considera a cota de "R$ 150,00" para cada membro

  Cenário: Só meu fica fora do acerto
    Quando Lucas lança "Farmácia" de "R$ 80,00" em "Saúde" com a divisão "Só meu"
    Então o acerto do mês não muda

  Cenário: Dividir de outro jeito
    Dado que Mariana paga o presente do pai de Lucas
    Quando Mariana lança "Presente" de "R$ 200,00" em "Outros" com a divisão "De outro jeito" Lucas 100% e Mariana 0%
    Então o acerto considera a cota de "R$ 200,00" para Lucas
    E a cota de Mariana é "R$ 0,00"

  Cenário: Percentuais precisam somar cem
    Quando Lucas informa "De outro jeito" com Lucas 70% e Mariana 40%
    Então vê "Os percentuais precisam somar 100%"
    E o botão "Salvar Despesa" fica desabilitado

  Cenário: Centavos ficam com quem pagou
    Quando Lucas lança "Bala" de "R$ 0,05" com a divisão "De outro jeito" Lucas 50% e Mariana 50%
    Então a cota de Mariana é "R$ 0,02"
    E a cota de Lucas é "R$ 0,03"

  Cenário: Mudar a regra depois não altera lançamentos antigos
    Dado que Lucas lançou "Mercado" de "R$ 300,00" com a divisão "Pela regra da família"
    Quando o Administrador salva a regra "70% / 30%"
    Então o lançamento "Mercado" continua gravado com "50% / 50%"

  Cenário: A regra nova vale para os próximos lançamentos
    Dado que o Administrador salvou a regra "70% / 30%"
    Quando Lucas escolhe "Pela regra da família"
    Então vê "Pela regra da família (70% / 30%)"

  Cenário: Três membros
    Dado a "Família Silva" também com o membro "Helena"
    Quando Lucas lança "Pizza" de "R$ 90,00" com a divisão "De outro jeito" Lucas 40% Mariana 40% e Helena 20%
    Então as cotas são "R$ 36,00" e "R$ 36,00" e "R$ 18,00"

  Cenário: Editar o modo de um lançamento em mês aberto
    Dado um lançamento "Mercado" de "R$ 300,00" gravado com "50% / 50%"
    Quando Lucas edita a divisão para "Só meu"
    Então o acerto do mês deixa de considerar "R$ 300,00"

  Cenário: Editar a divisão em mês já acertado
    Dado que o mês de setembro de 2026 tem um acerto registrado
    Quando Lucas edita a divisão de uma despesa de setembro
    Então vê o aviso de mês acertado da US-013b e a opção de desfazer o acerto

  Cenário: Sem acerto ligado o seletor não aparece
    Dado que o acerto de contas foi desligado
    Quando Lucas abre o formulário "Nova despesa"
    Então não vê o campo "Divisão"

  Cenário: Quatro toques no lançamento Só meu
    Quando Lucas digita "R$ 80,00" e escolhe a categoria "Saúde" e toca em "Salvar Despesa"
    Então a despesa é registrada com a divisão "Só meu"
```

## Experiência (UX/estados)
[FLUXO-008](../../flows/FLUXO-008-lancar-despesa-r21-r3.md): controle segmentado de três opções; ao escolher "De outro jeito", um mini-formulário com um campo por membro e a soma ao vivo.

## Fora de escopo
Divisão por valor fixo em R$ (só percentual); regras por categoria (US-044); desdobramento entre categorias (NEED-008, AP2).

## Perguntas em aberto / pontos para o Tech Lead
- Contrato do lançamento com rateio por membro (EN-002); arredondamento para N > 2 (maior resto, ADR-006).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 9b, Q-F02b).
- 2026-10-04 — **Revisão pós-TL (D-PO-34):** posição na R3 depois da US-042; a EN-002 passou a Must e deixou de ser cortada junto com esta história.

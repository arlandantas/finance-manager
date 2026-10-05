# US-030 — "Dividir com a família" desligado por padrão ("Só meu")

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 4,0 · 3 |
| Status | **Especificada** (SDD-011, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-028, US-005, US-018 |
| Corte | **Não cortar** |
| Rastreabilidade | Parecer item 9a · NEED-018 · Q-F02, Q-22 · RN-007.2 · FLUXO-008 · D-PO-16 |

## História
Como **membro da família**, quero que **o lançamento nasça como "Só meu" e eu escolha dividir só quando fizer sentido**, para **não inflar o acerto com gastos que não são da casa**.

## Regras de negócio aplicáveis
- Padrão do formulário de **despesa**: **"Só meu"** (não entra no acerto). Dividir = ligar o interruptor "Dividir com a família", que usa a **regra da família vigente** (percentual visível). Escolha por lançamento com outros percentuais é R3 (US-043).
- Vale para: lançamento de despesa (US-005), compra no cartão (US-016a) e **despesa prevista** (US-018; a baixa herda). Isto **revisa o Q-22** (padrão ligado) para manter um único comportamento (D-PO-16).
- O campo **não aparece** com o acerto desligado (US-028) nem em família com **um único membro**.
- Lançamentos **já gravados não mudam**: `isSharedExpense` existente é preservado; só muda o padrão do formulário.
- **Reembolso/"paguei tudo por você"** só com percentual por lançamento (US-043, R3). Na R2.1 ele não existe: não prometer.
- **Transparência contra sub-registro** (risco C7): o painel de Acerto mostra "N despesas 'Só meu' neste mês (R$ X)" com link para o Extrato filtrado por "Só meu" (sem alterar o cálculo). A lembrança por categoria e a revisão no fechamento do mês são R3 (US-044).
- Despesas em **receita** continuam sem o campo (receita não entra no rateio).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Dividir desligado por padrão

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E o acerto de contas ligado
    E Lucas está autenticado

  Cenário: Nova despesa nasce como Só meu
    Quando Lucas abre o formulário "Nova despesa"
    Então o interruptor "Dividir com a família" está desligado
    E vê o rótulo "Só meu"

  Cenário: Lançamento rápido sem dividir mantém os quatro toques
    Quando Lucas digita "R$ 80,00" e escolhe a categoria "Saúde" e toca em "Salvar Despesa"
    Então a despesa é registrada como "Só meu"
    E o acerto do mês não muda

  Cenário: Ligar o interruptor divide pela regra vigente
    Dado a regra de divisão igual vigente
    Quando Lucas liga "Dividir com a família" e salva uma despesa de "R$ 300,00" em "Supermercado"
    Então a despesa entra no acerto com cota de "R$ 150,00" para cada membro
    E o formulário mostrou "Divisão igual (50% / 50%)" ao ligar

  Cenário: O padrão não lembra a escolha anterior
    Dado que Lucas salvou a despesa anterior com "Dividir com a família" ligado
    Quando Lucas abre o formulário "Nova despesa" de novo
    Então o interruptor "Dividir com a família" está desligado

  Cenário: Campo some com o acerto desligado
    Dado que o acerto de contas foi desligado
    Quando Lucas abre o formulário "Nova despesa"
    Então não vê o interruptor "Dividir com a família"

  Cenário: Campo some em família com um único membro
    Dado a "Família Souza" com apenas o membro "Ana"
    Quando Ana abre o formulário "Nova despesa"
    Então não vê o interruptor "Dividir com a família"

  Cenário: Despesa prevista também nasce como Só meu
    Quando Lucas abre o cadastro de despesa prevista
    Então o interruptor "Dividir com a família" está desligado

  Cenário: Compra no cartão também nasce como Só meu
    Dado o cartão "Nubank Lucas" cadastrado
    Quando Lucas escolhe "Pagar com" o cartão "Nubank Lucas"
    Então o interruptor "Dividir com a família" está desligado

  Cenário: Lançamentos antigos preservam a marcação
    Dado uma despesa de "R$ 150,50" gravada antes desta mudança como "Dividir com a família"
    Quando Lucas abre o Extrato
    Então a despesa de "R$ 150,50" continua marcada como dividida
    E o acerto do mês não muda

  Cenário: Painel de Acerto informa as despesas Só meu do mês
    Dado duas despesas "Só meu" de "R$ 80,00" e "R$ 45,00" em outubro de 2026
    Quando Lucas abre o painel de Acerto de outubro de 2026
    Então vê "2 despesas Só meu neste mês (R$ 125,00)"
    E o link "Ver no Extrato" filtra por "Só meu"

  Cenário: Painel de Acerto sem despesas Só meu
    Dado que todas as despesas de outubro de 2026 estão divididas
    Quando Lucas abre o painel de Acerto de outubro de 2026
    Então não vê a linha "despesas Só meu neste mês"

  Cenário: Receita não tem o campo de divisão
    Quando Lucas troca o formulário para "Nova receita"
    Então não vê o interruptor "Dividir com a família"
```

## Experiência (UX/estados)
[FLUXO-008](../../flows/FLUXO-008-lancar-despesa-r21-r3.md): linha "Dividir com a família" logo abaixo de "Quem pagou"; rótulo dinâmico "Só meu" / "Divisão igual (50% / 50%)". Linha informativa no Acerto em texto secundário.

## Fora de escopo
Três modos e percentual por lançamento (US-043), lembrar por categoria (US-044), aviso de revisão no fechamento (US-044), migração do percentual (EN-002).

## Perguntas em aberto / pontos para o Tech Lead
- Confirmar que `isSharedExpense = false` na criação não exige mudança no cálculo (`computeSettlement`); a mudança é só de padrão de formulário e de valor default em previstas.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 9a, Q-F02). Revisa o padrão da US-005 ("ligado") e da US-018 (Q-22).

# US-008 — Definir a regra de divisão das despesas comuns

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-4 Divisão & Acerto de Contas · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 6,0 · 2 |
| Status | Refinada (PO) — aguarda SDD-002 |
| Depende de | US-003 |
| Rastreabilidade | NEED-007 · RN-007.1, RN-007.2 · ADR-006 · FLUXO-003 |

## História
Como **Administrador**, quero **definir como as despesas comuns são divididas entre os membros** (igual ou proporcional), para que **o acerto de contas reflita o combinado do casal**.

## Regras de negócio aplicáveis
- Regra da **família** (vale para todas as despesas comuns do período). Padrão: **igualitária**.
- **Proporcional**: cada membro recebe um percentual **inteiro em pontos-base (basis points)**; a soma deve ser exatamente **100%** (ADR-006).
- Somente Administradores alteram a regra.
- A mudança **vale a partir de agora**; períodos já acertados não são recalculados. Ver Q-08.
- Com um só membro, a regra existe mas é irrelevante (100% dele).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Regra de divisão familiar

  Cenário: Padrão igualitário
    Dado uma família recém-criada com Mariana e Lucas
    Quando abro "Regra de divisão"
    Então vejo "Dividir igualmente (50% / 50%)" selecionado

  Cenário: Definir divisão proporcional
    Dado que sou Administrador
    Quando escolho "Proporcional" e informo Mariana "60%" e Lucas "40%"
    Então a regra é salva
    E o painel de acerto passa a usar 60% / 40%

  Cenário: Percentuais não somam 100%
    Quando informo Mariana "60%" e Lucas "30%" e tento salvar
    Então vejo "Os percentuais precisam somar 100%"
    E a regra anterior é mantida

  Cenário: Percentual inválido
    Quando informo "-10%" ou "110%" para um membro
    Então vejo "Informe um percentual entre 0% e 100%"

  Cenário: Membro sem permissão
    Dado que Lucas tem papel "Membro"
    Quando ele abre "Regra de divisão"
    Então vê a regra em modo somente leitura

  Cenário: Novo membro entra na família
    Dado a regra proporcional 60% / 40% e um terceiro membro convidado que aceita
    Então o sistema solicita ao Administrador que redefina os percentuais
    E enquanto isso o acerto exibe aviso "Regra de divisão desatualizada"
```

## Experiência
Acessível pelo ícone de engrenagem do painel de acerto ([FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md)). Dois botões de opção + campos de percentual com soma ao vivo ("Total: 100%").

## Fora de escopo
Regra por lançamento (exceção pontual), regra por categoria, cálculo automático proporcional à renda, histórico de regras.

## Perguntas em aberto / pontos para o Tech Lead
- **Q-08**: uma mudança de regra deve ser **versionada com data de vigência** para que meses passados mantenham o cálculo original? Recomendação do PO: **sim** (evita rever acertos já feitos). TL define a modelagem no SDD-002.
- Arredondamento do centavo: **maior resto**, desempate determinístico (ADR-006).

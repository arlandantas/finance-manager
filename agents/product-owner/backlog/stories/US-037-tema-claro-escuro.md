# US-037 — Tema claro e escuro

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Could · 1,7 · 3 |
| Status | **Especificada** (SDD-010, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | nenhuma (transversal); a cor por conta (US-050) depende desta |
| Corte | **Primeiro item a cortar da R2.1** (depois da US-039) |
| Rastreabilidade | Parecer item 14 · NEED-022 (RN-022.1) · FLUXO-013 · D-PO-22 |

## História
Como **membro da família**, quero **escolher entre tema claro, escuro ou o do sistema**, para **usar o app com conforto em qualquer ambiente**.

## Regras de negócio aplicáveis
- Opções: **Sistema** (padrão, segue `prefers-color-scheme`), **Claro**, **Escuro**.
- Preferência **por dispositivo**, lembrada (RN-022.1); não altera dados da família.
- **Contraste**: textos e estados (positivo/atenção/negativo, "Atrasada", "saldo insuficiente") atendem **WCAG AA** nos dois temas; estado nunca depende só de cor.
- Sem **piscar** do tema errado ao carregar a página.
- Local do controle: **menu do avatar > Aparência** (3 opções).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Tema claro e escuro

  Contexto:
    Dado Lucas está autenticado
    E Lucas abre "Aparência" no menu do avatar

  Cenário: Padrão segue o sistema
    Dado que o sistema operacional está em modo escuro e Lucas nunca escolheu um tema
    Quando Lucas abre o app
    Então o tema escuro está aplicado
    E a opção "Sistema" está marcada

  Cenário: Escolher tema claro
    Quando Lucas escolhe "Claro"
    Então o tema claro é aplicado imediatamente

  Cenário: Escolher tema escuro
    Quando Lucas escolhe "Escuro"
    Então o tema escuro é aplicado imediatamente

  Cenário: Escolha é lembrada no dispositivo
    Dado que Lucas escolheu "Escuro"
    Quando Lucas recarrega a página
    Então o tema escuro continua aplicado

  Cenário: Escolha vale só para o dispositivo
    Dado que Lucas escolheu "Escuro" no desktop
    Quando Lucas abre o app em um celular que nunca usou
    Então o tema segue o sistema do celular

  Cenário: Sem piscar ao carregar
    Dado que Lucas escolheu "Escuro"
    Quando Lucas abre a Home
    Então a página nunca é exibida no tema claro durante o carregamento

  Cenário: Estados legíveis nos dois temas
    Dado uma despesa prevista atrasada e uma conta com saldo insuficiente
    Quando Lucas alterna entre os temas "Claro" e "Escuro"
    Então "Atrasada" e "saldo insuficiente" mantêm contraste mínimo AA
    E continuam com texto além da cor

  Cenário: Voltar para Sistema
    Dado que Lucas escolheu "Escuro"
    Quando Lucas escolhe "Sistema"
    Então o tema passa a seguir o sistema operacional

  Cenário: Preferência indisponível no navegador
    Dado que o navegador não permite guardar preferências
    Quando Lucas escolhe "Escuro"
    Então o tema escuro vale até fechar a página
```

## Experiência (UX/estados)
[FLUXO-013](../../flows/FLUXO-013-preferencias-navegacao-e-detalhe.md): três opções em lista com marca de seleção; todos os componentes usam tokens de cor (sem cores fixas).

## Fora de escopo
Temas personalizados; agendamento por horário; cor de destaque configurável.

## Perguntas em aberto / pontos para o Tech Lead
- Estratégia anti-flash (script inline antes da hidratação) e auditoria de componentes com cores fixas.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 14).

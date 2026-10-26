# US-093 — Membro sem conta como titular, pagador, responsável e no acerto

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros / EPIC-4 Divisão e Acerto · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should (Alta)** · 3,6 (V8/U5/R5) · **5** (toca titularidade, "Só meu", acerto e remoção; o TL reestima) |
| Status | Proposta pelo PO em 2026-10-26; **bloqueada pelo spike do TL (TL-U1) e revisão de segurança do "Só meu"**; **2026-10-26 (TL): spike concluído no [ADR-033](../../../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (proposto); tamanho TL 8 (TL, ADR-033: 093a seletores/titular/acerto 3 + 093b "Só meu" 5); SDD aguarda Q-TL-U1..U5 e revisão da Segurança** |
| Depende de | **US-092**, US-004, US-015, US-018, US-009a, US-028 (acerto opcional), US-084 |
| Corte | Não cortar da NEED-028; dividir em 093a (titular/pagador) e 093b (acerto) se o TL achar grande |
| Rastreabilidade | **NEED-028** (RN-028.1, 028.4, 028.5) · **Q-U16 (usuário, 2026-10-26)** · NEED-001 (tripla responsabilidade), NEED-007, NEED-019 · `estado/so-meu.md` · FLUXO-020 · D-PO-103 |

## História
Como **Administrador (ou qualquer membro, nas despesas)**, quero **atribuir contas, cartões, despesas, previstas e a divisão do acerto a um membro que ainda não tem conta**, para **que "quem gastou", "quem pagou" e "quem deve" reflitam a família real desde o primeiro dia**.

## Regras
- O membro sem conta pode ser: **titular de conta e de cartão**, **responsável** e **quem pagou/quem gastou** em lançamento, **responsável** de prevista e série e **participante da divisão**. Quem registra é sempre o **autor** (o membro logado).
- **Q-U16 (usuário):** ele **entra no acerto de contas** como qualquer membro, quando o acerto da família está ligado (NEED-019 mantida: opcional). Os valores aparecem com o nome dele; **o acerto continua só registro, sem cobrança** nem notificação a ele.
- Regra de divisão familiar (US-008) e percentuais incluem o membro sem conta; a EN-002 e o rateio não mudam, só passa a haver mais um participante.
- **"Só meu" (RN-028.4, RN17):** lançamento "Só meu" cujo dono é membro sem conta é **visível como hoje** e **controlado** (editar, excluir, restaurar, estornar) por **quem o lançou, pelo dono da conta** e pelo Administrador; ninguém mais. Ao assumir o cadastro (US-094), o membro passa a controlá-lo. As travas anti-captura (ninguém *torna* "Só meu" o que não é seu; SEC-025/026/038) permanecem. **Hipótese a validar pelo TL e pela Segurança** (TL-U1/TL-U3).
- **Pagador de despesa de membro sem conta:** só o lançador (autor) ou o Administrador pode atribuir um membro sem conta como pagador; quem atribui fica registrado no histórico. Evita criar "crédito" em nome de quem não pode contestar (princípio de SEC-048/DEV-132; o TL fecha o alcance).
- Conta/cartão de membro sem conta: aparecem no seletor de titular; titular pode ser trocado só pelo Administrador (o "titular atual" não tem sessão).
- Relatórios, Análise e Extrato mostram o nome dele em "Quem pagou" e filtros, com o selo "Sem acesso ao app" no filtro.
- Exportação de dados (LGPD) e MCP: o membro sem conta não tem token nem exportação própria; seus lançamentos entram nos dados de quem os lançou conforme regra do TL.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Membro sem conta como titular, pagador e no acerto

  Contexto:
    Dado a "Família Silva" com "Mariana" (Administradora) e "Lucas" (Membro)
    E o membro sem conta "Ana"
    E o acerto de contas está ligado
    E Mariana está autenticada

  Cenário: Conta com titular sem conta
    Quando Mariana cadastra a conta "Poupança Ana" com titular "Ana"
    Então a conta mostra o titular "Ana"

  Cenário: Cartão com titular sem conta
    Quando Mariana cadastra o cartão "Itaú Ana" com titular "Ana"
    Então o cartão mostra o titular "Ana"

  Cenário: Despesa paga por quem ainda não tem conta
    Quando Mariana lança "Mercado" de "R$ 200,00" pela conta "Poupança Ana" com "Quem pagou?: Ana" e dividida entre os três
    Então "Ana" aparece como pagadora no Extrato
    E o autor registrado é "Mariana"

  Cenário: Membro sem conta entra no acerto
    Dado uma despesa dividida de "R$ 300,00" paga por "Ana" entre "Mariana", "Lucas" e "Ana"
    Quando Mariana abre o Acerto
    Então "Ana" aparece com crédito de "R$ 200,00"
    E "Mariana" e "Lucas" aparecem devendo "R$ 100,00" cada

  Cenário: Acerto desligado não inclui ninguém
    Dado que o acerto de contas está desligado
    Quando Mariana abre a Home
    Então não aparece linha de acerto com "Ana"

  Cenário: Prevista com responsável sem conta
    Quando Mariana cadastra a prevista "Mesada" de "R$ 100,00" com responsável "Ana"
    Então a prevista mostra o responsável "Ana"

  Cenário: Só meu de membro sem conta é controlado por quem lançou
    Dado que Mariana lançou uma despesa "Só meu" com pagador "Ana"
    Quando Lucas tenta excluir essa despesa
    Então vê que apenas quem controla pode alterar
    E Mariana consegue excluí-la

  Cenário: Pagador sem conta só pelo lançador ou Administrador
    Dado que Lucas lançou uma despesa
    Quando Lucas tenta definir "Ana" como pagadora de uma despesa lançada por Mariana
    Então vê "Apenas quem lançou ou o Administrador pode definir este pagador"

  Cenário: Filtro por quem pagou inclui o membro sem conta
    Quando Mariana abre o filtro "Quem pagou" no Extrato
    Então "Ana" aparece como opção
```

## Fora de escopo
Qualquer cobrança ou aviso a quem não tem conta; fechar mês em nome de outra pessoa; permissões por conta (US-020).

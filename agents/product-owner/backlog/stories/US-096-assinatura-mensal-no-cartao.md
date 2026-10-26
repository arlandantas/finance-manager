# US-096 — Assinatura mensal no cartão (lançada sozinha todo mês)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (assinaturas) · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,0 (V7/U4/R4) · **5** (limite; fatiar em commits) |
| Status | Proposta pelo PO em 2026-10-26; **precisa de ADR/SDD do TL** (série com cartão, competência da cobrança, geração sem cron) |
| Depende de | US-016a, US-017a, US-058/059 (séries), US-090/091 (porta; opcional, há atalho no cartão) |
| Corte | Núcleo da NEED-029; 097/098/099 dependem dela |
| Rastreabilidade | **NEED-029** (RN-029.1..4, 029.6) · **Q-U18 (usuário, 2026-10-26)** · NEED-003, NEED-004 · `estado/previstas-series.md` L-2/L-3 · FLUXO-004, FLUXO-019 · D-PO-104 |

## História
Como **membro da família**, quero **cadastrar uma cobrança mensal sem data de fim num cartão**, para **que ela caia sozinha na fatura de cada mês e eu não precise digitá-la de novo nem parcelar**.

## Regras
- **Estende a recorrência existente** (série), sem criar um conceito novo (NEED-029, "menos regras a aprender"): a série passa a aceitar **cartão** como meio de pagamento. Continua mensal, valor igual, sem fim (ou com fim em N ocorrências).
- **Onde se cadastra:** na tela do cartão ("Nova assinatura") e na porta única (US-090/091): ao escolher um cartão, "Quando?" oferece **"Já aconteceu | Assinatura (todo mês)"**.
- Campos: descrição (2..100), valor (> 0), categoria de despesa, **dia da cobrança** (1..31; 29..31 cai no último dia do mês), início, fim (sem fim | após N cobranças), cartão, **quem gastou** (responsável) e "Só meu"/divisão (esta, na US-099).
- **Q-U18 (usuário): a cobrança é lançada sozinha todo mês.** No dia da cobrança (fuso da família) vira uma **compra à vista no cartão**, real, na **fatura do ciclo correspondente** (regra de fechamento vigente, US-016a: dia ≤ fechamento fica no mês). Compra no cartão **não admite data futura**: por isso, **só é lançada quando o dia chega**; antes disso não existe no Extrato nem na fatura.
- **Comprometimento futuro visível sem contar duas vezes (RN-029.3):** a fatura aberta e o detalhe do cartão mostram "Assinaturas previstas neste ciclo: R$ X" (informativo). O **total da fatura e o limite usado só contam cobranças já lançadas**; ao ser lançada, a cobrança sai da linha "prevista" e entra no total (nunca nos dois).
- **Limite (RN-029.2):** consome o **valor do mês** à medida que é lançada; não há total a consumir nem "parcela x/y". Estourar o limite não bloqueia (regra vigente).
- **Fatura paga não muda:** se a cobrança cair em fatura **paga** (por exemplo, início retroativo), a ocorrência é **pulada com aviso** "Cobrança de {mês} não lançada: fatura paga"; o histórico e a série não se alteram.
- Aparece no Extrato como compra no cartão com selo **"Assinatura"** (distinguível de compra avulsa); excluir uma cobrança já lançada segue a regra de compra no cartão (US-016b).
- Cartão **arquivado** não recebe cobrança nova; **arquivar cartão com assinatura ativa** lista o impedimento "Encerre as assinaturas" (padrão da US-054).
- Geração preguiçosa e idempotente, sem job (como L-1): a cobrança do dia é criada ao abrir Início/Cartões/Fatura/Extrato/MCP; unicidade (família, série, mês), sem duplicar nem ressuscitar excluída.
- Regras de "Só meu" e captura valem como em qualquer despesa no cartão (`so-meu.md`): o titular do cartão controla os "Só meu" lançados nele.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Assinatura mensal no cartão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com fechamento dia 25, vencimento dia 5 e limite de "R$ 5.000,00"
    E hoje é 08/10/2026
    E Lucas está autenticado

  Cenário: Cadastrar assinatura sem fim
    Quando Lucas cadastra a assinatura "Streaming" de "R$ 39,90" no "Nubank Lucas" no dia 8 sem data de fim
    Então vê "Assinatura cadastrada"
    E o Extrato mostra "Streaming" de "R$ 39,90" em 08/10/2026 com o selo "Assinatura"
    E a fatura de outubro do "Nubank Lucas" inclui "R$ 39,90"

  Cenário: A cobrança do mês seguinte é lançada sozinha no dia
    Dado a assinatura "Streaming" de "R$ 39,90" no dia 8
    Quando chega 08/11/2026 e Lucas abre o app
    Então o Extrato mostra a cobrança de "Streaming" em 08/11/2026
    E a fatura de novembro inclui "R$ 39,90"

  Cenário: Antes do dia a cobrança não existe
    Dado a assinatura "Streaming" de "R$ 39,90" no dia 8
    Quando Lucas abre o Extrato em 08/10/2026
    Então não há cobrança de "Streaming" em 08/11/2026

  Cenário: Comprometimento futuro sem contar duas vezes
    Dado a assinatura "Streaming" de "R$ 39,90" no dia 28
    Quando Lucas abre a fatura aberta do "Nubank Lucas"
    Então vê "Assinaturas previstas neste ciclo: R$ 39,90"
    E o total da fatura não inclui os "R$ 39,90"

  Cenário: Depois de lançada sai da linha prevista
    Dado a assinatura "Streaming" de "R$ 39,90" no dia 28
    Quando chega 28/10/2026 e Lucas abre a fatura
    Então o total da fatura inclui "R$ 39,90"
    E a linha "Assinaturas previstas" não inclui mais "Streaming"

  Cenário: Limite consome só o valor do mês
    Dado o limite disponível de "R$ 5.000,00"
    Quando a cobrança de "R$ 39,90" é lançada
    Então o limite disponível é "R$ 4.960,10"

  Cenário: Cobrança em fatura paga é pulada com aviso
    Dado a fatura de setembro paga
    Quando Lucas cadastra a assinatura "Streaming" no dia 20 com início em setembro
    Então a cobrança de setembro não é lançada
    E vê "Cobrança de setembro não lançada: fatura paga"

  Cenário: Dia 31 cai no último dia do mês
    Quando Lucas cadastra uma assinatura no dia 31
    Então em novembro a cobrança é lançada no dia 30

  Cenário: Não é parcelamento
    Quando Lucas vê a cobrança no Extrato
    Então não aparece "parcela" nem "x/y"

  Cenário: Arquivar cartão com assinatura ativa
    Dado a assinatura ativa "Streaming" no "Nubank Lucas"
    Quando Lucas tenta arquivar o "Nubank Lucas"
    Então o diálogo lista "Encerre as assinaturas"
```

## Fora de escopo
Periodicidade que não seja mensal; valores diferentes por mês (use a correção da US-097); detecção automática de assinaturas; análise por IA (NEED-027).

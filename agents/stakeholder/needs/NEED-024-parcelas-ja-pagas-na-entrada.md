# NEED-024: Compra Parcelada com Parcelas Já Pagas (Entrada com Parcelamento em Andamento)

## 📋 Metadados
- **ID:** `NEED-024`
- **Área:** Meios de Pagamento e Crédito (extensão do `NEED-003`)
- **Status:** Levantado em 2026-10-24 — aguardando priorização do Gestor
- **Prioridade de valor:** **Alta**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Pedido do usuário (dono do produto), repassado pelo Gestor em 2026-10-24

---

## 1. Dor
Quem começa a usar o app já tem compras parceladas em andamento (ex.: sofá em 10x, na parcela 4). Hoje só é possível lançar o parcelamento desde a parcela 1. A família precisa então (a) lançar tudo desde o início, poluindo meses passados e o acerto de contas, ou (b) ignorar o parcelamento, e as parcelas restantes ficam **fora da projeção** dos próximos meses — exatamente a "falsa folga" que o `NEED-003` quer evitar.

## 2. Valor
- **Adoção:** a família consegue começar a usar o app **no meio da vida financeira real**, sem reconstruir o passado. Sem isso, o primeiro mês de uso mostra um futuro mais leve do que é.
- **Fidelidade da projeção** das faturas futuras e do limite do cartão desde o dia 1.

## 3. Regras de negócio (RN)
- **RN-024.1:** o usuário informa o parcelamento completo (valor total ou da parcela, nº total de parcelas) **e quantas parcelas já foram pagas** (ou "estou na parcela X").
- **RN-024.2:** as parcelas já pagas **não geram lançamento em faturas passadas já fechadas/pagas**, não alteram saldo de conta e **não entram no acerto de contas** de meses passados; servem apenas como histórico do parcelamento (ex.: "4/10").
- **RN-024.3:** as parcelas restantes seguem a regra normal do `NEED-003` (RN-003.2 a RN-003.9), rotuladas com a numeração real ("5/10"), ligadas por identificador de parcelamento.
- **RN-024.4 (limite):** o limite do cartão é consumido apenas pelo **saldo restante** (parcelas ainda não pagas), pois o limite das já pagas foi liberado no mundo real. Hipótese conservadora.
- **RN-024.5 (acerto):** em compra dividida, as parcelas restantes entram no acerto do mês em que caem na fatura (Q-F05); as pagas não entram retroativamente.
- **RN-024.6:** deve ser possível identificar, na lista do parcelamento, quais parcelas são "anteriores ao app" (informadas, não lançadas).
- **RN-024.7:** validação de coerência: pagas < total; parcela atual compatível com a data da compra e o ciclo do cartão.

## 4. Riscos
- Usuário informar a posição errada e a projeção ficar defasada (mitigar com prévia: "restam 6 parcelas de R$ 250, a próxima em nov/2026").
- Confusão entre "pagas antes do app" e "pagas dentro do app" nas edições do parcelamento ("esta e as próximas").
- Conflito com o regime de acerto (não gerar dívida retroativa entre o casal).

## 5. Pergunta aberta
- **Q-U03:** ao registrar parcelas já pagas, o usuário quer **apenas** o saldo restante projetado (hipótese conservadora) ou também reconstruir as parcelas passadas no histórico/relatórios por categoria (mais trabalho e risco de distorcer meses fechados)? Hipótese: só o restante, com a numeração real.

## 6. Relação com outros NEEDs
Estende `NEED-003` (parcelamento), interage com `NEED-007/018/019` (acerto) e é pré-requisito natural de `NEED-026` (a fatura importada já traz parcelas "3/10").

# NEED-018: Divisão com a Família Opcional e Definida no Lançamento

## 📋 Metadados
- **ID:** `NEED-018`
- **Área:** Lançamentos e Rateio
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Must** (padrão opcional) em **R2.1**; **Should** (divisão definida no lançamento) em **R3**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Sugestão 9 do usuário e ressalvas 1 e 4 da homologação R1+R2. **Altera** NEED-007 (RN-007.1/007.2) e a decisão D-GES-08 / Q-08 (vigência por data)

---

## 1. Contexto e Dor de Negócio
Hoje "Dividir com a família" nasce **ligado**. O usuário discorda: nem todo gasto é comum (presente, hobby, farmácia pessoal), e marcar tudo como comum por padrão **infla o acerto** e gera exatamente a discussão que o produto quer evitar. Além disso, o usuário quer decidir **na hora do lançamento** como aquele gasto específico se divide, em vez de depender de um percentual fixo da família.

## 2. Necessidade
1. **Padrão do formulário desligado** ("Só meu"): dividir é uma escolha consciente. (Se a família desligar o acerto, NEED-019, o campo some.)
2. Três modos no lançamento: **Não dividir** · **Dividir pela regra da família** (mostra o % vigente, ex. 58/42) · **Dividir de outro jeito** (informar o percentual de cada membro; inclui o caso "foi tudo do outro" = 100%/0%, comum em reembolsos).
3. **O percentual usado fica gravado no lançamento** (o que se vê é o que conta). A regra da família passa a ser apenas a **sugestão inicial**.
4. (Recomendado) **Categoria pode lembrar "dividir por padrão"** (ex.: Supermercado, Condomínio): a escolha vira automática onde sempre se repete, sem voltar ao "tudo comum".

## 3. Regras de Negócio (RN)
- **RN-018.1:** Alterar a regra da família **nunca recalcula** lançamentos já salvos (mantém Q-08/D-GES-08: não reescrever acertos passados). Mudança de regra afeta só lançamentos futuros.
- **RN-018.2 — Efeito colateral positivo:** com o percentual gravado por lançamento, o rótulo do Acerto (ressalva 1) deixa de depender de "uma regra para o mês": o resumo mostra o **percentual efetivo** por lançamento e a **média ponderada do mês** ("na prática, 54/46").
- **RN-018.3:** Soma dos percentuais = 100% (3 ou mais membros: US-009b continua valendo); centavos arredondados de forma determinística (`amountInCents`), sobra ao pagador.
- **RN-018.4:** Lançamentos antigos migram com o percentual que o cálculo vigente já produzia (nenhum número de acerto muda).
- **RN-018.5:** Editar o modo de divisão de um lançamento de mês já acertado segue as regras de mês acertado (US-013b).

## 4. Riscos e salvaguardas
- **Risco de sub-registro:** com padrão desligado, despesas comuns esquecidas reduzem o acerto e viram discussão. Salvaguardas: lembrar por categoria (item 4) e um **aviso de revisão no fechamento do mês** ("12 despesas não divididas, revisar?") com filtro direto no Extrato.
- **Risco de complexidade:** exibir 3 modos pode lentificar o lançamento. Meta: o fluxo "Só meu" continua com os mesmos 4 toques.

## 5. Decisões sobre pontos em aberto
- **Q-F02 (decidida):** padrão **"Só meu"**, com lembrança por categoria.
- **Q-F02b (decidida):** reembolso = percentual 0/100, sem modo próprio.

## 6. Cenário
> Lucas paga o mercado (R$ 300) e escolhe "Dividir pela regra" (50/50). Depois paga uma farmácia só sua (R$ 80): nada a marcar. Mariana paga o presente do pai dele (R$ 200) com "Dividir de outro jeito": Lucas 100%.

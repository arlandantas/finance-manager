# NEED-013: Tags Livres nas Transações

## 📋 Metadados
- **ID:** `NEED-013`
- **Área:** Classificação e Análise
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Should** · Release **R3**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Sugestão 1 do usuário. Relacionada: NEED-016 (visões sintéticas), NEED-005/006 (tetos por categoria)

---

## 1. Contexto e Dor de Negócio
A categoria responde "em que tipo de gasto foi" (Supermercado, Lazer). Mas a família também quer responder perguntas **transversais** que cortam as categorias: "quanto gastamos na viagem de julho?", "quanto custou o aniversário da Helena?", "o que é da reforma?". Hoje a única saída é inventar categorias de uso único, o que polui a lista de categorias e distorce os tetos (NEED-005).

## 2. Necessidade
1. O usuário pode **anexar zero ou mais tags livres** a qualquer lançamento (despesa, receita, compra no cartão), digitando o nome na hora (sem cadastro prévio obrigatório).
2. As tags são **da família** (todos veem e reutilizam), com sugestão das já existentes ao digitar.
3. É possível **filtrar e totalizar por tag** no Extrato e nas visões sintéticas (NEED-016).
4. Tags são **complementares** à categoria: **categoria continua obrigatória** e continua sendo a base de tetos e disponibilidade.

## 3. Regras de Negócio (RN)
- **RN-013.1:** Tag é opcional e **não pode atrasar o lançamento rápido** (meta de < 10 s): o campo é secundário, nunca obrigatório.
- **RN-013.2:** Nomes de tag são únicos por família sem diferenciar maiúsculas/minúsculas/acentos ("Viagem" = "viagem"), para evitar duplicatas por digitação.
- **RN-013.3:** Renomear uma tag atualiza todos os lançamentos; remover uma tag a retira dos lançamentos mas **nunca apaga lançamentos**.
- **RN-013.4:** Tags **não têm teto/orçamento** nem entram no cálculo de acerto de contas; são rótulo de análise.
- **RN-013.5:** Tag em compra parcelada (NEED-003) vale para todas as parcelas.
- **RN-013.6:** Fora de escopo agora: hierarquia de tags, cor por tag, tags com orçamento, tags "automáticas".

## 4. Cenário de Exemplo
> Em julho, Mariana lança "Hotel" (Lazer) com a tag `viagem-nordeste`, depois "Restaurante" (Alimentação) e "Passeio de barco" (Lazer) com a mesma tag. No fim, filtrar por `viagem-nordeste` mostra o custo total da viagem sem ter criado nenhuma categoria nova.

## 5. Decisões sobre pontos em aberto
- **Q-F09 (decidida):** sem limite técnico; a interface sugere até ~3 tags.
- **Q-F09b (decidida):** só receita, despesa e compra no cartão; não em transferência/acerto.

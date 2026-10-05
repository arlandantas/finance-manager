# NEED-014: Ocultar Valores na Tela (Privacidade de Exibição)

## 📋 Metadados
- **ID:** `NEED-014`
- **Área:** Privacidade e Uso em Público
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Must** · Release **R2.1**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Sugestão 3 do usuário

---

## 1. Contexto e Dor de Negócio
O app é usado no celular, na rua, no transporte e no mercado. Abrir a tela inicial expõe saldos e dívidas a quem está ao lado. Hoje não há como usar o app com discrição: o usuário evita abri-lo, o que derruba o hábito de lançar na hora.

## 2. Necessidade
1. Um controle de fácil acesso (sempre visível, 1 toque) para **ocultar/mostrar valores monetários**.
2. O estado fica **lembrado no dispositivo** (quem oculta no celular não é obrigado a ocultar no desktop de casa).
3. Quando oculto, **todos os valores monetários** de leitura aparecem mascarados (saldos, resumo do mês, acerto, faturas, extrato), de forma consistente em todo o app, não só na Início.
4. Lançar continua possível com o modo oculto ligado (o valor digitado é do próprio usuário); revelar um valor pontualmente deve ser simples.

## 3. Regras de Negócio (RN)
- **RN-014.1:** É preferência **por dispositivo/usuário**, não da família.
- **RN-014.2:** É proteção contra "olhar por cima do ombro", **não** é controle de acesso nem segurança de dados; o texto da interface não deve prometer mais que isso.
- **RN-014.3:** Cálculos, alertas e dados não mudam; só a exibição.
- **RN-014.4:** Percentuais e quantidades podem permanecer visíveis; decisão fina é do PO.

## 4. Decisão sobre o padrão
Em dispositivo/sessão novo os valores **começam ocultos** (não expor dado financeiro sem ação do usuário); depois lembra a **última escolha**. Ver Q-F04 (decidida).

## 5. Decisões sobre pontos em aberto
- **Q-F04 (decidida):** valores começam ocultos em dispositivo/sessão novo; depois lembra a última escolha.

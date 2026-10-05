# NEED-017: Identificação Visual de Conta/Cartão por Cor

## 📋 Metadados
- **ID:** `NEED-017`
- **Área:** Usabilidade
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Could** · Release **R3**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Sugestão 11 do usuário

---

## 1. Contexto e Dor de Negócio
Com várias contas e cartões, ler nomes em cada linha do Extrato é lento. Uma cor associada à conta/cartão permite reconhecer a origem "de relance".

## 2. Necessidade
Cada conta e cada cartão tem uma **cor** (atribuída automaticamente ao cadastrar, editável depois) que aparece nas movimentações e seletores.

## 3. Regras de Negócio (RN)
- **RN-017.1:** A cor **nunca é o único identificador**: o nome continua visível (acessibilidade e daltonismo).
- **RN-017.2:** Paleta curta e contrastante, funcionando nos temas claro e escuro (NEED-022).
- **RN-017.3:** Cores são por conta/cartão, não por membro nem por categoria (categorias já têm identidade própria).
- **RN-017.4:** Duas contas podem repetir cor; o sistema só sugere cores ainda não usadas.

# NEED-008: Desdobramento de Despesa Única (Split de Compra)

## 📋 Metadados
- **ID:** `NEED-008`
- **Área:** Lançamentos e Precisão Orçamentária
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
No mundo real, uma única compra em estabelecimentos como hipermercados, farmácias ou lojas de departamento costuma englobar múltiplos propósitos:
- Compras de alimentos da casa (categoria *Alimentação*);
- Materiais escolares dos filhos (categoria *Educação*);
- Medicamento de uso pessoal de um dos cônjuges (categoria *Saúde* e de responsabilidade exclusiva daquele membro).

Se o usuário for obrigado a registrar 3 transações separadas na mão para um único pagamento no cartão de R$ 500, a experiência fica pesada. Se lançar tudo em *Alimentação*, o teto dessa categoria é distorcido injustamente.

---

## 2. Necessidade
O sistema deve permitir o **Desdobramento de uma Transação Única** em subitens (itens de rateio):

1. **Desdobramento por Categoria:**
   - Atribuir parcelas do valor total a diferentes categorias orçamentárias (ex: R$ 350 para Alimentação, R$ 100 para Saúde e R$ 50 para Lazer).
2. **Desdobramento por Responsável pelo Gasto:**
   - Permitir que cada subitem da compra possa ser atribuído a um membro específico da família.
3. **Consistência Contábil:**
   - No extrato bancário ou fatura do cartão, a transação continua aparecendo como um único pagamento de valor consolidado, enquanto os tetos orçamentários das categorias e a apuração por membro absorvem os respectivos valores rateados.

---

## 3. Regras de Negócio (RN)
- **RN-008.1:** A soma de todos os subitens desdobrados deve ser rigorosamente igual ao valor total da movimentação principal ($\sum \text{subitens} = \text{valor\_total}$).
- **RN-008.2:** Cada subitem pode ter sua própria categoria e seu próprio `responsavel_gasto`.
- **RN-008.3:** No extrato da conta bancária ou fatura do cartão de crédito, a cobrança permanece em linha única com o valor total original.

---

## 4. Cenário de Exemplo
> **Cenário:** Em uma compra de R$ 450,00 no Sam's Club paga no cartão de crédito compartilhado:
> - Subitem 1: R$ 320,00 em `Alimentação`, atribuído como gasto da família.
> - Subitem 2: R$ 80,00 em `Educação`, atribuído ao filho Lucas.
> - Subitem 3: R$ 50,00 em `Cuidados Pessoais`, atribuído a Maria.
> - **Resultado:** A fatura do cartão registra R$ 450,00 no Sam's Club, mas o painel de tetos consome R$ 320 de Alimentação, R$ 80 de Educação e R$ 50 de Cuidados Pessoais.

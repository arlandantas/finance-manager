# NEED-007: Acerto de Contas entre Membros da Família (Split Familiar)

## 📋 Metadados
- **ID:** `NEED-007`
- **Área:** Governança e Rateio Familiar
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
Em famílias onde os cônjuges ou membros mantêm rendas separadas e dividem as despesas da casa (ex: 50/50 ou proporcional à renda):
- Um membro paga contas de maior valor (aluguel, condomínio, seguro) e o outro paga despesas do cotidiano (escola, supermercado, farmácia);
- No fim do mês, calcular manualmente "quem deve quanto para quem" gera desgaste, planilhas paralelas e frequente sentimento de injustiça.

---

## 2. Necessidade
O sistema deve calcular de forma automatizada o **Balanço de Despesas Comuns e Acerto de Contas entre Membros**:

1. **Classificação de Despesas Comuns:**
   - Despesas podem ser marcadas como "Despesa Familiar Comum" (com regra de divisão acordada, ex: divisão igualitária 50/50 entre membros pagadores).
2. **Apuração do Balanço Mensal:**
   - O sistema totaliza quanto cada membro arcou financeiramente em despesas familiares comuns ao longo do ciclo orçamentário.
3. **Sugestão de Compensação com 1 Clique:**
   - O sistema gera a instrução de acerto líquida:  
     `"Membro A pagou R$ 3.200 e Membro B pagou R$ 2.400. Para equilibrar, Membro B deve transferir R$ 400 para Membro A."`
   - Possibilidade de registrar essa liquidação como uma transferência interna de acerto, zerando o balanço do mês.

---

## 3. Regras de Negócio (RN)
- **RN-007.1:** O balanço de acerto considera quem efetivamente desembolsou o valor (`responsavel_pagamento` ou débito na conta individual do membro).
- **RN-007.2:** Despesas marcadas como exclusivamente pessoais de um membro não entram na partilha do rateio comum.
- **RN-007.3:** A liquidação do acerto de contas é registrada como uma transferência entre contas dos respectivos membros para fins de histórico e auditoria.

---

## 4. Cenário de Exemplo
> **Cenário:** João e Maria dividem as despesas comuns da casa 50/50.
> - João pagou R$ 2.000 (Aluguel) e R$ 400 (Internet e Luz). Total João = R$ 2.400.
> - Maria pagou R$ 1.200 (Supermercado) e R$ 400 (Feira). Total Maria = R$ 1.600.
> - Total Comum da Família = R$ 4.000 (Cota de cada um: R$ 2.000).
> - **Resultado do Balanço:** O sistema exibe: *"Maria deve transferir R$ 400 para João para quitar o ciclo de Outubro"*.

---

## Revisão do Stakeholder — 2026-10-04 (homologação R1+R2 e feedback do usuário)

**Ressalvas da homologação (`../homologacao-r1-r2.md`) incorporadas como regras:**
- **RN-007.4 (ressalva 1, rótulo):** a tela de Acerto **nunca** exibe uma regra que não corresponda ao cálculo. Deve mostrar o percentual **efetivamente aplicado** no mês (ex.: "50% até 03/10 e 58/42 a partir de 04/10", ou o percentual médio ponderado). Ver NEED-018, que torna isso estrutural gravando o percentual no lançamento.
- **RN-007.5 (ressalva 2, dívida antiga):** com o acerto ligado, **meses anteriores com saldo em aberto** geram um aviso discreto e neutro (no Resumo do Mês e no Acerto), sem poluir a Início.
- **RN-007.6 (ressalva 4, prévia):** ao salvar uma nova regra, mostrar a **prévia do impacto** (quanto muda no acerto do mês, a partir de que data) e, opcionalmente, **sugerir a proporção pelas rendas** informadas; todo membro vê a regra e o histórico (transparência). O Administrador continua sendo quem altera.

**Mudanças vindas do feedback do usuário:**
- O acerto passa a ser **opcional por família** (NEED-019) e **discreto** na Início (NEED-015).
- A divisão deixa de ser "ligada por padrão" e passa a ser definida **no lançamento** (NEED-018); RN-007.1/007.2 continuam: só entra no acerto o que foi marcado como dividido.
- Compras parceladas (NEED-003) entram no acerto **parcela a parcela** (Q-F05).

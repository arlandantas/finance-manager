# NEED-023: Assistente de IA Generativa para Analisar o Mês

## 📋 Metadados
- **ID:** `NEED-023`
- **Área:** Inteligência e Organização
- **Status:** Registro de oportunidade — **Futuro**, condicionado a uma v0 em produção
- **Prioridade de valor:** **Futuro** (pós-v0); nenhum item entra em R2.1/R3
- **Consumidores:** Product Owner, Tech Lead (ADR de privacidade)
- **Origem:** Sugestão 10 do usuário. Detalhado em `possibilidades-e-oportunidades.md` (§4)

---

## 1. Valor esperado
Ao fechar o mês, a família quer um resumo em linguagem natural: onde gastou fora do padrão, categorias que cresceram, sugestão de reorganizar tags/categorias, possíveis duplicidades. É um **diferencial**, mas **só tem valor quando há dados bons** (categorias e tags consistentes).

## 2. Pré-condições (todas, antes de investir)
1. **v0 em produção** com uso real da família por pelo menos 2 a 3 fechamentos de mês.
2. **Qualidade de dados**: categorias/tags (NEED-013) estabilizadas e visões sintéticas (NEED-016) como base de números. A IA **explica números calculados pelo sistema**, nunca os calcula.
3. **Decisão de privacidade** (ADR) aprovada pelo usuário: o que sai do ambiente e para quem.
4. Custo por uso estimado e limitado.

## 3. Regras de negócio candidatas
- **RN-023.1 — Opt-in explícito** por família (Administrador), desligado por padrão, com texto claro do que é enviado.
- **RN-023.2 — Minimização:** enviar **agregados** (totais por categoria/tag/mês), não descrições livres, nomes, e-mails, nem identificadores de conta. Mascarar nomes de pessoas.
- **RN-023.3 — Somente sugestão:** a IA nunca grava, recategoriza ou apaga por conta própria; toda ação é confirmada pelo usuário.
- **RN-023.4 — Sem aconselhamento financeiro:** o texto não recomenda investimentos/crédito; mostra observações e perguntas.
- **RN-023.5 — Transparência:** mostrar o que foi enviado e permitir apagar o histórico de análises.
- **RN-023.6:** Provedor sem retenção/treinamento com os dados, contrato compatível com LGPD (dados financeiros e dados de terceiros, os membros).

## 4. Riscos
Vazamento ou uso indevido de dados financeiros (o maior), respostas plausíveis porém erradas (perda de confiança), custo recorrente, dependência de fornecedor, e percepção de "vigilância" entre os membros do casal (tensão com NEED-019).

## 5. Recomendação
Passo intermediário **sem IA generativa**: sugestão de categoria baseada em descrições já usadas pela família (regra determinística). Entrega 80% do valor de organização com risco de privacidade zero. Avaliar só depois.

## 6. Pergunta que permanece com o usuário
- **Q-U01:** aceitar o envio de agregados financeiros a um provedor externo de IA (qual provedor, opt-in)? Privacidade e serviço externo: o time não decide. Só após a v0 em produção.

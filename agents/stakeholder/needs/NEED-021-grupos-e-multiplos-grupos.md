# NEED-021: Grupos Não Familiares e Pessoa em Mais de um Grupo

## 📋 Metadados
- **ID:** `NEED-021`
- **Área:** Modelo de Grupo e Visibilidade
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — **Futuro**; decidido pelo time como Futuro (hipótese conservadora)
- **Prioridade de valor:** **Futuro** (não entra em R2.1/R3); apenas um **spike técnico de modelo** recomendado em R3
- **Consumidores:** Product Owner, Tech Lead (ADR)
- **Origem:** Sugestão 16 do usuário. **Tensiona** D-PO-02 (todos veem tudo), US-020 e Q-01 (dependentes)

---

## 1. Contexto e Dor de Negócio
O usuário imagina grupos que não sejam necessariamente famílias (república, viagem com amigos, sociedade) com **menos visibilidade entre as pessoas**, e uma mesma pessoa participando de **vários grupos**. Isso mistura **três necessidades distintas**, de custo e valor muito diferentes:

| # | Necessidade | Valor | Custo |
| :-: | :--- | :--- | :--- |
| a | **Uma pessoa em mais de um grupo** (ex.: a família dela e a dos pais) | Médio | **Alto** (troca de contexto, convites, permissões em toda consulta) |
| b | **Visibilidade restrita** (conta/lançamento privado dentro do grupo) | Médio-alto (vem do mundo real do casal: conta pessoal) | Médio |
| c | **Grupos não familiares** (rachar viagem/república) | Incerto | Alto, é outro produto (perfil Splitwise) |

## 2. Posição do Stakeholder
- **D-PO-02** foi validada com a ressalva "reavaliar se surgir uso com conta estritamente pessoal". Este feedback é o **primeiro sinal** dessa reavaliação, mas é um sinal fraco: **o usuário ainda não pediu uma conta privada concreta**. Recomendo **não reabrir D-PO-02 agora**.
- **Não construir (c) agora.** O produto é validado para casais/famílias. Abrir para "qualquer grupo" dilui a proposta de valor e o time antes de provar o hábito do casal.
- **(b) é o candidato mais provável** (Should/Could em AP posterior): marcar uma conta como "privada" (só o titular vê saldo e lançamentos; entra no acerto apenas se o titular optar). Depende de US-020 e de NEED-014. Reavaliar quando houver pedido real.
- **(a) exige decisão de modelo cedo:** se hoje a pessoa pertence a uma única família, trocar depois é caro. Recomendo um **spike do Tech Lead em R3** (sem entrega de funcionalidade): avaliar se o vínculo usuário↔família já é N:N e quanto custaria. Resultado vira ADR.
- **Nomenclatura:** a palavra "família" na interface é ótima para o público-alvo; só reavaliar se (c) for aprovado.

## 3. Regras de Negócio candidatas (para quando for priorizado)
- **RN-021.1:** Todo dado pertence a **exatamente um grupo**; nada é compartilhado entre grupos de uma mesma pessoa.
- **RN-021.2:** Um usuário vê apenas os grupos de que é membro e escolhe o grupo ativo explicitamente (sem mistura de saldos).
- **RN-021.3:** Privacidade dentro do grupo é decisão por conta/cartão (b), nunca implícita.

## 4. Pontos em aberto (decididos)
- **Q-F08 (decidida):** sem consulta; tratado como Futuro. Hipótese: necessidade real = conta privada (b); spike de modelo em R3.

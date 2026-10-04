# 📐 Visão Arquitetural Preliminar (Tech Lead)

*Status: Parcialmente substituído — o modelo de dados vigente está em [`modelo-de-dados.md`](modelo-de-dados.md) (nomes `isSharedExpense`, `payerMemberId`, `authorMemberId`; ver ADR-007). O diagrama de classes abaixo é conceitual e preliminar.*  
*Responsável: Agente Tech Lead*

---

## 🏛️ Modelo de Domínio Familiar

O sistema financeiro familiar difere de um gerenciador pessoal tradicional porque deve acomodar múltiplos membros com papéis e visões financeiras distintas:

```mermaid
classDiagram
    class Family {
        +String id
        +String name
        +DateTime createdAt
    }

    class Member {
        +String id
        +String familyId
        +String name
        +String email
        +Role role
        +Decimal incomeShare
    }

    class Transaction {
        +String id
        +String familyId
        +String paidByMemberId
        +String categoryId
        +String description
        +Int amountInCents
        +TransactionType type
        +Boolean isShared
        +DateTime date
    }

    class Category {
        +String id
        +String familyId
        +String name
        +String icon
        +String color
        +Boolean isEssential
    }

    class Budget {
        +String id
        +String familyId
        +String categoryId
        +Int limitInCents
        +String period
    }

    Family "1" --> "*" Member
    Family "1" --> "*" Category
    Family "1" --> "*" Transaction
    Family "1" --> "*" Budget
    Member "1" --> "*" Transaction : "registra / paga"
    Category "1" --> "*" Transaction
```

---

## 🔒 Princípios de Segurança e Integridade
1. **Multi-tenancy Estrito**: Nenhuma consulta pode retornar dados sem o filtro explícito de `familyId`.
2. **Cálculo Monetário Inteiro**: Armazenamento de moedas em centavos (`amountInCents: Integer`) para erradicar imprecisões de arredondamento IEEE 754.
3. **Auditoria de Ações**: Registro de quem criou, editou ou deletou cada transação.

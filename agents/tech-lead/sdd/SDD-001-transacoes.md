# SDD-001: Especificação Técnica para Cadastro e Gestão de Transações

- **História PO Relacionada**: [`[US-001]`](file:///home/arlan/ai-tests/finance-manager/agents/product-owner/backlog/backlog.md#us-001-cadastro-e-gesto-de-transaes-financeiras)
- **Status**: Aprovado para Desenvolvimento
- **Autor**: Agente Tech Lead
- **Executor**: Agente Desenvolvedor & QA

---

## 1. 🔍 Gaps Técnicos Identificados na História do PO & Resoluções

| Gap Identificado no BDD | Resolução Técnica do Tech Lead |
| :--- | :--- |
| **Imprecisão de Float**: O PO definiu apenas "valor > 0". | Representação estrita em centavos (`amountInCents: number`, inteiro). Na UI o usuário digita "R$ 150,50", mas o frontend valida e envia `15050`. |
| **Cliques Duplos (Duplicidade)**: O usuário pode clicar duas vezes rapidamente no botão "Salvar". | Implementar estado de loading e header de idempotência (`Idempotency-Key: uuidv4()`) para evitar transações duplicadas. |
| **Timezone da Transação**: O PO pediu "data", mas membros da família podem estar em fusos diferentes ou lançar despesas passadas. | Armazenar a data em UTC com `ISO-8601` (`YYYY-MM-DDTHH:mm:ssZ`), garantindo exibição no horário local do navegador. |
| **Concorrência**: Dois usuários alterando ao mesmo tempo. | Utilizar chave única e controle de concorrência otimista com versionamento (`updatedAt`). |

---

## 2. 📦 Contratos de Dados & Tipagem (TypeScript / Zod)

```typescript
import { z } from "zod";

export const TransactionTypeEnum = z.enum(["EXPENSE", "INCOME"]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

export const CreateTransactionSchema = z.object({
  familyId: z.string().uuid("ID da família inválido"),
  paidByMemberId: z.string().uuid("ID do membro pagador inválido"),
  categoryId: z.string().uuid("Categoria é obrigatória"),
  description: z.string().min(2, "A descrição deve ter no mínimo 2 caracteres").max(100),
  amountInCents: z.number().int("O valor deve ser um número inteiro").positive("O valor deve ser maior que zero"),
  type: TransactionTypeEnum,
  isShared: z.boolean().default(true),
  date: z.string().datetime({ message: "Data deve estar no formato ISO 8601" }),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export interface TransactionDTO extends CreateTransactionInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. 🌐 Contrato de API / Serviço

- **Método**: `POST /api/v1/families/:familyId/transactions`
- **Headers Obrigatórios**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <UUID>`
  - `Content-Type: application/json`
- **Respostas Esperadas**:
  - `201 Created`: Retorna o objeto `TransactionDTO`.
  - `400 Bad Request`: Erro de validação de schema Zod com detalhes dos campos.
  - `401 Unauthorized`: Usuário não autenticado.
  - `403 Forbidden`: Usuário não pertence ao `familyId` informado (Multi-tenant check).

---

## 4. 🖥️ Estados de Interface (UI States)

- **Idle**: Formulário limpo com campos padrão preenchidos (data atual, tipo despesa, compartilhada = true).
- **Submitting (Loading)**: Botão desabilitado com spinner ("Salvando..."), prevenção de novos cliques.
- **Success**: Notificação toast ("Transação registrada com sucesso!"), formulário resetado ou modal fechado e cache TanStack Query invalidado.
- **Error**: Destaque em vermelho nos inputs inválidos com mensagens do schema Zod.

---

## 5. 🧪 Diretrizes de Testes & QA para o Desenvolvedor

O **Desenvolvedor & QA** deve implementar obrigatoriamente os seguintes testes:

1. **Testes Unitários de Domínio**:
   - Validação do schema Zod (sucesso para dados válidos, rejeição para valores negativos, nulos ou centavos fracionários).
   - Conversão de string de moeda ("R$ 1.250,90") para centavos (`125090`) e vice-versa.
2. **Testes de Integração de Componentes**:
   - Renderização do formulário e validação de bloqueio no clique com formulário incompleto.
   - Disparo correto do evento de submissão com o payload no formato `CreateTransactionInput`.
   - Feedback de loading e bloqueio contra clique duplo.

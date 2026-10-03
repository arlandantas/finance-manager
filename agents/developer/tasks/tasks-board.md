# 📋 Quadro de Tarefas & QA do Desenvolvedor

*Status Geral: Aguardando aprovação final da stack (ADR-001) para início da TASK-001*  
*Responsável: Agente Desenvolvedor & QA*

---

## 📌 Fluxo de Execução

```text
[Aguardando] ➔ [Em Desenvolvimento] ➔ [Em Testes de QA] ➔ [Pronto para Validação do Gestor]
```

---

## 🚀 Tarefas Previstas (Sprint 1)

### [TASK-001] Setup Inicial do Projeto Web & Infraestrutura de Testes
- **História Relacionada**: Setup Técnico / Sprint 0
- **Especificação / ADR**: [`[ADR-001]`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/adrs/ADR-001-stack-tecnologica.md)
- **Status**: Aguardando validação da stack pelo Gestor
- **Descrição**: Inicialização do repositório da aplicação web com TypeScript, Tailwind CSS, Vitest, React Testing Library e Playwright.
- **Checklist de QA**:
  - [ ] Compilação limpa sem avisos (`npm run build`).
  - [ ] Teste de fumaça executado com sucesso no Vitest (`npm test`).

---

### [TASK-002] Implementação e Testes do Cadastro de Transações
- **História PO**: [`[US-001]`](file:///home/arlan/ai-tests/finance-manager/agents/product-owner/backlog/backlog.md#us-001-cadastro-e-gesto-de-transaes-financeiras)
- **Especificação Técnica**: [`[SDD-001]`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/sdd/SDD-001-transacoes.md)
- **Status**: Todo
- **Descrição**: Criação dos esquemas de validação Zod, formulário com estados de interface (idle, loading, error, success) e tipagem precisa em centavos (`amountInCents`).
- **Checklist de QA (Desenvolvedor)**:
  - [ ] Teste unitário: Validação do schema Zod com centavos inteiros.
  - [ ] Teste unitário: Conversão e formatação monetária (BRL).
  - [ ] Teste de componente: Submissão do formulário e estados de loading.
  - [ ] Teste de QA: Validação do bloqueio de duplo clique (idempotência).
  - [ ] Teste de QA: Verificação responsiva em viewport mobile (375px) e desktop (1280px).

# 💻 Agente Dev (Programador) e papéis de QA

Espaço de trabalho do **Dev** e dos dois papéis de **QA** (executor e exploratório), descritos nas seções ao fim.

## 🎯 Missão e Responsabilidade
Como **Dev** (Sonnet), você constrói o software e escreve os testes (unitários, de integração e cenários BDD/E2E a partir do SDD/US), e corrige as falhas reais devolvidas pelo QA. Sua responsabilidade é implementar as funcionalidades da aplicação web com base direta nas especificações técnicas em **SDD (*Specification-Driven Development*)** entregues pelo **Tech Lead**, além de validar com rigor todos os cenários de negócio descritos no **BDD** pelo **Product Owner (PO)**.

Você é o responsável por entregar código funcionando, limpo, robusto e integralmente testado antes de submeter a entrega ao Gestor do Projeto.

---

## 🧭 O Que Você Deve Fazer

### Como Desenvolvedor:
1. **Seguir a Especificação SDD do Tech Lead**:
   - Consultar os documentos em [`agents/tech-lead/sdd/`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/sdd).
   - Utilizar estritamente os tipos TypeScript, schemas Zod e contratos de API definidos no SDD.
   - Respeitar as diretrizes de arquitetura em [`agents/tech-lead/adrs/`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/adrs).
2. **Implementar o Código na Pasta do Projeto (`src/`)**:
   - Desenvolver componentes limpos, modulares e acessíveis (WCAG).
   - Trabalhar com valores monetários em inteiros/centavos (`amountInCents`).
   - Implementar os tratamentos de UI states (loading, empty, error, feedback visual).

### Testes e Definition of Done (o Dev é o dono):
1. **Escrever Testes Automatizados Mandatórios**:
   - Implementar os testes de domínio e componentes requeridos na seção de testes de cada SDD.
   - Cobrir os cenários Gherkin (Dado/Quando/Então) definidos pelo PO no BDD.
2. **Testes de Casos de Borda e Validação Manual (Smoke Tests)**:
   - Testar preenchimentos inválidos, valores extremos, strings longas e cliques rápidos/duplos.
   - Validar responsividade em viewport de celular e desktop.
3. **Validar a Definition of Done (DoD) antes da Entrega**:
   - [ ] Código sem erros de linter ou TypeScript (`tsc --noEmit`).
   - [ ] 100% dos testes unitários e de integração passando.
   - [ ] Cenários BDD do PO atendidos.
   - [ ] Cenários SDD do Tech Lead cumpridos.
   - [ ] **Documentação em dia (parte da DoD)**: `estado/<área>.md` atualizado, status de US/SDD/TASK e `tasks-board.md` coerentes, `pnpm check:docs` passando.
   - [ ] Divergência entre spec (SDD/US) e código implementado registrada como `DEV-xxx` e refletida no `estado/<área>.md` (o código e os testes vencem).

---

## 📁 Onde Procurar e Onde Escrever

- **Ler primeiro**: [`agents/INDEX.md`](../INDEX.md) ➔ `agents/estado/<área>.md` §b (Regras) e §f (Fontes: código e testes) ➔ o SDD indicado. **Não ler** `_historico/` nem `developer/tasks/` (exceto `tasks-board.md`) por padrão.
- **Onde se informar**:
  - [`agents/tech-lead/sdd/`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/sdd): Especificações técnicas estritas (schemas, APIs e requisitos de testes).
  - [`agents/product-owner/backlog/`](file:///home/arlan/ai-tests/finance-manager/agents/product-owner/backlog): Histórias e regras de negócio do PO.
  - [`agents/tech-lead/adrs/`](file:///home/arlan/ai-tests/finance-manager/agents/tech-lead/adrs): Decisões de arquitetura.
- **Onde registrar o que está sendo feito**:
  - **Quadro de Tarefas e QA**: [`agents/developer/tasks/tasks-board.md`](file:///home/arlan/ai-tests/finance-manager/agents/developer/tasks/tasks-board.md) (a seção "Fila de implementação" e o "ponto de retomada" no fim do arquivo são os vigentes; relatórios de QA fechados ficam em `_historico/developer/tasks/`).
  - **Código e Testes**: `src/` e `tests/`.

---

## 📋 Formato Padrão para Registro de Tarefa & QA

```markdown
### [TASK-XXX] Nome da Tarefa
- **História PO**: [US-XXX]
- **Especificação Técnica**: [SDD-XXX]
- **Status**: [Todo | Em Desenvolvimento | Em Testes/QA | Concluído]
- **Arquivos Criados/Modificados**:
  - `src/...`
- **Checklist de QA & Testes**:
  - [x] Teste de domínio Zod / Centavos passando
  - [x] Teste de componente e renderização passando
  - [x] Cenário BDD 1 validado
  - [x] Cenário BDD 2 (erro) validado
  - [x] Responsividade mobile testada
```

---

## 🔀 Commits Atômicos & Co-autoria

O Dev deve realizar **commits atômicos** (`git commit -o <arquivos>`) e sempre incluir a co-autoria ao final da mensagem:
```gitcommit
feat(transactions): implementar schema de validação Zod e suporte a centavos

Co-authored-by: Agente Desenvolvedor & QA <dev-qa@finance-manager.local>
```

---

## 🗂 Manutenção da Estrutura
Ao concluir uma unidade de trabalho (no mesmo commit do código):
- [ ] `estado/<área>.md`: regra vigente, divergências docs×código (DEV-xxx) e pendências.
- [ ] `tasks-board.md` ("Fila de implementação" e "ponto de retomada"). Status por US/SDD e `backlog.md` não se atualizam por tarefa (protocolo em [`manager/README.md`](../manager/README.md)).
- [ ] Área nova ➔ criar `estado/<área>.md` e acrescentar a linha no `INDEX.md`.
- [ ] QA/tarefas encerradas e relatórios antigos vão para `_historico/developer/tasks/` (IDs TASK/DEV e links preservados).
- [ ] Rodar `pnpm check:docs` (e os testes) antes de commitar.

---

## 🧪 QA executor (Haiku)
Acionado pelo Gestor após cada entrega do Dev. Roda as suítes (unit, integração, lint/`tsc`, `pnpm check:docs`) e o E2E da feature; repete falhas instáveis com `--retries=1`; reinicia/limpa servidores e `.next-e2e` órfãos pelo PID. **Não edita `src/` nem `tests/`.** Devolve ao Gestor uma lista curta: falha, causa provável e comando de reprodução. Só o Dev corrige. Registra achados no relatório devolvido, não em arquivos de status. Trailer de commit (se houver): `Co-authored-by: Agente QA <qa@finance-manager.local>`.

## 🔍 QA exploratório (Sonnet)
Acionado só em entregas de interface. Verifica no navegador real (preview) em tema claro e escuro, em 375 px e desktop, com capturas; checa teclado, foco e contraste. **Não altera código.** Devolve os achados (severidade, captura, passos) ao Gestor, que os repassa ao Dev.

## 🤝 Regras comuns
Briefs fechados; sem agentes paralelos nos mesmos arquivos; `git commit -o`; ordem da entrega: Dev (testes focados) ➔ QA executor ➔ [QA exploratório se houver UI] ➔ revisão do TL/Segurança quando o SDD exigir. Protocolo do Gestor em [`manager/README.md`](../manager/README.md).

# 📂 Diretório de Agentes

Bem-vindo ao centro de operações dos agentes do projeto **Gestão Financeira Familiar**.

Neste diretório, cada agente possui uma pasta exclusiva para documentar suas análises, registrar tarefas em andamento e manter o histórico de suas entregas.

---

## 🗂 Estrutura das Pastas

```text
agents/
├── README.md                      # Este arquivo guia
├── INDEX.md                       # PRIMEIRA LEITURA: mapa por área/tarefa e regra de manutenção
│
├── estado/                        # Estado vigente por área (10 arquivos, densos): fonte da regra atual
│
├── _historico/                    # Fechado, não ler por padrão (mesma subestrutura: security/relatorios, developer/tasks/qa-*, tech-lead/respostas-*, product-owner/backlog/decisoes-po-* e pedidos-*, stakeholder/homologacao-*)
│
├── manager/                       # Gestor do Projeto (interface com o usuário, orquestração e decisões)
│   ├── README.md                  # Manual do Gestor (protocolo de atendimento, escalonamento, modelos)
│   └── *.md                       # Decisões, pedidos, pendências externas e checklists
│
├── security/                      # Agente de Segurança (auditor independente: brechas e dados pessoais)
│   ├── README.md                  # Manual do Agente de Segurança (escopo, formato SEC-xxx, regras)
│   └── status.md                  # Quadro histórico dos achados SEC (relatórios fechados em _historico/)
│
├── stakeholder/                   # Agente 1: Stakeholder (Dono do PROBLEMA e do VALOR)
│   ├── README.md                  # Manual do Stakeholder (dores, personas, regras de negócio)
│   └── needs/                     # Levantamento de necessidades e restrições
│
├── product-owner/                 # Agente 2: Product Owner (Dono da SOLUÇÃO, FLUXOS e UI/UX)
│   ├── README.md                  # Manual do PO (workflows, UX, backlog e critérios BDD)
│   ├── flows/                     # Fluxos de navegação (User Flows), layout e comportamento de telas
│   └── backlog/                   # Backlog priorizado e especificações funcionais (BDD)
│
├── tech-lead/                     # Agente 3: Tech Lead (Dono da ENGENHARIA, Gaps & SDD)
│   ├── README.md                  # Manual do Tech Lead (gaps técnicos, SDD, stack e ADRs)
│   ├── sdd/                       # Especificações Técnicas SDD (Specification-Driven Development)
│   ├── adrs/                      # Registros de Decisões de Arquitetura (ADRs)
│   └── architecture/              # Diagramas e modelos de dados
│
└── developer/                     # Agentes 4 e 5: Dev (IMPLEMENTAÇÃO & TESTES), QA executor e QA exploratório
    ├── README.md                  # Manual do Dev e dos dois QA (implementação SDD, testes, execução de suítes, QA no navegador)
    └── tasks/                     # tasks-board.md (fila de implementação, vivo); demais TASK/QA são histórico
```

---

## 🧭 Como Usar Esta Pasta

0a. **Comece por [`INDEX.md`](INDEX.md)** e pelo `estado/<área>.md` da sua tarefa (§a Resumo, §b Regras, §c Invariantes, §d Riscos aceitos, §e Pendências, §f Fontes); histórico (`_historico/`, `manager/decisoes-do-gestor.md`, `developer/tasks/` exceto `tasks-board.md`) só para rastrear origem.
0. **O usuário fala apenas com o Gestor** ([`manager/README.md`](manager/README.md)), que distribui as tarefas e traz de volta só as decisões que o time não pode tomar.
1. **Identifique o seu papel**: Vá diretamente para a pasta do seu agente.
2. **Leia o `README.md` da sua pasta**: Ele contém o escopo exato do que você deve fazer e o formato dos arquivos que deve produzir.
3. **Consulte o agente anterior**: Verifique os artefatos produzidos pelos agentes das etapas anteriores antes de iniciar sua produção.
4. **Mantenha os artefatos atualizados**: Registre cada nova entrega ou atualização nas subpastas apropriadas.

5. **Use o menor modelo capaz** (Haiku para tarefas mecânicas, Sonnet para implementação e histórias, Opus só para arquitetura e domínio crítico). Tabela completa em [`manager/README.md`](manager/README.md).

---

## 🔧 Manutenção da Estrutura (vale para todos os papéis)

Mapa e regra de manutenção ficam no [`INDEX.md`](INDEX.md) (não duplicar aqui). Checklist ao concluir uma unidade de trabalho:
- [ ] Atualizei `estado/<área>.md` (regra vigente, divergências docs×código, pendências) **no mesmo commit** da mudança; o arquivo continua com ~1500 palavras ou menos.
- [ ] Se couber ao meu papel, atualizei a "Fila de implementação" do `tasks-board.md`. Status por US e `backlog.md` não se atualizam por tarefa (protocolo em [`manager/README.md`](manager/README.md)).
- [ ] Se a área é nova: criei `estado/<área>.md` (molde em [`estado/so-meu.md`](estado/so-meu.md)) e acrescentei a linha no `INDEX.md`.
- [ ] Item fechado (relatório, QA, resposta, decisão antiga) vai para `_historico/` com a mesma subestrutura, mantendo IDs e corrigindo os links que apontavam para o caminho antigo.
- [ ] Rodei `pnpm check:docs` antes de commitar.

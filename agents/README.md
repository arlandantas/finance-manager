# 📂 Diretório de Agentes

Bem-vindo ao centro de operações dos agentes do projeto **Gestão Financeira Familiar**.

Neste diretório, cada agente possui uma pasta exclusiva para documentar suas análises, registrar tarefas em andamento e manter o histórico de suas entregas.

---

## 🗂 Estrutura das Pastas

```text
agents/
├── README.md                      # Este arquivo guia
├── INDEX.md                       # PRIMEIRA LEITURA: mapa por área/tarefa e regra de manutenção
├── _brief-estado.md               # Brief para consolidar/atualizar um arquivo de estado
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
└── developer/                     # Agente 4: Desenvolvedor & QA (Dono da IMPLEMENTAÇÃO & TESTES)
    ├── README.md                  # Manual do Desenvolvedor & QA (implementação SDD e plano de testes)
    └── tasks/                     # Acompanhamento de tarefas e checklist de QA
```

---

## 🧭 Como Usar Esta Pasta

0a. **Comece por [`INDEX.md`](INDEX.md)** e pelo `estado/<área>.md` da sua tarefa; histórico só para rastrear origem.
0. **O usuário fala apenas com o Gestor** ([`manager/README.md`](manager/README.md)), que distribui as tarefas e traz de volta só as decisões que o time não pode tomar.
1. **Identifique o seu papel**: Vá diretamente para a pasta do seu agente.
2. **Leia o `README.md` da sua pasta**: Ele contém o escopo exato do que você deve fazer e o formato dos arquivos que deve produzir.
3. **Consulte o agente anterior**: Verifique os artefatos produzidos pelos agentes das etapas anteriores antes de iniciar sua produção.
4. **Mantenha os artefatos atualizados**: Registre cada nova entrega ou atualização nas subpastas apropriadas.

5. **Use o menor modelo capaz** (Haiku para tarefas mecânicas, Sonnet para implementação e histórias, Opus só para arquitetura e domínio crítico). Tabela completa em [`manager/README.md`](manager/README.md).

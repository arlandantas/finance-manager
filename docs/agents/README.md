# Papéis

Definições neutras de ferramenta. Wrappers (`.claude/agents/`) ficam finos: frontmatter + "siga docs/agents/<papel>.md".

| Papel | Tier | Roda | Arquivo |
|---|---|---|---|
| architect | alto raciocínio | início de marco, domínio crítico | architect.md |
| builder | padrão | uma vez por história | builder.md |
| reviewer | padrão | após cada história (QA executor + exploratório de UI) | reviewer.md |
| researcher | rápido/barato | sob demanda (inclui levantamento de segurança) | researcher.md |

Mapa Claude Code: architect=opus, builder/reviewer=sonnet, researcher=haiku.
Todo papel lê `AGENTS.md` primeiro e depois só os arquivos que o brief nomeia. Resposta ≤150 palavras.

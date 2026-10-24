# EN-006 — Servidor MCP: base de autenticação, escopo e auditoria (Habilitadora)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente de IA (MCP) · **R4-D (proposta)** |
| Tipo | **Habilitadora** (sem tela própria; as telas vêm na US-074) |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,4 · 8 |
| Status | Refinada (PO) · **depende de ADR de segurança/autenticação do MCP** (Tech Lead) |
| Depende de | nenhuma história de LLM (o MCP usa a LLM **do usuário**, não a chave do app; não depende de EN-004) |
| Corte | Cortável com todo o bloco MCP |
| Rastreabilidade | **NEED-025** (RN-025.1..7; Q-U04, Q-U05, Q-U06) · RF43 · RN15 · D-PO-66 |

## Justificativa
Servidor MCP aberto (sem dependência de fornecedor, Q-U06) que expõe ao assistente do usuário um conjunto **pequeno e fechado de ferramentas**. A base — credencial, escopo e auditoria — é comum a leitura, lançamento e gestão e por isso é uma habilitadora.

## O que entrega (verificável)
- **Credencial por membro**, com validade e escopo (`leitura` primeiro; `lançamento` depois), revogável a qualquer momento e visível ao titular; guardada só como resumo (hash) no servidor.
- **Mesmas permissões do membro** (família, contas/cartões, papel); nenhuma ferramenta retorna dado de outra família.
- **Auditoria** de cada chamada (quem, qual ferramenta, quando, resultado), sem gravar o conteúdo devolvido.
- **Idempotência** nas ferramentas de escrita (RN-025.5) e **limite de taxa** por credencial.
- Todos os valores vêm dos mesmos cálculos do app (RN-025.7); o MCP não recalcula.
- Ferramentas destrutivas **não existem** nesta versão (excluir, editar valores antigos).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Base do servidor MCP

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E "Lucas" com uma credencial de assistente com escopo de leitura

  Cenário: Chamada sem credencial é recusada
    Quando um cliente chama o servidor MCP sem credencial
    Então recebe a resposta "não autorizado"
    E nenhum dado é devolvido

  Cenário: Credencial vê apenas o que o membro vê
    Dado que a conta "Poupança Mariana" é visível só para "Mariana"
    Quando o assistente de Lucas pede os saldos
    Então a resposta não contém a conta "Poupança Mariana"

  Cenário: Credencial de leitura não escreve
    Quando o assistente de Lucas tenta lançar uma despesa
    Então recebe a resposta "sem permissão de lançamento"
    E nenhum lançamento é criado

  Cenário: Credencial revogada para de funcionar na hora
    Dado que Lucas revogou a credencial
    Quando o assistente de Lucas pede os saldos
    Então recebe a resposta "não autorizado"

  Cenário: Credencial expirada
    Dado que a credencial de Lucas expirou
    Quando o assistente de Lucas pede os saldos
    Então recebe a resposta "credencial expirada"

  Cenário: Toda chamada é auditada sem guardar o conteúdo
    Quando o assistente de Lucas pede os saldos
    Então existe um registro com Lucas, a ferramenta "consultar saldos" e a data
    E o registro não contém os valores devolvidos

  Cenário: Excesso de chamadas é limitado
    Quando o assistente de Lucas excede o limite de chamadas por minuto
    Então recebe a resposta "limite de uso excedido"
```

## Fora de escopo
Ferramentas destrutivas, OAuth completo para clientes de terceiros (decisão do ADR), MCP por família.

## Pontos para o Tech Lead
Ver [`pedidos-ao-tech-lead-ia.md`](../pedidos-ao-tech-lead-ia.md) §3.

## Histórico
- 2026-10-24 — Criada (D-PO-66).

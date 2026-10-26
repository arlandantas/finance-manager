# EN-006 — Servidor MCP: base de autenticação, escopo e auditoria (Habilitadora) — fatiada em 006a e 006b

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente de IA (MCP) · **R4-D (proposta)** |
| Tipo | **Habilitadora** (sem tela própria; as telas vêm na US-074); **POC só com o Claude** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,4 · **12 no POC** (006a 7 + 006b 5); +2 na ampliação |
| Status | Implementada (TASK-066/067, aguardando validação do Gestor) |
| Depende de | nenhuma história de LLM (o MCP usa a LLM **do usuário**, não a chave do app; não depende de EN-004) |
| Corte | Cortável com todo o bloco MCP |
| Rastreabilidade | **NEED-025** (RN-025.1..7; Q-U04, Q-U05, Q-U06) · RF43 · RN15 · D-PO-66, D-PO-71 |

## Fatiamento (D-PO-71)
| Fatia | Conteúdo | Pts | Quando |
| :-- | :-- | :-: | :-- |
| **EN-006a** | Servidor de autorização OAuth próprio (conexão por URL, identificação do cliente por metadados, sem registro dinâmico) | **7** | POC, após a EN-007 (modelo avançado) |
| **EN-006b** | Endpoint MCP, contexto do membro, limite de taxa, auditoria e cliente de teste | **5** | POC, após a 006a |
| Ampliação | Registro dinâmico de clientes e homologação do ChatGPT (Gemini quando liberado) | +2 (+1) | Depois do POC |

## Justificativa
Servidor MCP aberto (sem dependência de fornecedor, Q-U06) que expõe ao assistente do usuário um conjunto **pequeno e fechado de ferramentas**. A base — credencial, escopo e auditoria — é comum a leitura, lançamento e gestão e por isso é uma habilitadora.

## O que entrega (verificável)
- **Conexão por membro via OAuth**, com validade (30/90 dias; acesso renovado a cada 60 min) e escopo (`leitura`; `lançamento` à parte), revogável a qualquer momento e visível ao titular; nenhum segredo é exibido ao membro: ele só cola a URL do servidor no cliente.
- **Mesmas permissões do membro** (família, contas/cartões, papel); nenhuma ferramenta retorna dado de outra família.
- **Auditoria** de cada chamada (quem, qual ferramenta, quando, resultado), sem gravar o conteúdo devolvido.
- **Idempotência** nas ferramentas de escrita (RN-025.5) e **limite de taxa** por conexão (60 chamadas/min e 1.000/dia; fixos, não configuráveis pelo membro).
- Todos os valores vêm dos mesmos cálculos do app (RN-025.7); o MCP não recalcula.
- Ferramentas destrutivas **não existem** nesta versão (excluir, editar valores antigos): o membro exclui pelo app.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Base do servidor MCP

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E "Lucas" com uma conexão de assistente com escopo de leitura

  Cenário: Chamada sem conexão é recusada
    Dado que o cliente não tem conexão autorizada
    Quando o cliente chama o servidor MCP
    Então recebe a resposta "não autorizado"
    E nenhum dado é devolvido

  Cenário: Conexão vê apenas o que o membro vê
    Dado que a conta "Poupança Souza" pertence à "Família Souza", da qual Lucas não faz parte
    Quando o assistente de Lucas pede os saldos
    Então a resposta não contém a conta "Poupança Souza"

  Cenário: Conexão de leitura não escreve
    Dado que a conexão de Lucas não tem o escopo de lançamento
    Quando o assistente de Lucas tenta lançar uma despesa
    Então recebe a resposta "sem permissão de lançamento"
    E nenhum lançamento é criado

  Cenário: Conexão revogada para de funcionar na hora
    Dado que Lucas revogou a conexão
    Quando o assistente de Lucas pede os saldos
    Então recebe a resposta "não autorizado"

  Cenário: Conexão expirada
    Dado que a conexão de Lucas expirou
    Quando o assistente de Lucas pede os saldos
    Então recebe a resposta "conexão expirada, conecte de novo"

  Cenário: Toda chamada é auditada sem guardar o conteúdo
    Quando o assistente de Lucas pede os saldos
    Então existe um registro com Lucas, a ferramenta "consultar saldos" e a data
    E o registro não contém os valores devolvidos

  Cenário: Excesso de chamadas é limitado
    Dado que o assistente de Lucas já fez 60 chamadas no último minuto
    o assistente de Lucas faz mais uma chamada
    Então recebe a resposta "limite de uso excedido"
```

## Fora de escopo
Ferramentas destrutivas, MCP por família, registro dinâmico de clientes e ChatGPT/Gemini (ampliação), token pessoal (US-074b).

## Pontos para o Tech Lead
[ADR-030](../../../tech-lead/adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md), [ADR-031](../../../tech-lead/adrs/ADR-031-producao-vercel-prisma-postgres.md) e SDD-024 (rev. 2).

## Histórico
- 2026-10-24 — Criada (D-PO-66).
- 2026-10-24 — Revisão 2 (D-PO-71): fatiada em 006a (7) e 006b (5); POC só com Claude; OAuth sem credencial exibida; hospedagem na EN-007.

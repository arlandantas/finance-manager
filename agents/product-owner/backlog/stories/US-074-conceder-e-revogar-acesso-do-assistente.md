# US-074 — Conceder, ver e revogar o acesso do meu assistente de IA

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (proposta)** · fatia 1/4 |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,6 · 5 |
| Status | Refinada (PO) · aguarda ADR/SDD do TL |
| Depende de | EN-006, US-031/035 (papéis) |
| Corte | Cortável com o bloco MCP; **não pode ser cortada sozinha** (sem ela as demais não têm como ser ativadas) |
| Rastreabilidade | **NEED-025** (RN-025.1, 025.2, Q-U04) · RF43 · FLUXO-016 §3 · D-PO-66 |

## História
Como **membro da família**, quero **conceder, ver e revogar o acesso do meu assistente de IA aos meus dados**, sabendo o que isso expõe, para **usar minha LLM de preferência sem abrir mão do controle**.

## Regras de negócio aplicáveis
- **Desligado por padrão e por membro** (Q-U04, hipótese); cada membro concede o seu, herdando as próprias permissões.
- O **Administrador pode bloquear o recurso para a família** (chave "Permitir acesso por assistente"); bloqueado, credenciais existentes deixam de funcionar.
- Ao conceder: aviso claro de que **os dados consultados vão ao provedor da LLM que o membro escolheu, fora do controle do app** (risco de privacidade); o membro escolhe o nome do assistente (ex.: "Meu Claude"), a validade (30/90 dias) e o escopo (somente leitura na 1ª versão).
- A credencial é **mostrada uma única vez** (com instruções de conexão); depois só aparecem nome, escopo, validade, criada/último uso.
- **Revogar** é imediato e visível; o histórico mostra "Revogada em …".
- Membro removido (US-035) perde as credenciais na hora.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Conceder e revogar acesso do assistente

  Contexto:
    Dado a "Família Silva" com "Mariana" como Administradora e "Lucas" como membro
    E o acesso por assistente permitido pela família
    E Lucas está autenticado

  Cenário: Nasce desligado
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então vê "Nenhum assistente conectado"

  Cenário: Conceder exige ciência do risco de privacidade
    Dado que Lucas toca em "Conectar um assistente"
    Então vê "Os dados que o assistente consultar serão enviados ao provedor da IA que você usa, fora do controle do app"
    E precisa marcar "Entendi" para continuar

  Cenário: Credencial é mostrada uma única vez
    Dado que Lucas conectou o assistente "Meu Claude" com validade de 30 dias e escopo de leitura
    Quando Lucas fecha a tela da credencial
    Então não consegue ver a credencial de novo
    E vê "Meu Claude · Leitura · expira em 23/11/2026"

  Cenário: Revogar na hora
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Lucas toca em "Revogar" e confirma
    Então o assistente aparece como "Revogado"
    E o assistente deixa de conseguir consultar dados

  Cenário: Cada membro vê só as suas credenciais
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana abre "Assistente de IA"
    Então não vê o assistente "Meu Claude"

  Cenário: Administrador bloqueia o recurso para a família
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana desliga "Permitir acesso por assistente"
    Então o assistente de Lucas deixa de funcionar
    E Lucas vê "O Administrador bloqueou o acesso por assistente"

  Cenário: Membro comum não altera a chave da família
    Quando Lucas abre "Assistente de IA"
    Então não vê a chave "Permitir acesso por assistente" editável

  Cenário: Membro removido perde as credenciais
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana remove Lucas da família
    Então o assistente de Lucas deixa de funcionar
```

## Experiência (UX/estados)
[FLUXO-016](../../flows/FLUXO-016-privacidade-e-consentimento-ia.md) §3.

## Fora de escopo
Acesso por família, escopo por conta/cartão (hipótese: herda tudo que o membro vê), lista de clientes compatíveis (Q-U06).

## Histórico
- 2026-10-24 — Criada (D-PO-66).

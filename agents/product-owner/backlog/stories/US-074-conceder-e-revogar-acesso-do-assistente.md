# US-074 — Conectar, ver e revogar o acesso do meu assistente de IA (POC com Claude)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (POC)** · fatia 1/4 |
| MoSCoW · WSJF · Tamanho (TL) | Should · 1,6 · 5 |
| Status | Refinada (PO, revisão 2) · SDD-025 (rev. 2) |
| Depende de | EN-007, EN-006a, EN-006b, US-031/035 (papéis) |
| Corte | Cortável com o bloco MCP; **não pode ser cortada sozinha** |
| Rastreabilidade | **NEED-025** (RN-025.1, 025.2, 025.4 revisada, Q-U04) · RF43 · FLUXO-016 §3 · D-PO-66, D-PO-72, D-PO-73 |

## História
Como **membro da família**, quero **conectar, ver e revogar o acesso do meu assistente de IA (Claude) aos meus dados**, sabendo o que isso expõe, para **usar minha LLM sem abrir mão do controle**.

## Regras de negócio aplicáveis
- **Desligado por padrão e por membro**; cada membro conecta o seu, herdando as próprias permissões.
- O **Administrador pode bloquear o recurso para a família** (chave "Permitir acesso por assistente"); bloqueado, as conexões existentes deixam de funcionar.
- **Conexão por OAuth:** o app **não mostra credencial**. O membro copia a **URL do servidor** do app e a cola no Claude, que o leva a autorizar no app. Não existe "credencial mostrada uma única vez".
- Ao conectar: aviso de que os **dados consultados vão ao provedor da IA que o membro usa**, fora do controle do app (marcar "Entendi"). Escolhe o nome do assistente e a validade (30 ou 90 dias); o acesso se renova sozinho a cada 60 minutos enquanto a conexão valer.
- **Permissões separadas:** "Consultar meus dados" (marcada) e "**Lançar despesas em seu nome (sem confirmação)**" (**desmarcada**). Marcar a segunda exige uma **segunda ciência** ("Entendi que o assistente grava lançamentos direto, sem pedir minha confirmação, e que posso excluí-los depois"). A permissão de lançar também aparece na tela de autorização do Claude.
- **Instruções de conexão só para o Claude** (web, Desktop e celular, e Claude Code); outros clientes entram na ampliação.
- **Revogar** é imediato e visível; o histórico mostra "Revogada em …". Membro removido (US-035) perde as conexões na hora.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Conectar e revogar acesso do assistente

  Contexto:
    Dado a "Família Silva" com "Mariana" como Administradora e "Lucas" como membro
    E o acesso por assistente permitido pela família
    E Lucas está autenticado

  Cenário: Nasce desligado
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então vê "Nenhum assistente conectado"

  Cenário: Conectar exige ciência do risco de privacidade
    Dado que Lucas toca em "Conectar um assistente"
    Então vê "Os dados que o assistente consultar serão enviados ao provedor da IA que você usa, fora do controle do app"
    E precisa marcar "Entendi" para continuar

  Cenário: Conexão não mostra credencial
    Dado que Lucas conectou o assistente "Meu Claude" com validade de 30 dias e só consulta
    Então vê a URL do servidor para colar no Claude
    E não vê nenhuma senha, chave ou código para guardar

  Cenário: Instruções são só do Claude
    Quando Lucas abre as instruções de conexão
    Então vê os passos para o Claude na web, no Desktop, no celular e no Claude Code
    E não vê passos para outros assistentes

  Cenário: Lançar despesas vem desmarcado
    Dado que Lucas toca em "Conectar um assistente"
    Então a opção "Lançar despesas em seu nome (sem confirmação)" aparece desmarcada

  Cenário: Marcar o lançamento exige segunda ciência
    Dado que Lucas toca em "Conectar um assistente"
    Quando Lucas marca "Lançar despesas em seu nome (sem confirmação)"
    Então vê "O assistente grava lançamentos direto, sem pedir sua confirmação. Você poderá excluí-los depois"
    E precisa marcar um segundo "Entendi" para continuar

  Cenário: Conexão mostra o que foi permitido
    Dado que Lucas conectou "Meu Claude" com consulta e lançamento
    Então vê "Meu Claude · Consulta e lançamento · expira em 23/11/2026"

  Cenário: Revogar na hora
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Lucas toca em "Revogar" e confirma
    Então o assistente aparece como "Revogado"
    E o assistente deixa de conseguir consultar dados

  Cenário: Cada membro vê só as suas conexões
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

  Cenário: Membro removido perde as conexões
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana remove Lucas da família
    Então o assistente de Lucas deixa de funcionar
```

## Experiência (UX/estados)
[FLUXO-016](../../flows/FLUXO-016-privacidade-e-consentimento-ia.md) §3.

## Fora de escopo
Acesso por família, escopo por conta/cartão (herda tudo que o membro vê), instruções para ChatGPT/Gemini (ampliação), **token pessoal** ([US-074b](US-074b-token-pessoal-do-assistente.md)).

## Histórico
- 2026-10-24 — Criada (D-PO-66).
- 2026-10-24 — Revisão 2 (D-PO-72, D-PO-73): OAuth sem credencial exibida; permissão de lançar à parte com segunda ciência; instruções só do Claude.

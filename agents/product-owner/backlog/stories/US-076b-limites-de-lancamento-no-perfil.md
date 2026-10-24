# US-076b — Limites de lançamento do assistente, configuráveis pelo membro

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (POC)** · fatia 3b/4 |
| MoSCoW · Tamanho (TL) | Could · **3** |
| Status | Refinada (PO, revisão 2) · SDD-027 §R2.3 e SDD-025 §8.2 · **sai junto com a US-076a** |
| Depende de | US-076a, US-074 |
| Corte | Não vai sem a 076a (e a 076a não vai sem ela) |
| Rastreabilidade | **NEED-025** (RN-025.4 trocada, RN-025.6) · TL-47 · D-GES-37 · D-PO-75 |

## História
Como **membro da família**, quero **definir no meu perfil os limites do que meu assistente pode lançar sozinho, inclusive remover os limites com plena ciência do risco**, para **equilibrar comodidade e segurança**.

## Regras de negócio aplicáveis
- **Limites padrão** (já valem no primeiro lançamento): **R$ 500,00 por lançamento · 10 lançamentos por dia · 5 por hora**. Aceitos pelo usuário (D-GES-37).
- Cada limite é **configurável pelo membro** em **Configurações ▸ Assistente de IA ▸ Limites de lançamento**; vale para todas as conexões dele. Cada um aceita **"sem limite"**.
- Escolher **"sem limite"** mostra um aviso com duas mensagens: (1) **sem limite, um erro ou uma instrução maliciosa da IA pode gerar muitos lançamentos indevidos**; (2) **este app não movimenta dinheiro em bancos reais: os lançamentos só alteram os registros do app**. Exige confirmação explícita ("Entendi o risco").
- Excluir um lançamento **não devolve a cota** do dia/hora. O dia segue o fuso da família; a hora é uma janela de 60 minutos.
- Bloqueio por limite: o assistente recebe mensagem clara e **nada é gravado**; a Atividade (US-077) mostra "Bloqueado pelo seu limite". Toda alteração de limite é auditada.
- Os limites de **transporte** (60 chamadas/min, 1.000/dia por conexão) são do serviço e **não** são configuráveis.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Limites de lançamento do assistente

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Lucas com o assistente "Meu Claude" conectado com a permissão de lançar despesas
    E Lucas está autenticado
    E hoje é 10/11/2026

  Cenário: Limites padrão já valem
    Quando Lucas abre "Assistente de IA" e "Limites de lançamento"
    Então vê "R$ 500,00 por lançamento"
    E vê "10 lançamentos por dia"
    E vê "5 lançamentos por hora"

  Cenário: Valor acima do limite é bloqueado
    Quando o assistente de Lucas lança "Eletrônicos" de "R$ 600,00"
    Então recebe a resposta "Valor acima do seu limite por lançamento pelo assistente (R$ 500,00)"
    E nenhum lançamento é criado

  Cenário: Limite diário bloqueia o 11º lançamento
    Dado que o assistente de Lucas já fez 10 lançamentos hoje
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então recebe a resposta "Limite diário de lançamentos pelo assistente atingido"
    E nenhum lançamento é criado

  Cenário: Limite por hora bloqueia o 6º lançamento
    Dado que o assistente de Lucas já fez 5 lançamentos na última hora
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então recebe a resposta "Limite de lançamentos por hora pelo assistente atingido"
    E nenhum lançamento é criado

  Cenário: Excluir não devolve a cota
    Dado que o assistente de Lucas já fez 10 lançamentos hoje
    E Lucas excluiu um deles
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então recebe a resposta "Limite diário de lançamentos pelo assistente atingido"

  Cenário: Membro muda um limite
    Dado que Lucas abre "Limites de lançamento"
    Quando Lucas altera o limite por lançamento para "R$ 1.000,00" e salva
    Então o assistente de Lucas passa a poder lançar "Eletrônicos" de "R$ 600,00"

  Cenário: Remover um limite mostra o aviso de risco
    Dado que Lucas abre "Limites de lançamento"
    Quando Lucas escolhe "Sem limite" no limite por lançamento
    Então vê "Sem limite, um erro ou uma instrução maliciosa da IA pode gerar muitos lançamentos indevidos"
    E vê "Este app não movimenta dinheiro em bancos reais, os lançamentos só alteram os registros do app"
    E precisa marcar "Entendi o risco" para salvar

  Cenário: Sem limite depois de confirmar o risco
    Dado que Lucas escolheu "Sem limite" no limite por lançamento e confirmou o risco
    Quando o assistente de Lucas lança "Eletrônicos" de "R$ 5.000,00"
    Então o lançamento é criado

  Cenário: Cancelar o aviso mantém o limite
    Dado que Lucas escolheu "Sem limite" no limite por lançamento
    Quando Lucas cancela o aviso
    Então o limite continua "R$ 500,00"

  Cenário: Alteração de limite fica auditada
    Dado que Lucas mudou o limite por lançamento de "R$ 500,00" para "Sem limite"
    Quando Lucas abre "Atividade"
    Então vê "Você alterou o limite por lançamento: R$ 500,00 para sem limite"

  Cenário: Cada membro tem os seus limites
    Dado que Lucas removeu todos os limites
    Quando Mariana abre "Assistente de IA" e "Limites de lançamento"
    Então vê os limites padrão dela

  Cenário: Bloqueio aparece na Atividade
    Dado que o assistente de Lucas teve um lançamento bloqueado pelo limite
    Quando Lucas abre "Atividade"
    Então vê o resultado "Bloqueado pelo seu limite"
```

## Fora de escopo
Limite por categoria, por conta ou por conexão; limites de transporte configuráveis; limite para o token pessoal além dos do membro (US-074b reutiliza estes).

## Histórico
- 2026-10-24 — Criada (D-PO-75).

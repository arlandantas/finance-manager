# US-053 — Clareza de textos: acerto desligado, regra somente leitura e preferência do olho

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.2** |
| MoSCoW · WSJF · Tamanho (PO) | Could · 1,6 · 3 |
| Status | Refinada (PO) · aguarda SDD/estimativa do TL |
| Depende de | US-028, US-031, US-027, US-036 |
| Corte | **Cortável (1º do pacote R2.2)**; cada grupo de cenários é independente |
| Rastreabilidade | Homologação R2.1 achados 3, 4 e 6 (Melhorias) · NEED-019, NEED-007, NEED-014 · D-PO-50 |

## História
Como **membro da família**, quero **textos e selos que reflitam o estado real (acerto desligado, regra só para leitura, preferência de ocultar valores)**, para **não ser induzido a achar que posso mudar o que não posso, nem ver pistas de um acerto que está desligado**.

## Regras de negócio aplicáveis
- **(b) Acerto desligado — selo "Comum"**: com o acerto **desligado**, as linhas de Início e Extrato **não mostram** o selo "Comum" (nem "Só meu"), pois a distinção não tem efeito. O dado `isSharedExpense` **não é alterado** (religar restaura os selos). Filtros "Comum/Só meu" também somem enquanto desligado.
- **(b) Atividade recente**: o evento de configuração do acerto diz **"Mariana ligou o acerto de contas"** ou **"Mariana desligou o acerto de contas"** (hoje: "alterou o acerto de contas"). Eventos antigos já gravados sem a informação continuam com o texto genérico.
- **(c) Regra em somente leitura** (membro sem permissão de alterar): a tela da regra mostra **apenas leitura** (percentuais vigentes e trechos); **sem** o texto "A mudança vale a partir de agora.", sem prévia de impacto, sem campos nem botão "Salvar", e com a frase "Só o Administrador altera a regra de divisão." no topo.
- **(e) Valores começam ocultos ao entrar como outro usuário — MANTIDO** (D-PO-50): é o comportamento da US-027 e da Q-F04, **intencional**: a preferência é **por usuário e por dispositivo**; quem nunca definiu a sua nesse aparelho começa **oculto** (privacidade por padrão; custo de 1 toque). **Ajuste só de texto**: a dica do olho passa a dizer **"Valores ocultos neste aparelho para o seu usuário. Toque para mostrar."** (e o equivalente quando visíveis), e a mensagem de logout/troca de usuário não muda. Sem lembrar entre dispositivos (exigiria guardar no servidor; fica fora do escopo).
- Nada muda em cálculos, permissões ou contratos de dados.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Clareza de textos e selos

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E uma despesa comum "Supermercado" de "R$ 100,00" e uma despesa "Só meu" de "R$ 45,00" em outubro de 2026

  Cenário: Selo Comum some com o acerto desligado
    Dado que o Administrador desligou o acerto de contas da família
    E Mariana está autenticada
    Quando Mariana abre o Extrato de outubro de 2026
    Então não vê o selo "Comum" nem o selo "Só meu" nas linhas

  Cenário: Selos voltam ao religar o acerto
    Dado que o Administrador desligou e religou o acerto de contas da família
    E Mariana está autenticada
    Quando Mariana abre o Extrato de outubro de 2026
    Então vê o selo "Comum" na despesa "Supermercado"
    E vê o selo "Só meu" na despesa de "R$ 45,00"

  Cenário: Atividade recente diz que o acerto foi desligado
    Dado que Mariana desligou o acerto de contas da família
    Quando Mariana abre a "Atividade recente" da Família
    Então vê "Mariana desligou o acerto de contas"

  Cenário: Atividade recente diz que o acerto foi ligado
    Dado que Mariana desligou e religou o acerto de contas da família
    Quando Mariana abre a "Atividade recente" da Família
    Então vê "Mariana ligou o acerto de contas"

  Cenário: Regra em somente leitura para o Membro
    Dado que Lucas está autenticado
    Quando Lucas abre a tela "Regra de divisão"
    Então vê "Só o Administrador altera a regra de divisão."
    E não vê "A mudança vale a partir de agora."
    E não vê o botão "Salvar regra"

  Cenário: Administrador continua vendo o texto de vigência
    Dado que Mariana está autenticada
    Quando Mariana abre a tela "Regra de divisão"
    Então vê "A mudança vale a partir de agora."
    E vê o botão "Salvar regra"

  Cenário: Preferência de valores é por usuário e por dispositivo
    Dado que Mariana mostrou os valores neste dispositivo
    Quando Lucas entra neste mesmo dispositivo pela primeira vez
    Então os valores aparecem como "R$ •••••"
    E a dica do olho diz "Valores ocultos neste aparelho para o seu usuário. Toque para mostrar."

  Cenário: A escolha de cada usuário volta ao reentrar
    Dado que Mariana mostrou os valores neste dispositivo
    E Lucas entrou e saiu neste dispositivo sem mostrar os valores
    Quando Mariana entra de novo neste dispositivo
    Então os valores aparecem visíveis
```

## Experiência (UX/estados)
Sem componentes novos. Textos de leitura em tom neutro; selos somem sem deixar espaço vazio nas linhas.

## Fora de escopo
Lembrar a preferência do olho entre dispositivos; permitir que o Membro proponha regra; histórico de ligar/desligar por mês.

## Perguntas em aberto / pontos para o Tech Lead
- O evento `FamilyEvent` do acerto já guarda o novo estado (ligado/desligado)? Eventos antigos precisam de migração ou só do texto genérico?
- Confirmar que o armazenamento do olho já é chaveado por usuário (SDD-010); o cenário "Mariana mostrou, Lucas entra" deve passar sem mudança de lógica.

## Histórico
- 2026-10-05 — Criada a partir dos achados 3, 4 e 6 da homologação da R2.1. Achado 6 tratado como comportamento **mantido** (D-PO-50), com ajuste só do texto da dica.

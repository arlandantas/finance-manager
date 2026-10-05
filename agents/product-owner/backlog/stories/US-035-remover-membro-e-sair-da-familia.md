# US-035 — Remover membro e sair da família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 1,1 (recalc.) · 8 (035a 5 + 035b 3) (PO: 5) |
| Status | **Especificada** (SDD-012, pronta para o Dev) · tamanho re-estimado pelo TL |
| Depende de | US-034, US-032, US-003 |
| Corte | **Cortável** (caso sensível; alto risco, risco de inchar a R2.1) |
| Fatias | **035a** (5): remover membro, ex-membro, revisão de pendências e reatribuição, reconvite · **035b** (3): sair da família, avisos de acesso encerrado e casos-limite (D-PO-36) |
| Rastreabilidade | Parecer item 15, Q-F07 · NEED-020 (RN-020.1, RN-020.4, RN-020.5, RN-020.7) · NEED-001 · FLUXO-011 · D-PO-18, **D-PO-36** · SDD-012, ADR-019, TL-06 |

## História
Como **Administrador**, quero **remover um membro que saiu da casa** (e como membro, **sair da família**), para **encerrar o acesso sem perder o histórico financeiro**.

## Regras de negócio aplicáveis
- Membro removido vira **"ex-membro"**: o **nome é preservado** em lançamentos, acertos e faturas passadas (RN-020.1); **acesso encerrado imediatamente** (sessões invalidadas).
- **Pendências antes de remover** (RN-020.4) mostradas em um **diálogo de revisão**:
  1. **Acerto em aberto** envolvendo o membro (com acerto ligado): exige marcar "Reconheço a diferença de R$ X" (a diferença **continua registrada** no histórico).
  2. **Contas** do membro (titular): com **saldo ≠ 0** o Administrador deve **reatribuir a titularidade** (obrigatório); com saldo zero a conta é **arquivada por padrão** (Q-F07) ou reatribuída.
  3. **Cartões** do membro: faturas abertas/não pagas exigem **reatribuir o titular**; sem pendência, **arquivados** por padrão.
  4. **Despesas previstas** sob responsabilidade dele: **reatribuídas** ao Administrador que remove (editável no diálogo).
- **Último Administrador** não sai/é removido sem promover outro (RN-020.5). **Mensagens neutras de gênero** (TL-06): "Você é a única pessoa Administradora. Promova outro membro antes de sair." e "Você é a única pessoa na família. Convide alguém antes de sair."
- **Sair da família**: qualquer membro, com as mesmas verificações; ao sair vê "Você saiu da Família Silva" e vai à tela de criar/entrar em família. Se o membro for o único restante, **não pode sair** (família sem membros é fora de escopo, RN-020.6).
- **Convite posterior**: o e-mail de um ex-membro pode ser convidado de novo (RN-020.7) e volta como **novo membro** (não reassume o histórico automaticamente).
- **Acesso encerrado** (ADR-019): o removido recebe `403` na **próxima** requisição e vê **uma única vez** o aviso "Seu acesso a esta família foi encerrado"; o histórico dele continua com o nome ("ex-membro").
- Remoção e saída **não apagam nada**; excluir a família inteira é fora de escopo.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Remover membro e sair da família

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E a conta "Itaú Lucas" de titularidade de "Lucas" com saldo "R$ 0,00"
    E a despesa prevista "Plano de saúde" sob responsabilidade de "Lucas"
    E Mariana está autenticada em "Família"

  Cenário: Remover membro sem pendências graves
    Quando Mariana remove "Lucas" e confirma o diálogo de revisão
    Então vê "Lucas foi removido da família"
    E "Lucas" aparece como "ex-membro" no histórico
    E o acesso de "Lucas" é encerrado

  Cenário: Histórico é preservado com o nome
    Dado uma despesa de "R$ 150,50" paga por "Lucas" em 10/10/2026
    E Mariana removeu "Lucas"
    Quando Mariana abre o Extrato
    Então a despesa mostra "Pago por Lucas (ex-membro)"
    E o total da despesa não muda

  Cenário: Diálogo de revisão lista as pendências
    Quando Mariana toca em "Remover" no membro "Lucas"
    Então vê "1 conta de Lucas será arquivada"
    E vê "1 despesa prevista será passada para você"

  Cenário: Conta com saldo exige reatribuir a titularidade
    Dado que a conta "Itaú Lucas" tem saldo "R$ 3.000,00"
    Quando Mariana toca em "Remover" no membro "Lucas"
    Então vê "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro."
    E o botão "Remover membro" fica desabilitado até ela escolher o novo titular

  Cenário: Reatribuir a titularidade e remover
    Dado que a conta "Itaú Lucas" tem saldo "R$ 3.000,00"
    Quando Mariana passa a titularidade da conta "Itaú Lucas" para "Mariana" e remove "Lucas"
    Então a conta "Itaú Lucas" continua ativa com titular "Mariana" e saldo "R$ 3.000,00"

  Cenário: Acerto em aberto exige reconhecimento
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Mariana toca em "Remover" no membro "Lucas"
    Então vê "Há R$ 380,00 a acertar entre vocês"
    E o botão "Remover membro" só habilita depois de marcar "Reconheço a diferença"

  Cenário: Acerto em aberto continua registrado após a remoção
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    E Mariana removeu "Lucas" reconhecendo a diferença
    Quando Mariana abre o painel de Acerto de outubro de 2026
    Então a diferença de "R$ 380,00" continua registrada

  Cenário: Despesa prevista passa ao Administrador
    Quando Mariana remove "Lucas" mantendo o responsável sugerido
    Então a despesa prevista "Plano de saúde" passa a ter responsável "Mariana"

  Cenário: Último Administrador não pode sair
    Quando Mariana tenta sair da família
    Então vê "Você é a única pessoa Administradora. Promova outro membro antes de sair."

  Cenário: Membro sai da família
    Dado que Lucas está autenticado em "Família"
    Quando Lucas toca em "Sair da família" e confirma
    Então vê "Você saiu da Família Silva"
    E não consegue mais abrir a Home da "Família Silva"

  Cenário: Único membro restante não pode sair
    Dado a "Família Souza" com apenas o membro "Ana"
    Quando Ana tenta sair da família
    Então vê "Você é a única pessoa na família. Convide alguém antes de sair."

  Cenário: Membro não remove outros
    Dado que Lucas está autenticado em "Família"
    Quando Lucas abre o menu de um membro
    Então não vê a ação "Remover"

  Cenário: Ex-membro pode ser convidado de novo
    Dado que Mariana removeu "Lucas"
    Quando Mariana convida o e-mail de "Lucas" como Membro
    Então o convite é enviado sem erro de e-mail já usado

  Cenário: Sessão do removido é encerrada
    Dado que Lucas está com o app aberto
    Quando Mariana remove "Lucas"
    E Lucas atualiza a tela
    Então Lucas vê a tela de login com "Seu acesso a esta família foi encerrado"

  Cenário: Duplo clique remove uma única vez
    Quando Mariana toca duas vezes rapidamente em "Remover membro"
    Então apenas uma remoção é registrada

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o membro "Ana"
    Quando Mariana tenta remover "Ana" por endereço direto
    Então vê "Não encontrado"
```

## Fatias (D-PO-36; SDD-012 §US-035)
| Fatia | Pts | Cenários |
| :-- | :-: | :-- |
| **035a** | 5 | Remover sem pendências graves · Histórico preservado com o nome · Diálogo lista as pendências · Conta com saldo exige reatribuir · Reatribuir e remover · Acerto em aberto exige reconhecimento · Acerto continua registrado · Despesa prevista passa ao Administrador · Membro não remove · Ex-membro pode ser convidado de novo · Duplo clique · Isolamento |
| **035b** | 3 | Último Administrador não pode sair · Membro sai da família · Único membro restante não pode sair · Sessão do removido é encerrada |
A 035b depende da 035a; ambas são cortáveis (6º na ordem de corte), mas a 035a é a de **maior risco da R2.1** (acerto com ex-membro: vetores S14..S16 e regressão S1..S13 antes e depois).

## Experiência (UX/estados)
[FLUXO-011](../../flows/FLUXO-011-familia-e-membros.md): diálogo em duas etapas (1. Revisão de pendências com seletores de reatribuição; 2. Confirmação textual "Remover Lucas"). Botão destrutivo só habilita com pendências resolvidas.

## Fora de escopo
Excluir a família (RN-020.6); política de retenção de dados de ex-membros (**Q-U02**, usuário); reassumir histórico ao reconvidar; transferência de titularidade em lote.

## Perguntas em aberto / pontos para o Tech Lead
- **Respondido pelo TL** (ADR-019, SDD-012): `Member` nunca é apagado (`removedAt`); unicidade só entre ativos; reconvite cria **novo** `Member`; último Administrador protegido por *advisory lock*; reatribuição em lote atômica.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 15, Q-F07).
- 2026-10-04 — **Revisão pós-TL (D-PO-36):** TL = 8 (PO: 5), fatiada em 035a (5) e 035b (3); mensagens **neutras de gênero** ("única pessoa Administradora", "única pessoa na família"); acesso encerrado com aviso único.

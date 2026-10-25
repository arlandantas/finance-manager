# US-080 — Excluir minha conta

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | **Must** (antes de abrir o cadastro além do alpha) · 5 (SEC-017c) · prazo do TL: ≤ 60 dias |
| Status | Refinada (PO) · SDD-028 §7.4 (aprovado para Dev; modelo Opus) |
| Depende de | US-078 (sessões encerradas), US-079 (baixar antes), US-035 (saída da família), SEC-018a |
| Rastreabilidade | SEC-017c · LGPD art. 18 (eliminação; **validação jurídica do usuário**) · ADR-019 · ADR-032 §6 · SDD-028 §7.4 · D-GES-42 U5 · D-PO-86, D-PO-87 |

## História
Como **membro da família**, quero **excluir a minha conta**, para **ter meus dados pessoais removidos do app sem destruir o histórico financeiro da família**.

## Regras de negócio aplicáveis
- Ação em **Perfil ➜ "Excluir minha conta"**, numa página de confirmação que **lista o que acontece** e exige **digitar o e-mail da conta**.
- O que acontece (texto da tela):
  1. você **sai da família** (mesmas regras e revisão de pendências da saída, US-035);
  2. os acessos de assistente são **revogados** e **todas as sessões** (todos os aparelhos) são encerradas;
  3. nome, e-mail e foto são **apagados/anonimizados**: seu nome vira **"Conta excluída"**;
  4. os **lançamentos e acertos que você fez permanecem** na família (são registros compartilhados do caixa familiar, ADR-019), aparecendo como **"ex-membro (conta excluída)"**.
- **Bloqueios**, com o texto na tela:
  - Administrador único com outros membros ativos: **"Passe a administração para outra pessoa antes de excluir sua conta."**
  - Único membro ativo da família: **"Você é a única pessoa na família. Exclua a família antes de excluir sua conta."**, com o atalho para a [US-081](US-081-excluir-a-familia.md).
- Se a pessoa tiver **conta com saldo ou cartão com fatura em aberto**, vale a revisão da US-035 (reatribuir a titularidade) antes de concluir.
- É **definitivo**: entrar de novo com o mesmo Google cria uma **conta nova e vazia**. Convites pendentes para esse e-mail passam a valer para a conta nova.
- Recomendação exibida: "Baixe seus dados antes", com atalho para a [US-079](US-079-baixar-meus-dados.md).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Excluir minha conta

  Contexto:
    Dado a "Família Silva" com "Mariana" Administradora e "Lucas" Membro
    E Lucas fez 12 lançamentos na família
    E Lucas está autenticado

  Cenário: Página de confirmação explica o que acontece
    Quando Lucas toca em "Excluir minha conta" no Perfil
    Então vê que sairá da família e que as sessões e os acessos de assistente serão encerrados
    E vê que seus lançamentos continuam na família como "ex-membro (conta excluída)"
    E vê o atalho "Baixar meus dados antes"

  Cenário: Botão só habilita com o e-mail digitado
    Dado que Lucas está na página de confirmação
    Quando Lucas digita um e-mail diferente do da conta
    Então o botão "Excluir minha conta" fica desabilitado

  Cenário: Excluir a conta com sucesso
    Dado que Lucas digitou o próprio e-mail na confirmação
    Quando Lucas toca em "Excluir minha conta"
    Então vê a tela "Sua conta foi excluída"
    E está desconectado

  Cenário: Dados pessoais são anonimizados
    Dado que Lucas excluiu a conta
    Então o nome dele passa a ser "Conta excluída"
    E o e-mail, a foto e o vínculo com o Google deixam de existir no app

  Cenário: Histórico da família é preservado
    Dado uma despesa de "R$ 150,50" paga por "Lucas" em 10/10/2026
    E Lucas excluiu a conta
    Quando Mariana abre o Extrato
    Então a despesa mostra "Pago por ex-membro (conta excluída)"
    E o total da despesa não muda

  Cenário: Todas as sessões são encerradas
    Dado que Lucas está conectado no celular e no computador
    Quando Lucas exclui a conta no celular
    Então o computador também volta para a tela de entrada

  Cenário: Acessos de assistente são revogados
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Lucas exclui a conta
    Então o assistente deixa de conseguir consultar dados

  Cenário: Administrador único não exclui a conta
    Dado que Mariana é a única Administradora e a família tem Lucas
    Quando Mariana tenta excluir a conta
    Então vê "Passe a administração para outra pessoa antes de excluir sua conta."
    E a conta não é excluída

  Cenário: Único membro da família não exclui a conta
    Dado a "Família Souza" com apenas o membro "Ana"
    Quando Ana tenta excluir a conta
    Então vê "Você é a única pessoa na família. Exclua a família antes de excluir sua conta."
    E vê o atalho "Excluir a família"

  Cenário: Conta com saldo exige reatribuir a titularidade
    Dado que a conta "Itaú Lucas" tem saldo "R$ 3.000,00"
    Quando Lucas tenta excluir a conta
    Então vê "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro."
    E a exclusão só avança depois da reatribuição

  Cenário: Entrar de novo cria uma conta nova
    Dado que Lucas excluiu a conta
    Quando Lucas entra com o mesmo Google
    Então é tratado como pessoa nova, sem família e sem histórico

  Cenário: Convite pendente vale para a conta nova
    Dado que existe um convite pendente para o e-mail de Lucas
    E Lucas excluiu a conta
    Quando Lucas entra de novo com o mesmo Google
    Então vê o convite em "Você foi convidado"

  Cenário: Duplo clique exclui uma única vez
    Quando Lucas toca duas vezes rapidamente em "Excluir minha conta"
    Então apenas uma exclusão é executada

  Cenário: Falha de rede
    Dado que não há conexão
    Quando Lucas toca em "Excluir minha conta"
    Então vê "Sem conexão. Nada foi excluído. Tente de novo."
```

## Experiência
Página própria (não um *modal*): título "Excluir minha conta", lista "O que acontece", campo "Digite seu e-mail para confirmar", botão vermelho "Excluir minha conta" e link "Cancelar". Sucesso: tela "Sua conta foi excluída" com botão "Voltar ao início".

## Fora de escopo
Período de arrependimento (conta "suspensa" por N dias), apagar os lançamentos que a pessoa fez, exclusão por pedido ao suporte, exclusão da conta de **outra** pessoa por Administrador.

## Perguntas em aberto / pontos para o Tech Lead
- **TL**: a revisão de pendências (conta com saldo, cartão, previstas) na exclusão reaproveita a da US-035? O SDD-028 §7.4 só diz "pelo mesmo serviço da US-035"; o PO assume que sim.
- **Usuário (D-PO-87)**: prazos de eliminação e a manutenção do histórico financeiro da família após a exclusão da conta pedem **validação jurídica** (LGPD); isto não é parecer.

## Histórico
- 2026-10-24 — Criada (SEC-017c, SDD-028 §7.4; D-PO-86, D-PO-87).

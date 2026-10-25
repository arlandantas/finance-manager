# language: pt
Funcionalidade: Excluir minha conta

  # DEV-101: a ação vive em Perfil ("Perfil e meus dados" no menu do usuário) ➜ "Excluir minha conta".

  Contexto:
    Dado a família da exclusão de conta com Mariana Administradora e Lucas Membro sem pendências
    E Lucas fez uma despesa de "R$ 150,50" na família
    E Lucas está autenticado

  Cenário: Página de confirmação explica o que acontece
    Quando Lucas abre a página de exclusão da conta
    Então vê que sairá da família e que as sessões e os acessos de assistente serão encerrados
    E vê que seus lançamentos continuam na família como "ex-membro (conta excluída)"
    E vê o atalho "Baixar meus dados antes"

  Cenário: Botão só habilita com o e-mail digitado
    Quando Lucas abre a página de exclusão da conta
    E Lucas digita o e-mail "outra@exemplo.com" na confirmação
    Então o botão "Excluir minha conta" da exclusão fica desabilitado

  Cenário: Excluir a conta com sucesso, dados anonimizados e desconectado
    Quando Lucas abre a página de exclusão da conta
    E Lucas digita o próprio e-mail e toca em "Excluir minha conta"
    Então vê a tela "Sua conta foi excluída"
    E o nome do Lucas no banco é "Conta excluída" e o e-mail original não existe mais
    E Lucas está desconectado

  Cenário: Histórico da família é preservado
    Quando Lucas abre a página de exclusão da conta
    E Lucas digita o próprio e-mail e toca em "Excluir minha conta"
    Então vê a tela "Sua conta foi excluída"
    Quando Mariana abre o Extrato e a despesa
    Então a despesa mostra "Pago por ex-membro (conta excluída)"

  Cenário: Todas as sessões são encerradas
    Dado que Lucas também está conectado em outro aparelho
    Quando Lucas abre a página de exclusão da conta
    E Lucas digita o próprio e-mail e toca em "Excluir minha conta"
    Então vê a tela "Sua conta foi excluída"
    E Lucas não tem nenhuma sessão

  Cenário: Administrador único não exclui a conta
    Quando Mariana abre a página de exclusão da conta
    Então vê o bloqueio "Passe a administração para outra pessoa antes de excluir sua conta."
    E o botão "Excluir minha conta" da exclusão fica desabilitado

  Cenário: Duplo clique exclui uma única vez
    Quando Lucas abre a página de exclusão da conta
    E Lucas digita o próprio e-mail e toca duas vezes em "Excluir minha conta"
    Então vê a tela "Sua conta foi excluída"
    E há uma única saída de Lucas registrada

  Cenário: Falha de rede
    Quando Lucas abre a página de exclusão da conta
    E Lucas fica sem conexão e tenta excluir a conta
    Então vê o erro da exclusão "Sem conexão. Nada foi excluído. Tente de novo."
    E o nome do Lucas no banco é "Lucas Silva"

  Cenário: Conta com saldo exige reatribuir a titularidade
    Dado que a conta "Itaú Lucas" tem saldo "R$ 3.000,00" na exclusão
    Quando Lucas abre a página de exclusão da conta
    Então vê a revisão "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro."
    Quando Lucas digita o próprio e-mail
    Então o botão "Excluir minha conta" da exclusão fica desabilitado
    Quando Lucas escolhe "Mariana" como novo titular de "Itaú Lucas" na exclusão
    Então o botão "Excluir minha conta" da exclusão fica habilitado

  Cenário: Único membro da família não exclui a conta
    Dado a família "Família Souza" com apenas a Ana
    Quando Ana abre a página de exclusão da conta
    Então vê o bloqueio "Você é a única pessoa na família. Exclua a família antes de excluir sua conta."
    E vê o atalho "Excluir a família"

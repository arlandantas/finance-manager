# language: pt
Funcionalidade: Excluir a família

  # DEV-101: a ação fica em Família ➜ "Zona de risco" ➜ "Excluir família" (/familia/excluir).

  Contexto:
    Dado a "Família Silva" onde Mariana é a única pessoa ativa e Administradora com dados

  Cenário: Página explica o que será apagado
    Dado Mariana está autenticada para excluir a família
    Quando Mariana abre Família e toca em "Excluir família"
    Então vê a lista de tudo que será apagado
    E vê "Esta ação não pode ser desfeita" na exclusão da família
    E vê o atalho "Baixar meus dados antes" na exclusão da família

  Cenário: Botão só habilita com o nome da família
    Dado Mariana está autenticada para excluir a família
    Quando Mariana abre Família e toca em "Excluir família"
    E Mariana digita o nome "Familia Silvo" para excluir a família
    Então o botão "Excluir a família" fica desabilitado na exclusão da família
    Quando Mariana digita o nome "Família Silva" para excluir a família
    Então o botão "Excluir a família" fica habilitado na exclusão da família

  Cenário: Excluir a família com sucesso e seguir para criar outra
    Dado Mariana está autenticada para excluir a família
    Quando Mariana abre Família e toca em "Excluir família"
    E Mariana digita o nome "Família Silva" para excluir a família
    E Mariana confirma a exclusão tocando em "Excluir a família"
    Então vê o aviso "Família excluída" e a tela de criar família
    E nada da "Família Silva" existe mais no banco
    E a conta de Mariana continua ativa

  @integration
  Cenário: Outra família não é afetada
    Dado a "Família Souza" com lançamentos e contas
    E Mariana está autenticada para excluir a família
    Quando Mariana abre Família e toca em "Excluir família"
    E Mariana digita o nome "Família Silva" para excluir a família
    E Mariana confirma a exclusão tocando em "Excluir a família"
    Então vê o aviso "Família excluída" e a tela de criar família
    E os dados da "Família Souza" permanecem iguais

  @integration
  Cenário: Duplo clique exclui uma única vez
    Dado Mariana está autenticada para excluir a família
    Quando Mariana abre Família e toca em "Excluir família"
    E Mariana digita o nome "Família Silva" para excluir a família
    E Mariana confirma a exclusão tocando duas vezes em "Excluir a família"
    Então vê o aviso "Família excluída" e a tela de criar família
    E nada da "Família Silva" existe mais no banco

  Cenário: Com outros membros ativos a exclusão é bloqueada
    Dado que Lucas também é membro ativo da "Família Silva"
    E Mariana está autenticada para excluir a família
    Quando Mariana abre Família
    Então vê "Remova os outros membros antes de excluir a família." na zona de risco
    E o botão "Excluir família" não está disponível

  Cenário: Membro comum não vê a ação
    Dado que Lucas também é membro ativo da "Família Silva"
    E Lucas está autenticado para excluir a família
    Quando Lucas abre Família
    Então não vê "Excluir família"

# language: pt
Funcionalidade: Assumir o cadastro pelo convite vinculado

  Contexto:
    Dado a família "Família Silva" com o cadastro sem acesso "Ana Rótulo" com 1 conta e 1 lançamento
    E existe um convite vinculado para "ana@exemplo.com"
    E a convidada entrou com o Google como "Ana Souza" e vê o convite

  Cenário: A prévia mostra o que será assumido e o nome vem do Google
    Então o resumo do convite diz "Você vai assumir o cadastro de Ana Rótulo: 1 conta, 0 cartões, 1 lançamento e 0 previstas."
    E o campo "Seu nome na família" vem preenchido com "Ana Souza"

  Cenário: Assumir o cadastro com o nome escolhido
    Quando ela troca o nome para "Aninha" e aciona "Assumir meu cadastro"
    Então o cadastro "Ana Rótulo" passa a ser da convidada com o nome "Aninha"
    E o lançamento e a conta seguem com o mesmo cadastro

  Cenário: Nome de outro membro é recusado e o convite continua
    Quando ela troca o nome para "Mariana Silva" e aciona "Assumir meu cadastro"
    Então vê o erro de nome "Já existe um membro com este nome"
    E o convite continua pendente

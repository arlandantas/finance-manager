# language: pt
Funcionalidade: Editar família e papéis

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro

  Cenário: Editar o nome da família
    Quando Mariana altera o nome da família para "Casa Silva" e salva
    Então vê o aviso de família "Família atualizada"
    E o cabeçalho da família mostra "Casa Silva"

  Cenário: Nome vazio ou curto
    Quando Mariana altera o nome da família para "" e salva
    Então vê o erro de família "Informe um nome com 2 a 60 caracteres"

  Cenário: Membro não edita o nome nem os papéis
    Quando Lucas abre a tela Família
    Então não vê o botão "Editar nome" nem ações de papel

  Cenário: Promover e rebaixar
    Quando Mariana altera o papel de "Lucas" para "Administrador"
    Então vê o aviso de família "Papel atualizado"
    E "Lucas" aparece como "Administrador"
    Quando Mariana altera o papel de "Lucas" para "Membro"
    Então "Lucas" aparece como "Membro"

  Cenário: Último Administrador não pode ser rebaixado
    Quando Mariana altera o papel de "Mariana" para "Membro"
    Então vê o erro de família "A família precisa de pelo menos um Administrador. Promova outro membro antes."

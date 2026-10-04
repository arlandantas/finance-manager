# language: pt
Funcionalidade: Criação da família

  Cenário: Criar família com sucesso
    Dado que Mariana está autenticada e não pertence a nenhuma família
    Quando ela informa o nome "Família Silva" e clica em "Criar família"
    Então a família "Família Silva" é criada
    E Mariana é membro com papel "Administrador"
    E a família possui as 8 categorias de despesa e as 3 de receita padrão
    E ela é levada ao passo opcional de convite

  Cenário: Nome sugerido
    Dado que o nome Google de Mariana é "Mariana Silva"
    Quando o onboarding é exibido
    Então o campo "Nome da família" vem preenchido com "Família Silva"

  Cenário: Nome inválido
    Dado que estou no onboarding
    Quando informo um nome vazio ou com menos de 2 caracteres e tento criar
    Então vejo a mensagem "Informe um nome com pelo menos 2 caracteres"
    E nenhuma família é criada

  Cenário: Duplo clique não duplica
    Dado que preenchi o nome da família
    Quando clico duas vezes rapidamente em "Criar família"
    Então apenas uma família é criada

  Cenário: Quem já tem família não refaz o onboarding
    Dado que Lucas já pertence a uma família
    Quando ele tenta acessar a tela de onboarding
    Então é redirecionado para a Home

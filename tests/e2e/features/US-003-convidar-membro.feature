# language: pt
Funcionalidade: Convite de membros

  Cenário: Enviar convite com sucesso
    Dado que Mariana é Administradora da "Família Silva"
    Quando ela convida "lucas@exemplo.com" com papel "Membro"
    Então um convite pendente é criado com validade de 7 dias
    E um e-mail com o link de acesso é enviado para "lucas@exemplo.com"
    E o convite aparece em "Convites pendentes"

  Cenário: Convidado vê o convite e escolhe Entrar
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando Lucas entra com o Google usando "Lucas@Exemplo.com"
    Então vê "Mariana Silva convidou você para a Família Silva"
    E vê os botões "Entrar na Família Silva" e "Recusar"
    E não é vinculado a nenhuma família ainda

  Cenário: Aceitar o convite vincula ao clicar em Entrar
    Dado que existe um convite pendente para "lucas@exemplo.com"
    E que Lucas entrou com o Google e vê o convite
    Quando Lucas aciona "Entrar na Família Silva"
    Então ele é vinculado à "Família Silva" com o papel do convite
    E o convite passa a "aceito"
    E ele vê a mensagem "Você entrou na Família Silva"

  Cenário: Recusar convite
    Dado que existe um convite pendente para "lucas@exemplo.com"
    E que Lucas entrou com o Google e vê o convite
    Quando Lucas recusa pelo botão "Recusar"
    Então o convite passa a "recusado"
    E Lucas não é vinculado a nenhuma família
    E Lucas segue para criar a própria família

  Cenário: Dois convites pendentes
    Dado que existem convites pendentes para "lucas@exemplo.com" da "Família Silva" e da "Família Souza"
    Quando Lucas entra com o Google usando "lucas@exemplo.com"
    Então vê um cartão para a "Família Silva" e outro para a "Família Souza"
    E não é vinculado a nenhuma família ainda

  Cenário: Quem já tem família não troca pelo convite
    Dado que Lucas já faz parte da "Família Souza" e tem um convite da "Família Silva"
    Quando Lucas abre o link do convite e toca em "Entrar na Família Silva"
    Então vê "Você já faz parte de uma família. Para entrar em outra, saia da atual em Família."
    E o convite da "Família Silva" continua pendente

  Cenário: Link do e-mail mostra o cartão de aceite e não vincula
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando Lucas abre o link do convite com a conta Google de "lucas@exemplo.com"
    Então vê "Mariana Silva convidou você para a Família Silva"
    E vê os botões "Entrar na Família Silva" e "Recusar"
    E não é vinculado a nenhuma família ainda

  Cenário: Convite que não está mais disponível
    Dado que existe um convite pendente para "lucas@exemplo.com"
    E que Lucas entrou com o Google e vê o convite
    E que o convite foi cancelado por Mariana
    Quando Lucas aciona "Entrar na Família Silva"
    Então vê "Este convite não está mais disponível"
    E não é vinculado a nenhuma família ainda

  Cenário: Convite aberto com outra conta Google
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando alguém entra com "outra@exemplo.com" pelo link do convite
    Então não é vinculado à família
    E vê a mensagem "Este convite é para outro e-mail"

  Cenário: E-mail inválido
    Dado que estou no drawer de convite
    Quando informo "lucas@" e tento enviar
    Então vejo "Informe um e-mail válido"
    E nenhum convite é criado

  @integration
  Cenário: E-mail que já é membro
    Dado que "lucas@exemplo.com" já é membro da família
    Quando tento convidá-lo novamente
    Então vejo "Esta pessoa já faz parte da família"

  @integration
  Cenário: Convite duplicado pendente
    Dado que já existe convite pendente para "lucas@exemplo.com"
    Quando tento convidá-lo novamente
    Então vejo "Já existe um convite pendente para este e-mail"

  Cenário: Cancelar convite
    Dado um convite pendente para "lucas@exemplo.com"
    Quando o Administrador clica em "Cancelar convite"
    Então o convite deixa de valer
    E Lucas, ao entrar, cai no onboarding de nova família

  Cenário: Convite expirado
    Dado um convite emitido há mais de 7 dias
    Quando o convidado entra com o Google
    Então ele não é vinculado
    E vê "Convite expirado. Peça um novo convite."

  Cenário: Membro comum não convida
    Dado que Lucas tem papel "Membro"
    Quando ele acessa a tela "Família"
    Então a ação "Convidar membro" não está disponível

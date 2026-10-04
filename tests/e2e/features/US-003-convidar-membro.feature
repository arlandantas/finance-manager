# language: pt
Funcionalidade: Convite de membros

  Cenário: Enviar convite com sucesso
    Dado que Mariana é Administradora da "Família Silva"
    Quando ela convida "lucas@exemplo.com" com papel "Membro"
    Então um convite pendente é criado com validade de 7 dias
    E um e-mail com o link de acesso é enviado para "lucas@exemplo.com"
    E o convite aparece em "Convites pendentes"

  Cenário: Convidado entra e é vinculado automaticamente
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando Lucas entra com o Google usando "Lucas@Exemplo.com"
    Então ele é vinculado à "Família Silva" com o papel do convite
    E o convite passa a "aceito"
    E ele vê a mensagem "Você entrou na Família Silva"

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

  Cenário: E-mail que já é membro
    Dado que "lucas@exemplo.com" já é membro da família
    Quando tento convidá-lo novamente
    Então vejo "Esta pessoa já faz parte da família"

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

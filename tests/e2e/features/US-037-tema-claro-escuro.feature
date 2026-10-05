# language: pt
@valores-ocultos
Funcionalidade: Tema claro e escuro

  Contexto:
    Dado Lucas está na Home para o tema

  Cenário: Padrão segue o sistema
    Dado que o sistema operacional está em modo escuro e Lucas nunca escolheu um tema
    Quando Lucas abre a Home para o tema
    Então o tema escuro está aplicado e "Sistema" está marcada em "Aparência"

  Cenário: Escolher claro e escuro aplica na hora
    Quando Lucas escolhe o tema "Claro"
    Então o tema aplicado é "light"
    Quando Lucas escolhe o tema "Escuro"
    Então o tema aplicado é "dark"

  Cenário: Escolha é lembrada neste dispositivo e não vale para outro
    Quando Lucas escolhe o tema "Escuro"
    E Lucas recarrega a página do tema
    Então o tema aplicado é "dark"
    Quando Lucas abre o app em um celular que nunca usou com o sistema claro
    Então o tema aplicado no outro dispositivo é "light"

  Cenário: Sem piscar ao carregar
    Dado que Lucas escolheu o tema "Escuro" e a página registra o primeiro tema aplicado
    Quando Lucas recarrega a página do tema
    Então o primeiro tema registrado foi "dark"

  Cenário: Voltar para Sistema
    Dado que o sistema operacional está em modo claro e Lucas nunca escolheu um tema
    Quando Lucas escolhe o tema "Escuro"
    E Lucas escolhe o tema "Sistema"
    Então o tema aplicado é "light"

  Cenário: Preferência indisponível vale na sessão
    Dado que o navegador não permite guardar o tema
    Quando Lucas escolhe o tema "Escuro"
    Então o tema aplicado é "dark"

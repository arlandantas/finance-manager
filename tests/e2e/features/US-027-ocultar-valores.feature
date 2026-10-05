# language: pt
@valores-ocultos
Funcionalidade: Ocultar valores

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    E Lucas está autenticado

  Cenário: Dispositivo novo começa com valores ocultos
    Dado que Lucas nunca abriu o app neste dispositivo
    Quando Lucas abre a tela de Contas
    Então os valores aparecem como "R$ •••••"
    E o ícone do olho indica "Valores ocultos"

  Cenário: Mostrar os valores com um toque
    Dado que os valores estão ocultos
    Quando Lucas toca no ícone do olho
    Então o saldo da família mostra "R$ 7.349,50"

  Cenário: A última escolha é lembrada no dispositivo
    Dado que Lucas mostrou os valores
    Quando Lucas recarrega a página
    Então o saldo da família mostra "R$ 7.349,50"

  Cenário: Ocultar de novo é lembrado
    Dado que Lucas mostrou os valores
    Quando Lucas toca no ícone do olho e recarrega a página
    Então os valores aparecem como "R$ •••••"

  Cenário: A preferência é por dispositivo
    Dado que Lucas mostrou os valores
    Quando Lucas abre o app em um celular novo
    Então os valores aparecem como "R$ •••••"

  Cenário: Máscara em todo o app
    Dado dados de cartão, previsão, despesa e acerto
    E que os valores estão ocultos
    Quando Lucas visita Início, Extrato, Acerto, Cartões, A pagar e Contas
    Então nenhuma dessas telas mostra um valor em reais legível

  Cenário: Máscara no extrato mantém data e descrição
    Dado uma despesa "Mercado do bairro" de "R$ 150,50" em 03/10/2026
    E que os valores estão ocultos
    Quando Lucas abre o Extrato
    Então vê "Mercado do bairro" e "03/10" e "R$ •••••"

  Cenário: Percentuais permanecem visíveis
    Dado que Mariana pagou "R$ 900,00" e Lucas "R$ 300,00" em despesas
    E que os valores estão ocultos
    Quando Lucas abre a Home
    Então vê "75%" e "25%" sem valores em reais

  Cenário: Revelar um valor pontualmente
    Dado que os valores estão ocultos
    Quando Lucas toca no valor do saldo da família
    Então o saldo mostra "R$ 7.349,50" por 5 segundos
    E volta a "R$ •••••" em seguida

  Cenário: Lançar com valores ocultos
    Dado que os valores estão ocultos
    Quando Lucas digita "R$ 150,50" no campo de valor do formulário "Nova despesa"
    Então o campo mostra "R$ 150,50"
    E após salvar vê "Despesa registrada com sucesso!" sem o valor

  Cenário: Alertas de saldo não vazam o valor
    Dado que os valores estão ocultos
    E a conta "Dinheiro" com saldo de "R$ 90,00"
    Quando Lucas escolhe "Dinheiro" para transferir "R$ 650,00"
    Então vê o aviso "A conta de origem ficará negativa" sem mostrar os valores

  Cenário: Leitor de tela não lê o número
    Dado que os valores estão ocultos
    Quando Lucas abre a tela de Contas
    Então o saldo da família é anunciado como "valor oculto"

  Cenário: Dica não promete segurança
    Quando Lucas abre a tela de Contas
    Então o ícone do olho tem a dica "Oculta os valores na tela. Não protege seus dados."

  Cenário: Outro usuário no mesmo dispositivo
    Dado que Lucas mostrou os valores neste dispositivo e saiu do app
    Quando Mariana entra neste dispositivo pela primeira vez
    Então os valores aparecem como "R$ •••••"

  Cenário: Preferência indisponível no navegador
    Dado que o navegador não permite guardar preferências
    Quando Lucas abre a tela de Contas
    Então os valores aparecem como "R$ •••••"
    E o controle do olho continua funcionando na sessão

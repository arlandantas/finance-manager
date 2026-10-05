# language: pt
Funcionalidade: Acerto de contas opcional

  Contexto:
    Dado a família do acerto opcional com Mariana Administradora e Lucas Membro

  Cenário: Famílias existentes continuam com o acerto ligado
    Quando Mariana abre as configurações da família
    Então a chave "Acerto de contas entre membros" está ligada

  Cenário: Família nova pergunta no onboarding e escolhe não dividir
    Dado que Souza está criando a família "Família Souza"
    Então a opção "Quero acertar as diferenças entre os membros" vem marcada
    E vê a opção "Só controlar, sem dividir"
    Quando ela escolhe "Só controlar, sem dividir" e conclui o onboarding
    Então a "Família Souza" fica com o acerto desligado
    E vê a dica "Você pode mudar isso depois em Configurações da família"

  Cenário: Desligar sem diferença esconde as telas e o campo de divisão
    Quando Mariana desliga a chave do acerto
    Então vê o aviso "Acerto de contas desligado"
    E o menu não tem o item "Acerto"
    E o formulário de nova despesa não mostra "Dividir com a família"

  Cenário: Desligar com diferença exige confirmação e considera qualquer mês
    Dado uma diferença do acerto de "R$ 90,00" em maio de 2025 sem acerto registrado
    Quando Mariana desliga a chave do acerto
    Então vê o aviso de pendência "Há R$ 90,00 a acertar entre os membros"
    Quando ela toca em "Desligar mesmo assim"
    Então o acerto fica desligado na família

  Cenário: Cancelar o desligamento mantém tudo como estava
    Dado uma diferença do acerto de "R$ 380,00" em outubro de 2026
    Quando Mariana desliga a chave do acerto
    E ela toca em "Cancelar"
    Então a chave "Acerto de contas entre membros" está ligada

  Cenário: Desligar e religar restaura a diferença
    Dado uma diferença do acerto de "R$ 380,00" em outubro de 2026
    Quando Mariana desliga a chave do acerto
    E ela toca em "Desligar mesmo assim"
    E Mariana religa a chave do acerto
    Então o painel de outubro de 2026 mostra "Valor a acertar: R$ 380,00"

  Cenário: Membro não altera a configuração
    Quando Lucas abre as configurações da família
    Então a chave "Acerto de contas entre membros" está desabilitada com a dica "Só o Administrador pode alterar"

  Cenário: Endereço direto com o recurso desligado
    Dado que o acerto foi desligado na família
    Quando Lucas acessa o endereço do painel de Acerto
    Então vê "O acerto de contas está desligado nesta família" e o link "Voltar para o início"

  Cenário: Linguagem neutra no painel
    Dado uma diferença do acerto de "R$ 380,00" em outubro de 2026
    Quando Lucas acessa o painel de acerto de outubro de 2026
    Então o painel mostra "Valor a acertar: R$ 380,00" e nenhuma frase com "deve R$"

  Cenário: Falha de rede ao alterar a configuração
    Quando a conexão cai e Mariana desliga a chave do acerto
    Então vê o erro "Sem conexão. Seus dados continuam na tela, tente de novo."
    E a chave "Acerto de contas entre membros" está ligada

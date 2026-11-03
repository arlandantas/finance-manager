# language: pt
Funcionalidade: Clareza de textos com o acerto desligado, regra somente leitura e dica do olho

  Contexto:
    Dado a família da clareza de textos com Mariana Administradora e Lucas Membro

  Cenário: Com o acerto desligado não há selos nem filtros de divisão
    Dado uma despesa comum "Mercado" de "R$ 100,00" e uma "Só meu" de "R$ 40,00"
    E que o acerto foi desligado sem alterar as despesas
    Quando Lucas abre o Extrato da clareza
    Então nenhuma linha mostra "Comum" nem "Pessoal"
    E o filtro "Divisão" não existe

  Cenário: Religar o acerto restaura os selos
    Dado uma despesa comum "Mercado" de "R$ 100,00" e uma "Só meu" de "R$ 40,00"
    E que o acerto foi desligado sem alterar as despesas
    E que o acerto foi religado
    Quando Lucas abre o Extrato da clareza
    Então as linhas mostram os selos "Comum" e "Pessoal"
    E o filtro "Divisão" existe

  Cenário: Atividade recente diz se o acerto foi ligado ou desligado
    Quando Mariana desliga e religa o acerto pela tela da família
    Então a atividade recente mostra "Mariana desligou o acerto de contas"
    E a atividade recente mostra "Mariana ligou o acerto de contas"

  Cenário: Evento antigo sem a informação mantém o texto genérico
    Dado um evento antigo de acerto sem a informação de ligar ou desligar
    Quando Mariana abre a tela da família da clareza
    Então a atividade recente mostra "Mariana alterou o acerto de contas"

  Cenário: Membro vê a regra só para leitura
    Quando Lucas abre a regra de divisão
    Então vê "Só o Administrador altera a regra de divisão." e os percentuais vigentes
    E não vê "A mudança vale a partir de agora." nem campos nem "Salvar regra"

  Cenário: Administrador continua podendo alterar a regra
    Quando Mariana abre a regra de divisão
    Então vê "A mudança vale a partir de agora." e o botão "Salvar regra"

  @valores-ocultos
  Cenário: Dica do olho explica a preferência por usuário e aparelho
    Quando Lucas abre o Extrato da clareza
    Então o olho tem a dica "Valores ocultos neste aparelho para o seu usuário. Toque para mostrar."
    Quando Lucas toca no olho da clareza
    Então o olho tem a dica "Valores visíveis neste aparelho para o seu usuário. Toque para ocultar."

  @valores-ocultos
  Cenário: A escolha de cada usuário é restaurada no aparelho
    Dado que Mariana mostrou os valores neste aparelho e saiu
    Quando Lucas entra neste aparelho
    Então os valores da clareza aparecem como "R$ •••••"
    Quando Mariana entra de novo neste aparelho
    Então os valores da clareza aparecem visíveis

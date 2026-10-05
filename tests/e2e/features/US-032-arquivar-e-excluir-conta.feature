# language: pt
Funcionalidade: Arquivar e excluir conta

  Contexto:
    Dado a família com as contas "Poupança" (zerada, com histórico), "Carteira antiga" (sem lançamentos) e "Itaú Lucas" (R$ 3.000,00)

  Cenário: Arquivar conta com saldo zero
    Quando Mariana arquiva a conta "Poupança" e confirma
    Então vê o aviso de conta "Conta arquivada"
    E "Poupança" não aparece na lista de contas

  Cenário: Conta arquivada some dos seletores e o histórico mantém o marcador
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre o formulário de despesa da conta
    Então "Poupança" não aparece em "Pagar com"
    Quando Mariana abre o Extrato das contas
    Então os lançamentos antigos da "Poupança" mostram "Poupança (arquivada)"

  Cenário: Saldo diferente de zero bloqueia e oferece transferir o saldo
    Quando Mariana tenta arquivar a conta "Itaú Lucas"
    Então vê o bloqueio "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes." com o botão "Transferir o saldo"
    Quando Mariana toca em "Transferir o saldo"
    Então o formulário de transferência abre com origem "Itaú Lucas" e valor "R$ 3.000,00"

  Cenário: Saldo da família ignora conta arquivada
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre a Home das contas
    Então o total em "Saldos das contas" é "R$ 3.000,00"

  Cenário: Reativar conta arquivada
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana reativa a conta "Poupança"
    Então "Poupança" volta à lista de contas

  Cenário: Excluir conta sem movimentação libera o nome
    Quando Mariana exclui a conta "Carteira antiga" e confirma "Excluir definitivamente"
    Então vê o aviso de conta "Conta excluída"
    E "Carteira antiga" não existe em nenhuma lista
    Quando Mariana cadastra uma conta chamada "Carteira antiga"
    Então a conta "Carteira antiga" é criada

  Cenário: Conta arquivada continua ocupando o nome
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana cadastra uma conta chamada "Poupança"
    Então vê o aviso de nome já em uso

  Cenário: Conta com histórico só pode ser arquivada e Membro não exclui
    Quando Mariana abre as ações da conta "Poupança"
    Então vê a ação "Arquivar" e não vê "Excluir"
    Quando Lucas abre as ações da conta "Carteira antiga"
    Então vê a ação "Arquivar" e não vê "Excluir"

  Cenário: Conta arquivada nunca é sugerida para pagar
    Dado que a conta "Itaú Lucas" foi zerada e arquivada e existe a despesa prevista "Reforma" de "R$ 100,00" de Lucas
    Quando Lucas abre a baixa de "Reforma"
    Então a conta de origem sugerida na baixa não é "Itaú Lucas"

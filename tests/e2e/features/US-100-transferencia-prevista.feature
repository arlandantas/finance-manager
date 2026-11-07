# language: pt
Funcionalidade: Transferência prevista entre contas

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E hoje é 03/12/2026
    E as contas "Itaú" com "R$ 5.000,00" e "Poupança" com "R$ 1.000,00" para transferir
    E Mariana está autenticada

  Cenário: Prever, ver a coluna por conta, efetivar e desfazer
    Quando Mariana prevê a transferência de "R$ 1.000,00" de "Itaú" para "Poupança" vencendo em "2026-12-20"
    Então a aba de transferências lista "Itaú" para "Poupança" de "1.000,00" sem selo
    E o total de "A pagar" de dezembro é "R$ 0,00"
    E "Itaú" mostra transferências previstas "-R$ 1.000,00" e previsto "R$ 4.000,00"
    E "Poupança" mostra transferências previstas "+R$ 1.000,00" e previsto "R$ 2.000,00"
    Quando Mariana efetiva a transferência prevista pela tela
    Então a transferência prevista aparece "Efetivada" sem ações de edição
    E a coluna de transferências previstas não aparece
    Quando Mariana desfaz a transferência no Extrato
    Então a transferência prevista volta a ficar pendente
    E "Itaú" mostra transferências previstas "-R$ 1.000,00" e previsto "R$ 4.000,00"

  Cenário: Sem transferência prevista no período a coluna some
    Quando Mariana abre o resumo por conta de dezembro
    Então a coluna de transferências previstas não aparece

  Cenário: Atrasada tem selo e ainda pode ser efetivada; excluir libera a conta
    Dado uma transferência prevista de "R$ 300,00" de "Itaú" para "Poupança" vencida em "2026-11-20"
    Quando Mariana abre a aba de transferências de dezembro
    Então a transferência prevista aparece "Atrasada"
    Quando Mariana exclui a transferência prevista
    Então a aba de transferências está vazia

  Cenário: Conta com transferência prevista pendente não arquiva
    Dado a conta "Reserva" sem saldo e uma transferência prevista de "R$ 100,00" de "Reserva" para "Poupança" vencendo em "2026-12-20"
    Quando Mariana abre o arquivamento da conta "Reserva"
    Então o diálogo mostra "Exclua ou efetive as transferências previstas desta conta"
    E o botão de arquivar conta está desabilitado

  Cenário: Lucas, segundo membro, vê e efetiva a transferência de Mariana, sem ver a de outra família
    Dado uma transferência prevista de "R$ 700,00" de "Itaú" para "Poupança" vencendo em "2026-12-10"
    E outra família com uma transferência prevista própria
    Quando Lucas abre a aba de transferências de dezembro
    Então a aba de transferências lista só "Itaú" para "Poupança" de "700,00"
    Quando Lucas efetiva a transferência prevista pela tela
    Então a transferência prevista aparece "Efetivada" sem ações de edição

  @valores-ocultos
  Cenário: Valores ocultos
    Dado uma transferência prevista de "R$ 700,00" de "Itaú" para "Poupança" vencendo em "2026-12-10"
    Quando Mariana abre a aba de transferências de dezembro
    Então a lista e a coluna de transferências mostram "R$ •••••" e nenhum número

  Cenário: Tela no celular e no tema escuro sem rolagem horizontal nem erros de console
    Dado uma transferência prevista de "R$ 700,00" de "Itaú" para "Poupança" vencendo em "2026-12-10"
    Quando Mariana abre a aba de transferências de dezembro em 375px no tema escuro
    Então a tela de transferências não tem rolagem horizontal nem erros de console

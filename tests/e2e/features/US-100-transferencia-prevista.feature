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

  # US-101b: transferência mensal (série) pela tela Previstas
  Cenário: Transferência mensal: criar, efetivar uma e encerrar
    Quando Mariana cadastra a transferência mensal de "R$ 500,00" de "Itaú" para "Poupança" no dia 15
    Então a aba de transferências lista "Itaú" para "Poupança" de "500,00" com o selo "Todo mês"
    E a família tem 12 ocorrências mensais e os saldos de "Itaú" e "Poupança" seguem "5.000,00" e "1.000,00"
    Quando Mariana efetiva a transferência prevista pela tela
    Então a transferência prevista aparece "Efetivada" sem ações de edição
    Quando Mariana encerra a transferência mensal
    Então a família não tem ocorrência mensal pendente e a efetivada permanece

  Cenário: Editar a série mostra o impacto antes de salvar e vale para as próximas
    Quando Mariana cadastra a transferência mensal de "R$ 500,00" de "Itaú" para "Poupança" no dia 15
    E Mariana efetiva a transferência prevista pela tela
    E Mariana abre "Editar série" da transferência mensal
    Então o impacto da série mostra "Muda 11; ficam 1 efetivada e 0 alteradas"
    Quando Mariana salva a série com o valor "R$ 600,00"
    Então a ocorrência de janeiro de 2027 mostra "600,00" e a efetivada segue "500,00"

  Cenário: Conta com série ativa não arquiva; encerrar a série libera
    Dado a conta "Reserva" sem saldo
    Quando Mariana cadastra a transferência mensal de "R$ 100,00" de "Reserva" para "Poupança" no dia 15
    E Mariana abre o arquivamento da conta "Reserva"
    Então o diálogo mostra "Encerre a transferência mensal ou troque a conta"
    E o botão de arquivar conta está desabilitado
    Quando Mariana encerra a transferência mensal
    E Mariana abre o arquivamento da conta "Reserva"
    Então o botão de arquivar conta está habilitado
    Quando Mariana arquiva a conta aberta
    Então a conta "Reserva" está arquivada

  Cenário: Lucas, segundo membro, edita a série de Mariana, vê o conflito e não vê a série de outra família
    Dado uma transferência mensal de "R$ 500,00" de "Itaú" para "Poupança" criada por Mariana
    E outra família com uma transferência mensal própria
    Quando Lucas abre a aba de transferências de dezembro
    Então a aba de transferências lista só "Itaú" para "Poupança" de "500,00"
    Quando Lucas abre "Editar série" da transferência mensal
    E Mariana altera a série enquanto Lucas edita
    E Lucas salva a série com o valor "R$ 700,00"
    Então o aviso mostra "alterada por Mariana"

  Cenário: Cadastro mensal no celular e no tema escuro sem rolagem horizontal nem erros de console
    Quando Mariana abre o cadastro da transferência mensal em 375px no tema escuro
    Então a tela de transferências não tem rolagem horizontal nem erros de console

# language: pt
Funcionalidade: Desfazer transferência/acerto e aviso de mês acertado

  Cenário: Aviso em mês já acertado
    Dado que outubro foi quitado
    Quando edito o valor de uma despesa comum de outubro
    Então vejo "Este mês já foi acertado. O saldo do acerto será recalculado." e posso confirmar

  Cenário: Desfazer um acerto
    Dado um acerto registrado de "R$ 400,00"
    Quando escolho "Desfazer acerto" e confirmo
    Então as duas pernas são estornadas e o painel volta a exibir "Lucas deve R$ 400,00 para Mariana"

  Cenário: Transferência não é editável
    Dado uma transferência entre contas
    Quando abro o detalhe de uma transferência
    Então não há "Editar", apenas "Desfazer transferência"

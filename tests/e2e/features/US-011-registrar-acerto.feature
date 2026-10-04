# language: pt
Funcionalidade: Registro do acerto de contas

  Contexto:
    Dado o acerto de outubro: "Lucas deve R$ 400,00 para Mariana"

  Cenário: Quitar integralmente
    Quando Lucas toca em "Registrar acerto" e escolhe a conta origem "Itaú Lucas" e a conta destino "Nubank Mariana"
    E confirma o valor sugerido de "R$ 400,00"
    Então "Itaú Lucas" é debitada em "R$ 400,00" e "Nubank Mariana" é creditada em "R$ 400,00"
    E a transferência é marcada como "Acerto de contas - Outubro"
    E o painel passa a exibir "Tudo certo neste mês"

  Cenário: Acerto parcial
    Quando Lucas registra "R$ 150,00" como acerto
    Então o painel exibe "Lucas deve R$ 250,00 para Mariana"

  Cenário: Valor acima do devido
    Quando Lucas informa "R$ 500,00" no acerto
    Então vê "O valor não pode ser maior que o devido (R$ 400,00)" e nada é registrado

  Cenário: Acerto não distorce receitas e despesas
    Dado que o acerto de "R$ 400,00" foi registrado
    Quando consulto totais de despesas e receitas após o acerto
    Então o acerto não é contabilizado em nenhum deles

  Cenário: Histórico do acerto
    Dado que o acerto de "R$ 400,00" foi registrado
    Quando abro o painel após o acerto
    Então vejo "Lucas transferiu R$ 400,00 para Mariana em 04/10" com as contas usadas

  Cenário: Nova despesa comum após o acerto
    Dado que o mês foi quitado
    Quando Mariana lança nova despesa comum de "R$ 200,00"
    Então o painel exibe "Lucas deve R$ 100,00 para Mariana"

  Cenário: Duplo clique não duplica
    Quando preencho o acerto e toco duas vezes em "Confirmar acerto"
    Então apenas um acerto é registrado

  Cenário: Origem igual ao destino
    Quando escolho a mesma conta nos dois campos do acerto
    Então vejo "Escolha contas diferentes"

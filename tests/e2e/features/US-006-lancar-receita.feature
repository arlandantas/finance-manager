# language: pt
Funcionalidade: Lançamento de receita

  Cenário: Registrar salário
    Dado a conta "Itaú Mariana" com saldo "R$ 1.500,00"
    Quando Mariana alterna para "Nova Receita", digita "R$ 5.000,00", escolhe "Salário" e salva
    Então a receita é registrada com autor e responsável "Mariana"
    E o saldo de "Itaú Mariana" passa a "R$ 6.500,00"

  Cenário: Receita em nome de outro membro
    Quando Lucas lança "R$ 300,00" em "Outras receitas" com "Quem recebeu: Mariana"
    Então o autor é "Lucas" e o responsável pelo recebimento é "Mariana"

  Cenário: Interface de receita não exibe divisão
    Quando abro o lançamento no modo "Nova Receita"
    Então o switch "Dividir com a família" não é exibido
    E as categorias exibidas são as de receita

  Cenário: Valor inválido
    Quando tento salvar a receita com "R$ 0,00"
    Então vejo "Informe um valor maior que zero"

  Cenário: Duplo clique não duplica
    Quando toco duas vezes em "Salvar Receita"
    Então apenas uma receita é registrada

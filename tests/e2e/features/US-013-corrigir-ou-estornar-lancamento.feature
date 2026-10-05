# language: pt
Funcionalidade: Correção e exclusão de lançamentos

  Cenário: Corrigir valor
    Dado a despesa de "R$ 150,50" em "Nubank Conjunta" (saldo "R$ 849,50")
    Quando Mariana altera o valor para "R$ 105,50" e salva
    Então o saldo da conta passa a "R$ 894,50"
    E o detalhe mostra "Editado por Mariana"

  Cenário: Trilha de auditoria
    Dado a despesa de "R$ 150,50" em "Nubank Conjunta" (saldo "R$ 849,50") corrigida por Mariana para "R$ 105,50"
    Quando abro o histórico do lançamento
    Então vejo cada alteração com autor, data/hora, campo, valor anterior e valor novo

  Cenário: Excluir com confirmação
    Dado a despesa de "R$ 150,50" em "Nubank Conjunta" (saldo "R$ 849,50")
    Quando Lucas escolhe "Excluir" e confirma "Excluir lançamento?"
    Então o lançamento some do extrato e o saldo da conta é restabelecido
    E ele passa a constar em "Mostrar excluídos"

  Cenário: Restaurar lançamento excluído
    Dado um lançamento excluído
    Quando restauro o lançamento clicando em "Restaurar"
    Então ele volta ao extrato e ao saldo da conta

  Cenário: Conflito de edição
    Dado que Mariana e Lucas abriram o mesmo lançamento
    E Mariana salvou uma alteração
    Quando Lucas tenta salvar a sua
    Então Lucas vê o conflito "Este lançamento foi alterado por Mariana. Recarregue para continuar."
    E sua alteração não é gravada

  Cenário: Acerto de contas recalculado
    Dado "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana" no painel
    Quando a despesa comum de Mariana de "R$ 400,00" é excluída
    Então o painel exibe "Para equilibrar o mês: Lucas transfere R$ 200,00 para Mariana"

  Cenário: Validações da edição
    Dado a despesa de "R$ 150,50" em "Nubank Conjunta" (saldo "R$ 849,50")
    Quando altero o valor para "R$ 0,00"
    Então vejo "Informe um valor maior que zero" e a alteração não é salva

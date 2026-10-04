# language: pt
Funcionalidade: Baixa de despesa prevista

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E os membros "Mariana" e "Lucas"
    E a despesa prevista "Condomínio" de "R$ 650,00" na categoria "Moradia" com vencimento em 10/11/2026 e responsável "Lucas"
    E a despesa prevista "Condomínio" de "R$ 650,00" com vencimento em 10/12/2026
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Dar baixa com a conta e a data
    Quando Lucas dá baixa em "Condomínio" de novembro escolhendo a conta "Itaú Lucas" e a data de hoje
    Então a despesa de novembro fica "Pago"
    E o saldo de "Itaú Lucas" passa a "R$ 2.350,00"
    E aparece o aviso "Pagamento registrado com sucesso!"

  Cenário: Valor efetivo diferente do previsto
    Quando Lucas dá baixa em "Condomínio" de novembro pagando "R$ 682,50" pela conta "Itaú Lucas"
    Então o saldo de "Itaú Lucas" passa a "R$ 2.317,50"
    E a previsão mostra "Previsto R$ 650,00 · Pago R$ 682,50" com a diferença "+R$ 32,50"

  Cenário: A baixa gera a despesa real
    Quando Lucas dá baixa em "Condomínio" de novembro pagando "R$ 682,50" pela conta "Itaú Lucas" em 10/11/2026
    Então o extrato mostra uma despesa de "R$ 682,50" na categoria "Moradia" em 10/11/2026 na conta "Itaú Lucas"
    E o total de despesas de novembro aumenta "R$ 682,50"

  Cenário: Quem pagou padrão é o responsável
    Quando Lucas dá baixa sem alterar quem pagou
    Então a despesa gerada tem "Pago por Lucas"

  Cenário: Outro membro paga a conta
    Quando Lucas dá baixa escolhendo "Quem pagou: Mariana"
    Então a despesa gerada tem autor "Lucas" e "Pago por Mariana"

  Cenário: Despesa comum entra no acerto pelo valor efetivo
    Dado a regra de divisão "igualitária"
    Quando Lucas dá baixa em "Condomínio" pagando "R$ 682,50"
    Então o acerto de novembro considera "R$ 682,50" pago por Lucas

  Cenário: Despesa pessoal fica fora do acerto
    Dado a previsão "Plano de saúde de Lucas" de "R$ 300,00" marcada como pessoal
    Quando Lucas dá baixa nela
    Então o acerto de novembro não muda

  Cenário: Previsão do mês seguinte permanece intacta
    Quando Lucas dá baixa em "Condomínio" de novembro
    Então a despesa de 10/12/2026 continua "Previsto" com valor "R$ 650,00"

  Cenário: Conta obrigatória
    Quando Lucas tenta confirmar a baixa sem escolher a conta
    Então vê "Escolha a conta do pagamento"
    E nada é registrado

  Cenário: Valor efetivo inválido
    Quando Lucas informa o valor pago "R$ 0,00"
    Então vê "Informe um valor maior que zero"

  Cenário: Data do pagamento no futuro
    Quando Lucas escolhe, para a baixa, uma data posterior a hoje
    Então vê "A data do pagamento não pode ser futura"

  Cenário: Data retroativa
    Quando Lucas dá baixa com a data 08/11/2026
    Então a despesa gerada tem a data 08/11/2026

  Cenário: Conta ficará negativa
    Dado que o saldo de "Itaú Lucas" é "R$ 100,00"
    Quando Lucas escolhe "Itaú Lucas" para pagar "R$ 650,00"
    Então vê o aviso "A conta de origem ficará negativa" com o botão "Confirmar mesmo assim"
    E ao confirmar o saldo da conta passa a "-R$ 550,00"

  @integration
  Cenário: Baixa única
    Dado que a despesa de novembro já está "Pago" e a tela de Lucas foi atualizada
    Quando Lucas tenta dar baixa de novo com a versão atual da previsão
    Então vê "Esta despesa prevista já foi paga"
    E nada é debitado

  Cenário: Duplo clique não paga duas vezes
    Quando Lucas toca duas vezes rapidamente em "Confirmar pagamento"
    Então apenas uma despesa é gerada
    E a conta é debitada uma única vez

  Cenário: Conflito de baixa simultânea
    Dado que Lucas e Mariana abriram a baixa de "Condomínio" de novembro
    Quando Mariana confirma a baixa
    E Lucas tenta confirmar a baixa
    Então Lucas vê "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar."
    E apenas um débito existe

  Cenário: Previsão paga fica travada
    Dado que a despesa de novembro está "Pago"
    Quando Lucas abre a previsão
    Então não vê "Editar" nem "Excluir", só "Desfazer pagamento"

  Cenário: Desfazer o pagamento
    Dado que Lucas deu baixa em "Condomínio" pagando "R$ 682,50" pela conta "Itaú Lucas"
    Quando Lucas toca em "Desfazer pagamento" e confirma
    Então o saldo de "Itaú Lucas" volta a "R$ 3.000,00"
    E a previsão volta a "Previsto" com valor "R$ 650,00"
    E a despesa de "R$ 682,50" some do extrato e do acerto

  Cenário: Despesa gerada não pode ser excluída pelo extrato
    Dado a despesa gerada pela baixa de "Condomínio"
    Quando Lucas tenta excluí-la pelo extrato
    Então vê "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento."

  Cenário: Corrigir o valor da despesa gerada atualiza a previsão
    Dado a despesa gerada pela baixa de "Condomínio" de "R$ 682,50"
    Quando Lucas corrige o valor no extrato para "R$ 680,00"
    Então a previsão mostra "Pago R$ 680,00" com a diferença "+R$ 30,00"

  Cenário: Falha de rede ao dar baixa
    Dado que não há conexão
    Quando Lucas confirma a baixa
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."

  @integration
  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a previsão "Aluguel"
    Quando Lucas tenta dar baixa nela por endereço direto
    Então vê "Não encontrado"

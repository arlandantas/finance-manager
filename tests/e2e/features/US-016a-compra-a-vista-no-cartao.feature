# language: pt
Funcionalidade: Compra à vista no cartão

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 15/10/2026
    E Lucas está autenticado

  Cenário: Compra no cartão com sucesso
    Quando Lucas toca em "+", digita "R$ 300,00", escolhe "Supermercado", escolhe "Pagar com: Nubank Mariana" e toca em "Salvar Despesa"
    Então a despesa é registrada com autor "Lucas", quem pagou "Lucas", cartão "Nubank Mariana" e data de hoje
    E aparece o aviso "Despesa registrada com sucesso!"
    E o saldo de "Itaú Lucas" continua "R$ 3.000,00"
    E o limite disponível do cartão passa a "R$ 4.700,00"

  Cenário: A compra entra na fatura aberta
    Quando Lucas lança "R$ 300,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "out/2026" que fecha em 25/10 e vence em 05/11

  Cenário: Compra no dia do fechamento fica na fatura que fecha
    Dado que hoje é 25/10/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "out/2026"

  Cenário: Compra depois do fechamento vai para a próxima fatura
    Dado que hoje é 26/10/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "nov/2026" que fecha em 25/11 e vence em 05/12

  Cenário: Compra no fim do ano cai na fatura de janeiro
    Dado que hoje é 26/12/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "jan/2027" que fecha em 25/01 e vence em 05/02

  Cenário: Data retroativa muda a fatura
    Dado que hoje é 28/10/2026
    Quando Lucas lança "R$ 100,00" no cartão com a data 20/10/2026
    Então a compra está na fatura de "out/2026"

  Cenário: Registrar a compra em nome de outro membro
    Quando Lucas lança "R$ 350,00" em "Supermercado" no cartão "Nubank Mariana" e escolhe "Quem pagou: Mariana"
    Então o autor é "Lucas" e quem pagou é "Mariana"

  Cenário: Compra pessoal no cartão
    Quando Lucas lança "R$ 80,00" em "Lazer e restaurantes" no cartão com "Dividir com a família" desligado
    Então a compra é registrada como pessoal
    E não entra no acerto de contas

  Cenário: Compra compartilhada no cartão entra no acerto pela data da compra
    Dado a regra de divisão "igualitária"
    E que Mariana lançou "R$ 300,00" em "Supermercado" no cartão "Nubank Mariana" em 15/10/2026
    Quando abro o acerto de outubro
    Então vejo "Para equilibrar o mês: Lucas transfere R$ 150,00 para Mariana"

  Cenário: Compra no cartão entra nos totais do mês
    Quando Lucas lança "R$ 300,00" no cartão "Nubank Mariana"
    Então o total de despesas de outubro no extrato e na Home aumenta "R$ 300,00"
    E o saldo da família não muda

  Cenário: Compra acima do limite disponível
    Dado que o limite disponível do cartão é "R$ 100,00"
    Quando Lucas tenta salvar uma compra de "R$ 300,00" no cartão
    Então vê o aviso "Esta compra ultrapassa o limite disponível do cartão" com o botão "Confirmar mesmo assim"
    E ao confirmar a compra é registrada
    E o limite disponível passa a "-R$ 200,00"

  Cenário: Valor obrigatório e positivo
    Quando Lucas tenta salvar no cartão com valor "R$ 0,00"
    Então vê "Informe um valor maior que zero"
    E nada é registrado

  Cenário: Data futura não é permitida no cartão
    Quando Lucas escolhe, para uma compra no cartão, uma data posterior a hoje
    Então vê "A data da compra não pode ser futura"

  Cenário: Meio de pagamento padrão é o último usado
    Dado que a última despesa de Lucas foi no cartão "Nubank Mariana"
    Quando Lucas toca em "+"
    Então "Pagar com" vem com "Nubank Mariana"

  Cenário: Receita só aceita contas
    Quando Lucas alterna para "Nova Receita"
    Então o seletor "Receber em" lista apenas contas, sem cartões

  Cenário: Família sem cartões
    Dado que a família não tem cartões
    Quando Lucas toca em "+"
    Então o seletor lista apenas as contas e mostra o atalho "Cadastrar cartão"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa" para uma compra de "R$ 300,00" no cartão
    Então apenas uma compra é registrada
    E o limite disponível é reduzido uma única vez

  Cenário: Compra aparece no extrato
    Dado uma compra de "R$ 300,00" no cartão "Nubank Mariana"
    Quando abro o extrato
    Então a linha mostra "Nubank Mariana" no lugar da conta e o marcador "Cartão"
    E mostra a fatura "out/2026"

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar Despesa" para uma compra no cartão
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

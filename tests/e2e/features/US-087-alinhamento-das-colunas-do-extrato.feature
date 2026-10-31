# language: pt
Funcionalidade: Alinhamento das colunas do Extrato

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada
    E o Extrato de outubro tem despesa, receita, parcela "2/10", transferência, acerto e pagamento de fatura

  Cenário: Valores alinhados à direita na mesma coluna
    Quando Mariana confere o Extrato de outubro
    Então os valores de todas as linhas terminam na mesma posição horizontal

  Cenário: Datas na mesma coluna
    Quando Mariana confere o Extrato de outubro
    Então a data de todas as linhas começa na mesma posição horizontal

  Cenário: Selos e tags não deslocam as colunas
    Dado que uma despesa tem 3 tags, o selo "Pessoal" e o selo "via assistente"
    Quando Mariana confere o Extrato de outubro
    Então o valor dessa linha continua alinhado com os das demais

  Cenário: Linha de parcela alinhada
    Quando Mariana confere o Extrato de outubro
    Então a parcela "2/10" ocupa as mesmas colunas de uma despesa comum

  Cenário: Tela estreita
    Dado que a tela tem 375 pixels de largura
    Quando Mariana confere o Extrato de outubro
    Então os valores de todas as linhas terminam na mesma posição horizontal
    E não há rolagem horizontal no Extrato

  Cenário: Descrição longa
    Dado uma despesa com descrição de 120 caracteres
    Quando Mariana confere o Extrato de outubro
    Então a descrição é truncada com reticências
    E os valores de todas as linhas terminam na mesma posição horizontal

# language: pt
Funcionalidade: Tags livres no lançamento (US-045)

  Contexto:
    Dado a família "Silva" com a conta "Nubank Conjunta" com saldo "R$ 1.000,00" para tags
    E Mariana está autenticada no formulário "Nova despesa"

  Cenário: Lançar sem tag continua igual
    Quando Mariana lança "R$ 80,00" em "Saúde" sem tocar nas tags
    Então a despesa é registrada sem tags

  Cenário: Criar uma tag ao digitar
    Quando Mariana lança "Hotel" de "R$ 800,00" em "Lazer e restaurantes" com a tag "viagem-nordeste"
    Então o Extrato mostra "Hotel" com a tag "viagem-nordeste"

  Cenário: Sugestão das tags existentes
    Dado a tag "viagem-nordeste" já usada em outro lançamento
    Quando Mariana digita "via" no campo de tag
    Então vê a sugestão de tag "viagem-nordeste"

  @integration
  Cenário: Mesma tag com outra caixa reaproveita a existente
    Dado a tag "Viagem" já existente na família
    Quando Mariana lança "Hotel" de "R$ 800,00" em "Lazer e restaurantes" com a tag "viagem"
    Então o lançamento "Hotel" fica com a tag "Viagem"
    E não existe uma segunda tag "viagem"

  @integration
  Cenário: Acentos não criam tag duplicada
    Dado a tag "Café" já existente na família
    Quando Mariana lança "Padaria" de "R$ 20,00" em "Supermercado" com a tag "cafe"
    Então o lançamento "Padaria" fica com a tag "Café"

  Cenário: Vários nomes em um lançamento
    Quando Mariana lança "Passagem" de "R$ 600,00" em "Transporte" com as tags "viagem-nordeste" e "ferias"
    Então o Extrato mostra as duas tags em "Passagem"

  Cenário: Quarta tag gera só um aviso
    Quando Mariana preenche "Hotel" de "R$ 800,00" em "Lazer e restaurantes" com 3 tags e acrescenta uma quarta
    Então vê o aviso de tags "Muitas tags dificultam a análise"
    E consegue salvar mesmo assim

  Cenário: Nome de tag inválido
    Quando Mariana digita a tag "a" e confirma
    Então vê o erro de tag "A tag precisa ter entre 2 e 30 caracteres"

  Cenário: Caractere não permitido na tag
    Quando Mariana digita a tag "viagem*" e confirma
    Então vê o erro de tag "A tag só pode ter letras, números, hífen, ponto e sublinhado"

  @integration
  Cenário: Transferência não tem tags
    Quando Mariana abre o formulário "Transferir entre contas"
    Então não vê o campo de tags

  @integration
  Cenário: Receita aceita tags
    Quando Mariana troca para "Nova receita"
    Então vê a ação "+ Tag" no formulário

  @integration
  Cenário: Compra parcelada aplica a tag a todas as parcelas
    Dado o cartão "Nubank Lucas" cadastrado para tags
    Quando Mariana lança "Notebook" de "R$ 2.500,00" parcelado em "10x" com a tag "escritorio"
    Então as 10 parcelas mostram a tag "escritorio"

  Cenário: Editar as tags de um lançamento
    Dado um lançamento "Hotel" com a tag "viagem-nordeste"
    Quando Mariana troca a tag de "Hotel" para "ferias" e salva
    Então o Extrato mostra "Hotel" com a tag "ferias"

  @integration
  Cenário: Editar tag de uma compra parcelada vale para todas as parcelas
    Dado o cartão "Nubank Lucas" cadastrado para tags
    E a compra "Notebook" de "R$ 2.500,00" em "10x" sem tags
    Quando Mariana adiciona a tag "trabalho" à parcela "3/10"
    Então as 10 parcelas mostram a tag "trabalho"

  Cenário: Falha de rede ao salvar com tag
    Dado que não há conexão para salvar
    Quando Mariana salva um lançamento com a tag "ferias"
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E a tag "ferias" continua no formulário

  @integration
  Cenário: Tag não muda o acerto
    Dado a regra de divisão igual
    Quando Mariana lança "Mercado" de "R$ 300,00" dividindo com a família e com a tag "festa"
    Então o acerto considera exatamente o mesmo valor que consideraria sem a tag

  @integration
  Cenário: Editar tag em mês acertado não pede desfazer o acerto
    Dado que o mês de setembro de 2026 tem um acerto registrado
    Quando Mariana altera só a tag de uma despesa de setembro
    Então a alteração é salva sem o aviso de mês acertado

  @integration
  Cenário: Editar tag de despesa em fatura paga
    Dado uma compra "Hotel" no cartão em fatura já paga
    Quando Mariana altera só a tag de "Hotel" para "ferias"
    Então a alteração é salva

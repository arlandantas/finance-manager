# language: pt
Funcionalidade: Detalhe da transação na Home

  Contexto:
    Dado a família do detalhe com a despesa "Mercado do bairro" de "R$ 150,50" paga por Lucas e Lucas na Home

  Cenário: Tocar no lançamento abre o detalhe sem sair da Home
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    Então o detalhe mostra "R$ 150,50", "Supermercado", "Nubank Mariana" e "Pago por Lucas"
    E a Home continua aberta por trás com "tx" no endereço

  Cenário: Ações visíveis e link para o Extrato com destaque
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    Então vê os botões "Editar", "Excluir" e "Histórico" do detalhe
    Quando Lucas segue o link "Ver no Extrato" do detalhe
    Então o Extrato mostra "Mercado do bairro" em destaque

  Cenário: Editar a partir do detalhe atualiza a Home
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    E Lucas edita o valor do detalhe para "R$ 160,00"
    Então o detalhe da Home mostra "R$ 160,00"

  Cenário: Excluir com desfazer por pelo menos 8 segundos
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    E Lucas exclui pelo detalhe
    Então "Mercado do bairro" sai dos últimos lançamentos
    E o aviso "Despesa excluída" tem "Desfazer" por pelo menos 8 segundos

  Cenário: Histórico de alterações
    Dado que a despesa foi corrigida uma vez por Mariana
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    E Lucas abre o histórico do detalhe
    Então o histórico mostra uma alteração de "Mariana"

  Cenário: Destaque de lançamento inexistente é ignorado
    Quando Lucas abre o Extrato com destaque de um lançamento que não existe
    Então o Extrato abre sem nenhum item em destaque

  Cenário: Detalhe legível em 375 px e 1280 px
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    Então o detalhe não gera rolagem horizontal em 375 e 1280 px e os botões têm 44 px

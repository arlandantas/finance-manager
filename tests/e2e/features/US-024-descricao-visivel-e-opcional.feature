# language: pt
Funcionalidade: Descrição visível e opcional

  Contexto:
    Dado a conta "Nubank Conjunta" da família com saldo "R$ 1.000,00"
    E Lucas está autenticado

  Cenário: Campo de descrição visível sem abrir Mais detalhes
    Quando Lucas abre o formulário de nova despesa para a descrição
    Então vê o campo "Descrição (opcional)" sem abrir "Mais detalhes"

  Cenário: Salvar com descrição
    Quando Lucas lança "R$ 150,50" em "Supermercado" com a descrição "Mercado do bairro"
    Então o Extrato mostra "Mercado do bairro" como descrição da despesa

  Cenário: Descrição vazia assume a categoria
    Quando Lucas lança "R$ 150,50" em "Supermercado" com a descrição ""
    Então o Extrato mostra "Supermercado" como descrição da despesa

  Cenário: Descrição só com espaços equivale a vazia
    Quando Lucas lança "R$ 20,00" em "Lazer e restaurantes" com a descrição "   "
    Então o Extrato mostra "Lazer e restaurantes" como descrição da despesa

  Cenário: Descrição curta demais
    Quando Lucas abre o formulário de nova despesa para a descrição
    E Lucas preenche a descrição "a"
    Então vê o erro de descrição "A descrição precisa ter entre 2 e 100 caracteres"
    E o botão "Salvar Despesa" fica desabilitado

  Cenário: Descrição longa demais
    Quando Lucas abre o formulário de nova despesa para a descrição
    E Lucas informa uma descrição com 101 caracteres
    Então vê o erro de descrição "A descrição precisa ter entre 2 e 100 caracteres"

  Cenário: Foco continua no valor
    Quando Lucas abre o formulário de nova despesa para a descrição
    Então o foco da descrição está no campo de valor

  Cenário: Lançamento rápido continua com quatro toques
    Quando Lucas lança "R$ 80,00" em "Saúde" sem tocar na descrição
    Então o Extrato mostra "Saúde" como descrição da despesa

  Cenário: Busca por descrição encontra o lançamento
    Dado despesas "Mercado do bairro" de "R$ 150,50" e "Padaria" de "R$ 20,00" em 03/10/2026
    Quando Lucas busca "bairro" no Extrato
    Então a lista mostra só "Mercado do bairro" e o endereço guarda a busca

  Cenário: Busca curta pede ao menos 2 letras
    Dado despesas "Mercado do bairro" de "R$ 150,50" e "Padaria" de "R$ 20,00" em 03/10/2026
    Quando Lucas busca "a" no Extrato
    Então vê a dica "Digite ao menos 2 letras" e a lista não é filtrada

# language: pt
Funcionalidade: Desfazer uma importação de fatura

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E a fatura "out/2026" com total "R$ 1.200,00"
    E hoje é 28/10/2026
    E Lucas está autenticado

  Cenário: Importar, ver o selo e desfazer o lote inteiro
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o CSV da fatura com duas compras e um estorno
    E confirma a importação
    Então vê o aviso "2 itens importados" e a fatura "out/2026" com total "R$ 1.430,00"
    E vê o selo "Importado da fatura" em 2 compras
    E a seção "Importações" lista 1 importação com "2 itens"
    Quando desfaz a importação e confirma
    Então vê a fatura "out/2026" com total "R$ 1.200,00"
    E a importação aparece como "Revertida em"
    E nenhuma compra importada segue ativa

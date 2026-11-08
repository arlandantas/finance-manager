# language: pt
Funcionalidade: Importar fatura (enviar, revisar e confirmar)

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E a fatura "out/2026" com total "R$ 1.200,00"
    E hoje é 28/10/2026
    E Lucas está autenticado

  @mobile
  Cenário: Importar um CSV na fatura (fluxo feliz)
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o CSV da fatura com duas compras e um estorno
    Então vê os grupos "Compras" e "Estornos e créditos"
    E na revisão "Selecionados" mostra "R$ 230,00"
    Quando desmarca o item "POSTO IPIRANGA"
    Então na revisão "Selecionados" mostra "R$ 150,00"
    Quando confirma a importação
    Então vê o aviso "1 item importado" e a fatura "out/2026" com total "R$ 1.350,00"

  Cenário: Editar o valor atualiza os selecionados e a diferença
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o CSV da fatura com duas compras e um estorno
    E altera o valor do item "MERCADO BOM PRECO" para "R$ 100,00"
    Então na revisão "Selecionados" mostra "R$ 180,00"

  Cenário: PDF mostra o que vai à IA antes de extrair e importa com o provedor simulado
    Dado a importação por IA está ligada para a família
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o PDF da fatura
    Então vê o aviso "O conteúdo destas linhas vai à Anthropic (EUA)" com as linhas a enviar
    E só a pré-visualização foi chamada
    Quando toca no botão "Extrair com IA"
    Então vê os grupos "Compras"
    Quando confirma a importação
    Então vê o aviso "2 itens importados" e a fatura "out/2026" com total "R$ 1.403,45"

  Cenário: PDF sem consentimento convida a enviar o CSV
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o PDF da fatura
    Então vê "Indisponível: envie o CSV."
    E a extração não foi chamada

  Cenário: Arquivo de outro formato é recusado
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia um arquivo de texto qualquer
    Então vê "Formato não aceito. Envie PDF ou CSV."

  Cenário: Fatura paga não oferece a importação
    Quando Lucas paga a fatura "out/2026"
    E Lucas abre a fatura "out/2026"
    Então não oferece o link "Importar fatura"

  Cenário: Sair da revisão não grava nada
    Quando Mariana abre a fatura "out/2026" e toca em "Importar fatura"
    E envia o CSV da fatura com duas compras e um estorno
    E cancela a revisão e confirma a saída
    Então vê a fatura "out/2026" com total "R$ 1.200,00"
    E nenhuma compra foi importada

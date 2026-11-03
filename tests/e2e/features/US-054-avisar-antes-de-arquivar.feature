# language: pt
Funcionalidade: Avisar antes de arquivar e botão flutuante que não cobre ações

  Contexto:
    Dado a família com o cartão "Nubank Lucas" (compras pagas) e o cartão "Cartão novo" (sem compras)

  Cenário: Fatura não paga e parcelas futuras aparecem juntas e travam a confirmação
    Dado uma fatura fechada de "R$ 479,00" do "Nubank Lucas" ainda não paga
    E parcelas futuras de "R$ 800,00" no "Nubank Lucas"
    Quando Mariana abre o arquivamento do cartão "Nubank Lucas"
    Então vê o bloqueio de cartão "Pague a fatura antes de arquivar o cartão"
    E o diálogo de arquivar mostra "Fatura não paga" com "R$ 479,00"
    E o diálogo de arquivar mostra "Parcelas futuras" com "R$ 800,00"
    E o diálogo de arquivar tem o link "Ver fatura"
    E o botão de confirmar arquivamento está desabilitado

  Cenário: Cartão sem impedimentos arquiva normalmente
    Quando Mariana abre o arquivamento do cartão "Cartão novo"
    Então o botão de confirmar arquivamento está habilitado
    Quando Mariana confirma o arquivamento
    Então vê o aviso de cartão "Cartão arquivado"

  Cenário: Impedimento surgido depois de abrir o diálogo aparece no 422
    Quando Mariana abre o arquivamento do cartão "Cartão novo"
    E surge uma compra de "R$ 90,00" na fatura aberta do "Cartão novo"
    E Mariana confirma o arquivamento
    Então vê o bloqueio de cartão "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar."

  Cenário: Última linha de Contas, Cartões e arquivadas fica acima do botão flutuante
    Dado vários cartões e contas e um cartão arquivado
    Quando Mariana abre a lista de cartões no celular
    Então as ações do último cartão e o "Reativar" do arquivado ficam visíveis e tocáveis
    Quando Mariana abre a lista de contas no celular
    Então as ações da última conta e o Reativar da arquivada ficam visíveis e tocáveis

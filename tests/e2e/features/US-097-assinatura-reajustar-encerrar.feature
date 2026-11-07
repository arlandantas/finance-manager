# language: pt
Funcionalidade: Reajustar e encerrar a assinatura

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E hoje é 05/11/2026
    E Lucas está autenticado
    E a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    E hoje passa a ser 10/11/2026

  Cenário: Reajustar a partir de dezembro avisa o impacto e não reescreve o passado
    Dado Lucas recarrega a tela do cartão
    Quando Lucas abre a assinatura "Netflix"
    E Lucas altera o valor para "R$ 59,90" a partir de "Dezembro de 2026"
    Então o aviso de impacto é "Muda as próximas cobranças; 1 já lançada fica"
    Quando Lucas salva as alterações da assinatura
    Então a família tem a assinatura "Netflix" com 2 valores, o último "R$ 59,90" a partir de "2026-12"
    E a cobrança de nov/2026 de "Netflix" continua em "R$ 55,90"

  Cenário: Encerrar mantém as cobranças já lançadas
    Dado Lucas recarrega a tela do cartão
    Quando Lucas abre a assinatura "Netflix"
    E Lucas pede para encerrar a assinatura
    Então a confirmação de encerrar a assinatura diz "As cobranças já lançadas ficam no Extrato."
    Quando Lucas confirma o encerramento
    Então o bloco de assinaturas mostra "Nenhuma assinatura neste cartão"
    E a assinatura "Netflix" da família está encerrada e a cobrança lançada continua

  Cenário: Cobrança corrigida no Extrato ganha o selo alterada
    Dado a cobrança de nov/2026 de "Netflix" foi corrigida no Extrato
    Quando Lucas abre o Extrato para ver a assinatura
    Então a linha "Netflix" do Extrato tem o selo "alterada"

  @integration
  Cenário: Quem não controla a assinatura "Só meu" alheia é barrado
    Dado a assinatura "Netflix" passa a ser de Mariana
    E Lucas recarrega a tela do cartão
    Quando Lucas abre a assinatura "Netflix"
    E Lucas altera o valor para "R$ 59,90" a partir de "Dezembro de 2026"
    E Lucas tenta salvar as alterações da assinatura
    Então o aviso de erro diz "Só Mariana pode alterar este lançamento."
    E a família tem a assinatura "Netflix" com 1 valores, o último "R$ 55,90" a partir de "2026-11"

  Cenário: Edição da assinatura cabe em 375 px no tema escuro
    Dado a tela tem 375 por 800 pixels
    E o tema do sistema é escuro
    E Lucas recarrega a tela do cartão
    Quando Lucas abre a assinatura "Netflix"
    E Lucas altera o valor para "R$ 59,90" a partir de "Dezembro de 2026"
    Então a edição da assinatura não tem rolagem horizontal e não há erros no console

# language: pt
Funcionalidade: Compra parcelada dividida entra no acerto por parcela (US-042)

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com fechamento dia 25, vencimento dia 5 e limite de "R$ 5.000,00"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Dividir a compra parcelada e ver a parcela no acerto de novembro
    Dado que Lucas informa "Geladeira" de "R$ 3.000,00" em "3x"
    Quando Lucas escolhe dividir "Pela regra da família" e salva a compra parcelada
    E Lucas abre o acerto de nov/2026 e as despesas comuns
    Então o acerto lista "Geladeira 1/3" com "R$ 1.000,00"
    E Lucas pagou "R$ 1.000,00" no acerto de nov/2026

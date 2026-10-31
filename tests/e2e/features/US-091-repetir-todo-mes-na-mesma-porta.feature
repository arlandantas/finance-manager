# language: pt
Funcionalidade: Repetir todo mês na mesma porta

  Contexto:
    Dado a porta com a família "Família Silva", a conta "Corrente" e os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Criar a série pela porta única
    Dado que Mariana abre a porta de lançar
    E Mariana seleciona "Vai acontecer"
    Quando Mariana informa "Internet" de "R$ 120,00", dia 10, "Pagar com: Corrente" e repete todo mês sem fim
    E salva a previsão
    Então a série "Internet" aparece em "Previstas"
    E as próximas ocorrências de "Internet" aparecem em "A pagar"

  Cenário: Série exige conta de pagamento
    Dado que Mariana abre a porta de lançar
    E Mariana seleciona "Vai acontecer"
    E Mariana ativa "Repetir: Todo mês" com "Internet" e "R$ 120,00"
    Quando Mariana tenta salvar sem "Pagar com"
    Então a porta mostra "Séries exigem conta de pagamento"

  Cenário: Repetir não existe em Já aconteceu
    Dado que Mariana abre a porta de lançar
    Quando Mariana seleciona "Já aconteceu"
    Então a opção "Repetir" não aparece

  Cenário: Resumo do efeito
    Dado que Mariana abre a porta de lançar
    E Mariana seleciona "Vai acontecer"
    Quando Mariana ativa "Repetir: Todo mês" com "Internet" e "R$ 120,00"
    Então a porta mostra "as próximas 12 aparecem em A pagar"

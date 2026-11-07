# language: pt
Funcionalidade: Lançar ou prever na mesma porta

  Contexto:
    Dado a porta com a família "Família Silva", a conta "Corrente" e os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Padrão é lançar o que já aconteceu
    Quando Mariana abre a porta de lançar
    Então "Já aconteceu" aparece selecionado com ícone e texto
    E o botão de salvar é "Salvar despesa"

  Cenário: Lançar o que já aconteceu mantém o caminho rápido
    Quando Mariana lança "Mercado" de "R$ 80,00" pela "Corrente"
    Então a despesa "Mercado" aparece no Extrato
    E o saldo da "Corrente" diminui "R$ 80,00"

  Cenário: Prever o que vai acontecer
    Dado que Mariana abre a porta de lançar
    Quando Mariana seleciona "Vai acontecer"
    E informa "Condomínio" de "R$ 650,00" com vencimento em 20/10/2026
    E salva a previsão
    Então "Condomínio" aparece em "A pagar" com vencimento em 20/10/2026
    E "Condomínio" não aparece no Extrato
    E o saldo da "Corrente" não muda

  Cenário: O efeito aparece antes de salvar
    Dado que Mariana abre a porta de lançar
    Quando Mariana seleciona "Vai acontecer"
    Então a porta mostra "fica em A pagar até você dar baixa; não muda saldo nem extrato"
    E o botão de salvar é "Salvar previsão"

  Cenário: Previsão nasce Só meu e o aviso aparece ao trocar
    Dado que Mariana abre a porta de lançar
    Quando Mariana seleciona "Vai acontecer"
    Então a despesa nasce como "Só meu"
    E a porta mostra "Padrão deste modo: Só meu"

  Cenário: Trocar de modo não perde o que foi digitado
    Dado que Mariana abre a porta de lançar
    E Mariana digitou "Condomínio" e "R$ 650,00"
    Quando Mariana alterna entre "Já aconteceu" e "Vai acontecer"
    Então descrição e valor continuam preenchidos

  @integration
  Cenário: Data futura só em Vai acontecer
    Dado que Mariana abre a porta de lançar
    E Mariana informa o vencimento 20/10/2026 em "Vai acontecer"
    Quando Mariana seleciona "Já aconteceu"
    Então a porta mostra "A data não pode ser futura"

  @integration
  Cenário: Receita só aparece em Vai acontecer quando a receita prevista existir
    Dado que Mariana abre a porta de lançar
    Quando Mariana seleciona "Receita"
    Então "Vai acontecer" fica indisponível com a dica "Receita prevista ainda não está disponível"

  Cenário: Previsão no cartão não é oferecida aqui
    Dado que o cartão "Nubank Lucas" existe
    E Mariana abre a porta de lançar
    Quando Mariana escolhe o cartão "Nubank Lucas" em "Pagar com"
    Então "Vai acontecer" fica indisponível com a dica "No cartão, use Assinatura (todo mês)"

  Cenário: Teclado e leitor de tela no seletor Quando
    Dado que Mariana abre a porta de lançar
    Quando Mariana foca "Já aconteceu" e pressiona a seta para a direita
    Então "Vai acontecer" fica selecionado
    E o seletor "Quando?" é um grupo de opções com "Já aconteceu" e "Vai acontecer"

  Cenário: Dois toques rápidos em Salvar previsão criam uma só previsão
    Dado que Mariana abre a porta de lançar
    E Mariana seleciona "Vai acontecer"
    Quando Mariana informa "Água" de "R$ 90,00" com vencimento em 20/10/2026
    E Mariana toca duas vezes em "Salvar previsão"
    Então existe uma só previsão "Água"

  Cenário: Tema escuro e sem rolagem horizontal
    Dado que o tema é escuro
    E Mariana abre a porta de lançar
    Quando Mariana seleciona "Vai acontecer"
    Então o seletor "Quando?" se distingue por ícone e texto além da cor
    E a porta não tem rolagem horizontal

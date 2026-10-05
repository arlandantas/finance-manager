# language: pt
Funcionalidade: Dividir desligado por padrão

  Contexto:
    Dado a família Silva do "Só meu" com a conta "Nubank Conjunta" e Lucas autenticado

  Cenário: Nova despesa nasce como Só meu
    Quando Lucas abre o formulário de despesa do "Só meu"
    Então o interruptor "Dividir com a família" está desligado e o rótulo é "Só meu"

  Cenário: Lançamento rápido sem dividir mantém os quatro toques
    Quando Lucas lança "R$ 80,00" em "Saúde" sem tocar no interruptor
    Então a despesa mais recente fica como "Só meu" e o acerto do mês não muda

  Cenário: Ligar o interruptor divide pela regra vigente
    Quando Lucas liga "Dividir com a família" e salva "R$ 300,00" em "Supermercado"
    Então o formulário mostrou "Divisão igual (50% / 50%)" ao ligar
    E a despesa entra no acerto com cota de "R$ 150,00" para cada membro

  Cenário: O padrão não lembra a escolha anterior
    Dado que Lucas salvou a despesa anterior com o interruptor ligado
    Quando Lucas abre o formulário de despesa do "Só meu"
    Então o interruptor "Dividir com a família" está desligado e o rótulo é "Só meu"

  Cenário: Campo some com o acerto desligado
    Dado que o acerto de contas foi desligado no "Só meu"
    Quando Lucas abre o formulário de despesa do "Só meu"
    Então não vê o interruptor "Dividir com a família"

  Cenário: Despesa prevista também nasce como Só meu
    Quando Lucas abre o cadastro de despesa prevista do "Só meu"
    Então o interruptor "Dividir com a família" está desligado e o rótulo é "Só meu"

  Cenário: Painel de Acerto informa as despesas Só meu do mês
    Dado duas despesas "Só meu" de "R$ 80,00" e "R$ 45,00" em outubro de 2026
    Quando Lucas abre o painel de Acerto do "Só meu"
    Então vê "2 despesas Só meu neste mês (R$ 125,00)" e o link "Ver no Extrato" filtra por "Só meu"

  Cenário: Painel de Acerto sem despesas Só meu
    Dado despesas "Só meu" ausentes e uma despesa dividida de "R$ 100,00" em outubro de 2026
    Quando Lucas abre o painel de Acerto do "Só meu"
    Então não vê a linha "despesas Só meu neste mês"

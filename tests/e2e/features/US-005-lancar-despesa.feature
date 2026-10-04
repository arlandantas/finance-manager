# language: pt
Funcionalidade: Lançamento rápido de despesa

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E Lucas está autenticado

  Cenário: Despesa comum com sucesso
    Quando Lucas toca no botão "+", digita "R$ 150,50", escolhe a categoria "Supermercado" e toca em "Salvar Despesa"
    Então a despesa é registrada com autor "Lucas", quem pagou "Lucas", conta "Nubank Conjunta" e data de hoje
    E está marcada como "Dividir com a família"
    E o saldo de "Nubank Conjunta" passa a "R$ 849,50"
    E aparece o aviso "Despesa registrada com sucesso!"

  Cenário: Registrar em nome de outro membro
    Dado que Mariana pagou o supermercado de R$ 350,00
    Quando Lucas lança "R$ 350,00" em "Supermercado" e escolhe "Quem pagou: Mariana"
    Então o autor é "Lucas" e quem pagou é "Mariana"

  Cenário: Despesa pessoal
    Quando Lucas lança "R$ 80,00" em "Lazer e restaurantes" com "Dividir com a família" desligado
    Então a despesa é registrada como pessoal
    E não entra no acerto de contas

  Cenário: Valor obrigatório e positivo
    Quando Lucas tenta salvar com valor "R$ 0,00"
    Então vê "Informe um valor maior que zero"
    E nada é registrado

  Cenário: Categoria obrigatória
    Quando Lucas informa o valor mas não escolhe categoria e tenta salvar
    Então o campo categoria é destacado com "Escolha uma categoria"

  Cenário: Descrição omitida
    Quando Lucas salva "R$ 20,00" na categoria "Transporte" sem descrição
    Então a despesa é registrada com a descrição "Transporte"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa"
    Então apenas uma despesa é registrada
    E o saldo da conta é reduzido uma única vez

  Cenário: Data retroativa
    Quando Lucas abre "Mais detalhes" e escolhe a data de ontem
    Então a despesa é registrada com a data de ontem

  Cenário: Tentar data futura
    Quando Lucas escolhe uma data posterior a hoje
    Então vê "Para contas futuras, use Despesa prevista"

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar Despesa"
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Família sem conta cadastrada
    Dado que a família não tem contas
    Quando Lucas toca em "+"
    Então é orientado a "Cadastre uma conta primeiro" com atalho para a tela de contas

  Cenário: Meta de velocidade
    Quando Lucas executa o fluxo valor, categoria e salvar com os padrões
    Então o fluxo exige no máximo 4 interações (valor, categoria, salvar e, opcionalmente, conta)

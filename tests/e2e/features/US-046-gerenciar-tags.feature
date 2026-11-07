# language: pt
Funcionalidade: Gerenciar tags (US-046)

  Contexto:
    Dado a família Silva com as tags viagem, viajem e ferias
    E Mariana está autenticada na tela de Tags

  Cenário: Lista ordenada por uso
    Então a lista de tags mostra "viagem" com "5 lançamentos", "viajem" com "3 lançamentos" e "ferias" com "0 lançamentos"

  Cenário: Nome curto demais
    Quando Mariana tenta renomear "ferias" para "a"
    Então a tag mostra o erro "A tag precisa ter entre 2 e 30 caracteres"

  Cenário: Renomear para um nome existente oferece mesclar
    Quando Mariana tenta renomear "viajem" para "Viagem"
    Então vê a oferta "Já existe a tag viagem. Mesclar viajem nela?"

  Cenário: Mesclar viajem em viagem
    Quando Mariana mescla "viajem" em "viagem"
    Então a lista de tags mostra "viagem" com "8 lançamentos"
    E a tag "viajem" não existe mais

  Cenário: Membro remove uma tag
    Dado Lucas está autenticado na tela de Tags
    Quando Lucas remove a tag "viagem"
    Então a tag "viagem" não existe mais
    E os 5 lançamentos continuam existindo

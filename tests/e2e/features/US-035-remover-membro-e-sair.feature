# language: pt
Funcionalidade: Remover membro e sair da família

  Contexto:
    Dado a família da remoção com a conta "Itaú Lucas" de Lucas zerada e a previsão "Plano de saúde" de Lucas

  Cenário: Revisão lista as pendências e a remoção preserva o histórico
    Dado uma despesa da remoção de "R$ 150,50" paga por Lucas
    Quando Mariana abre o diálogo de remoção de "Lucas"
    Então a revisão mostra "1 conta de Lucas será arquivada" e "1 despesa prevista será passada para você"
    Quando Mariana avança e confirma digitando "Remover Lucas"
    Então vê o aviso de remoção "Lucas foi removido da família"
    E "Lucas" aparece em "Ex-membros"
    E o Extrato mostra a despesa paga por "Lucas Silva (ex-membro)"

  Cenário: Conta com saldo exige reatribuir a titularidade
    Dado que a conta "Itaú Lucas" tem saldo "R$ 3.000,00" na remoção
    Quando Mariana abre o diálogo de remoção de "Lucas"
    Então a revisão mostra "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro."
    E o botão da remoção "Continuar" fica desabilitado
    Quando Mariana escolhe "Mariana" como novo titular de "Itaú Lucas"
    Então o botão da remoção "Continuar" fica habilitado

  Cenário: Acerto em aberto exige reconhecimento
    Dado uma diferença da remoção de "R$ 380,00" em outubro de 2026
    Quando Mariana abre o diálogo de remoção de "Lucas"
    Então a revisão mostra "a acertar entre vocês"
    E o botão da remoção "Continuar" fica desabilitado
    Quando Mariana marca "Reconheço a diferença"
    Então o botão da remoção "Continuar" fica habilitado

  Cenário: Último Administrador não pode sair
    Quando Mariana tenta sair da família
    Então vê o bloqueio da remoção "Você é a única pessoa Administradora. Promova outro membro antes de sair."

  Cenário: Membro sai da família e perde o acesso
    Quando Lucas sai da família escolhendo "Mariana" para as previstas
    Então vê o aviso na entrada "Você saiu da Família Silva"
    E Lucas não consegue mais abrir a Home da família

  Cenário: Membro não remove outros
    Quando Lucas abre o menu de "Mariana" na tela Família
    Então não vê a ação "Remover"

  Cenário: Sessão do removido é encerrada com aviso único
    Dado que Mariana removeu "Lucas" pelo servidor
    Quando Lucas atualiza a tela
    Então Lucas vê a tela de login com "Seu acesso a esta família foi encerrado"

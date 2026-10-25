# language: pt
Funcionalidade: Página de Privacidade

  Cenário: Acessível sem login pelo rodapé da tela de entrada
    Dado uma pessoa que ainda não entrou
    Quando ela toca em "Privacidade" no rodapé da tela de entrada
    Então vê a página "Privacidade" sem precisar entrar

  Cenário: Acessível pelo Perfil
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas está autenticado
    Quando Lucas abre o Perfil e toca no link "Privacidade"
    Então vê a página "Privacidade" sem precisar entrar

  Cenário: Explica os dados tratados, a finalidade e o compartilhamento com IA
    Dado uma pessoa que ainda não entrou
    Quando ela abre a página "Privacidade"
    Então vê quais dados são guardados e para que servem
    E vê que a IA do app só recebe dados com a autorização da família
    E vê que o assistente do próprio membro envia dados ao provedor que ele usa

  Cenário: Explica quanto tempo os dados ficam
    Dado uma pessoa que ainda não entrou
    Quando ela abre a página "Privacidade"
    Então vê os prazos de retenção de sessões, convites e dados financeiros

  Cenário: Mostra como exercer os direitos e o contato
    Dado uma pessoa que ainda não entrou
    Quando ela abre a página "Privacidade"
    Então vê "Baixar meus dados" e "Excluir minha conta" com links para o Perfil
    E vê o contato "[e-mail de contato a definir pelo usuário]"

  Cenário: Versão e data visíveis
    Dado uma pessoa que ainda não entrou
    Quando ela abre a página "Privacidade"
    Então vê o número da versão e a data da última atualização

  Cenário: Legível no celular
    Dado uma pessoa que ainda não entrou
    E um celular de 375 px de largura
    Quando ela abre a página "Privacidade"
    Então o texto é legível sem rolagem horizontal

# US-082 — Página "Privacidade" (dados tratados, retenção e direitos)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | **Must** (publicar junto com a US-080) · 1 (SEC-017e) |
| Status | Refinada (PO) · **texto aguarda aprovação do usuário e revisão jurídica** |
| Depende de | Tabela de retenção do TL (SDD-028 §7.1); US-079 e US-080 (os botões citados no texto) |
| Rastreabilidade | SEC-017e · LGPD (arts. 6, 9, 18) · EN-005 (privacidade de IA) · ADR-032 §6 · SDD-028 §7.1, §7.6 · D-GES-42 U5 · D-PO-86, D-PO-89 |

## História
Como **pessoa que usa (ou pensa em usar) o app**, quero **ler, em português simples, quais dados são guardados, por quanto tempo e como exercer meus direitos**, para **decidir com confiança e saber a quem pedir**.

## Regras de negócio aplicáveis
- Página pública **"Privacidade"** (acessível sem login), com link no **rodapé da tela de login** e no **Perfil**.
- Conteúdo mínimo: (1) **quais dados** são tratados; (2) **para quê**; (3) **por quanto tempo** (tabela de retenção do TL); (4) **com quem** são compartilhados (provedor de IA, só com opt-in da família; assistente do membro; hospedagem); (5) **seus direitos** e como exercê-los (botões "Baixar meus dados" e "Excluir minha conta"); (6) **contato** para dúvidas e pedidos.
- Linguagem simples, sem jargão jurídico; **versão e data** da última atualização visíveis.
- O texto **não é parecer jurídico**: o usuário aprova o texto final e decide se precisa de revisão jurídica (U5).
- Os prazos citados são os do SDD-028 §7.1; se o TL ou o usuário alterar um prazo, o texto muda junto.

## Texto proposto pelo PO (rascunho para aprovação do usuário)
> **Privacidade — versão 1 · atualizada em [data da publicação]**
>
> **O que guardamos.** Seu nome, e-mail e foto da conta Google (só para identificar você); as finanças que você e sua família cadastram (contas, cartões, lançamentos, previstas, categorias, tags e acertos); suas preferências; e registros de segurança (sessões ativas e conexões de assistente).
>
> **Para quê.** Para o app funcionar e para a sua família acompanhar as finanças juntas. Não vendemos dados nem mostramos anúncios.
>
> **Com quem compartilhamos.** Os dados de uma família só aparecem para os membros dela. Se a sua família ligar os recursos de IA, os dados necessários são enviados ao provedor de IA contratado pelo app, sempre depois de mostrarmos o que será enviado. Se você conectar um assistente de IA, o que ele consultar vai para o provedor que você usa, fora do nosso controle. O app roda em provedores de hospedagem e de banco de dados.
>
> **Por quanto tempo.** Sessões e códigos de acesso vencidos são apagados em até 1 dia. Convites encerrados são apagados após 90 dias. Os lançamentos e demais registros financeiros ficam enquanto a família existir. Se você sair da família, o histórico que você ajudou a registrar continua com ela; se você excluir a sua conta, seu nome, e-mail e foto são anonimizados.
>
> **Seus direitos.** Em Perfil, você pode **baixar uma cópia dos seus dados** e **excluir a sua conta**. A última pessoa de uma família pode **excluir a família inteira**, o que apaga todos os dados dela de forma definitiva. Para qualquer outra dúvida ou pedido, escreva para **[e-mail de contato a definir pelo usuário]**.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Página de Privacidade

  Cenário: Acessível sem login pelo rodapé da tela de entrada
    Dado uma pessoa que ainda não entrou
    Quando ela toca em "Privacidade" no rodapé da tela de entrada
    Então vê a página "Privacidade" sem precisar entrar

  Cenário: Acessível pelo Perfil
    Dado que Lucas está autenticado
    Quando Lucas abre o Perfil e toca em "Privacidade"
    Então vê a página "Privacidade"

  Cenário: Explica os dados tratados e a finalidade
    Dado que Lucas está autenticado
    Quando Lucas abre a página "Privacidade"
    Então vê quais dados são guardados e para que servem

  Cenário: Explica quanto tempo os dados ficam
    Dado que Lucas está autenticado
    Quando Lucas abre a página "Privacidade"
    Então vê os prazos de retenção de sessões, convites e dados financeiros

  Cenário: Explica o compartilhamento com IA
    Dado que Lucas está autenticado
    Quando Lucas abre a página "Privacidade"
    Então vê que a IA do app só recebe dados com a autorização da família
    E vê que o assistente do próprio membro envia dados ao provedor que ele usa

  Cenário: Mostra como exercer os direitos
    Dado que Lucas está autenticado
    Quando Lucas abre a página "Privacidade"
    Então vê "Baixar meus dados" e "Excluir minha conta" com links para o Perfil
    E vê o e-mail de contato

  Cenário: Versão e data visíveis
    Dado que Lucas está autenticado
    Quando Lucas abre a página "Privacidade"
    Então vê o número da versão e a data da última atualização

  Cenário: Legível no celular
    Dado um celular de 375 px de largura
    Quando Lucas abre a página "Privacidade"
    Então o texto é legível sem rolagem horizontal
```

## Experiência
Página de texto simples, títulos curtos por seção, tabela de retenção, links para o Perfil. Mesmo layout da tela de entrada quando aberta sem sessão.

## Fora de escopo
Termos de uso, banner de cookies (o app só usa o cookie de sessão), aceite explícito do texto no primeiro acesso, registro de consentimento por versão do texto.

## Perguntas em aberto / pontos para o Tech Lead
- **Usuário**: aprovar o texto, definir o **e-mail de contato** e decidir sobre revisão jurídica.
- **TL**: confirmar a tabela de retenção (SDD-028 §7.1) como fonte do texto.

## Histórico
- 2026-10-24 — Criada com rascunho do texto (SEC-017e, SDD-028 §7.6; D-PO-89).

# US-079 — Baixar meus dados

Estado vigente consolidado em agents/estado/privacidade-lgpd.md

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | Should · 3 (SEC-017b) · prazo do TL: ≤ 60 dias |
| Status | Refinada (PO) · SDD-028 §7.3 (aprovado para Dev) |
| Depende de | — (independe das demais; é pré-requisito natural da US-080) |
| Rastreabilidade | SEC-017b · LGPD arts. 18 e 19 (acesso e portabilidade; **validação jurídica do usuário**) · ADR-032 §6 · SDD-028 §7.3 · D-GES-42 U5 · D-PO-86 |

## História
Como **membro (ou ex-membro) da família**, quero **baixar uma cópia dos meus dados**, para **saber o que o app guarda sobre mim e levar comigo se eu quiser sair**.

## Regras de negócio aplicáveis
- Ação em **Perfil ➜ "Seus dados" ➜ "Baixar meus dados"**; gera um arquivo **JSON** chamado `meus-dados-AAAA-MM-DD.json`. Enquanto prepara, mostra **"Preparando…"**.
- O arquivo traz: **perfil** (nome, e-mail, data de criação), **vínculos** com famílias (atuais e passadas, papéis, datas), **consentimentos** (IA, com datas), **conexões de assistente** (cliente, datas, permissões; **nunca** chaves ou tokens) e, para quem está numa família, os **dados da família atual** (contas, cartões, categorias, tags, lançamentos, previstas, recorrentes e acertos) **com valores em centavos, no mesmo formato das telas**.
- **Ex-membro** recebe só perfil, vínculos e os lançamentos **que ele fez ou pagou** na família antiga; dados de outros membros saem só como nome exibido.
- Ninguém baixa dados de **outra família**.
- Limite de **3 downloads por dia** por pessoa. Arquivo acima de **50 MB** não é gerado no app: orientação para pedir ao suporte.
- A exportação é ação explícita do usuário: **não aplica** o "ocultar valores" visual (como o MCP, D-PO-66).
- O arquivo contém dados financeiros: a tela avisa para guardá-lo com cuidado.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Baixar meus dados

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Lucas está autenticado

  Cenário: Baixar o arquivo
    Quando Lucas toca em "Baixar meus dados" em Perfil, "Seus dados"
    Então vê "Preparando…" enquanto o arquivo é gerado
    E o navegador baixa o arquivo "meus-dados-2026-11-05.json"

  Cenário: Conteúdo do arquivo de um membro ativo
    Dado que Lucas fez 12 lançamentos e tem a conta "Itaú Lucas"
    Quando Lucas baixa os próprios dados
    Então o arquivo traz perfil, vínculos, consentimentos, conexões de assistente e a família "Família Silva"
    E o lançamento de "R$ 150,50" aparece como 15050 centavos

  Cenário: Conexões de assistente sem credenciais
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Lucas baixa os próprios dados
    Então o arquivo lista "Meu Claude" com datas e permissões
    E o arquivo não contém nenhuma chave nem token

  Cenário: Ex-membro leva só o que é dele
    Dado que Lucas foi removido da "Família Silva"
    E Lucas fez 3 lançamentos e pagou 2 que Mariana registrou
    Quando Lucas baixa os próprios dados
    Então o arquivo traz perfil, vínculos e esses lançamentos
    E o arquivo não traz contas, cartões nem lançamentos de Mariana

  Cenário: Não baixa dados de outra família
    Dado a "Família Souza" com o membro "Ana"
    Quando Lucas baixa os próprios dados
    Então o arquivo não contém nenhum dado da "Família Souza"

  Cenário: Limite de três downloads por dia
    Dado que Lucas já baixou os dados 3 vezes hoje
    Quando Lucas toca em "Baixar meus dados"
    Então vê "Você já baixou seus dados 3 vezes hoje. Tente de novo amanhã."

  Cenário: Arquivo grande demais
    Dado que os dados de Lucas passam de 50 MB
    Quando Lucas toca em "Baixar meus dados"
    Então vê "Seus dados são grandes demais para baixar aqui. Fale com o suporte."

  Cenário: Falha de rede
    Dado que não há conexão
    Quando Lucas toca em "Baixar meus dados"
    Então vê "Sem conexão. Tente de novo."

  Cenário: Valores ocultos não mascaram o arquivo
    Dado que Lucas deixou "Ocultar valores" ligado
    Quando Lucas baixa os próprios dados
    Então os valores no arquivo aparecem completos
```

## Experiência
Perfil ➜ seção "Seus dados" (junto de "Excluir minha conta", US-080, e do link "Privacidade", US-082). Texto de apoio: "Uma cópia dos seus dados em formato aberto (JSON)". Estados: ocioso, preparando (botão desabilitado), erro com "Tentar de novo".

## Fora de escopo
Formato CSV/PDF, envio do arquivo por e-mail, exportação agendada, exportação da família inteira por Administrador, importar de volta.

## Perguntas em aberto / pontos para o Tech Lead
- Prazos de atendimento (LGPD) e base legal: **validar com quem responde juridicamente** (D-GES-42 U5).

## Histórico
- 2026-10-24 — Criada (SEC-017b, SDD-028 §7.3; D-PO-86).

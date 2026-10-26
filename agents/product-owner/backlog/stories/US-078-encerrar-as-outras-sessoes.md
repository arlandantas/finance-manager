# US-078 — Encerrar as outras sessões

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | Should · 2 (SEC-018b) |
| Status | Implementada (TASK-075/076, aguardando validação do Gestor) |
| Depende de | SEC-018a (sessão por *hash*, 3 pts, TL), US-035 (encerramento por remoção/troca de papel) |
| Rastreabilidade | **NEED-012** (RN-012.3, **revisão a validar pelo Stakeholder**, D-PO-85) · SEC-018 · ADR-032 §7 · SDD-028 §6 · D-GES-42 U2 · D-PO-80 |

## História
Como **membro da família**, quero **encerrar as sessões abertas em outros aparelhos**, para **garantir que ninguém mais use minha conta se eu perder um celular ou emprestar um computador**.

## Regras de negócio aplicáveis
- Ação em **Perfil ➜ "Encerrar as outras sessões"**, com confirmação **"Você continuará conectado só neste aparelho."**; depois, aviso **"N sessão(ões) encerrada(s)"**.
- A sessão **atual nunca é encerrada** pela ação; as sessões de outras pessoas nunca são afetadas.
- **Validade da sessão (D-GES-42 U2)**: a sessão expira após **30 dias sem uso** e, no máximo, **90 dias depois do login**, mesmo com uso diário. No uso diário a pessoa **não precisa entrar de novo** (RN-012.3 mantida); a cada 90 dias entra com o Google outra vez.
- Remoção da família e troca de papel já encerram as sessões do afetado (US-035); **sair do app** encerra só a sessão atual.
- Quem teve a sessão encerrada vê a tela de entrada e entra com o Google normalmente (nenhum dado se perde).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Encerrar as outras sessões e validade da sessão

  Contexto:
    Dado a "Família Silva" com "Mariana" e "Lucas"
    E Lucas conectado no celular e no computador

  Cenário: Encerrar as outras sessões mantém só a atual
    Dado que Lucas usa o celular
    Quando Lucas abre o Perfil, toca em "Encerrar as outras sessões" e confirma
    Então vê "1 sessão encerrada"
    E o celular continua conectado
    E o computador volta para a tela de entrada na próxima ação

  Cenário: Confirmação explica o efeito
    Quando Lucas toca em "Encerrar as outras sessões"
    Então vê "Você continuará conectado só neste aparelho."
    E vê os botões "Encerrar" e "Cancelar"

  Cenário: Cancelar não encerra nada
    Quando Lucas toca em "Encerrar as outras sessões" e depois em "Cancelar"
    Então o computador continua conectado

  Cenário: Sem outras sessões
    Dado que Lucas está conectado só no celular
    Quando Lucas toca em "Encerrar as outras sessões" e confirma
    Então vê "0 sessões encerradas"
    E o celular continua conectado

  Cenário: Não afeta a sessão de outra pessoa
    Dado que Mariana está conectada no próprio celular
    Quando Lucas encerra as outras sessões dele
    Então Mariana continua conectada

  Cenário: Erro de rede ao encerrar
    Dado que não há conexão
    Quando Lucas toca em "Encerrar" na confirmação
    Então vê "Sem conexão. Tente de novo."
    E nenhuma sessão foi encerrada

  Cenário: Duplo clique encerra uma única vez
    Quando Lucas toca duas vezes rapidamente em "Encerrar"
    Então a ação é executada uma única vez

  Cenário: Uso diário não pede novo login
    Dado que Lucas usa o app todos os dias
    Quando passam 60 dias
    Então Lucas continua conectado

  Cenário: Sessão sem uso por 30 dias expira
    Dado que Lucas não usa o app há 31 dias
    Quando Lucas abre o app
    Então vê a tela de entrada com o Google

  Cenário: Sessão tem prazo máximo de 90 dias
    Dado que Lucas entrou há 91 dias e usou o app todos os dias
    Quando Lucas abre o app
    Então vê a tela de entrada com o Google
    E ao entrar de novo os dados da família estão intactos
```

## Experiência
Perfil ➜ seção "Segurança": botão secundário "Encerrar as outras sessões" (texto de apoio: "Use se perdeu um aparelho ou entrou em um computador que não é seu"). Estados: confirmação, enviando ("Encerrando…"), sucesso (*toast*), erro (SDD-000).

## Fora de escopo
Lista de aparelhos com nome/IP/localização e encerramento individual; aviso por e-mail de novo login; autenticação em dois fatores.

## Perguntas em aberto / pontos para o Tech Lead
- **Stakeholder (D-PO-85)**: a RN-012.3 ("persistir de forma segura para não relogar a cada acesso") passa a ter prazos explícitos: 30 dias sem uso e 90 dias absolutos. A hipótese preserva o espírito; confirmar.

## Histórico
- 2026-10-24 — Criada (SEC-018b, SDD-028 §6; D-GES-42 U2; D-PO-80, D-PO-85).

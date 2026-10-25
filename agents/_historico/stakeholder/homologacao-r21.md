# Homologação de valor — R2.1 (+ parcelamento da R3-A) pelo navegador

- **Data:** 2026-10-05
- **Papel:** Agente Stakeholder (dono do problema: casal que quer fechar o mês sem discussão, lançar em menos de 10 s, acerto justo e discreto)
- **Ambiente:** `http://localhost:3100` (Next dev), banco recém-semeado da "Família Silva (demonstração)", login pelo bloco "Entrar como (teste)" (Mariana = Administradora, Lucas = Membro). Mailpit local. Google real não configurado (esperado).
- **Método:** uso real pela interface, sem ler código-fonte. Referências: [`homologacao-r1-r2.md`](homologacao-r1-r2.md) (4 ressalvas importantes), [`parecer-feedback-usuario.md`](parecer-feedback-usuario.md) (itens 1..16, Q-F01..Q-F14), `tasks-board.md` (R2.1 US-022..039 e R3-A US-040a/b).
- **Viewports:** painel embutido (~630 px, já com barra inferior), emulação mobile 375 px (sem rolagem horizontal, `scrollWidth` = 375 em Acerto e Extrato) e emulação 1280 px (menu superior e conteúdo contido). Viewport devolvido para "desktop" ao final.

## 1. Resumo executivo

As quatro ressalvas importantes da homologação anterior **foram resolvidas** e o pacote de "discrição" pedido pelo usuário (valores ocultos, acerto opcional, "Só meu" por padrão, Resumo do Mês) **funciona como pedido**. Conferi à mão os números do Resumo do Mês (resultado, "a pagar", saldo previsto), do acerto (cotas com a regra mista 50/50 até 04/10 e 58/42 depois) e do cartão (limite usado, parcelas futuras) e **todos batem**. A compra parcelada no cartão, que o parecer considerava o item de maior valor oculto, está entregue e é clara: prévia "3x de R$ 400,00 · 1ª na fatura de out/2026", faturas futuras, limite consumido pelo total e exclusão da compra inteira.

Não encontrei bloqueantes nem divergência de saldo. Os pontos que ficam são de **expectativa**: a parcela dividida ainda não existe ("Disponível em breve"), então uma compra parcelada hoje nasce "Pessoal" e fica fora do acerto, o que **subestima o acerto** de um casal que parcela compras comuns. Já está previsto (US-042, após a janela de reversão), mas precisa ficar visível para o casal real.

**Parecer: HOMOLOGA COM RESSALVAS** (1 item Importante de expectativa, §4; demais Melhorias).

## 2. O que foi exercitado e criado no banco

| # | Exercício | Resultado |
| :-: | :--- | :--- |
| 1 | Login Mariana; Início com valores **ocultos** ("R$ •••••"); olho para revelar | OK; padrão oculto conforme Q-F04 |
| 2 | Resumo do Mês (receitas, despesas, resultado, a pagar = previstas + faturas, saldo previsto) | Contas conferidas, reconcilia com o Extrato |
| 3 | Aviso "Acertos pendentes de meses anteriores: 2 meses (R$ 365,50)" leva ao mês pendente mais antigo | OK (ressalva 2) |
| 4 | Regra de divisão: Proporcional + "Sugerir pela renda" (6.500 e 4.800 → 58/42) + prévia + salvar | Prévia "Vale a partir de 05/10/2026. Lançamentos anteriores não mudam. Impacto no acerto de outubro: R$ 0,00"; volta ao Acerto ao salvar (ressalvas 1 e 4) |
| 5 | Rótulo da regra no Acerto | "50% / 50% até 04/10 · 58% / 42% a partir de 05/10 — Na prática neste mês: 50,6% / 49,4%" |
| 6 | Compra parcelada R$ 1.200,00 em 3x no cartão Nubank Roxinho ("TV 55 polegadas (teste Stakeholder)") | Prévia 3x de R$ 400,00; despesas do mês +R$ 400,00 (só a parcela de out) |
| 7 | Fatura nov/2026 ("Futura"), "Ver compra" (1/3 aberta, 2/3 nov, 3/3 dez); "Excluir compra parcelada" (abri e **cancelei**) | Mensagem "Todas as 3 parcelas serão excluídas e o limite do cartão será devolvido" |
| 8 | Arquivar cartão com fatura em aberto | Bloqueado: "Pague a fatura antes de arquivar o cartão" |
| 9 | Pagar fatura set/2026 (R$ 479,00) | Origem padrão **Conta corrente · "Conta do titular com saldo suficiente"**; Dinheiro marcada "saldo insuficiente"; fatura "Paga", limite liberado |
| 10 | Nova despesa prevista "Internet fibra (teste Stakeholder)" R$ 129,90, dividir ligado | Nasce "Só meu" por padrão; rótulo muda para "Divisão proporcional (58% / 42%)" ao ligar |
| 11 | Dar baixa na Internet fibra | Conta padrão com saldo suficiente ("Conta do titular com saldo suficiente") |
| 12 | Receita "Rendimentos" R$ 350,00 sem descrição | Descrição assume o nome da categoria |
| 13 | Despesa comum R$ 100,00 (Supermercado, Conta corrente), interruptor "Dividir" ligado | Entra no acerto a 58/42 |
| 14 | Acerto parcial Lucas → Mariana R$ 500,00 (Conta Lucas → Conta corrente) | Confirmação com resumo; "Saldo restante R$ 694,01"; histórico com "Desfazer acerto" (não usei) |
| 15 | Desligar o acerto (Família > Configurações) com dívida | Aviso "Há R$ 1.059,51 a acertar… o valor fica guardado e volta se você religar"; confirmei; Acerto some do menu, indicador some da Início, `/acerto` diz "desligado nesta família", lançamento rápido **sem** "Dividir"; religado |
| 16 | Família: "Remover Lucas" (revisão de pendências, **cancelei**); Convidar com e-mail `vovo.r21@example.com` | Revisão: "Há R$ 1.059,51 a acertar…", checkbox "Reconheço a diferença", contas com saldo exigem novo titular. Convite com "Copiar link", "Reenviar e-mail", "3 reenvios restantes"; **cancelado** |
| 17 | Contas: nova conta "Conta Teste Stakeholder" (saldo 0) → **arquivada**; arquivar "Dinheiro" (R$ 150,00) | Aparece em "Contas arquivadas (1)"; Dinheiro bloqueado: "Para arquivar, o saldo precisa ser zero" + atalho "Transferir o saldo"; "Excluir" só aparece em conta sem movimento |
| 18 | Tema Claro/Escuro/Sistema (menu do avatar) | Claro aplicado e mantido ao recarregar; voltei para "Sistema" |
| 19 | Desktop 1280 px | Menu superior com itens, conteúdo contido e em 2 colunas |
| 20 | Como Lucas (mobile 375): Acerto, regra, despesa "Só meu" R$ 45,00, detalhe do lançamento | Regra em somente leitura com explicação; despesa em 3 interações; detalhe com botões "Editar / Excluir / Histórico" rotulados |

**Dados de teste que ficaram na Família Silva (outubro/2026):**
- Despesa parcelada R$ 1.200,00 em 3x (TV, Pessoal; parcelas out/nov/dez) no cartão Nubank Roxinho.
- Fatura set/2026 **paga** (R$ 479,00) pela Conta corrente.
- Previsão "Internet fibra" R$ 129,90 **baixada** (despesa Comum); Condomínio R$ 650,00 segue a pagar.
- Receita Rendimentos R$ 350,00; despesa Supermercado R$ 100,00 (comum); despesa Supermercado R$ 45,00 do Lucas (Só meu).
- **Regra de divisão:** nova versão 58/42 vigente desde 05/10 (50/50 antes). Não revertida.
- **Acerto** parcial de R$ 500,00 (Conta Lucas → Conta corrente) registrado; acerto desligado e religado (2 eventos na "Atividade recente").
- Conta "Conta Teste Stakeholder" criada e **arquivada** (R$ 0,00).
- Convite `vovo.r21@example.com` criado e cancelado.
- Tema do navegador de volta a "Sistema".

## 3. O que está bom (valor entregue)

- **Ressalva 1 (rótulo contra números): resolvida.** O Acerto agora diz o que de fato vale em cada trecho e o resultado na prática ("50,6% / 49,4%"). Conferi: cota de Mariana = 1.532,45 (50% de 3.064,90) + 133,34 (58% de 229,90) = 1.665,79; Lucas = 1.532,45 + 96,56 = 1.629,01. O casal consegue entender de onde vem cada número (NEED-007).
- **Ressalva 2 (dívida antiga): resolvida.** Indicador neutro "Acerto do mês: R$ 694,01 a acertar" e "Acertos pendentes de meses anteriores: 2 meses (R$ 365,50)" dentro do Resumo, com link para o mês pendente. Linguagem neutra ("transfere", "a acertar", sem "deve").
- **Ressalva 3 (conta de origem): resolvida.** Pagar fatura e dar baixa sugerem a conta do titular com saldo suficiente, explicam o motivo e marcam "saldo insuficiente" nas demais; o alerta vermelho de saldo negativo não apareceu mais.
- **Ressalva 4 (prévia e proporção pela renda): resolvida.** Prévia do impacto, vigência explícita ("Lançamentos anteriores não mudam"), "Sugerir pela renda" (aviso de que as rendas não são guardadas), salvar leva de volta ao Acerto e o botão flutuante não cobre mais "Salvar regra".
- **Resumo do Mês (NEED-015):** responde "como está o mês?" com receitas, despesas, resultado, a pagar (previstas e faturas em linhas próprias), saldo previsto com a fórmula explicada, participação por membro e saldos das contas em card recolhível. Verifiquei: 11.300 − 3.064,90 = 8.235,10; a pagar 650 + 479 = 1.129; saldo previsto 26.787 − 1.129 = 25.658. Depois dos meus lançamentos tudo reconciliou com o Extrato (despesas 3.694,80 = 3.064,90 + 400 + 129,90 + 100).
- **Ocultar valores (NEED-014):** mascara Início, Acerto, Extrato e mensagens; valores começam ocultos em sessão nova; o olho revela e a escolha persiste ao navegar.
- **Acerto opcional (NEED-019):** desligar não apaga nada, avisa o valor pendente, tira menu, indicador e campo "Dividir", e religar restaura. Padrão "Só meu" no lançamento e na previsão (Q-F02); o rótulo do interruptor mostra a regra efetiva.
- **Descrição opcional (Q-F13):** campo visível; vazio assume a categoria. Lançamento rápido continua em 3 a 4 interações (valor, categoria, salvar), com conta e pagador prefigurados.
- **Parcelamento (NEED-003):** valor total + parcelas com prévia, 1ª parcela na fatura certa, fatura futura "Futura", detalhe "Compra parcelada" com situação por parcela, limite consumido pelo total (usado 1.768,90 = 479 + 89,90 + 1.200), "Parcelas futuras R$ 800,00", excluir a compra inteira com devolução de limite.
- **Cadastro e família (NEED-020):** arquivar conta/cartão com bloqueios explicados (saldo zero, fatura em aberto) e atalho "Transferir o saldo"; seção "Contas arquivadas"; revisão de pendências antes de remover membro; trilha "Atividade recente"; convite com "Copiar link" e "Reenviar" e aviso de que é preciso a conta Google do mesmo e-mail (achado 11 anterior resolvido).
- **Tema (NEED-022):** Sistema/Claro/Escuro com bom contraste nos dois temas nos cards, verde/cinza e botões.
- **Detalhe do lançamento (item 12):** botões rotulados "Editar / Excluir / Histórico" (resolve achado 7 anterior). Filtros do Extrato e erro de validação reativo não foram reexaminados a fundo (ver §5).
- **Mobile 375 px:** sem rolagem horizontal em Acerto e Extrato; barra inferior com 7 itens legível; formulário do lançamento rápido cabe em uma tela com rolagem.
- **Desktop:** menu superior e conteúdo contido (alternativa escolhida no Q-F06).

## 4. Achados

Classificação: **B** = Bloqueante, **I** = Importante, **M** = Melhoria.

| # | Sev. | Achado | Onde / como reproduzir | Relação |
| :-: | :-: | :--- | :--- | :--- |
| 1 | **I** | **Compra parcelada não pode ser dividida e vira "Pessoal" (fora do acerto).** O formulário mostra "Dividir com a família: Disponível em breve para compras parceladas"; a TV de R$ 1.200,00 em 3x ficou "Pessoal" e o Acerto passou a exibir "1 despesa Só meu neste mês (R$ 400,00)". Para o casal que parcela compras comuns, o acerto é **subestimado** sem aviso no momento da compra. É decisão conhecida (US-042 depois da janela de reversão, Q-F05 "por parcela no mês da fatura"), mas hoje o aviso está escondido em letra pequena; peço que fique mais visível ou que o Gestor comunique ao casal. Não bloqueia a homologação. | Lançamento rápido, cartão, 2x ou mais | NEED-003, NEED-018, Q-F05 |
| 2 | M | O bloqueio de **arquivar cartão** só aparece depois de confirmar ("Pague a fatura antes de arquivar o cartão"), e cita só a fatura (há também parcelas futuras). Seria melhor avisar antes de confirmar e listar tudo o que impede. Contas já mostram o bloqueio após a tentativa, também. | Cartões > Ações > Arquivar | NEED-020 |
| 3 | M | Com o **acerto desligado**, as linhas ainda mostram o selo "Comum" e a "Atividade recente" diz apenas "Mariana alterou o acerto de contas" (sem "ligou/desligou"). Pequeno ruído de discrição e de rastreabilidade. | Início/Extrato; Família | NEED-019 |
| 4 | M | Em somente leitura (Lucas), a tela da regra mantém o texto "A mudança vale a partir de agora." e o resto do formulário, o que soa como "posso mudar". O aviso de leitura está no topo, mas o texto de ação pode confundir. | `/acerto/regra` como Lucas | NEED-007 |
| 5 | M | O botão flutuante (+) ainda cobre parte de ações no mobile (menu "Ações da conta" e botão "Reativar" em "Contas arquivadas"). Funciona, mas atrapalha o toque. | `/contas` | Ergonomia |
| 6 | M | **Valores voltaram a ficar ocultos ao trocar de usuário** (Mariana estava com valores visíveis; ao entrar como Lucas começaram ocultos). Provavelmente é a preferência por usuário/sessão; vale deixar claro no texto do olho se é por dispositivo ou por pessoa (Q-F04 diz "lembra por dispositivo"). | Logout/login | NEED-014 |
| 7 | M | A tela **A pagar** continua sem listar faturas de cartão (a Início lista); duas visões do mesmo conceito. Hoje não apareceu porque não havia fatura vencendo, mas segue sendo uma lacuna do achado 10 anterior. | `/previstas` | NEED-003/004 |
| 8 | M | O servidor de **desenvolvimento** é lento na primeira abertura de cada tela e nas ações (3 a 8 s, indicador "Compiling" do Next); algumas ações (arquivar conta) só refletem depois de alguns segundos. Estimo que seja efeito do ambiente dev; reavaliar em build de produção. | Geral | Qualidade percebida |

Nenhum achado Bloqueante. Nenhum lançamento duplicado, perda de dado ou divergência de saldo.

### Resolução dos achados da homologação anterior

| Anterior | Situação |
| :-: | :--- |
| 1 (I) rótulo da regra | **Resolvido** |
| 2 (I) dívida de mês anterior | **Resolvido** |
| 3 (I) conta de origem padrão | **Resolvido** |
| 4 (I) prévia de impacto / sugestão pela renda | **Resolvido** |
| 5 (M) erro de validação reativo | Não reexaminado em profundidade (campo de valor do lançamento e do acerto não mostraram erro residual) |
| 6 (M) trocar forma de pagamento | Não reexaminado (campo "Pagar com" foi visto desabilitado na edição de compra de cartão na rodada anterior; não retestei) |
| 7 (M) ações atrás do "…" | **Resolvido** (botões rotulados no detalhe) |
| 8 (M) Categorias fora da navegação | Persiste no menu do avatar ("Configurações > Categorias"); aceitável |
| 9 (M) transferência em 2 linhas | Persiste ("Mesma transferência", acerto aparece em duas linhas) |
| 10 (M) A pagar x faturas | Persiste (achado 7 acima) |
| 11 (M) convite sem copiar/reenviar | **Resolvido** |
| 12 (M) filtros do Extrato | Parcial: botão "Filtros" recolhível; não testei "Limpar filtros" nem a busca |
| 13 (M) FAB cobre "Salvar regra" | **Resolvido** na regra; persiste em Contas (achado 5 acima) |
| 14 (M) saldo "livre de verdade" | Ainda em NEED-009/011 |
| 15 (M) ruído de console | Não reexaminado |

## 5. Não coberto neste teste (para o Gestor saber)

- Não executei: confirmação de arquivamento de cartão (bloqueado), reativação de conta/cartão, "Excluir" de conta sem movimento, remover membro (apenas a revisão), mudar papel, editar nome da família, "Desfazer acerto", exclusão da compra parcelada (apenas abri e cancelei), compra com 24x, Extrato por intervalo de 24 meses, busca por descrição, "Limpar filtros", edição do ciclo do cartão.
- Não abri o Mailpit para conferir o conteúdo do e-mail do convite desta rodada (conferido na rodada anterior).
- O aceite de convite exige Google real (fora do escopo permitido).
- Dark mode no desktop e o "Sistema" com o tema do SO não foram comparados lado a lado.
- A emulação mobile do painel renderizou a página em ~278 px dentro de 375 px nos screenshots; as checagens de largura (`scrollWidth` = 375) foram feitas por script.

## 6. A dor "fechar o mês em casal" foi resolvida?

Sim, e agora com mais confiança. O fluxo lançar → ver a diferença do mês → registrar acerto parcial → pagar a fatura → dar baixa nas previstas funciona, é rápido e **explica o número**. O usuário pediu discrição e controle (ocultar, desligar o acerto, "Só meu" por padrão): entregue. A única ponta solta que pode gerar discussão é a compra parcelada comum ficar fora do acerto até a US-042 (achado 1).

## 7. Parecer final

**HOMOLOGA COM RESSALVAS.**

Condições para a homologação plena (apenas conferência, sem nova rodada ponta a ponta):
1. Tornar visível, no formulário e/ou em comunicação ao casal, que **compra parcelada ainda não entra no acerto** até a US-042 (achado 1), ou antecipar a US-042 se o Gestor entender que a janela de reversão permite.
2. (Recomendado) Antecipar o aviso de bloqueio ao arquivar cartão com motivos completos (achado 2).
3. Os demais itens (3 a 8) são melhorias para o AP1/AP2 conforme o PO.

## 8. Posição do Stakeholder sobre o que vem

- **R3-A:** o parcelamento básico está pronto para uso real; manter a US-042 (parcela dividida por parcela no mês da fatura, Q-F05) como a próxima prioridade assim que a janela de reversão fechar, antes de tags e visões.
- **Tags, visões, cor, receitas previstas:** manter a ordem do parecer (parcelamento → percentual por lançamento → tags → visões).
- **Q-20 (crédito ao comprador x ao pagador da fatura):** o teste não exercitou o caso em que um paga a fatura de outro; continua com a posição anterior (decisão do casal pelo Gestor, opção por família no AP2).

## 9. Rastreabilidade

NEED-003 (parcelamento, faturas futuras), NEED-004 (conta de origem padrão), NEED-007 (acerto, rótulo, dívida antiga, prévia), NEED-014 (ocultar valores), NEED-015 (Resumo do Mês), NEED-018 ("Só meu"/dividir), NEED-019 (acerto opcional), NEED-020 (arquivar/família/membros), NEED-022 (descrição, detalhe, tema, desktop); Q-F01..Q-F06, Q-F11, Q-F13, Q-F14; US-022..US-039, US-040a/b.

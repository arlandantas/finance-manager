# Homologação de valor — R1 + R2 (teste pelo navegador)

- **Data:** 2026-10-04
- **Papel:** Agente Stakeholder (dono do problema: casal que quer fechar o mês sem discussão, lançar em menos de 10 s, acerto de contas justo)
- **Ambiente:** `http://localhost:3100` (dev), dados de demonstração da Família Silva, login pelo bloco "Entrar como (teste)" (Mariana = Administradora, Lucas = Membro). Desktop e viewport mobile 375 px. Mailpit em `http://localhost:8025`.
- **Método:** uso real pela interface, sem ler código. Referências de aceite: `needs/`, `requisitos-negocio.md`, `visao-geral.md`, `agents/developer/tasks/qa-pre-liberacao.md`.

## 1. Resumo executivo

A dor central **está resolvida**. Em poucos minutos, Mariana e Lucas conseguem: ver o saldo da família, lançar gastos (conta ou cartão) em 4 toques, ver na hora "Lucas deve R$ X para Mariana", registrar um acerto parcial e ver o saldo restante, pagar a fatura sem que ela vire "despesa em duplicidade" e dar baixa em contas a pagar com opção de desfazer. Os números que conferi à mão batem (rateio, cota, diferença, saldo restante, saldo total após pagar fatura).

O que me impede de dar um "sim" limpo é **confiança no acerto**, que é exatamente o produto: (a) a tela de Acerto exibe um rótulo de regra que contradiz os valores (mostra "proporcional 58/42" em meses cujos números foram calculados a 50/50 e, no mês corrente, em que a regra nova só vale para lançamentos de hoje em diante); (b) a dívida de meses anteriores não aparece na Início; (c) a conta de origem padrão em pagamentos pode vir negativa. Nenhum é bloqueante técnico, mas (a) é o tipo de coisa que gera nova discussão no casal.

**Parecer: HOMOLOGA COM RESSALVAS** (3 itens Importantes a tratar antes de apresentar ao casal real; ver §4).

## 2. O que foi exercitado e criado no banco de demonstração

Criado/alterado durante o teste (todos na Família Silva, outubro/2026):

| Item | Resultado |
| :--- | :--- |
| Despesa comum no cartão R$ 42,50 (Supermercado) por duplo clique | 1 único lançamento (sem duplicidade) |
| Edição para R$ 45,00; exclusão; "Mostrar excluídos"; Restaurar | Funcionou; fica 1 lançamento de R$ 45,00 ativo |
| Transferência Conta corrente → Poupança R$ 200,00 | Saldo total inalterado; prévia "ficará com" |
| Receita "Rendimentos" R$ 350,00 em Conta corrente | OK |
| Despesa comum R$ 60,00 em Dinheiro (Lazer e restaurantes) | OK |
| Regra de divisão: proporcional 58/42, depois **revertida para 50/50** | Dois novos registros de regra (vigência 04/10) |
| Acerto parcial Lucas → Mariana R$ 500,00 | Saldo restante exibido; botão Desfazer acerto presente (não usei) |
| Pagamento da fatura set/2026 (R$ 479,00) pela Conta corrente | Fatura "Paga"; limite liberado; **não** virou despesa |
| Despesa prevista "Internet fibra" R$ 129,90 (vence 04/10) | Aberta em "A pagar" |
| Baixa do Condomínio R$ 650,00 e **desfazer pagamento** | Voltou a pendente |
| Categoria "Pets" (despesa) | Criada; duplicata "supermercado" rejeitada com mensagem |
| Convite `vovo.homologacao@example.com` (Membro) e **cancelamento** | E-mail chegou ao Mailpit; convite cancelado |
| Como Lucas: despesa comum R$ 35,00 (Supermercado, Conta Lucas) | OK |

Pendências deixadas no banco: fatura set/2026 **paga**; despesa de R$ 45,00 no cartão; R$ 60 e R$ 35 de despesas; acerto de R$ 500 registrado; transferência de R$ 200; categoria Pets; previsão Internet fibra. Não consegui aceitar o convite (exige conta Google real; fora do escopo permitido).

## 3. O que está bom (valor entregue)

- **Lançamento rápido:** FAB sempre visível; abre já com foco no valor e **conta/quem pagou prefigurados pelo usuário** (Lucas abre com Conta Lucas e "Lucas pagou"). Valor + categoria + salvar = 4 interações, bem abaixo de 10 s no desktop e no celular. NEED de agilidade (parceiro) atendido.
- **Acerto de contas:** frase clara "Lucas deve R$ X para Mariana", pagou/cota/diferença por pessoa, "Máximo" no valor do acerto, mensagem de erro acima do devido, confirmação com resumo ("Conta Lucas → Conta corrente, R$ 500,00 … abate o saldo do mês"), histórico com "Desfazer acerto". Conferi: 3.169,90 de despesas comuns, cota 1.584,95 a 50/50, diferença 1.149,95 — correto. Após as mudanças o painel da Início atualiza imediatamente (NEED-007).
- **Cartão e fatura:** fatura fechada x aberta, vencimento, quem comprou (chips por membro), pagar fatura com origem escolhida, "Desfazer pagamento", limite disponível correto, pagamento de fatura não duplica a despesa (despesas do mês ficaram em R$ 3.169,90 antes e depois). NEED-003 atendido.
- **Previstas:** baixa com valor previsto x pago, mensagem de explicação ao desfazer ("a despesa sai do extrato, dos totais e do acerto; o saldo volta"), aba Pagas. NEED-004 atendido.
- **Segurança de uso:** validações claras (valor zero, descrição/categoria vazias, e-mail inválido, categoria duplicada, percentuais ≠ 100%), exclusão com confirmação + restaurar, permissões coerentes (Membro não convida; regra de divisão fica em somente leitura com explicação), logout e botão voltar levam ao login com `callbackUrl`.
- **Mobile 375 px:** navegação inferior com 7 itens legível, Extrato com botão "Filtros" recolhível, cards sem rolagem horizontal.

## 4. Achados

Classificação: **B** = Bloqueante, **I** = Importante, **M** = Melhoria.

| # | Sev. | Achado | Onde / como reproduzir | Relação |
| :-: | :-: | :--- | :--- | :--- |
| 1 | **I** | **Rótulo da regra de divisão contradiz os números.** A tela de Acerto mostra "Divisão proporcional (58% / 42%)" em **Setembro**, mas a cota exibida (358,50 de 717,00) é 50%. No mês corrente, após salvar 58/42 "a partir de agora", todo o mês aparece rotulado como 58/42 embora só os lançamentos de hoje em diante usem a regra nova (Mariana: cota 1.593,35, não 58% de 3.169,90). O cálculo está certo (vigência por data, Q-08); a **explicação é errada/enganosa** e o casal vai achar que o app errou. | `/acerto` e `/acerto?period=2026-09` após trocar a regra | NEED-007, Q-08 / D-GES-08 |
| 2 | **I** | **Dívida de mês anterior não aparece na Início.** Setembro continua com "Lucas deve R$ 260,50 para Mariana" sem acerto registrado, mas a Início só mostra o mês corrente. Quem "fecha o mês" fica sem alerta de pendência antiga. | `/acerto?period=2026-09` x Início | NEED-007 (fechar o mês sem discussão) |
| 3 | **I** | **Conta de origem padrão pode ser inadequada.** Em "Pagar fatura" e "Dar baixa", o padrão foi a última conta usada (Dinheiro, R$ 90,00), gerando o aviso "A conta de origem ficará negativa" com botão vermelho "Confirmar mesmo assim". O padrão deveria ser uma conta com saldo suficiente (ou a do titular do cartão). | Pagar fatura set/2026; Dar baixa no Condomínio | NEED-003, NEED-004; ergonomia de pagamento |
| 4 | **I** | **Mudar regra de divisão não mostra o impacto antes de salvar.** Texto "A mudança vale a partir de agora" não diz se mexe no mês em curso nem quanto muda no acerto. Percentuais iniciam em 50/50 sem sugerir a proporção das rendas (6.500 x 4.800, ≈ 58/42). Somente o Administrador altera: Lucas vê tudo em leitura, o que pode soar como "a regra é dela". | `/acerto/regra` | NEED-007, Q-08; confiança do casal |
| 5 | M | Erros de validação **não somem ao corrigir o campo** (só ao reenviar): em Transferir e Nova despesa prevista o campo segue vermelho com "Informe um valor maior que zero" mesmo com R$ 200,00 digitado, e o layout salta (pode atrapalhar o toque no botão). | Transferir; Nova despesa prevista | Qualidade percebida |
| 6 | M | Corrigir **forma de pagamento** (conta ↔ cartão) exige excluir e relançar ("Para mudar a forma de pagamento, exclua e lance novamente"). É o erro mais comum de lançamento rápido. | Editar lançamento | US-013 (já ressalvada: contorno existe) |
| 7 | M | Ações de editar/excluir/histórico ficam atrás de um "…" sem rótulo dentro do detalhe (2 toques para descobrir). O toast "Desfazer" após excluir some em poucos segundos; a restauração depende de "Mostrar excluídos". | Extrato > lançamento | US-013 |
| 8 | M | "Categorias" só existe no menu do avatar e no link dentro do formulário; fora da navegação principal. | Menu do usuário | NEED-001/US categorias |
| 9 | M | Transferência e acerto aparecem como **duas linhas** no Extrato/Início ("Mesma transferência") — ruído em listas curtas e no mobile. | Início, Extrato | NEED-002 |
| 10 | M | Tela de A pagar não lista faturas de cartão (só a Início lista "A pagar" com fatura); duas visões diferentes do mesmo conceito. | `/previstas` x Início | NEED-003/004 |
| 11 | M | Convite pendente só oferece "Cancelar convite": sem "Copiar link" nem "Reenviar". Se o e-mail cair no spam, o casal trava. O texto do e-mail exige conta Google do mesmo e-mail (adequado, mas pouco visível antes de enviar). Não consegui concluir o aceite (exige Google). | `/familia` | NEED-001, NEED-012 |
| 12 | M | Nenhum "limpar filtros" visível no Extrato; filtros de combo sem rótulos acessíveis ("Todas/Todos"). Filtros por membro, tipo, cartão, categoria e divisão funcionaram. | `/extrato` | NEED-006 |
| 13 | M | Salvar regra não leva de volta ao Acerto (fica na tela da regra); botão flutuante (+) cobre "Salvar regra" no mobile/viewport baixo. | `/acerto/regra` | Ergonomia |
| 14 | M | "Saldo da família" soma contas pessoais e a poupança; não mostra dívida em aberto no cartão (R$ 134,90) nem "livre de verdade". Já previsto em NEED-009/011 (fora do R1+R2), só registro a expectativa. | Início | NEED-009, NEED-011 |
| 15 | M | Console do navegador acumulou respostas HTTP 500/511 e "An unknown error occurred when fetching the script" (sem efeito visível; nenhuma chamada `/api/v1` falhou além do 409 esperado de categoria duplicada). Parece ruído do ambiente dev/túnel; registrar para o QA. Em um clique no "mês anterior" do Acerto no mobile a página demorou a reagir; não reproduzi de forma confiável. | Console | Qualidade |

Nenhum achado **Bloqueante**. Não encontrei perda de dados, divergência de saldo nem lançamento duplicado.

## 5. A dor "fechar o mês em casal" foi resolvida?

Sim, com ressalvas de confiança. O fluxo ponta a ponta (lançar → ver quem deve a quem → pagar o acerto → pagar a fatura → baixar as contas) funciona e é rápido. O que ainda gera risco de nova discussão é a **explicação** do acerto (achados 1, 2 e 4): o casal precisa entender de onde vem o número tanto quanto precisa do número certo.

## 6. Parecer final

**HOMOLOGA COM RESSALVAS.**

Condições para homologação plena (sem nova rodada de testes de ponta a ponta, apenas conferência):
1. Corrigir o rótulo de regra no Acerto para refletir a regra **vigente em cada lançamento/mês** (ou mostrar "50% até 03/10; 58/42 a partir de 04/10") — achado 1.
2. Sinalizar pendência de meses anteriores na Início (ou no Acerto) — achado 2.
3. Padrão de conta de origem com saldo suficiente (ou titular) nos pagamentos — achado 3.
4. (Recomendado) Prévia do impacto ao trocar a regra e sugestão de proporção pela renda — achado 4.

Os demais itens são melhorias e podem ir para o AP1/AP2 conforme o PO.

## 7. Posição do Stakeholder sobre Q-18..Q-22

| Pergunta | Opinião do Stakeholder | Observação do teste |
| :--- | :--- | :--- |
| **Q-18** compra no dia do fechamento entra na fatura que fecha | De acordo (hipótese "sim"), **desde que o app mostre a data de fechamento ao lançar**. | A tela já mostra "Entra na fatura de out/2026 · fecha 25/10" ao escolher o cartão: ótimo. |
| **Q-19** travar dias do ciclo após a primeira compra | Aceitável no R2: casal troca de cartão/dia de vencimento raramente. Pedir apenas mensagem clara quando bloqueado. | Não testei edição do ciclo. |
| **Q-20** crédito da compra no cartão vai a quem **comprou**, não a quem paga a fatura | **Sensível.** Aceito como regra padrão, mas espero que o acerto deixe visível "pagou por compra" x "pagou a fatura". Se o casal usa o cartão de um só para tudo e o outro paga a fatura, o acerto não reflete o desembolso real. Peço que o Gestor decida com o casal; deixar como opção por família no AP2. | No teste a fatura foi paga pela Conta corrente (de quem comprou), então a divergência não apareceu. |
| **Q-21** pagar fatura com valor diferente (parcial/juros/desconto) | Confirmo AP1/AP2: no R2 pagamento integral basta. | Pagar fatura ofereceu só o total, com texto "O pagamento é sempre o valor total". |
| **Q-22** "Dividir com a família" da previsão decidido no cadastro (padrão ligado) | De acordo. | Previsões nasceram "Comum" e a baixa herdou o rateio; funciona. |

## 8. Rastreabilidade

NEED-001, NEED-002, NEED-003, NEED-004, NEED-006, NEED-007, NEED-012 (convite/acesso); Q-08/D-GES-08, Q-13/D-GES-03, Q-17/D-GES-04, Q-18..Q-22.

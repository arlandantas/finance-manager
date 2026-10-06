# Feedback do usuário — testes da R2.1 (2026-10-05)

Fonte: usuário (dono do produto), em testes pelo navegador. Transcrito sem edição de mérito; base da definição de escopo da **v0 (primeiro alpha tester)**.

1. O card "primeiros passos" é genial. No **modo escuro** o hover fica com fundo branco e letra branca. Revisar o visual geral do app para que isso não aconteça em outros pontos (contraste de hover/foco/estados em todos os componentes).
2. A quantidade de números na Início ainda incomoda. A Início deve ser simples: **lançar nova despesa, ver o que está pendente nos próximos dias e o extrato recente** (acompanhamento diário dos gastos da família). Os cards de resumo/saldos são úteis, mas fogem desse objetivo: a análise geral do mês é mais pontual. Ideias: movê-los para uma tela secundária, ou deixá-los colapsados no topo da Início, ou levá-los para a tela de Extrato — e o card de pesquisa/filtros do Extrato passa a ser colapsável e vir **fechado por padrão**.
3. Ao cadastrar despesa prevista (inclusive recorrente), selecionar **a conta com a qual se prevê pagar**. Na tela "A pagar", mostrar um **resumo das contas em aberto por conta de pagamento**, talvez com saldo atual e saldo previsto de cada conta.
4. **Despesa recorrente**: o sistema tem? Não foi encontrado onde cadastrar. Considerado importante já nas versões iniciais.
5. Bug: no detalhe de um lançamento de cartão, ao clicar em remover a compra o modal de confirmação abre, mas o modal de detalhe continua ativo (não é coberto pelo fundo do novo modal).
6. Opção de **excluir contas do "saldo atual"** (ex.: reserva de emergência não é saldo disponível): a conta existe e pode ser movimentada, mas não entra nos saldos.
7. **Transferência prevista/agendada** entre contas (ex.: guardar um valor todo mês na reserva de emergência).
8. O horário do PC foi corrigido e o login Google funcionou perfeitamente.
9. A **barra de navegação ainda está no topo** em desktop (esperado: lateral/outra posição — confirmar intenção com o usuário se houver dúvida; a US-038 entregou menu superior).
10. Botão **"limpar todos os filtros"** no Extrato.
11. Card Resumo do Mês: renomear "A pagar" para **"Previstas"**, como subnível das despesas. Despesas = Previstas + Não previstas. Previstas = Faturas + A pagar (em aberto) + pagas. Não previstas = demais despesas lançadas no mês.

Diretriz do usuário: foco em lançar a **v0** para o primeiro alpha tester (o próprio usuário, uso no dia a dia), com ambiente produtivo; o time decide e conduz sem interferência dele; **tokens são escassos: usar com sabedoria**.

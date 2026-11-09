# "Adicionar" único: design

Data: 2026-11-08. Origem: testes do usuário em produção (Vercel). **Aprovado pelo usuário em 2026-11-08.**

## Intenção

No dia a dia o usuário registra uma despesa que acabou de acontecer, e isso tem de ser rápido. Uma vez por mês ele senta para organizar: o que vai receber, o que tem a pagar, para quais contas mandar os valores. O app deve brilhar nesse segundo momento. Hoje a criação está espalhada em várias portas, e o usuário não achou receita prevista nem transferência recorrente.

## Estado atual (verificado no código)

- O "+" flutuante global (`src/components/quick-add.tsx`) abre o `TransactionDrawer`, que já é uma "porta única" parcial (spec 04b, US-090/091): tipo Despesa/Receita, "Quando?" (Já aconteceu / Vai acontecer), "Repetir todo mês", parcelamento com cartão. Com cartão em "Já aconteceu", "Todo mês" vira "Assinatura (todo mês)" (US-096d).
- "Vai acontecer" está indisponível para Receita e com cartão. Receita prevista só existe em Previstas (`planned-drawer.tsx`).
- Transferência não está na porta: avulsa em Contas ("Transferir", `contas/transfer-drawer.tsx`); prevista e mensal só em Previstas, aba Transferências (`planned-transfer-drawer.tsx`).
- O "+" aparece em todas as telas, exceto 4 rotas (`HIDE_FAB_ROUTES` em `app-shell.tsx`).

## Objetivos

1. Um só lugar para criar: o "+" abre um modal único. "O que é?" = Despesa, Receita ou Transferência; "Quando?" = Já aconteceu ou Vai acontecer; os campos de baixo variam conforme as duas escolhas.
2. O modal abre sempre em **Despesa · Já aconteceu**, em qualquer tela. O comportamento do "+" não se adapta à tela.
3. Receita "Vai acontecer" e "Todo mês" (salário, por exemplo) criada nesse modal. Receita mensal exige série de receita no servidor (exceção aprovada ao não objetivo de não mudar servidor).
4. Transferência criada nesse modal: já aconteceu, vai acontecer e todo mês. Origem e destino no lugar de categoria e "pagar com".
5. "Assinatura" deixa de ser nome de interface; o rótulo passa a ser **"Todo mês no cartão"** (palpite do designer, ainda pode mudar). Só o texto muda: o modelo e as regras de assinatura ficam como estão.
6. O "+" só aparece em telas onde criar faz sentido (ver abaixo).

## Visibilidade do "+"

Regra invertida: lista de permitidas, decidida com o usuário.

- **Mostra:** Início, Extrato, Previstas (item "A pagar" do menu), Contas, Cartões e fatura de cartão, Assinaturas, Categorias.
- **Esconde:** Família, Configurações, Perfil, Acerto, Análise, Assistente, Tags, e qualquer rota nova por padrão.

## Não objetivos

- Não mudar regras de negócio, centavos, rateio, "Só meu", acerto, nem rotas e serviços de servidor, **exceto** a série mensal de receita (objetivo 3); a porta é orquestração no cliente (spec 04b invariante 3).
- Não unificar edição, baixa ("Pagar", "Receber", "Efetivar") nem as telas de listagem. Só a criação.
- Não renomear a tela "Assinaturas" além do texto "assinatura" visível ao usuário, se o builder julgar que cabe (ver "Deixado ao builder").

## Anti-objetivos (seria falha mesmo que tecnicamente funcione)

- Despesa pontual ficar mais lenta ou com mais campos do que hoje. O caminho "valor, categoria, conta, salvar" não pode ganhar nenhum toque.
- Perder qualquer capacidade existente (parcelar, dividir, "Só meu", série, assinatura, transferência recorrente).
- O "+" cobrir "Salvar" em telas de formulário de página inteira (motivo original de `HIDE_FAB_ROUTES`).

## Restrições do projeto

`docs/rules/frontend.md`, `dinheiro-centavos.md`, `seguranca-lgpd.md`, `testing.md`. Fontes ≤300 linhas (o `transaction-drawer.tsx` já tem ~834: extrair ao tocar, não crescer). Mudou regra de negócio, atualizar spec 04b e 04 no mesmo commit. Textos em pt-BR.

## Decidido pelo usuário

- Desenho A: tipo e "quando" no topo do mesmo formulário.
- Despesa pontual como padrão do dia a dia.
- "+" fixo em algumas telas, com funcionamento idêntico em todas, e escondido onde não faz sentido (lista acima).

## Confirmado pelo usuário (eram palpites)

- Transferência "Já aconteceu" também entra no modal e a tela "Transferir" de Contas passa a abrir o mesmo modal.
- Os modais de criação de Previstas (`planned-drawer`, `planned-transfer-drawer`) deixam de ser portas de criação; "Nova prevista" e "Nova transferência prevista" abrem o modal único já em "Vai acontecer" (exceção ao "sempre Despesa · Já aconteceu", só para esses botões de dentro da tela Previstas).
- Edição de série e de prevista continua nos drawers atuais.

## Decisões do designer (conferir ao ler)

- "Vai acontecer" com **cartão** continua indisponível (despesa e transferência não usam cartão); só Receita deixa de ser bloqueada. Regra de `door.ts` `availability` muda só para Receita.
- O rótulo "Todo mês no cartão" fica fixado; atualizar spec 04b, BDD e testes que citam "Assinatura (todo mês)".
- Ao trocar o tipo, valor e descrição são mantidos; categoria, conta e campos específicos que não valem no novo tipo são limpos (comportamento atual de `switchKind`, estendido a Transferência).
- Série mensal de **receita**: pelo código lido, `recurring-service.ts` não tem `kind` (só despesa). Receita única prevista já funciona no servidor. Receita todo mês entra no escopo (aprovado) e exige mudança de servidor: história própria, com ADR e migração expand se preciso.

## Deixado ao builder

Divisão em histórias, ordem, extração de arquivos, nomes de componentes, estados de erro e foco, textos finos, testes. Previsão do designer: ao menos uma história para receita prevista na porta, uma para transferência na porta, uma para regra de visibilidade do "+" e rótulos, a série mensal de receita no servidor (antes da história de receita na porta) e a convergência dos modais de Previstas por último.

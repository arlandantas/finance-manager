# US-018 — Cadastrar uma despesa prevista

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-7 Despesas Previstas (fase 1) · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 2,2 · 5 |
| Status | Refinada (PO) |
| Depende de | US-005 (categorias, quem pagou), US-012 (Home) · integra faturas fechadas se a US-017a já existir |
| Rastreabilidade | NEED-004 (§2.1, RN-004.1) · NEED-001 (RN-001.2, RN-001.3) · NEED-002 (RN-002.2) · FLUXO-005 · D-PO-01, D-PO-11 |

## História
Como **membro da família**, quero **cadastrar contas que vão vencer (aluguel, condomínio, escola) com vencimento e responsável**, para **não esquecer nenhum compromisso e saber o que ainda falta pagar**.

## Regras de negócio aplicáveis
- Toda despesa prevista nasce **`PREVISTO`** (RN-004.1). Estados nesta release: **PREVISTO** e **PAGO** (a baixa é a US-019).
- Campos: **descrição** (obrigatória, 2 a 100), **valor previsto** (centavos > 0), **data de vencimento** (padrão hoje; **passada permitida**, vira "Atrasada"), **categoria** (de despesa, ativa), **responsável pelo pagamento** (membro; padrão = usuário logado; RN-001.2), **dividir com a família** (padrão ligado; define se a despesa real entrará no rateio quando for paga), observação opcional (até 500). **Autor** automático.
- **Uma despesa prevista NÃO é um lançamento** (D-PO-11): enquanto `PREVISTO` **não altera saldo de conta, não aparece no extrato, não entra nos totais do mês nem no acerto de contas**. Só vira despesa real na baixa (US-019), com o valor efetivamente pago.
- **Atrasada** é um destaque calculado (`PREVISTO` com vencimento anterior a hoje no fuso `America/Sao_Paulo`), não um terceiro estado.
- Enquanto `PREVISTO`: pode ser **editada** (todos os campos) e **excluída** (com confirmação). `PAGO`: travada (para corrigir, usar "Desfazer pagamento", US-019).
- **Recorrência** (mensal automática) é AP1: nesta release cada previsão é cadastrada à mão e **independente** das demais (editar uma não mexe nas outras).
- Todos os membros veem e gerenciam todas as previstas (D-PO-02).
- **Contas a pagar** (tela e bloco da Home): lista por **mês de vencimento**, com atrasadas primeiro. A Home mostra o bloco **"A pagar"**: atrasadas + as que vencem nos **próximos 7 dias** (hoje incluso), no máximo 5 itens, com link "Ver todas". Faturas de cartão **fechadas e não pagas** (US-017a) aparecem nesse mesmo bloco e na tela, com o rótulo "Fatura".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Despesa prevista

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E os membros "Mariana" e "Lucas"
    E Lucas está autenticado
    E hoje é 28/10/2026

  Cenário: Cadastrar despesa prevista
    Quando Lucas cadastra "Condomínio" de "R$ 650,00" com vencimento em 10/11/2026, categoria "Moradia" e responsável "Lucas"
    Então a despesa prevista aparece em "Contas a pagar" de novembro com estado "Previsto"
    E aparece o aviso "Despesa prevista cadastrada!"

  Cenário: Responsável padrão
    Quando Lucas cadastra uma despesa prevista sem escolher o responsável
    Então o responsável é "Lucas"

  Cenário: Registrar em nome de outro responsável
    Quando Lucas cadastra "Escola" de "R$ 1.200,00" com responsável "Mariana"
    Então o responsável pelo pagamento é "Mariana" e o autor é "Lucas"

  Cenário: Previsão não mexe no saldo, extrato, totais nem acerto
    Quando Lucas cadastra "Condomínio" de "R$ 650,00" com vencimento em 10/11/2026
    Então o saldo de "Itaú Lucas" continua "R$ 3.000,00"
    E a despesa não aparece no extrato
    E o total de despesas do mês não muda
    E o acerto de contas não muda

  Cenário: Vencimento passado fica atrasado
    Quando Lucas cadastra "Internet" de "R$ 120,00" com vencimento em 20/10/2026
    Então o item aparece com o destaque "Atrasada" e continua com estado "Previsto"

  Cenário: Campos obrigatórios
    Quando Lucas tenta salvar sem descrição, sem valor e sem categoria
    Então vê "Informe a descrição"
    E vê "Informe um valor maior que zero"
    E vê "Escolha uma categoria"
    E nada é cadastrado

  Cenário: Descrição muito curta
    Quando Lucas informa a descrição "A"
    Então vê "A descrição deve ter no mínimo 2 caracteres"

  Cenário: Editar despesa prevista
    Dado a despesa prevista "Condomínio" de "R$ 650,00"
    Quando Lucas altera o valor para "R$ 680,00" e o vencimento para 12/11/2026
    Então a previsão mostra "R$ 680,00" com vencimento em 12/11/2026

  Cenário: Excluir despesa prevista
    Dado a despesa prevista "Condomínio" de "R$ 650,00"
    Quando Lucas toca em "Excluir" e confirma "Excluir despesa prevista?"
    Então ela some de "Contas a pagar"

  Cenário: Conflito de edição
    Dado que Lucas e Mariana abriram a edição da previsão "Condomínio"
    Quando Mariana salva um novo valor
    E Lucas tenta salvar outro valor
    Então Lucas vê "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar."

  Cenário: Lista por mês de vencimento com total
    Dado as previsões "Condomínio" de "R$ 650,00" em 10/11/2026 e "Escola" de "R$ 1.200,00" em 05/11/2026
    Quando Lucas abre "Contas a pagar" de novembro
    Então vê "Escola" antes de "Condomínio"
    E vê o total a pagar "R$ 1.850,00"

  Cenário: Bloco "A pagar" na Home
    Dado a previsão "Internet" de "R$ 120,00" atrasada, "Luz" de "R$ 200,00" com vencimento em 30/10/2026 e "Condomínio" de "R$ 650,00" em 10/11/2026
    Quando Lucas abre a Home
    Então o bloco "A pagar" mostra "Internet" como atrasada e "Luz" vencendo em 30/10
    E não mostra "Condomínio", que vence depois de 7 dias

  Cenário: Faturas fechadas aparecem em "A pagar"
    Dado a fatura "out/2026" do cartão "Nubank Mariana" fechada com total "R$ 400,00" e vencimento 05/11/2026
    Quando Lucas abre "Contas a pagar" de novembro
    Então vê o item "Fatura Nubank Mariana" de "R$ 400,00" vencendo em 05/11

  Cenário: Previsão nasce como Só meu
    Dado que o interruptor "Dividir com a família" está desligado, que é o padrão
    Quando Lucas cadastra a previsão "Plano de saúde de Lucas" de "R$ 300,00" sem ligar "Dividir com a família"
    Então a previsão fica marcada como "Só meu"

  Cenário: Nenhuma despesa prevista
    Dado que a família não tem despesas previstas
    Quando Lucas abre "Contas a pagar"
    Então vê "Nenhuma conta a pagar neste mês" com o botão "Nova despesa prevista"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar" na nova previsão
    Então apenas uma previsão é cadastrada

  Cenário: Membro comum também cadastra
    Dado que Lucas é "Membro" e não "Administrador"
    Quando Lucas cadastra uma despesa prevista
    Então ela é cadastrada

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar" na nova previsão
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a previsão "Aluguel"
    Quando Lucas abre "Contas a pagar"
    Então não vê a previsão "Aluguel"
```

## Experiência (UX/estados)
[FLUXO-005](../../flows/FLUXO-005-despesas-previstas.md): tela **Contas a pagar** (`/previstas`) com seletor de mês, abas **A pagar** | **Pagas**, cartões com vencimento em destaque, *chip* "Atrasada" (cor **e** texto), valor, categoria, avatar do responsável e marcador Comum/Pessoal; total do mês no topo. Botão "Nova despesa prevista" (drawer com os campos acima; vencimento e observação em *Mais detalhes* quando padrão). **Bloco "A pagar"** na Home (US-012) com "Ver todas". Estados: skeleton, vazio, erro de leitura, enviando, sem conexão (padrão SDD-000 §7).

## Fora de escopo
Baixa/pagamento (US-019); recorrência e projeção automática (AP1); parcelamento; alertas externos (AP3); anexar boleto; valor variável por mês com histórico; previstas de cartão (parcelas, AP1).

## Perguntas em aberto / pontos para o Tech Lead
- Previsão **não** é `Transaction`: o TL define o modelo (hipótese do PO: entidade própria, que gera a despesa real na baixa) e como o bloco "A pagar" agrega previsões e faturas.
- **Q-22 (Stakeholder, não bloqueante)**: "Dividir com a família" é decidido no cadastro da previsão (padrão ligado). Confirmar com o casal; a baixa não o altera (edição posterior da despesa gerada, US-013, é possível).

## Histórico
- 2026-10-04 — Refinada a partir do esboço (Rascunho → Refinada). Home passa a ter o bloco "A pagar" (cenário próprio).
- 2026-10-04 — **Revisão pós-homologação (R2.1):** Q-22 revisada: "Dividir com a família" da previsão passa a nascer **Só meu** (US-030, D-PO-16), aguardando ratificação do Gestor.
- 2026-10-04 — **Cenário atualizado (D-PO-41, D-GES-15):** "Dividir com a família desligado" vira "Previsão nasce como Só meu" (padrão; revisa Q-22); testes de `previstas` ajustados pelo Dev com a US-030.

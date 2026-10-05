# US-036 — Detalhe da transação a partir da Home

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,3 · 3 |
| Status | **Especificada** (SDD-010, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-012, US-013a, US-007 |
| Corte | **Cortável, o último dos itens de ergonomia a sair** (ordem: tema, navegação desktop, polimento e, por fim, esta) |
| Rastreabilidade | Parecer item 12 · Homologação achado 7 · NEED-022 · FLUXO-013 · D-PO-21 |

## História
Como **membro da família**, quero **tocar num lançamento da Home e ver o detalhe ali mesmo, com editar, excluir e histórico à vista**, para **não ser levado ao Extrato inteiro nem procurar ações escondidas**.

## Regras de negócio aplicáveis
- Tocar num dos "Últimos lançamentos" da Home abre o **detalhe** (gaveta no mobile; painel lateral no desktop), **sem sair da Home**.
- O detalhe mostra: descrição, valor, data, categoria, conta ou cartão, **quem pagou**, autor, divisão ("Só meu" ou "Dividido 50% / 50%"), observação, situação ("excluída" quando aplicável) e, para compra no cartão, a **fatura** em que cai.
- **Ações rotuladas e visíveis** (achado 7): **Editar**, **Excluir**, **Histórico**; nada escondido atrás de "…". As regras de edição/exclusão são as da US-013a/013b/016b (ex.: despesa gerada por baixa ⇒ "Use Desfazer pagamento").
- "Ver no Extrato" é um link explícito (leva ao Extrato do mês do lançamento com ele em destaque); a aba Extrato continua existindo. O destaque é o parâmetro de interface **`highlight`** (D-PO-40): **só a tela do Extrato o lê** (rola e destaca o item); **não há contrato de API** para ele e a API o ignora. O detalhe abre por estado local e pode ser reaberto por `?tx=<id>`, sem rotas paralelas.
- Transferências e acertos abrem o detalhe com as ações cabíveis (desfazer), sem "Editar" (US-013b).
- O mesmo detalhe também é usado no **Extrato** (um único componente), eliminando a divergência de comportamento.
- Excluir mostra o aviso **"Desfazer"** por pelo menos 8 segundos (achado 7); restaurar continua em "Mostrar excluídos".
- Respeita "ocultar valores".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Detalhe da transação na Home

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E uma despesa "Mercado do bairro" de "R$ 150,50" paga por "Lucas" em 10/10/2026 na categoria "Supermercado"
    E Lucas está autenticado na Home

  Cenário: Tocar no lançamento abre o detalhe sem sair da Home
    Quando Lucas toca em "Mercado do bairro" nos últimos lançamentos
    Então vê o detalhe com "R$ 150,50" e "Supermercado" e "Nubank Conjunta" e "Pago por Lucas"
    E a Home continua aberta por trás

  Cenário: Ações visíveis sem menu escondido
    Quando Lucas abre o detalhe de "Mercado do bairro"
    Então vê os botões "Editar" e "Excluir" e "Histórico"

  Cenário: Editar a partir do detalhe
    Quando Lucas abre o detalhe e edita o valor para "R$ 160,00" e salva
    Então o detalhe mostra "R$ 160,00"
    E a Home atualiza o saldo e o resumo do mês

  Cenário: Excluir a partir do detalhe com desfazer
    Quando Lucas abre o detalhe e confirma "Excluir"
    Então a despesa sai dos últimos lançamentos
    E vê o aviso "Despesa excluída" com o botão "Desfazer" por pelo menos 8 segundos

  Cenário: Histórico de alterações
    Dado que a despesa foi corrigida uma vez por Mariana
    Quando Lucas abre o detalhe e toca em "Histórico"
    Então vê a alteração com autor "Mariana" e data

  Cenário: Link explícito para o Extrato
    Quando Lucas abre o detalhe de "Mercado do bairro"
    Então vê o link "Ver no Extrato"
    E ao tocar nele vê o Extrato com "Mercado do bairro" em destaque

  Cenário: Destaque de lançamento inexistente é ignorado
    Dado um endereço do Extrato com destaque de um lançamento que não existe
    Quando Lucas abre o endereço
    Então o Extrato abre normalmente sem nenhum item em destaque

  Cenário: Transferência abre o detalhe sem Editar
    Dado uma transferência de "R$ 200,00" de "Nubank Conjunta" para "Poupança"
    Quando Lucas abre o detalhe da transferência
    Então vê "Desfazer transferência"
    E não vê "Editar"

  Cenário: Despesa gerada por baixa orienta o desfazer
    Dado uma despesa gerada pela baixa de "Condomínio"
    Quando Lucas abre o detalhe e toca em "Excluir"
    Então vê "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento."

  Cenário: Compra no cartão mostra a fatura
    Dado uma compra de "R$ 90,00" no cartão "Nubank Lucas" em 10/10/2026
    Quando Lucas abre o detalhe da compra
    Então vê "Fatura de out/2026"

  Cenário: Lançamento já excluído por outro membro
    Dado que Mariana excluiu "Mercado do bairro" depois que Lucas abriu a Home
    Quando Lucas toca em "Mercado do bairro" e tenta excluir
    Então vê "Este lançamento foi alterado por Mariana. Recarregue para continuar."

  Cenário: Detalhe no celular e no desktop
    Dado viewports de 375 px e 1280 px
    Quando Lucas abre o detalhe de "Mercado do bairro"
    Então o detalhe é legível sem rolagem horizontal
    E os botões têm pelo menos 44 px de altura

  Cenário: Valores ocultos mascaram o detalhe
    Dado que os valores estão ocultos
    Quando Lucas abre o detalhe de "Mercado do bairro"
    Então o valor aparece como "R$ •••••"
```

## Experiência (UX/estados)
[FLUXO-013](../../flows/FLUXO-013-preferencias-navegacao-e-detalhe.md): gaveta inferior no mobile; painel lateral à direita no desktop; foco e Esc/voltar fecham o detalhe e devolvem o foco ao item.

## Fora de escopo
Anexos e comprovantes; comentários no lançamento; duplicar lançamento; corrigir forma de pagamento (achado 6, fica para depois).

## Perguntas em aberto / pontos para o Tech Lead
- **Respondido pelo TL** (SDD-010 §4.6): estado local + `?tx=<id>` (sem rotas paralelas); componente único `TransactionDetail` compartilhado com o Extrato.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 12) e do achado 7 da homologação.
- 2026-10-04 — **Revisão pós-TL (D-PO-40):** `highlight` é parâmetro de UI sem contrato de API; acrescentado o cenário de destaque inexistente. Tamanho 3 confirmado.

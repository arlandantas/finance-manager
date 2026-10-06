# US-052 — Aviso visível: compra parcelada ainda fica fora do acerto

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo · **R2.2 (ajustes da homologação de 2026-10-05)**, antes da R3-B |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,0 · 2 |
| Status | Refinada (PO) · aguarda SDD/estimativa do TL |
| Depende de | US-040a/b (entregue), US-030, US-029 |
| Corte | **Não cortar**; **sai de cena quando a US-042 for entregue** (cenário de remoção) |
| Rastreabilidade | Homologação R2.1 achado 1 (Importante) · NEED-003, NEED-007, NEED-018 · Q-F05 · D-PO-25, D-PO-49 · decisão do Gestor (aviso agora, sem antecipar a US-042) |

## História
Como **membro da família**, quero **ser avisado, no momento da compra parcelada e onde vejo o acerto, de que as parcelas ainda não entram na divisão**, para **não achar que o acerto está completo quando ele subestima o que o casal gastou junto**.

## Regras de negócio aplicáveis
- Hoje a compra parcelada nasce **"Só meu"** e o campo "Dividir com a família" mostra "Disponível em breve" em letra pequena (D-PO-25). O comportamento **não muda** nesta história (a US-042 continua a entrega que permite dividir); muda só a **visibilidade do aviso**.
- **Texto padrão do aviso** (um só texto em todos os lugares): **"Compras parceladas ainda não entram na divisão do acerto. Elas contam como Só meu até uma próxima versão."**
- **Onde aparece** (só com o acerto **ligado**, US-028; com o acerto desligado nada disso é exibido):
  1. **Formulário de compra no cartão**, quando o número de parcelas for **2 ou mais**: aviso em destaque (faixa informativa, não só texto auxiliar), logo abaixo do interruptor "Dividir", que fica desabilitado.
  2. **Painel de Acerto do mês**: se houver parcela **Só meu** de compra parcelada no mês, a linha "N despesas Só meu neste mês" (US-030) ganha o detalhe **"inclui N parcelas de compras parceladas (R$ X)"** e o aviso padrão.
  3. **Resumo do Mês** (indicador neutro do acerto, US-029): quando houver parcela no mês, o indicador ganha o ícone de informação com o aviso padrão.
  4. **Detalhe "Compra parcelada"** (Ver compra): linha "Fora do acerto" com o aviso.
- Linguagem **neutra** (sem "deve"/"deixou de pagar"). O aviso **não altera nenhum cálculo**: motor, cotas e totais permanecem idênticos (regressão S1..S16 e valores homologados).
- Compra **à vista** no cartão não mostra o aviso (continua com o "Dividir" normal).
- Aviso **dispensável por tela**? **Não**: precisa ser visível sempre, pois o risco é de subestimar o acerto.
- Quando a US-042 for entregue, **todos os avisos desta história são removidos** e o "Dividir" passa a funcionar na parcela.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Aviso de compra parcelada fora do acerto

  Contexto:
    Dado a "Família Silva" com o acerto de contas ligado
    E o cartão "Nubank Roxinho" com limite de "R$ 5.000,00"
    E Mariana está autenticada

  Cenário: Aviso em destaque ao parcelar em 2x ou mais
    Dado que Mariana abre o lançamento de compra no cartão "Nubank Roxinho"
    Quando Mariana escolhe 3 parcelas
    Então vê a faixa "Compras parceladas ainda não entram na divisão do acerto. Elas contam como Só meu até uma próxima versão."
    E o interruptor "Dividir com a família" está desabilitado

  Cenário: Compra à vista não mostra o aviso
    Dado que Mariana abre o lançamento de compra no cartão "Nubank Roxinho"
    Quando Mariana escolhe 1 parcela
    Então não vê a faixa "Compras parceladas ainda não entram na divisão do acerto"
    E o interruptor "Dividir com a família" está habilitado

  Cenário: Aviso some ao voltar para à vista
    Dado que Mariana abre o lançamento de compra no cartão "Nubank Roxinho"
    E escolheu 3 parcelas
    Quando Mariana escolhe 1 parcela
    Então não vê a faixa "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Acerto detalha as parcelas que ficaram de fora
    Dado uma compra parcelada "TV 55 polegadas" de "R$ 1.200,00" em 3x com a parcela de "R$ 400,00" em outubro de 2026
    Quando Mariana abre o Acerto de outubro de 2026
    Então vê "1 despesa Só meu neste mês (R$ 400,00)"
    E vê "inclui 1 parcela de compras parceladas (R$ 400,00)"
    E vê "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Acerto sem parcelas no mês não mostra o aviso
    Dado nenhuma compra parcelada com parcela em outubro de 2026
    Quando Mariana abre o Acerto de outubro de 2026
    Então não vê "inclui" parcelas de compras parceladas
    E não vê "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Resumo do Mês sinaliza a limitação
    Dado uma compra parcelada "TV 55 polegadas" com parcela em outubro de 2026
    Quando Mariana abre o Resumo do Mês de outubro de 2026
    Então o indicador de acerto traz o ícone de informação com "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Detalhe da compra parcelada informa que está fora do acerto
    Dado uma compra parcelada "TV 55 polegadas" de "R$ 1.200,00" em 3x
    Quando Mariana abre "Ver compra"
    Então vê a linha "Fora do acerto"
    E vê "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Nenhum número do acerto muda por causa do aviso
    Dado as despesas comuns de outubro de 2026 somando "R$ 3.169,90" e a cota de "R$ 1.584,95" a 50% e 50%
    E uma compra parcelada com parcela de "R$ 400,00" em outubro de 2026
    Quando Mariana abre o Acerto de outubro de 2026
    Então a cota de cada membro continua "R$ 1.584,95"
    E a diferença continua "R$ 1.149,95"

  Cenário: Acerto desligado não exibe o aviso
    Dado que o Administrador desligou o acerto de contas da família
    Quando Mariana abre o lançamento de compra no cartão "Nubank Roxinho"
    E escolhe 3 parcelas
    Então não vê a faixa "Compras parceladas ainda não entram na divisão do acerto"

  Cenário: Valores ocultos não escondem o aviso
    Dado que os valores estão ocultos
    E uma compra parcelada com parcela em outubro de 2026
    Quando Mariana abre o Acerto de outubro de 2026
    Então vê "Compras parceladas ainda não entram na divisão do acerto"
    E vê "R$ •••••"

  Cenário: Aviso removido quando a divisão de parcelas existir
    Dado que a divisão de compras parceladas no acerto (US-042) foi entregue
    Quando Mariana abre o lançamento de compra no cartão "Nubank Roxinho"
    E escolhe 3 parcelas
    Então não vê a faixa "Compras parceladas ainda não entram na divisão do acerto"
    E o interruptor "Dividir com a família" está habilitado
```

## Experiência (UX/estados)
Faixa informativa (cor neutra, ícone de informação, contraste nos dois temas), nunca modal nem bloqueio. Mesmo texto em todas as telas (componente único para facilitar a remoção na US-042). 375 px sem rolagem horizontal.

## Fora de escopo
Dividir a parcela (US-042); mudar o padrão "Só meu" da compra parcelada; comunicação externa ao casal (do Gestor); aviso em compras já feitas fora do mês consultado.

## Perguntas em aberto / pontos para o Tech Lead
- O Acerto e o Resumo já sabem distinguir "Só meu" por parcela? Custo de contar/somar as parcelas Só meu de compra parcelada no mês (consulta do SDD-011/014).
- Componente único do aviso e flag de remoção para a US-042.

## Histórico
- 2026-10-05 — Criada a partir do achado 1 (Importante) da homologação da R2.1 e da decisão do Gestor (aviso visível agora, sem antecipar a US-042).

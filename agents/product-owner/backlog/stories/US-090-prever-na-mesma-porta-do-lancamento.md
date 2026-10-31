# US-090 — Lançar ou prever na mesma porta ("Já aconteceu / Vai acontecer")

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-26 Previsão unificada (novo; liga EPIC-3 e EPIC-7) · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,2 (V8/U5/R3) · **5** (limite; fatiar em commits) |
| Status | **SDD pronto, aprovada para Dev** (2026-10-26): [SDD-031](../../../tech-lead/sdd/SDD-031-porta-unica-lancar-ou-prever-us-090-091.md), **5 pts confirmados pelo TL** (orquestração no cliente; botão "Salvar despesa/receita" em vez de "Salvar lançamento", **PO ajusta o Gherkin**) |
| Depende de | US-005, US-006, US-018, US-019, US-030. **Prepara** US-051 (receita prevista) e US-100 (transferência prevista, tipo "Transferência" na mesma porta) |
| Corte | Não depende de outras do pacote; a US-091 vem depois |
| Rastreabilidade | **NEED-031** (RN-031.1..6) · NEED-004, NEED-022 · FLUXO-001, FLUXO-005, **FLUXO-019** · D-GES-15 · D-PO-102 |

## História
Como **membro da família**, quero **escolher, no mesmo formulário, se a despesa já aconteceu ou vai acontecer**, para **não aprender duas portas nem repetir campos**.

## Regras
- O lançamento (FAB/"Nova despesa") ganha o seletor **"Quando? Já aconteceu | Vai acontecer"** — **padrão "Já aconteceu"**, mantendo a meta de lançar em < 10 s (RN-031.4: previsto é **opção, não etapa**). Os demais campos são os mesmos: valor, descrição, categoria, responsável, conta/cartão, divisão, "Só meu", tags.
- **"Já aconteceu" = lançamento real** (data não futura, regras de hoje). **"Vai acontecer" = prevista** (data = **vencimento**, pode ser futura; **"Pagar com"** opcional; sem efeito em saldo, extrato, totais ou acerto até a baixa). **A unificação de tela não unifica o efeito** (RN-031.2).
- **Efeito explícito antes de salvar** (RN-031.3): linha de apoio sob o seletor — "Já aconteceu: entra no extrato e nos saldos agora" / "Vai acontecer: fica em A pagar até você dar baixa; não muda saldo nem extrato" — e o botão muda: **"Salvar lançamento"** / **"Salvar previsão"**.
- **Padrões por modo mantidos e mostrados ao trocar:** previsão nasce **"Só meu" por padrão** (D-GES-15); lançamento real segue o padrão atual. Ao trocar de modo, o formulário mostra o aviso "Padrão deste modo: Só meu" e não apaga o que já foi digitado.
- Campos que só existem na previsão (vencimento, "Pagar com" opcional, responsável pelo pagamento) aparecem só em "Vai acontecer"; no cartão, "Vai acontecer" fica **indisponível** (compra no cartão não admite data futura); a cobrança mensal no cartão é a **Assinatura (US-096)**, oferecida em "Quando?" ao escolher um cartão, com a dica "No cartão, use Assinatura (todo mês)".
- Com a US-051, **receita** usa a mesma porta (tipo Receita + "Vai acontecer" = receita prevista). Enquanto ela não existir, "Vai acontecer" só aparece para **Despesa**.
- A tela "Previstas" e o cadastro próprio continuam existindo (mesmas regras); a porta é um **atalho único** para o mesmo serviço, sem duplicar regras.
- Permissões e travas de captura ("Só meu", pagador) valem como hoje, para ambos os modos (SEC-025/026/038).
- Erros e validações: iguais aos do modo escolhido; trocar de modo revalida a data (futura só em "Vai acontecer").

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Lançar ou prever na mesma porta

  Contexto:
    Dado a "Família Silva" com a conta "Corrente" e os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Padrão é lançar o que já aconteceu
    Quando Mariana abre "Nova despesa"
    Então "Já aconteceu" está selecionado
    E o botão é "Salvar lançamento"

  Cenário: Lançar o que já aconteceu mantém o caminho rápido
    Quando Mariana lança "Mercado" de "R$ 80,00" pela "Corrente"
    Então a despesa aparece no Extrato
    E o saldo da "Corrente" diminui "R$ 80,00"

  Cenário: Prever o que vai acontecer
    Dado que Mariana abre "Nova despesa"
    Quando Mariana seleciona "Vai acontecer"
    E informa "Condomínio" de "R$ 650,00" com vencimento em 20/10/2026
    E salva a previsão
    Então "Condomínio" aparece em "A pagar" com vencimento em 20/10/2026
    E não aparece no Extrato
    E o saldo da "Corrente" não muda

  Cenário: O efeito aparece antes de salvar
    Quando Mariana seleciona "Vai acontecer"
    Então vê "fica em A pagar até você dar baixa; não muda saldo nem extrato"
    E o botão é "Salvar previsão"

  Cenário: Previsão nasce Só meu e o aviso aparece ao trocar
    Quando Mariana seleciona "Vai acontecer"
    Então "Só meu" vem marcado
    E vê "Padrão deste modo: Só meu"

  Cenário: Trocar de modo não perde o que foi digitado
    Dado que Mariana digitou "Condomínio" e "R$ 650,00"
    Quando Mariana alterna entre "Já aconteceu" e "Vai acontecer"
    Então descrição e valor continuam preenchidos

  Cenário: Data futura só em Vai acontecer
    Dado que Mariana informa a data 20/10/2026
    Quando Mariana seleciona "Já aconteceu"
    Então vê "A data não pode ser futura"

  Cenário: Receita só aparece em Vai acontecer quando a receita prevista existir
    Dado que a receita prevista ainda não foi entregue
    Quando Mariana seleciona o tipo "Receita"
    Então "Vai acontecer" não está disponível

  Cenário: Previsão no cartão não é oferecida aqui
    Dado que Mariana escolhe o cartão "Nubank Lucas"
    Quando Mariana abre as opções de "Quando?"
    Então "Vai acontecer" fica indisponível com a dica "No cartão, use Assinatura (todo mês)"
```

## Fora de escopo
Remover a tela "Previstas"; previsão de parcelado; mudar o efeito da prevista; receita prevista (US-051).

# Pedidos ao Tech Lead — R2.2 (ajustes da homologação da R2.1)

*Atualizado: 2026-10-05 · De: Agente Product Owner · Para: Agente Tech Lead · Cópia: Gestor*
*Insumos: [`homologacao-r21.md`](../../stakeholder/homologacao-r21.md), [`US-052..US-055`](stories), [`backlog.md`](backlog.md) (seção R2.2, D-PO-48..52). Tamanhos do PO são **preliminares** (11 pts); peço **confirmação ou ajuste** e **SDD** (sugestão: **SDD-018 Ajustes da homologação R2.1**). A lentidão do servidor de dev (achado 8) é do TL e fica fora deste pedido.*

## 1. O que precisa de SDD e estimativa

| História | Pts (PO) | Pergunta principal ao TL |
| :-- | :-: | :-- |
| **US-052** Aviso do parcelado fora do acerto (**Must, prioridade 1**) | 2 | (1) O DTO do Acerto e o do Resumo já permitem contar/somar as **parcelas "Só meu" de compra parcelada** no mês (nº e valor) sem mudar o cálculo? (2) Componente único do aviso (mesmo texto em formulário, Acerto, Resumo e "Ver compra") e **como removê-lo** quando a US-042 sair (flag ou remoção simples). (3) Confirmar que "Dividir" desabilitado com 2x ou mais já é o comportamento atual (D-PO-25). |
| **US-054** Avisar antes de arquivar + "+" em Contas | 3 | (1) **Pré-checagem sem efeito colateral** dos impedimentos de arquivar cartão (fatura não paga, parcelas futuras, TL-16) e conta (saldo ≠ 0), reutilizando a regra do `archive`; a validação do servidor permanece. (2) Padrão global do botão "+" (espaço inferior reservado nas listas, menus abrindo para cima) em vez de ajuste por tela. |
| **US-055** Faturas na tela "A pagar" | 3 | (1) **Fonte única** do "A pagar" (Resumo, SDD-010 §4.2) para a lista e o total; propriedade de teste: total da tela = "A pagar" do Resumo. (2) Ordenação por vencimento misturando previstas e faturas; atrasadas só no mês corrente. (3) Impacto na rota `/previstas` e no DTO. |
| **US-053** Clareza de textos (selos, atividade, regra, olho) | 3 | (1) `FamilyEvent` do acerto guarda o novo estado (ligado/desligado)? Eventos antigos: só texto genérico, sem migração? (2) Esconder selos e filtros "Comum/Só meu" com o acerto desligado, sem tocar `isSharedExpense`. (3) Confirmar que o armazenamento do olho já é **por usuário e por dispositivo** (SDD-010), de modo que "Mariana mostrou, Lucas entra oculto" é o comportamento atual (decisão D-PO-50: mantido). |

## 2. Restrições
- **Nenhum cálculo muda** (cotas, totais, regressão S1..S16 e valores homologados 3.169,90 / 1.584,95 / 1.149,95). O pacote não toca no motor nem na EN-002.
- Ordem sugerida de execução: **US-052 ➔ 054 ➔ 055 ➔ 053**; ordem de corte: 053 ➔ 055 ➔ 054 (US-052 não se corta).
- Conflitos: o Dev deve coordenar com a EN-002/US-042 apenas na remoção do aviso da US-052 (o cenário "Aviso removido" já está na história).

## 3. O que o PO pede de entrega
1. Confirmar ou reestimar os pontos e apontar dependências técnicas que mudem a ordem.
2. SDD-018 com contratos, estados de UI (skeleton/vazio/erro), mapeamento Gherkin ➔ testes e a lista de testes de regressão a rodar.
3. Notas de Gherkin como em [`pedidos-ao-tech-lead-r21-r3.md`](pedidos-ao-tech-lead-r21-r3.md) §4 (sem `E, após…`, sem frases em várias linhas, todo cenário com `Dado`); se o parser colidir passos (DEV-25), o Dev ajusta e registra.

## 4. Histórico
- 2026-10-05 — Criado após a homologação da R2.1 e a decisão do Gestor (aviso visível do parcelado agora, sem antecipar a US-042).

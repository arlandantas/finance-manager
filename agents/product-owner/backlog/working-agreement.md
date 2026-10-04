# 🤝 Acordo de Trabalho do Backlog (PO ⇄ Tech Lead ⇄ Dev & QA)

*Responsável: Agente Product Owner · Atualizado: 2026-10-04*

Este documento fixa **como** o backlog é escrito, priorizado e consumido, para que agentes de IA (que não guardam contexto entre sessões) recebam histórias **autossuficientes e inequívocas**.

---

## 1. Método (padrões de mercado adotados)

| Prática | Origem | Como usamos |
| :--- | :--- | :--- |
| **User Story Mapping** | Jeff Patton | Espinha dorsal da jornada → releases por *fatias verticais* (ver [`backlog.md`](backlog.md#-mapa-da-jornada-story-map)). |
| **INVEST** | Bill Wake | Toda história é Independente, Negociável, Valiosa, Estimável, Pequena (≤ tamanho 5) e Testável. |
| **Fatiamento vertical** | Cohn / Lawrence | Cada história atravessa UI + regra + dados e entrega valor observável. Nada de "só a tabela" ou "só a tela". |
| **Walking Skeleton** | Cockburn | O primeiro incremento é o menor fluxo ponta a ponta (entrar → lançar → ver no extrato). |
| **MoSCoW** | DSDM | Define o *corte* de escopo de cada release (Must/Should/Could/Won't). |
| **WSJF** | SAFe | Define a *ordem* dentro do que é elegível: `(Valor + Urgência + Risco/Oportunidade) ÷ Tamanho`. |
| **BDD / Gherkin** | Dan North | Critérios de aceite executáveis (Playwright + playwright-bdd, ADR-001). |
| **Elaboração progressiva (just-in-time)** | Scrum / Lean | Só os próximos 2 incrementos são detalhados; o resto fica como esboço. |
| **Enablers técnicos** | SAFe | Trabalho técnico sem valor direto ao usuário recebe prefixo `EN-` e justificativa explícita. |
| **Definition of Ready / Done** | Scrum | Portões objetivos abaixo. |

> **Regra de precedência:** dependência dura > WSJF. O WSJF ordena apenas histórias cujas dependências já estejam entregues ou em andamento.

---

## 2. Fluxo de estados de uma história

```text
Rascunho ➔ Refinada (PO) ➔ Especificada (TL: SDD/ADR) ➔ Pronta p/ Dev ➔ Em Dev ➔ Em QA ➔ Aceita (Gestor/Stakeholder)
```

| Transição | Quem move | Condição |
| :--- | :--- | :--- |
| Rascunho ➔ **Refinada** | PO | Atende à *Definition of Ready do PO* (§3.1). |
| Refinada ➔ **Especificada** | Tech Lead | SDD publicado cobrindo contratos, gaps e testes (§3.2). |
| Especificada ➔ **Pronta p/ Dev** | Gestor | Alocada em sprint, sem pergunta aberta. |
| Em QA ➔ **Aceita** | Gestor (com Stakeholder para valor) | *Definition of Done* (§4) comprovada. |

---

## 3. Definition of Ready

### 3.1 DoR do PO (história "Refinada")
- [ ] Segue o *template* do §5, com **Como / Quero / Para** e valor explícito.
- [ ] Rastreabilidade: `NEED-xxx` + regras `RN-xxx.x` + fluxo/ADR quando existirem.
- [ ] Critérios de aceite em Gherkin, com **caminho feliz, validação, permissão e vazio/erro**.
- [ ] Exemplos numéricos concretos em **centavos/BRL** sempre que houver dinheiro.
- [ ] Seção **Fora de escopo** preenchida (evita crescimento silencioso).
- [ ] Dependências listadas por ID.
- [ ] Tamanho relativo ≤ 5; se maior, deve ser fatiada.
- [ ] Perguntas em aberto registradas — as bloqueantes impedem o avanço.

### 3.2 DoR de Dev (história "Pronta p/ Dev")
- [ ] DoR do PO atendida.
- [ ] SDD do Tech Lead cobre a história (tipos/Zod, API, estados de UI, gaps, **guia de testes**).
- [ ] Sem pergunta bloqueante em aberto.
- [ ] Dependências técnicas já entregues ou entregues na mesma sprint.

---

## 4. Definition of Done (história "Aceita")
- [ ] Todos os cenários Gherkin da história automatizados e passando.
- [ ] Testes exigidos no SDD implementados e passando (unidade, integração, E2E).
- [ ] `lint`, `typecheck` e `build` limpos; sem regressão nos testes existentes.
- [ ] Verificado em viewport **375 px** e **1280 px**; estados *loading / vazio / erro* implementados.
- [ ] Isolamento por família verificado (usuário de outra família não acessa o dado).
- [ ] Valores monetários em centavos inteiros ponta a ponta.
- [ ] Documentação atualizada (README/SDD/tasks-board) e commits atômicos com `Co-authored-by`.
- [ ] Gestor revisou a demonstração; Stakeholder homologou o valor (quando aplicável).

---

## 5. Template de história (para agentes de IA)

```markdown
# US-XXX — <título imperativo e curto>

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-xx · R1 / R2 / AP1… |
| MoSCoW · WSJF · Tamanho (PO) | Must · 0,0 · 3 |
| Status | Refinada (PO) |
| Depende de | US-xxx |
| Rastreabilidade | NEED-xxx · RN-xxx.x · FLUXO-xxx · ADR-xxx |

## História
Como <persona>, quero <ação>, para <valor>.

## Regras de negócio aplicáveis
## Critérios de aceite (Gherkin)
## Experiência (UX/estados)
## Fora de escopo
## Perguntas em aberto / pontos para o Tech Lead
```

**Convenções para escrever para agentes de IA**
1. **Sem conhecimento implícito**: tudo que a história assume vem escrito ou linkado.
2. **Nomes canônicos**: usar sempre os termos do glossário (§6).
3. **O quê, não como**: o PO descreve comportamento observável; contratos e tecnologia são do Tech Lead.
4. **Números concretos**: exemplos com valores (R$ 2.400,00 = `240000`) eliminam interpretações.
5. **Uma história = um resultado verificável**; se exige "e também…", divida.
6. **Mudança em história Refinada** gera linha no *Histórico* da própria história (data + motivo); nunca sobrescrever em silêncio.

---

## 6. Glossário canônico

| Termo | Definição |
| :--- | :--- |
| **Família** | Grupo isolado (tenant) que compartilha contas, categorias e lançamentos. |
| **Membro** | Pessoa com login Google vinculada a uma família. Papéis: **Administrador** e **Membro**. |
| **Lançamento** | Movimentação financeira registrada (despesa ou receita). |
| **Quem pagou** | Membro que efetivamente desembolsou. No MVP preenche *responsável pelo gasto* e *pagador* (ver D-PO-01). |
| **Autor do cadastro** | Usuário logado que registrou; automático e imutável. |
| **Despesa comum** | Despesa que entra no rateio familiar (`isSharedExpense = true`). |
| **Despesa pessoal** | Despesa individual, fora do rateio (RN-007.2). |
| **Acerto de contas** | Balanço do período entre membros e transferência sugerida para equilibrar. |
| **Período** | No MVP, **mês-calendário**. O ciclo com dia de corte configurável chega no AP1 (NEED-005). |
| **Saldo da conta** | Saldo inicial + entradas − saídas ± transferências. |

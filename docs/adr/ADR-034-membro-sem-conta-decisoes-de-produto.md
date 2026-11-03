# ADR-034 — Membro sem conta: decisões de produto do usuário (divisão, acerto, cartão, remoção)

**Status:** aceito (refina ADR-033 e prevalece sobre ele onde divergir) · **Data:** 2026-10-31 · **Autor:** usuário

## Contexto
O ADR-033 definiu o modelo técnico do membro sem conta. O usuário respondeu às perguntas de produto Q-TL-U1..U5 (D-GES-63), à SEC-060/062 (D-GES-64) e à Q-TL-93-1 (D-GES-66); parte delas altera a matriz do ADR-033.

## Decisão
1. **Divisão (Q-TL-U1):** a divisão `EQUAL` inclui o membro cadastrado nas despesas **novas**, com aviso no cadastro; quem não divide usa `PROPORTIONAL` com 0%. No cadastro **não** há a pergunta "Entra na divisão?" (D-GES-64a).
2. **"Só meu" (Q-TL-U2/U3):** ninguém, nem o Administrador, torna "Só meu" uma despesa dividida paga pelo sem conta até ele assumir o cadastro; só o Administrador cria "Só meu" em nome do sem conta (exceção à regra de criação em nome de terceiro).
3. **Destino do acerto (D-GES-66a):** para acerto com membro sem conta vale "qualquer conta, como hoje". Ficam **removidos** a validação `SETTLEMENT_DESTINATION_IS_DEBTOR` e a restrição "destino ≠ conta do devedor" da matriz do ADR-033; risco SEC-059b **aceito pelo usuário**.
4. **Cartão (D-GES-66b):** só o Administrador cadastra cartão com titular sem conta; `CARD_OWNER_ONLY` é mantido; para passar o cartão a quem não tem conta a saída é arquivar e o Administrador recriar.
5. **Nome (Q-TL-U4):** na criação da conta a pessoa escolhe o próprio nome; o rótulo do Administrador é provisório (ADR-033 §2.2). Nenhum nome em `family_events`.
6. **Remoção (Q-TL-U5):** remover um membro sem conta anonimiza o e-mail dos convites encerrados do cadastro.
7. **Vínculo (D-GES-64b):** "Desvincular conta" **não** entra; ao cadastro ser assumido, apenas aviso por e-mail aos Administradores (ADR-033 §8).

## Consequências
- Testes do acerto com sem conta não exigem conta de destino específica; o teste de cartão cobre `CARD_OWNER_ONLY` para sem conta.
- A ordem do uso real (NEED-033, 034, 032, 031, 028, 029, 030) e as hipóteses Q-U15..U24 (D-GES-62) vivem no backlog, não aqui.

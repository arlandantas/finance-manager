# ADR-029 — Privacidade para LLM: opt-in, payload só de agregados por allowlist e retenção mínima

**Status:** aceito (complementa ADR-028) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
O usuário autorizou o envio à Anthropic somente com opt-in da família e anonimização máxima (D-GES-27); só agregados, sem nomes, descrições, contas, membros nem datas exatas (D-GES-29).

## Decisão
1. **Consentimento por família e finalidade** (`SPENDING_ANALYSIS`; `INVOICE_IMPORT` reservada). Desligado por padrão; só `ADMIN` liga, confirmando o texto da **versão vigente**; registro append-only. Efetivo = último registro "ligado" **com versão vigente** (publicar versão nova desliga). Verificado no envio, dentro da transação que reserva custo, lendo o consentimento `FOR SHARE`.
2. **Payload por allowlist construída** (`buildAnalysisPayload`), validada por Zod `.strict()`. Permitido: mês **relativo** (0, −1…−5) e `partial`; por categoria `ref` opaco (`C1..`), rótulo saneado, ícone, totais em centavos e contagens; totais gerais; recorrentes como referências opacas (`R1..`) com categoria, média mensal, meses presentes e origem, **sem nome**. Mapeamento `Rk → descrição` fica só no banco local. **Proibido:** nomes/e-mails, UUIDs, contas/cartões, descrições, notas, tags, datas, `familyId`, pagador, rateio, saldos, limites.
3. **Rótulo de categoria** é o único texto livre: `sanitizeCategoryLabel` (NFKC, remove dígitos/`@`/URLs, substitui por "pessoa" qualquer parte do nome ou e-mail de membro atual ou ex-membro, ≤ 40 caracteres; vazio ⇒ "Outra categoria"). A tela "O que será enviado" mostra exatamente o enviado.
4. **Recategorização sem LLM:** sugestão por regra local (chave de descrição normalizada com ≥ 3 lançamentos em 6 meses e categoria majoritária ≥ 70%); nada sai do app.
5. **Prova automatizada:** schema `.strict()` + `assertNoIdentifiers`; teste de propriedade (≥ 200 famílias com dados "maliciosos") comparando byte a byte o recebido pelo Fake com o exibido; snapshot da lista de chaves permitidas (acrescentar campo exige mudar teste e ADR).
6. **Retenção:** `spending_analyses` guarda payload, resultado e mapeamento local até o usuário apagar (`DELETE` físico), com expurgo após 24 meses; `llm_usage_events` sem conteúdo, 24 meses; consentimentos enquanto a família existir. Logs nunca com conteúdo.
7. **Texto do opt-in** não promete "retenção zero" nem "sem treino" até o Gestor confirmar os termos comerciais; deve informar que o provedor fica fora do Brasil (LGPD art. 33). Antes de produção com IA: página "Como tratamos seus dados", apagar análises e desligar funcionando.

## Consequências
- A análise fala de categoria e padrão, nunca do estabelecimento. Descartados: enviar descrições generalizadas, blocklist de objetos de domínio, consentimento por membro.
- Importação de fatura (arquivo bruto) não cabe neste ADR (D-GES-28).

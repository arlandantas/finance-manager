# SDD-022: Opt-in de privacidade por família e finalidade (EN-005)

- **História**: [EN-005](../../product-owner/backlog/stories/EN-005-opt-in-de-privacidade-para-ia.md) · **Fluxo**: [FLUXO-016](../../product-owner/flows/FLUXO-016-privacidade-e-consentimento-ia.md) §1, §2, §4
- **Rastreabilidade**: RN15, RN16 · NEED-023 (RN-023.1), NEED-026 §4, NEED-027 (RN-027.1, 027.8) · D-PO-58 · D-GES-27 · **[ADR-029](../adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md)** (leitura obrigatória) · ADR-028
- **Depende de**: SDD-003/012 (papéis, `findActiveMembership`, ex-membro), SDD-021 (bloco de consumo na mesma tela; `runLlm` chama `assertConsentEffective`)
- **Status**: **Aprovado para Desenvolvimento** (R4-B) · **Autor**: Agente Tech Lead · **Executor**: Dev & QA (Sonnet)
- **Estimativa**: **5** (confirma o PO) — §9.

---

## 1. Gaps técnicos e decisões
| Gap | Resolução |
| :-- | :-- |
| Finalidades | `SPENDING_ANALYSIS` (ativa na R4). `INVOICE_IMPORT` existe no enum mas a UI **não** mostra o interruptor até a R5 (D-GES-28); a API responde `422 PURPOSE_NOT_AVAILABLE`. O cenário BDD "Importar faturas" vira **cenário da R5**; na R4 os cenários rodam com "Análise de gastos" (pedido ao PO, §9). |
| Versionamento do texto | Constante `AI_CONSENT_TEXTS` em `src/modules/ia/consent-texts.ts`: `{ SPENDING_ANALYSIS: { version: 1, summary, details[] } }`. Mudar o texto = novo objeto com `version + 1` (teste: *snapshot* do texto amarrado à versão; mudar o texto sem subir a versão falha). |
| Estado efetivo | Último evento da finalidade é `ENABLED` **e** `textVersion = versão vigente`. Calculado, nunca armazenado. |
| Corrida ligar × desligar × envio | `families` `FOR UPDATE` em ligar/desligar; `runLlm` lê o estado com `SELECT … FROM families … FOR SHARE` na transação da reserva (SDD-021 §4.4). Ligar/desligar com `version` da família (`409 VERSION_CONFLICT`). |
| Idempotência | `Idempotency-Key` nas duas mutações; ligar já ligado (mesma versão) ⇒ `200` sem novo evento; desligar já desligado ⇒ `200` sem evento. |
| Quem ligou | `memberId` + nome atual do membro (ex-membro: "ex-membro" + nome guardado, ADR-019). |
| Desligar não apaga | Nenhuma cascata; teste de *checksum* de `transactions`, `spending_analyses`. |
| Mensagens nas telas de IA | `AiFeatureStateDTO.reason`: `ON`, `OFF`, `NEEDS_RECONSENT` (versão mudou), `UNAVAILABLE` (flag/teto, SDD-021). |

---

## 2. Contratos
```typescript
// src/modules/ia/consent-schemas.ts
export const AiPurposeSchema = z.enum(["SPENDING_ANALYSIS", "INVOICE_IMPORT"]);
export const EnableConsentSchema  = z.object({ textVersion: z.number().int().min(1), familyVersion: versionSchema }).strict();
export const DisableConsentSchema = z.object({ familyVersion: versionSchema }).strict();

export type AiFeatureStateDTO = {
  purpose: "SPENDING_ANALYSIS" | "INVOICE_IMPORT";
  available: boolean;                                   // false p/ INVOICE_IMPORT na R4 e com IA indisponível
  state: "ON" | "OFF" | "NEEDS_RECONSENT" | "UNAVAILABLE";
  currentText: { version: number; summary: string; details: string[] };
  lastChange: { action: "ENABLED" | "DISABLED"; at: string; by: { id: string; name: string; former: boolean }; textVersion: number } | null;
};
export type AiSettingsDTO = {
  canEdit: boolean;                                     // role === ADMIN
  features: AiFeatureStateDTO[];
  usage: AiUsageDTO | null;                             // SDD-021; null p/ não-ADMIN
  familyVersion: number;
};
export function assertConsentEffective(tx, familyId: string, purpose: AiPurpose): Promise<void>; // AI_DISABLED (409) com details.state
```

## 3. API (`auth: "family"`)
| Rota | Quem | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/ai/settings` | todos | `200 AiSettingsDTO` | — |
| `POST /api/v1/ai/consents/:purpose/enable` | ADMIN | `200 AiSettingsDTO` | `403 FORBIDDEN` "Só o Administrador pode ligar ou desligar" · `409 VERSION_CONFLICT` · `422 CONSENT_TEXT_OUTDATED` "O texto mudou. Leia a nova versão para ligar" (textVersion ≠ vigente) · `422 PURPOSE_NOT_AVAILABLE` · `400` |
| `POST /api/v1/ai/consents/:purpose/disable` | ADMIN | `200 AiSettingsDTO` | `403` · `409` · `422 PURPOSE_NOT_AVAILABLE` |

## 4. Regras
- `enable`: `families FOR UPDATE` ➜ confere `familyVersion` ➜ `textVersion === AI_CONSENT_TEXTS[p].version` ➜ se já efetivo, retorna ➜ `INSERT ai_consent_events { ENABLED, textVersion, memberId }` ➜ `families.version + 1` ➜ `FamilyEvent(AI_CONSENT_CHANGED)` (o mesmo mecanismo do SDD-012).
- `disable`: idem com `DISABLED` (sem exigir versão de texto).
- O cliente **nunca** envia o texto; só a versão que exibiu (prova de que viu a vigente).

## 5. Dados (`en005_ai_consent`)
```prisma
enum AiConsentAction { ENABLED DISABLED }
model AiConsentEvent {            // append-only (sem UPDATE/DELETE: gatilho recusa)
  id          String          @id @default(uuid()) @db.Uuid
  familyId    String          @db.Uuid
  purpose     LlmPurpose
  action      AiConsentAction
  textVersion Int
  memberId    String          @db.Uuid
  createdAt   DateTime        @default(now()) @db.Timestamptz(3)
  member Member @relation(fields: [familyId, memberId], references: [familyId, id])
  @@index([familyId, purpose, createdAt(sort: Desc)])
  @@map("ai_consent_events")
}
```
```sql
CREATE FUNCTION ai_consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ai_consent_events is append-only' USING ERRCODE = 'check_violation'; END $$;
CREATE TRIGGER ai_consent_no_update BEFORE UPDATE OR DELETE ON ai_consent_events FOR EACH ROW EXECUTE FUNCTION ai_consent_append_only();
```

## 6. Interface
- **Configurações ▸ IA e privacidade** (rota `/familia/ia` ou seção em Configurações, conforme o layout atual): bloco "Recursos da família" com o interruptor **"Análise de gastos"** (`role="switch"`, `aria-checked`, ≥ 44 px) e o resumo de uma frase; ADMIN: tocar no interruptor desligado abre `Dialog` com `summary`, "Ver como tratamos seus dados" (expande `details`) e os botões **"Entendi e quero ligar"** / "Cancelar"; o estado só muda com a resposta `200` (sem otimista: é consentimento). Desligar: confirmação simples "Desligar a análise de gastos?".
- Membro: interruptores `disabled` + "Só o Administrador pode ligar ou desligar".
- `NEEDS_RECONSENT`: selo "O texto mudou: confirme de novo" e o interruptor aparece desligado.
- Detalhe: "Ligado por Mariana em 24/10/2026" (data em SP).
- Telas que usam IA leem `GET /ai/settings` e mostram: OFF ⇒ "A análise por IA está desligada nesta família" + (ADMIN) atalho "Ligar em IA e privacidade" / (membro) "Peça ao Administrador"; UNAVAILABLE ⇒ "A IA ainda não está disponível".
- Cache `["ai-settings"]`; invalidado por ligar/desligar e pelo `FamilyEvent`.

## 7. Segurança
Papel verificado no servidor (não pela UI); `:purpose` validado pelo enum (`400`); isolamento por `familyId` da sessão; teste de outra família ⇒ 404/403.

## 8. Testes obrigatórios
| Cenário BDD | Testes |
| :-- | :-- |
| Recursos nascem desligados | **I**: família nova ⇒ `state OFF` em todas. **E**. |
| Ligar exige ler e confirmar | **E/C**: diálogo com o texto da versão vigente e "Entendi e quero ligar"; fechar ⇒ continua OFF; **I**: `enable` sem `textVersion` ⇒ 400. |
| Consentimento registra quem e quando | **I**: evento com `memberId`, `textVersion 1`; DTO "Mariana", data. **E**: "Ligado por Mariana em 24/10/2026". |
| Membro comum não altera | **I**: MEMBER ⇒ 403. **E**: interruptores desabilitados + texto. |
| Recurso desligado bloqueia o envio | **I**: `runLlm` com OFF ⇒ 409 `AI_DISABLED`, `fake.calls.length = 0`, sem reserva. |
| Desligar vale na hora e não apaga | **I**: *checksum* antes/depois; `runLlm` imediatamente depois ⇒ 409. (infra) corrida: `Promise.all([disable, runLlm])` ⇒ nunca uma chamada ao provedor iniciada **depois** do `COMMIT` do disable (ordenar por instantes registrados no fake). |
| Mudança no texto exige novo consentimento | **U**: com `AI_CONSENT_TEXTS` v2 injetado ⇒ `NEEDS_RECONSENT`; **I**: `enable` com `textVersion 1` ⇒ 422 `CONSENT_TEXT_OUTDATED`. |
| (infra) Append-only | **I** SQL cru: `UPDATE`/`DELETE` ⇒ `check_violation`. |
| (infra) Texto amarrado à versão | **U**: *snapshot* `{version, hash(texto)}`. |
| (infra) Idempotência/versão | **I**: dois `enable` com mesma chave ⇒ 1 evento; `familyVersion` velha ⇒ 409. |

## 9. Estimativa, *commits* e pedidos
**5**: migração + gatilho (1); serviço/rotas/`assertConsentEffective` (2); tela + diálogo + estados nas telas de IA (2).
*Commits*: (1) migração; (2) textos versionados + serviço + rotas; (3) UI.
**Pedidos ao PO**: (a) cenários da EN-005 trocarem "Importar faturas" por "Análise de gastos" na R4 (importação na R5); (b) texto v1 da análise conforme ADR-029 §7 **com a menção de que o provedor fica fora do Brasil**; (c) remover da tela a frase sobre o arquivo da fatura até a R5.

# ADR-009: Idempotência de mutações e controle otimista de concorrência

## Status
Aceito (Tech Lead). Detalha o ADR-001 ("`Idempotency-Key` e `version` → 409") e o ADR-004.

## Decisão
### Idempotência
1. **Toda mutação** (`POST/PATCH/PUT`) exige o header `Idempotency-Key` (UUID v4 gerado no cliente **uma vez por intenção do usuário**, mantido ao reenviar após falha, regerado após sucesso). Ausente ou inválido → `400 IDEMPOTENCY_KEY_REQUIRED`.
2. **Tabela `IdempotencyRecord`** com `UNIQUE (userId, key)` (escopo por usuário, pois a criação da família ocorre antes de existir família). Guarda `method`, `path`, `requestHash` (SHA-256 do corpo canônico), `responseStatus`, `responseBody`.
3. **Mesma transação de banco** da mutação: o handler (a) executa `INSERT … ON CONFLICT DO NOTHING` do registro; (b) se inseriu, executa a mutação, grava a resposta no registro e comita; (c) se não inseriu (a segunda requisição concorrente espera o *commit* da primeira por causa do índice único), lê o registro: mesmo `requestHash` → **reenvia a resposta guardada** com header `Idempotent-Replay: true`; hash diferente → `422 IDEMPOTENCY_KEY_REUSED`. Não existe estado "em andamento" visível.
4. Somente respostas `2xx` e erros de **regra de negócio determinísticos (4xx exceto 401/403/409/429)** são guardados; falhas `5xx`/rollback não gravam registro (a repetição reexecuta). Respostas `409 VERSION_CONFLICT` **não** são guardadas (reenvio após recarregar usa nova chave).
5. Retenção de 24 h; limpeza oportunista (`DELETE … WHERE createdAt < now() - interval '24 hours'`) a cada ~100 mutações ou por job pg-boss quando existir (ADR-003).

### Controle otimista
6. Entidades editáveis (`Transaction`, `TransferGroup`, `BankAccount`) têm `version Int` (inicia em 1). A edição envia `version` no corpo; o *update* é `WHERE id = :id AND familyId = :fid AND version = :v`; 0 linhas afetadas + registro existente → `409 VERSION_CONFLICT` com `details.currentVersion` e `details.updatedBy` (membro que alterou por último). Sucesso incrementa `version` e devolve a entidade.
7. Substitui a sugestão do SDD-001 original (`updatedAt` como versão).

## Consequências
- Cliques duplos e reenvios de rede são seguros; compatível com a futura fila offline (ADR-004).
- Custo: uma escrita extra por mutação (aceitável para o volume).

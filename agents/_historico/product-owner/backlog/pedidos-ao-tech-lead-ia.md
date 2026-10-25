# Pedidos ao Tech Lead — R4: parcelas já pagas, LLM (fatura e análise) e MCP

*Atualizado: 2026-10-24 · De: Agente Product Owner · Para: Agente Tech Lead · Cópia: Gestor*
*Insumos: [`US-065..US-077`](../../../product-owner/backlog/stories), [`EN-004..EN-006`](../../../product-owner/backlog/stories), [`decisoes-po-ia-e-parcelas.md`](decisoes-po-ia-e-parcelas.md) (D-PO-53..69, Q-U01..Q-U12), fluxos 015..017. Os pontos do PO são **preliminares**; peço confirmação ou reestimativa e SDD/ADR.*

## 0. Resumo do pedido

| # | Entrega pedida | Histórias | Tipo | Urgência |
| :-: | :-- | :-- | :-: | :-: |
| 1 | Extensão do SDD-014: parcelas "anteriores ao app" | US-065 | SDD (Sonnet) | Já (R4-A) |
| 2 | **ADR de integração com LLM** (provedor, SDK, modo simulado, erros, prompts/validação de resposta) | EN-004, US-066, US-070 | **ADR (Opus)** | Antes da R4-B |
| 3 | **ADR de privacidade e retenção de arquivo** (envio, descarte, o que se grava, logs sem conteúdo) | EN-005, US-066..068, US-070 | **ADR (Opus)** | Antes da R4-B |
| 4 | **ADR de segurança/autenticação do MCP** | EN-006, US-074..077 | **ADR (Opus)** | Antes da R4-D |
| 5 | **SDD de importação em lote** (extração, dedupe, atomicidade, idempotência, reversão) | US-066..069 | SDD (Opus: domínio crítico) | R4-B |
| 6 | **Controle de custo** (teto, estimativa, contabilidade) | EN-004 | no ADR 2 + SDD | R4-B |
| 7 | **Estratégia de testes sem chamar a API real** | todas de LLM/MCP | seção do SDD | R4-B |

## 1. ADR de integração com LLM (EN-004, US-066, US-070)
1. **Provedor e cliente:** SDK oficial da Anthropic no servidor? Qual modelo por finalidade (extração de fatura × análise) e critério de escolha custo/qualidade? Entrada de **PDF nativa** do provedor ou extração local de texto antes? CSV deve ser **interpretado sem LLM** quando o layout for conhecido?
2. **Saída estruturada:** contrato (Zod) para a extração (data, descrição, valor em centavos, parcela n/N, tipo do item: compra / pagamento / estorno / encargo) e para a análise. **Validação em runtime**; resposta fora do contrato = erro tratado, nunca dado gravado. Como garantir que o texto do arquivo não instrui a LLM (**injeção de prompt**) e que a LLM **não tem ferramentas de escrita** nessas chamadas.
3. **Falhas:** timeout, nova tentativa limitada, mensagens neutras (EN-004), cancelamento pelo usuário, tratamento de limite de taxa do provedor.
4. **Valores:** sempre `amountInCents`; a IA nunca produz totais; a análise recebe agregados calculados pelo app (US-048/049) e a resposta é conferida (número divergente descartado, US-070).
5. **Chave:** só em variável de ambiente no servidor; rotação sem deploy? Nunca em log ou no cliente. Avaliar o impacto da alternativa **chave por família** (Q-U08) para decidir se vale já deixar a interface do cliente preparada.

## 2. ADR de privacidade, armazenamento e retenção (EN-005, US-066..068, US-070)
1. **Armazenamento do arquivo da fatura:** processar **em memória** (preferido, D-PO-62) ou salvar temporariamente? Se salvar, onde (objeto/disco), criptografia, prazo máximo, exclusão garantida ao fim e em falha. Quanto tempo vive a **sessão de revisão** (itens extraídos pendentes), onde fica e quando expira.
2. **O que se persiste:** lote (id, autor, cartão, fatura, hash, nº de itens, total, data, situação), consentimento (versão do texto, quem, quando) e consumo de IA. **O que nunca se grava:** o arquivo, o texto bruto, dados do titular (nome/CPF/endereço) e, nos logs, qualquer conteúdo de fatura ou de lançamento.
3. **Minimização:** é viável remover/mascarar dados do titular e número do cartão **antes** de enviar ao provedor? Qual o custo para PDF?
4. **Termos do provedor:** retenção/treinamento da API; o que o texto do opt-in (EN-005) pode prometer com segurança. Versionamento do texto e invalidação do consentimento.
5. **Análise (Q-U11):** definir o payload mínimo (agregados + recorrentes) e como detectar "recorrente" sem enviar texto livre; normalização de estabelecimento para o descarte (US-071).
6. **LGPD:** direito de apagar (US-073) e de revogar (EN-005); alguma exigência a mais para o app antes de produção?

## 3. ADR de segurança e autenticação do MCP (EN-006, US-074..077)
1. **Transporte e formato:** servidor MCP dentro do app Next ou serviço separado? HTTP/SSE ou stdio? O que exigem os clientes alvo (Q-U06) quanto a autenticação.
2. **Credencial:** token opaco (hash no servidor) com validade, escopos (`read`, `write`), revogação imediata e **mostrada uma vez**? Alternativa OAuth 2.1: custo e quando se justifica. Vínculo `membro + família`; efeito de remover membro (US-035) e de o Administrador bloquear o recurso.
3. **Escopo e isolamento:** ferramentas passam pela **mesma camada de autorização** da UI (predicado único, `findActiveMembership`) para garantir "nunca mais que o membro" e zero vazamento entre famílias; testes de isolamento obrigatórios.
4. **Ferramentas:** lista fechada e contratos das ferramentas de leitura (saldos, resumo do mês, gastos por categoria, fatura/limite, extrato, previstas) reutilizando as consultas das telas (fonte única, RN-025.7). Paginação e tamanho máximo.
5. **Escrita (US-076):** modelo de **proposta + confirmação** (onde o membro confirma? no app, por link, ou pela própria LLM com confirmação do protocolo?), **idempotência** (chave por pedido), expiração da proposta, marca "via assistente" no lançamento, e defesa contra **injeção de instruções** nas descrições.
6. **Auditoria e limite de taxa:** esquema do registro (sem conteúdo devolvido), retenção e consulta pelo membro (US-077); limite por credencial.
7. **Estimativa e fatiamento:** confirmar 8 (EN-006) + 5 + 5 + 3 + 5 e dizer se algo deve ser reagrupado.

## 4. Controle de custo (EN-004)
- Modelo de cálculo da **estimativa antes de enviar** (páginas/tamanho do PDF, tokens) e do custo real por chamada; arredondamento e unidade (centavos) do teto; **fuso e virada do mês** do contador.
- Atomicidade do contador sob concorrência (duas importações simultâneas na mesma família não ultrapassam o teto).
- Onde o dono do produto define o teto (variável de ambiente por ambiente? campo administrativo?). Registro de consumo por família e finalidade, sem conteúdo.
- Limites adicionais úteis: tamanho/páginas por arquivo, nº de importações por dia, 1 análise por mês e família.

## 5. Testes sem chamar a API real (todas as histórias de LLM)
1. **Provedor simulado** (interface única; implementação fake determinística) usado por padrão em dev, unit, E2E e BDD; **a suíte nunca depende de rede nem de chave**.
2. **Fixtures de extração:** respostas JSON gravadas (fatura simples, com parcelas "3/10", pagamentos/estornos/encargos, itens duplicados, total divergente, arquivo que não é fatura, resposta inválida/truncada, texto com instruções maliciosas).
3. **Teste de contrato:** a resposta do provedor é validada pelo mesmo schema Zod de produção; fixture inválida deve falhar com erro tratado.
4. **Teste "de ouro" opcional e manual** (fora do CI, com chave de teste e orçamento mínimo) para detectar mudança de formato do provedor; documentar como executar.
5. **Garantias a automatizar:** IA nunca grava sem confirmação (US-067/068), lote atômico, idempotência, anti-duplicidade, teto de custo, opt-in obrigatório, isolamento entre famílias no MCP, escopo leitura × escrita, revogação imediata, auditoria sem conteúdo, números da análise sempre do app.
6. **E2E de UI** com o provedor simulado cobrindo o fluxo 015 inteiro e o 017.
7. Notas de Gherkin como em [`pedidos-ao-tech-lead-r21-r3.md`](pedidos-ao-tech-lead-r21-r3.md) §4 (sem `E, após…`, frases em uma linha, todo cenário com `Dado`/Contexto); se o parser colidir passos (DEV-25), o Dev ajusta e registra.

## 6. Estimativas pedidas (PO, preliminar)

| História | PO | Dúvida principal |
| :-- | :-: | :-- |
| US-065 Parcelas já pagas | 5 | Modelo "anterior ao app" e resto de centavos |
| EN-004 Infra LLM | 8 | Estimativa de custo e contador atômico |
| EN-005 Opt-in | 5 | Versionamento do texto |
| US-066 Enviar/validar | 5 | PDF nativo × texto; sessão de revisão |
| US-067 Revisar | 8 | Dedupe e categoria sugerida; fatiar se > 8 |
| US-068 Gravar | 5 | Lote atômico/idempotência |
| US-069 Reverter | 3 | Itens editados depois |
| US-070 Análise | 8 | Payload agregado e validação da resposta |
| US-071 / 072 / 073 | 3 / 3 / 2 | Chave do descarte |
| EN-006 MCP | 8 | ADR de autenticação |
| US-074 / 075 / 076 / 077 | 5 / 5 / 5 / 3 | Confirmação da escrita |

**Ordem de execução e corte** em [`backlog.md`](../../../product-owner/backlog/backlog.md) (seção R4). Restrição: nada nesta rodada altera o motor do acerto nem a EN-002.

# Estudo de viabilidade: integração com Meu Pluggy / Pluggy (Open Finance)

*Data: 2026-10-24 · Autor: agente de pesquisa (Stakeholder) · Status: proposta para decisão do dono do produto*
*Rastreio: NEED-003 (cartões/parcelas), NEED-026 (importação de fatura por arquivo), AP3 (importação OFX/CSV).*
*Legenda: [OK] confirmado em fonte oficial · [2ª] só fonte secundária · [?] não confirmado.*

## 0. Resumo executivo
- A **Pluggy** é um agregador regulado (iniciador de pagamento autorizado pelo BC) que entrega contas, cartões, faturas, transações e investimentos via API REST + widget **Pluggy Connect**.
- O **Meu Pluggy** é a "carteira de dados" gratuita da Pluggy para **pessoa física ver/acessar os próprios dados** (inclusive via API/MCP/CLI). Serve para uso **pessoal** (o nosso dono do produto como único usuário), **não** para oferecer a terceiros.
- Para atender **várias famílias**, o caminho é a **API empresarial** (Pluggy Dados), com preço de entrada de **R$ 2.500/mês** (500 conexões) após 15 dias de teste: incompatível com app gratuito/beta sem receita.
- **Recomendação:** POC pessoal e descartável via Meu Pluggy (esforço P/M), tratado como *importador com revisão humana* (mesmo funil da NEED-026). Não prometer a feature a outros usuários até haver decisão comercial.

## 1. Meu Pluggy x API/Pluggy Connect
| Aspecto | Meu Pluggy | Pluggy API / Connect (empresas) |
|---|---|---|
| Público | Pessoa física, dados próprios [OK] | Empresas que integram clientes finais [OK] |
| Acesso | Conta em meu.pluggy.ai + conector "MeuPluggy"; dev usa Client ID/Secret de uma aplicação própria no dashboard e o *Item ID* [OK/2ª] | Backend gera *Connect Token* com CLIENT_ID/SECRET; usuário conecta no widget [OK] |
| Custo | Gratuito, "sem expiração" para uso próprio [2ª]; página de preços: só lê dados já conectados no Meu Pluggy, **uso pessoal, máx. 5 conexões ativas por titular, sem SLA/contrato, sem Pix/categorização/KYC** [OK, página de preços resumida] | Planos pagos após trial (seção 3) |
| Extras | Dashboards, API, MCP, CLI, "50+ instituições" (Nubank, Inter, BB, Itaú, Bradesco, Santander, Caixa, XP) [OK, marketing] | Sandbox completo, suporte por ticket, categorizador (plano Pro) |

**Como o dado chega (API):** usuário conecta via widget -> cria-se um **Item** (conexão com 1 instituição) -> endpoints de *accounts* (corrente/poupança/cartão), *transactions*, *credit card bills* (faturas), *investments*, *identity*, *consents* [OK].
- **Transações:** até **12 meses** de histórico, obtidos na primeira sincronização; página máx. 500; sinal em cartão: positivo = débito [OK].
- **Parcelas:** `creditCardMetadata` traz `installmentNumber`, `totalInstallments`, `purchaseDate`, `billId` (só Open Finance); `totalAmount` do parcelamento só em conectores diretos; parcelas futuras/fatura aberta vêm `PENDING` [OK].
- **Faturas:** `dueDate`, `totalAmount`, encargos (juros, multa, IOF), pagamentos; obrigatório em Open Finance regulado, em conectores diretos só alguns (Inter PF, Itaú Cartões) [OK].
- **Categoria:** vem do categorizador da Pluggy, **exige plano Pro** [OK]; no Meu Pluggy provavelmente ausente [?].
- **Atualização:** a doc consultada não fixa frequência; há sync diário automático retomado após login/consent ok e o resultado varia por instituição [parcial: docs de consent + Actual Budget]. Webhooks: `item/created`, `item/updated`, `item/error`, `transactions/created|updated|deleted`, etc. [OK]. Webhook em conta Meu Pluggy: [?].

## 2. Autenticação, consentimento e limites
- **Credenciais da Pluggy:** CLIENT_ID/CLIENT_SECRET (server-side) -> API key -> Connect Token de curta duração para o widget [OK]. Segredo nunca no navegador.
- **Credenciais bancárias:** no Open Finance regulado o usuário autentica **no banco** (redirecionamento), nosso app e (em tese) nem a Pluggy veem a senha. Conectores "diretos" (login/senha) existem em algumas instituições: **evitar** [OK conceitual].
- **Consentimento:** criado na primeira conexão; no Open Finance regulado `expiresAt` costuma ser `null` (sem expiração padrão), mas o usuário revoga a qualquer momento no app do banco; algumas conexões têm validade (ex.: Inter PJ 1 ano). Expirado/revogado => endpoints retornam **vazio**; renovação por `PATCH` no Item com novo fluxo do usuário; sync diário só volta após sucesso [OK].
- **Limites:** cada leitura (saldo, transação, investimento) conta como requisição; mínimo mensal com volume incluído e excedente cobrado [OK]; limites técnicos de paginação 500.
- **Meu Pluggy tem API para terceiros?** Para **uso do próprio titular**, sim (API/MCP/CLI) [OK]; **não** há evidência de modelo "app de terceiro consome dados de vários usuários do Meu Pluggy" e os termos pessoais/5 conexões sugerem que **não** é permitido [?: confirmar nos termos oficiais].
- **Alternativas:**
| Alternativa | Observação |
|---|---|
| Pluggy API empresarial | Caminho técnico correto para multiusuário; custo (seção 3) |
| Belvo e similares | Agregadores com modelo comercial parecido (pago, contrato); situação/preços atuais no Brasil [?] não verificados |
| Open Finance direto | Exige ser instituição participante/receptora autorizada pelo BC: inviável para este porte |
| Importação OFX/CSV/PDF | Sem terceiro, sem custo recorrente, já alinhada à NEED-026/AP3; trabalho manual mensal do usuário |

## 3. Custos, regulação e LGPD
| Item | Fato | Fonte/estado |
|---|---|---|
| Trial | 15 dias em produção, sem cartão, conexões reais; depois pausa até contratar; dados mantidos 30 dias | [OK] pricing |
| Pluggy Dados | a partir de **R$ 2.500/mês** com até 500 conexões ativas; excedente por requisição (preço não público) | [OK] |
| Pluggy Pagamentos (Pix) | a partir de R$ 500/mês (**fora de escopo**: não movimentamos dinheiro) | [OK] |
| Categorização | exige plano Pro | [OK] |
| Meu Pluggy | gratuito, uso pessoal, 5 conexões, sem SLA | [OK] |

- **Regulatório:** a Pluggy é a instituição regulada/receptora; nós seríamos **cliente** dela. Não precisamos de autorização do BC, mas precisamos cumprir os termos de uso da Pluggy e o contrato (finalidade declarada, não revender dados) [?: termos não lidos].
- **LGPD:** dados de transações são pessoais, não "sensíveis" no sentido legal, mas de alto risco. Papéis esperados: **nós = controlador** (decidimos a finalidade), **Pluggy = operador** para a agregação (e controlador próprio para a parte regulada) [?: confirmar no DPA/termos; não encontrado]. Exige: base legal = **consentimento específico e destacado** por família/membro, aviso de finalidade, minimização (só o necessário), retenção definida, direito de revogar/excluir (revogar consent na Pluggy + apagar nossos dados importados), registro de operações, atualização da política de privacidade (FLUXO-016).
- **Dados de terceiros na família:** conta de um membro só pode ser conectada por ele próprio; o outro membro só vê o que for compartilhado (alinhar a NEED-002).

## 4. Encaixe no produto
| Dado Pluggy | Destino no app | Observação |
|---|---|---|
| Item (instituição) | Conexão por membro, não vira entidade financeira | Estado: ativo/erro/consent expirado |
| Account BANK | Conta bancária (NEED-002) | Mapeamento manual 1-para-1 escolhido pelo usuário |
| Account CREDIT_CARD | Cartão (NEED-003) | Usuário vincula; limite/vencimento/fechamento vêm da Pluggy mas editáveis |
| Bill | Fatura/ciclo do cartão | Usar `totalAmount` para a **conferência de total** (RN-026.4) |
| Transaction | Proposta de lançamento | Entra numa **fila de revisão**, nunca direto no extrato |
| `installmentNumber/totalInstallments` | Parcelas (NEED-003/024) | Open Finance não traz `totalAmount` do parcelamento; derivar e deixar usuário confirmar; não criar parcelas pagas passadas (RN-026.6) |
| `category` Pluggy | Sugestão apenas | Hoje exige Pro; usar categorias da família / histórico (NEED-023) |
| Gastador/pagador/rateio/acerto | Preenchidos **só na revisão** | Pluggy não conhece nossa tripla responsabilidade (NEED-001/007/008): padrão = titular da conta |

- **Desduplicação:** chave `pluggyTransactionId` guardada no lançamento aceito (idempotência) + heurística (data ±1 dia, valor em centavos exato, descrição semelhante) contra lançamentos manuais, marcados e desmarcados por padrão (RN-026.5). Transações `PENDING` vs efetivadas e `transactions/updated|deleted` exigem reconciliação.
- **Compatibilidade com decisões vigentes:**
  - *Usuário revisa antes de gravar / IA nunca grava sozinha*: compatível se a importação for **proposta + confirmação**, igual à NEED-026. Gravação automática sem revisão **conflita** com a filosofia e deve ser decisão explícita do dono (não recomendada).
  - *Privacidade/anonimização para LLM*: transações bancárias reais incluem nome de estabelecimentos/pessoas (Pix) e identificadores. Qualquer envio a LLM (categorização, assistente MCP) deve passar pela **mesma camada de anonimização** já definida; dados brutos da Pluggy não devem ir ao LLM.
  - *Dinheiro não real*: o app continua **somente leitura** sobre o banco (sem Pix/pagamento, sem produto Pagamentos). Muda o posicionamento: passa a tratar **dados financeiros reais** (não só controle manual), elevando exigência de segurança, termos e LGPD. Saldo da Pluggy vs saldo calculado pelo app podem divergir: definir qual prevalece (sugestão: app é a fonte, Pluggy é conferência).
  - *Fadiga de cadastro (dor nº 5)*: forte alinhamento; o maior valor é eliminar digitação de faturas e compras.

## 5. Riscos e esforço
| Risco | Severidade | Mitigação |
|---|---|---|
| Vazamento de Client Secret / Item IDs / dados bancários | Alta | Segredos em variáveis da Vercel, só server-side; criptografar Item ID e tokens em repouso; logs sem dados financeiros; acesso por família |
| Dependência de terceiro / indisponibilidade / mudança de preço | Média | Camada de adaptador; fallback OFX/CSV; app funciona sem a integração |
| Custo (R$ 2.500/mês) sem receita | Alta p/ multiusuário | Limitar a POC pessoal até decisão comercial |
| Termos do Meu Pluggy proibirem uso por outras pessoas | Alta | Ler termos; manter uso apenas do dono |
| Consentimento expira/revogado => dados vazios silenciosos | Média | Detectar `consentExpiresAt`/status do Item e avisar o usuário |
| Dados errados/duplicados contaminam orçamento e acerto | Média | Fila de revisão, conferência de total da fatura, desfazer em lote |
| Limites/atrasos de sync, histórico só 12 meses | Baixa | Comunicar; backfill único |
| LGPD (controlador, retenção, exclusão) | Alta | Consentimento explícito, política de retenção, exclusão ao desconectar |

**Esforço aproximado:**
| Escopo | Esforço |
|---|---|
| POC pessoal read-only (script/rota protegida lê Items do Meu Pluggy do dono; tela de fila de revisão simples; dedupe por ID) | **P a M** (poucos dias) |
| Integração multiusuário (Connect widget, webhooks, consent/estado, mapeamento contas/cartões, dedupe, LGPD, exclusão) | **G** + custo recorrente |
| Importação OFX/CSV (alternativa) | **M** (sobrepõe NEED-026) |

## 6. Recomendação
1. **Vale avaliar, só como POC pessoal e opcional.** Valor alto (resolve a dor de digitação), custo de entrada baixo se for só o dono.
2. **Forma mínima:** conectar poucas contas/cartões do dono no Meu Pluggy; job manual (não webhook) que puxa transações e faturas dos últimos meses e cria **propostas** em uma fila de revisão; aceite grava lançamento com `pluggyTransactionId`; conferir soma com `totalAmount` da fatura; nenhum dado vai a LLM sem anonimização; flag de feature desligada por padrão.
3. **Ordem no roadmap:** depois da NEED-026 (importação por arquivo), pois reutiliza revisão, dedupe e conferência de total, e a fila de revisão é o mesmo componente. Se a NEED-026 for adiada, o POC pode vir antes como substituto para o dono.
4. **Não prometer a outros usuários** até decisão comercial (R$ 2.500/mês ou parceria) e leitura dos termos/DPA.
5. **Decisões do dono do produto:**
   - Aceita POC apenas pessoal (uso próprio), sem multiusuário por ora?
   - Existe intenção de monetizar/ter receita que justifique a API paga (R$ 2.500/mês)? Ou preferir OFX/CSV para todos?
   - Importar sempre com revisão obrigatória (recomendado) ou permitir lançamento automático?
   - Quais instituições/cartões da família entram no POC?
   - Autoriza ler os termos da Pluggy (o dono precisa aceitá-los; o agente não cria conta)?
   - Pluggy vs saldo do app: qual é a fonte da verdade?

## Fontes
- Preços, trial e conector MeuPluggy (resumo): https://www.pluggy.ai/pricing
- Meu Pluggy (produto): https://meu.pluggy.ai
- Pluggy Connect: https://docs.pluggy.ai/docs/pluggy-connect-introduction
- Consentimentos e expiração: https://docs.pluggy.ai/docs/consents
- Transações (12 meses, parcelas, categoria Pro): https://docs.pluggy.ai/docs/transactions
- Faturas de cartão: https://docs.pluggy.ai/docs/credit-card-bills
- Webhooks: https://v2.docs.pluggy.ai/docs/webhooks e https://v2.docs.pluggy.ai/en/reference/webhooks
- Uso com Meu Pluggy (Actual Budget): https://actualbudget.org/docs/advanced/bank-sync/pluggyai
- MCP da Pluggy: https://docs.pluggy.ai/docs/mcp
- Listagem secundária (Meu Pluggy "sem expiração", fonte [2ª]): https://glama.ai/mcp/servers/hjf842k84y
- Pluggy como ITP e Meu Pluggy/LGPD (imprensa): https://finsidersbrasil.com.br/reportagem-exclusiva-fintechs/pluggy-lanca-hub-para-facilitar-a-vida-de-quem-quer-compartilhar-dados-financeiros-e-simplificar-a-lgpd-diz-socio/
- Código de ética Pluggy: https://www.pluggy.ai/docs/codigo-de-etica-e-conduta.pdf

**Não confirmado:** termos de uso/DPA/papéis LGPD da Pluggy; frequência exata de atualização; webhooks e categorização no Meu Pluggy; situação e preços atuais da Belvo; limite exato de 5 conexões fora da página de preços.

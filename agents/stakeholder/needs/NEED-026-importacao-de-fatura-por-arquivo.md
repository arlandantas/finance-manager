# NEED-026: Importar Fatura de Cartão por Arquivo (com Validação por LLM)

## 📋 Metadados
- **ID:** `NEED-026`
- **Área:** Meios de Pagamento, Automação e Inteligência
- **Status:** Levantado em 2026-10-24 — aguardando decisões do usuário (Q-U07..Q-U10)
- **Prioridade de valor:** **Alta**
- **Consumidores:** Product Owner, Tech Lead (ADR de privacidade, custo e dedupe)
- **Origem:** Pedido do usuário; antecipa/amplia o item "Importação OFX/CSV de faturas" do AP3

---

## 1. Dor
Digitar dezenas de compras de uma fatura é o maior custo de manter o app em dia (fadiga de cadastro, dor nº 5 da visão geral). Faturas chegam em PDF/arquivo com formatos diferentes por banco, o que torna impraticável um importador fixo para todos.

## 2. Valor
- Transforma horas de digitação mensal em **conferência de poucos minutos**; é o maior ganho de adoção contínua entre as quatro solicitações.
- Ajuda também na adoção inicial (somado a `NEED-024`, traz parcelas "3/10" já em andamento).
- Prioridade **Alta**, com ressalva: depende de decisões de privacidade e custo (abaixo), e o valor só existe se a **revisão humana** for rápida.

## 3. Regras de negócio (RN)
- **RN-026.1 — Validação do arquivo:** a LLM primeiro confirma se o arquivo **é uma fatura de cartão**; se não for (ou for ilegível), o usuário é avisado e **nada é gravado**.
- **RN-026.2 — Cartão e fatura escolhidos pelo usuário:** os lançamentos vão para o **cartão e a fatura (ciclo) indicados por ele**; o app avisa quando datas/total do arquivo não batem com o ciclo escolhido.
- **RN-026.3 — Revisão obrigatória antes de gravar:** a extração da LLM é uma **proposta**. O usuário vê a lista (data, descrição, valor, parcela), pode corrigir, excluir ou recategorizar, e **só então confirma**. A LLM nunca grava sozinha.
- **RN-026.4 — Conferência de total:** o app compara a soma dos itens extraídos com o **total da fatura informado no arquivo** e destaca divergência (principal defesa contra erro de extração).
- **RN-026.5 — Anti-duplicidade:** itens que já existem no cartão (mesma data, valor e descrição semelhante, ou já importados antes) são sinalizados e **desmarcados por padrão**; importar o mesmo arquivo duas vezes não duplica.
- **RN-026.6 — Parcelas:** itens "3/10" tratados conforme `NEED-003/024`; sem criar parcelas já pagas em faturas passadas.
- **RN-026.7 — Valores em centavos exatos;** encargos, juros, IOF, estornos e pagamentos aparecem como itens próprios e o usuário decide o que lançar (pagamento de fatura não é despesa, RN12).
- **RN-026.8 — Responsável e categoria:** cada item recebe responsável (padrão: titular do cartão) e categoria sugerida (por histórico da família, `NEED-023 §5`), ambos editáveis na revisão.
- **RN-026.9 — Arquivo não retido:** o arquivo original é descartado após a importação, salvo decisão em contrário do usuário (hipótese conservadora).
- **RN-026.10:** desfazer a importação em lote deve ser possível (reverter o lote inteiro).

## 4. Riscos
- **Privacidade (alto):** a fatura revela estabelecimentos, hábitos e dados do titular (nome, final do cartão, às vezes CPF/endereço) e é **enviada a um provedor externo (Anthropic)**. Hipótese: opt-in explícito por família, aviso do que sai, e o app não solicita nem armazena dados desnecessários.
- **Erro de extração:** valores, datas e parcelas lidos errado; mitigado por RN-026.3 e RN-026.4. Sem revisão, o dado errado contamina acerto e orçamento.
- **Duplicidade** (RN-026.5), inclusive com lançamentos feitos manualmente antes.
- **Custo da API:** faturas longas/escaneadas custam mais; exige limite por importação/mês e estimativa antes de processar (ver Q-U08).
- **Arquivos fora do padrão ou maliciosos** (prompt injection dentro do PDF): a LLM só extrai dados, sem poder de ação.
- **Chave da API:** ver Q-U08.

## 5. Perguntas abertas
- **Q-U07:** aceita enviar a fatura inteira (conteúdo bruto) a um provedor externo (Anthropic)? Hipótese: sim com opt-in e aviso; remover do envio o que for dispensável quando possível.
- **Q-U08:** a chave da API Anthropic é **uma só do app (paga pelo dono do produto)** ou **uma por usuário/família (cada um cadastra a sua)**? Hipótese conservadora: **uma do app**, com limite mensal por família, no início (menor fricção para o alpha); chave própria é alternativa se o custo preocupar. Vale para NEED-026 e NEED-027.
- **Q-U09:** formatos aceitos na 1ª versão: PDF, imagem (foto/print), CSV? Hipótese: PDF e CSV; imagem depois.
- **Q-U10:** limite aceitável de custo por importação/mês? Hipótese: teto mensal por família, definido pelo dono do produto.

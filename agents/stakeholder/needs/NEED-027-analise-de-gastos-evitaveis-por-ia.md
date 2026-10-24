# NEED-027: Análise dos Gastos por IA — Categorias e Gastos Evitáveis

## 📋 Metadados
- **ID:** `NEED-027`
- **Área:** Inteligência e Educação Financeira
- **Status:** Levantado em 2026-10-24 — **concretiza o `NEED-023`** (não duplica); aguardando decisões do usuário
- **Prioridade de valor:** **Média**
- **Consumidores:** Product Owner, Tech Lead (ADR de privacidade)
- **Origem:** Pedido do usuário (dono do produto), repassado pelo Gestor em 2026-10-24

---

## 1. Dor
A família vê os totais, mas não sabe **o que cortar**: não distingue gasto essencial de supérfluo, nem percebe assinaturas esquecidas, gastos recorrentes inflados ou compras por impulso. Falta uma segunda opinião estruturada, em linguagem simples.

## 2. Valor
- Transforma dados já lançados em **ação**: onde há margem para economizar, segundo práticas conhecidas de educação financeira (ex.: separar essencial/importante/supérfluo; revisar assinaturas; comparar mês a mês).
- Alimenta o autocontrole (`NEED-005/006`) e melhora a qualidade das categorias.
- Prioridade **Média**: é diferencial, mas só vale com dados de qualidade (`NEED-023 §2`) e **não resolve dor vital**.

## 3. Regras de negócio (RN) — herda `NEED-023` (RN-023.1 a 023.6)
- **RN-027.1 — Opt-in por família,** desligado por padrão, com texto claro do que é enviado (herda RN-023.1).
- **RN-027.2 — Minimização:** enviar agregados e, quando necessário para identificar "gasto evitável", descrições de estabelecimento **sem nomes de pessoas e sem identificadores de conta/cartão** (herda RN-023.2; descrições são necessárias, ver Q-U11).
- **RN-027.3 — Só sugestão:** a análise nunca recategoriza, apaga ou grava por conta própria; alterações de categoria sugeridas são aceitas uma a uma pelo usuário (herda RN-023.3).
- **RN-027.4 — Sem aconselhamento financeiro personalizado de investimento/crédito:** o texto traz observações educativas e perguntas, com aviso de que não substitui um profissional (herda RN-023.4).
- **RN-027.5 — Números do sistema:** totais e comparativos calculados pelo app; a IA interpreta e sugere, não calcula (herda NEED-023 §2.2).
- **RN-027.6 — Classificação "evitável" é sugestão discutível:** "evitável" depende do contexto da família; a análise indica **por quê** e permite descartar ("este gasto é importante para nós"), e o app aprende a não repetir.
- **RN-027.7 — Frequência e custo controlados:** análise sob demanda ou limitada por período (ex.: após fechamento do mês), com limite de uso por família.
- **RN-027.8 — Transparência:** mostrar o que foi enviado, data da análise, e permitir apagar o histórico (herda RN-023.5).
- **RN-027.9 — Tom sem julgamento** entre membros: foco em categorias e hábitos coletivos, **sem ranquear ou culpar membros** (tensão com `NEED-019`).

## 4. Riscos
- **Privacidade** dos dados enviados (hábitos de consumo revelam rotina e saúde, ex.: farmácia, terapia).
- **Custo da API** recorrente; **chave** (ver Q-U08 no `NEED-026`).
- **Conselho plausível porém errado** ou moralista, gerando perda de confiança ou atrito no casal.
- **Dependência da qualidade das categorias/tags** (`NEED-013/016`).
- Percepção de vigilância entre membros.

## 5. Perguntas abertas
- **Q-U01 (já existente, `NEED-023`):** aceitar envio ao provedor externo — agora com provedor sugerido: **Anthropic**. Hipótese: aceitar com opt-in.
- **Q-U11:** a análise pode incluir **descrições** dos lançamentos (necessário para achar assinaturas e gastos pontuais) ou apenas **totais por categoria**? Hipótese conservadora: começar só com agregados por categoria/mês + estabelecimentos recorrentes, sem texto livre, e ampliar depois.
- **Q-U12:** o critério de "evitável" segue um método fixo (ex.: essencial/importante/supérfluo) escolhido pelo produto, ou é configurável? Hipótese: método fixo e simples.

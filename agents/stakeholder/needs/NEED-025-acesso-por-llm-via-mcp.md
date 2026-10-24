# NEED-025: Acesso por Assistente de IA (LLM) via Servidor MCP

## 📋 Metadados
- **ID:** `NEED-025`
- **Área:** Inteligência, Integração e Conveniência
- **Status:** Levantado em 2026-10-24 — aguardando decisões do usuário (Q-U04..Q-U06)
- **Prioridade de valor:** **Média**
- **Consumidores:** Product Owner, Tech Lead (ADR de segurança/escopo)
- **Origem:** Pedido do usuário (dono do produto), repassado pelo Gestor em 2026-10-24

---

## 1. Dor
Lançar e consultar exige abrir o app e navegar. O usuário quer **conversar com sua LLM de preferência** ("quanto gastamos em mercado este mês?", "lance R$ 80 de farmácia no cartão") **sem acessar a conta pela interface**. Para o membro de rotina corrida (persona Lucas) isso reduz a fricção do registro, que é a principal causa de abandono.

## 2. Valor
- Registro e consulta por linguagem natural, de qualquer lugar onde a LLM do usuário esteja.
- Diferencial de conveniência; **não resolve uma dor vital** (o app já permite tudo pela interface) e depende de o usuário já ter um cliente de LLM compatível. Por isso, prioridade **Média**.

## 3. Regras de negócio (RN)
- **RN-025.1 — Opt-in e revogável:** o acesso é concedido explicitamente pelo próprio membro, desligado por padrão, com revogação imediata e visível.
- **RN-025.2 — Mesmas permissões do usuário:** a LLM nunca enxerga nem faz mais do que o membro que concedeu o acesso (escopo por família, conta/cartão e papel). Sem acesso a dados de outras famílias.
- **RN-025.3 — Leitura e escrita distintas:** consultar e lançar são permissões separadas; hipótese conservadora: **começar só com leitura** e lançamento como segunda fase.
- **RN-025.4 — Lançamento é sugestão confirmável:** lançamentos feitos via LLM aparecem identificados como "via assistente" (autoria rastreável, NEED-001), e **ações destrutivas (excluir, editar valores antigos) ficam fora do escopo inicial**.
- **RN-025.5 — Idempotência:** o mesmo pedido repetido pela LLM não pode criar lançamento duplicado.
- **RN-025.6 — Auditoria:** registro do que o assistente leu e gravou, consultável pelo usuário.
- **RN-025.7 — Números vêm do sistema:** a LLM apresenta valores calculados pelo app; não calcula saldos por conta própria.

## 4. Riscos
- **Privacidade:** o conteúdo consultado trafega para o provedor da LLM **do usuário** (fora do controle do app). O usuário precisa saber disso no momento de conceder acesso.
- **Segurança:** credencial de acesso vazada = acesso aos dados financeiros; exige credenciais com validade, escopo e revogação.
- **Escopo familiar:** membro conceder acesso expõe dados compartilhados da família; o Administrador deve poder desabilitar o recurso para a família (hipótese conservadora).
- **Injeção de instruções:** textos de descrição de lançamentos podem conter comandos que enganam a LLM a executar ações; reforça manter a escrita limitada e auditada.
- **Custo:** neste cenário a LLM é do próprio usuário; **não consome a chave Anthropic do app**.

## 5. Perguntas abertas
- **Q-U04:** o acesso MCP é **por membro** (cada um autoriza o seu) ou por família? Hipótese: por membro, herdando suas permissões; Administrador pode bloquear para a família.
- **Q-U05:** a primeira versão é **somente leitura**? Hipótese: sim; lançamento só depois, com confirmação.
- **Q-U06:** quais LLMs/clientes o usuário pretende usar (Claude, outras)? Hipótese: padrão MCP aberto, sem dependência de um fornecedor.

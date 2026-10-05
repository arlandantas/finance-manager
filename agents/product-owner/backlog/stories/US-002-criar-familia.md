# US-002 — Criar a família no primeiro acesso

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-0 Autenticação & Onboarding · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 9,5 · 2 |
| Status | Refinada (PO) |
| Depende de | US-001 |
| Rastreabilidade | NEED-012, NEED-001 · FLUXO-002 · ADR-002 |

## História
Como **pessoa que acabou de entrar e ainda não tem família**, quero **criar minha família informando só o nome**, para **começar a registrar finanças imediatamente**.

## Regras de negócio aplicáveis
- Quem cria a família torna-se **Administrador**.
- Cada família nasce com **categorias padrão** de despesa e de receita (lista abaixo).
- No MVP, **um usuário pertence a uma única família** (a UI não oferece troca/múltiplas).
- Todo dado criado depois fica isolado por família (multi-tenancy).

**Categorias padrão — Despesa:** Supermercado, Moradia, Contas e serviços, Transporte, Saúde, Educação, Lazer e restaurantes, Outros.
**Categorias padrão — Receita:** Salário, Rendimentos, Outras receitas.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Criação da família

  Cenário: Criar família com sucesso
    Dado que Mariana está autenticada e não pertence a nenhuma família
    Quando ela informa o nome "Família Silva" e clica em "Criar família"
    Então a família "Família Silva" é criada
    E Mariana é membro com papel "Administrador"
    E a família possui as 8 categorias de despesa e as 3 de receita padrão
    E ela é levada ao passo opcional de convite

  Cenário: Nome sugerido
    Dado que o nome Google de Mariana é "Mariana Silva"
    Quando o onboarding é exibido
    Então o campo "Nome da família" vem preenchido com "Família Silva"

  Cenário: Nome inválido
    Dado que estou no onboarding
    Quando informo um nome vazio ou com menos de 2 caracteres e tento criar
    Então vejo a mensagem "Informe um nome com pelo menos 2 caracteres"
    E nenhuma família é criada

  Cenário: Duplo clique não duplica
    Dado que preenchi o nome da família
    Quando clico duas vezes rapidamente em "Criar família"
    Então apenas uma família é criada

  Cenário: Quem já tem família não refaz o onboarding
    Dado que Lucas já pertence a uma família
    Quando ele tenta acessar a tela de onboarding
    Então é redirecionado para a Home
```

## Experiência
Ver [FLUXO-002](../../flows/FLUXO-002-onboarding-e-convite.md). Campo único, foco automático, botão *Criar família* fixo no rodapé no mobile.

## Fora de escopo
Moeda diferente de BRL, fuso configurável (fixo em `America/Sao_Paulo`), dia de corte do ciclo (AP1), criar/editar categorias (US-014), foto da família.

## Perguntas em aberto / pontos para o Tech Lead
- O modelo de dados pode permitir N famílias por usuário (evolução), mas **a regra de produto do MVP é 1**.

## Histórico
- 2026-10-04 — **Revisão pós-homologação (R2.1):** novo passo opcional no onboarding "Como vocês dividem as despesas?" (US-028, FLUXO-009); nome da família editável depois (US-034).

# ADR-001: Definição da Stack Tecnológica da Aplicação Web

## Status
Proposto (Em análise pelo Gestor de Projeto e Tech Lead)

## Contexto
A aplicação de Gestão Financeira Familiar necessita de:
- Interface web rica, altamente interativa, com gráficos de despesas e formulários rápidos de lançamento.
- Excelente experiência tanto no desktop quanto no smartphone (responsividade e toque).
- Integridade contábil estrita (cálculo de centavos sem imprecisão de ponto flutuante, transações atômicas).
- Suporte a multi-usuários dentro do mesmo núcleo familiar em tempo real ou quase em tempo real.
- Facilidade de desenvolvimento, testes automatizados e deploy.

## Opções Avaliadas
1. **Next.js (React 19 / TypeScript) + Tailwind CSS + PostgreSQL / Prisma** (Recomendada).
2. **Vite + React / TypeScript (SPA) + Node.js (Fastify) + PostgreSQL**.
3. **Python (FastAPI) + React + PostgreSQL**.

## Recomendação do Tech Lead
- **Linguagem**: TypeScript em 100% da stack (segurança de tipos ponta a ponta).
- **Frontend**: React + Tailwind CSS (com Shadcn UI / Radix primitives para acessibilidade e consistência visual).
- **Gerenciamento de Estado & Dados**: TanStack Query (React Query) para sincronização e cache de dados.
- **Validação de Esquemas**: Zod para tipagem e validação estrita em runtime tanto no front quanto nas APIs.
- **Tratamento Monetário**: Representação estrita de moedas como inteiros em centavos (`amountInCents`) para evitar erros de ponto flutuante IEEE 754.
- **Banco de Dados**: PostgreSQL com transações ACID.
- **Suíte de Testes (QA)**: Vitest + React Testing Library + Playwright.

## Consequências
- **Positivas**:
  - Ecossistema TypeScript unificado acelera a produtividade do time e reduz bugs de tipos.
  - Componentes modernos e acessíveis por padrão.
  - Testabilidade simples e rápida com Vitest.
- **Trade-offs**:
  - Exige disciplina do Desenvolvedor & QA em sempre converter valores para centavos na camada de dados e formatar para o usuário apenas na camada de apresentação.

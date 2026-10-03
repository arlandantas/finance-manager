# NEED-012: Autenticação via Conta Google e Acesso Familiar

## 📋 Metadados
- **ID:** `NEED-012`
- **Área:** Segurança, Acesso e Onboarding
- **Status:** Validado pelo Usuário
- **Release Alvo:** AP0 (MVP)
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
No contexto familiar, a adoção de um novo aplicativo falha rapidamente se o processo de cadastro for burocrático (criar senha, confirmar e-mail via link que cai no spam, etc.):
- Membros da família esquecem senhas facilmente ou utilizam senhas fracas para dados financeiros sensíveis;
- Praticamente todos os membros da família já possuem uma conta Google ativa (em smartphones Android, Gmail ou navegadores Chrome);
- Ter que gerenciar credenciais próprias no MVP aumenta o esforço técnico de desenvolvimento sem gerar valor imediato de negócio.

---

## 2. Necessidade
O sistema deve adotar **Autenticação com 1 Clique via Conta Google (Google Sign-In)** como o mecanismo inicial exclusivo de login e cadastro no AP0 (MVP), prevendo arquiteturalmente a expansão futura para outros provedores:

1. **Acesso com 1 Clique (Google OAuth):**
   - Usuário acessa o sistema clicando em "Entrar com o Google".
   - Autenticação rápida, segura e sem senhas adicionais.
2. **Importação Automática do Perfil:**
   - O sistema aproveita o nome completo, o e-mail verificado e a foto/avatar da conta Google do membro.
   - A foto e o nome facilitam a identificação visual imediata de quem gastou ou cadastrou nos extratos e painéis familiares.
3. **Associação ao Grupo Familiar:**
   - O e-mail Google autenticado é utilizado para associar o usuário ao seu grupo familiar (ex: convite por e-mail).
4. **Roadmap de Expansão de Acesso:**
   - **AP0 (MVP):** Foco exclusivo em Conta Google.
   - **Fases Futuras:** Avaliar adição de Apple Sign-In, Magic Links ou E-mail/Senha tradicional conforme a demanda dos usuários.

---

## 3. Regras de Negócio (RN)
- **RN-012.1:** No lançamento inicial (AP0), a autenticação por Conta Google é o único método suportado para criação de conta e login.
- **RN-012.2:** O e-mail fornecido pelo Google é tratado como verificado e imutável pelo usuário na plataforma, servindo como chave de associação familiar.
- **RN-012.3:** A sessão do usuário deve persistir de forma segura para evitar que o membro da família precise relogar a cada acesso ao sistema no dia a dia.

---

## 4. Cenário de Exemplo
> **Cenário:** João quer convidar sua esposa Maria para o sistema.
> - João adiciona o e-mail Google de Maria (`maria@gmail.com`) ao grupo familiar.
> - Maria acessa o endereço do sistema, clica em "Entrar com o Google" e seleciona sua conta.
> - O sistema reconhece o e-mail de Maria, puxa sua foto de perfil do Google e a conecta instantaneamente ao grupo familiar, sem exigir senha nova.

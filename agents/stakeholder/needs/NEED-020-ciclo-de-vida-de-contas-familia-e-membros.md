# NEED-020: Gerenciar Contas, Cartões, Família e Membros Depois de Criados

## 📋 Metadados
- **ID:** `NEED-020`
- **Área:** Governança e Manutenção de Cadastros
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Must** (editar nome da família, arquivar conta) · **Should** (remover membro, papel, sair da família, arquivar cartão) · Release **R2.1**
- **Consumidores:** Product Owner (`US`), Tech Lead (`SDD`)
- **Origem:** Sugestões 13 e 15 do usuário. Estende NEED-001 e NEED-002

---

## 1. Contexto e Dor de Negócio
Hoje é possível **criar** quase tudo mas não **desfazer ou corrigir**: uma conta criada por engano fica para sempre, o nome da família digitado errado não se altera, um membro que saiu da casa segue com acesso. Sem manutenção de cadastros, o produto não envelhece bem e o primeiro erro de onboarding vira dor permanente.

## 2. Necessidade
1. **Família:** editar nome; (Administrador) alterar o papel de um membro; (Administrador) **remover membro**; qualquer membro pode **sair** da família.
2. **Contas e cartões:** **remover** quando **nunca tiveram movimentação**; quando já tiveram, **arquivar** (some das listas e dos seletores de lançamento, o histórico permanece intacto).
3. Reativar o que foi arquivado.

## 3. Regras de Negócio (RN)
- **RN-020.1 (histórico é sagrado):** nenhuma remoção apaga lançamentos, acertos ou faturas passadas. Membro removido vira **"ex-membro"** (nome preservado nos históricos), com **acesso encerrado imediatamente**.
- **RN-020.2 (conta):** só arquiva quando o **saldo é zero** (ou o usuário transfere/ajusta antes). Excluir de verdade só se não houver nenhum lançamento, transferência ou acerto vinculados.
- **RN-020.3 (cartão):** só arquiva sem fatura em aberto/não paga e sem parcelas futuras (NEED-003 fase 2).
- **RN-020.4 (membro):** antes de remover, o app mostra pendências: acerto em aberto (com NEED-019 ligado), contas/cartões de titularidade dele, previstas sob sua responsabilidade; exige decidir (reatribuir titularidade ou arquivar).
- **RN-020.5:** A família **não pode ficar sem Administrador**; o último Administrador não sai sem promover outro.
- **RN-020.6:** Excluir a família inteira **não é escopo agora** (risco de perda; tratar como suporte).
- **RN-020.7:** Convite (US-003) e remoção convivem: e-mail de ex-membro pode ser convidado de novo.

## 4. Pontos em aberto (decididos)
- **Q-F07 (decidida):** contas pessoais do membro removido são arquivadas por padrão; o Administrador pode reatribuir antes.
- **Q-F11 (decidida):** arquivar conta exige saldo zero (bloqueia até transferir/ajustar).

# NEED-019: Acerto de Contas Opcional e Discreto

## 📋 Metadados
- **ID:** `NEED-019`
- **Área:** Governança e Rateio Familiar
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Must** · Release **R2.1**
- **Consumidores:** Product Owner (`US-009`, `US-011`, `US-012`), Tech Lead (`SDD`)
- **Origem:** Sugestão 2 do usuário. **Altera** NEED-007 (deixa de ser parte obrigatória da experiência) e o foco da Início (NEED-015)

---

## 1. Contexto e Dor de Negócio
Nem toda família quer (ou precisa) medir "quem deve a quem". Para alguns, o card "fulano deve R$ X a ciclano" na Início é **constrangedor**, pode estar visível a outras pessoas, e passa a mensagem de cobrança permanente. O usuário sugeriu torná-lo opcional.

## 2. Necessidade
1. O **acerto de contas é um recurso da família que pode ser ligado/desligado** (pelo Administrador), nas configurações da família.
2. **Desligado:** some o card da Início, o item de menu, o campo de divisão no lançamento (NEED-018) e os avisos de pendência; o produto funciona como controle financeiro familiar sem partilha.
3. **Ligado:** o acerto vive em **tela própria (aba Acerto)**; na Início aparece apenas como **indicador discreto e neutro** dentro do Resumo do Mês (ex.: "Acerto do mês: R$ 150 a acertar" com detalhe ao tocar), sem a frase "X deve a Y" em destaque e respeitando o modo "ocultar valores" (NEED-014).

## 3. Regras de Negócio (RN)
- **RN-019.1:** **Desligar não apaga nada**: lançamentos já marcados como divididos, regra de divisão e histórico de acertos permanecem guardados; religar restaura tudo.
- **RN-019.2:** Ao desligar com **saldo de acerto em aberto**, avisar ("há R$ X pendentes entre os membros") e exigir confirmação; a dívida não desaparece, fica apenas oculta.
- **RN-019.3:** Os totais de despesas, categorias e saldos **não mudam** com o acerto ligado ou desligado. Só a camada de partilha.
- **RN-019.4:** O texto do acerto usa linguagem neutra (preferir "diferença do mês" e "valor a acertar" a "deve").
- **RN-019.5 (convivência com a homologação):** US-009/US-011 e a ressalva 2 (dívida de mês anterior) continuam valendo **somente com o acerto ligado**.
- **RN-019.6:** O padrão para **famílias novas** é decisão do usuário (**Q-F01**). Recomendação: **ligado** (a dor vital do casal que originou o produto), com a opção de desligar logo no onboarding.

## 4. Conflitos e esclarecimentos
- O produto nasceu com o acerto como dor vital (D-GES-02). Torná-lo opcional **não rebaixa seu valor** para o casal-alvo; reduz exposição e evita impor um modelo a quem não quer.
- Há dependência com NEED-018 (divisão opcional) e com a ideia de grupos (NEED-021): em grupos não familiares, o acerto tende a ser o **centro**, não o acessório.

## 5. Decisões sobre pontos em aberto
- **Q-F01 (decidida):** ligado por padrão, por família; a discrição individual vem do "ocultar valores".

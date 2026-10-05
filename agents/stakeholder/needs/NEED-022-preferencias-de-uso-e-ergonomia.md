# NEED-022: Preferências de Uso e Ergonomia (Tema, Navegação, Detalhe, Descrição)

## 📋 Metadados
- **ID:** `NEED-022`
- **Área:** Usabilidade e Preferências
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** ver tabela · Release **R2.1**
- **Consumidores:** Product Owner (`FLUXO`/UI), Tech Lead
- **Origem:** Sugestões 4, 5, 12 e 14 do usuário. Princípio do Stakeholder: **a dor é descrita aqui; o desenho é do PO**.

---

## 1. Itens

| Sug. | Dor (o que dói) | Prioridade | Observação de negócio |
| :-: | :--- | :-: | :--- |
| **5** | Ao adicionar despesa, o campo de **descrição** não aparece (só categorias). Sem descrição o lançamento fica anônimo no extrato ("Supermercado" ≠ "Mercado do bairro") e a busca perde valor. | **Must** | Decisão (Q-F13): visível, opcional, vazio assume a categoria. Hoje a validação exige descrição, então ou o campo está escondido (defeito de descoberta) ou foi ocultado para a agilidade. Regra: a descrição deve ser **visível e opcional**; vazio assume o nome da categoria. A meta de < 10 s se mantém. **Pedir ao Dev/PO que confirmem a causa.** |
| **12** | Tocar numa transação na Início leva ao Extrato inteiro; o usuário quer **ver o detalhe** ali mesmo. | **Should** | Detalhe com ações editar/excluir/histórico (resolve também o achado 7: ações atrás de "…"). Ir ao Extrato só em "ver mais"/aba Extrato. |
| **14** | Preferência de **tema claro/escuro**. | **Could** (barato) | Seguir o tema do sistema por padrão, com escolha manual lembrada no dispositivo. Garantir contraste de cores de status e de NEED-017. |
| **4** | Menu no topo no desktop; o usuário prefere **barra inferior** como no celular, talvez centralizada para não espalhar botões. | **Could**, decisão do PO | Valor real: **consistência entre dispositivos** e botões agrupados ao alcance. Mas uma barra inferior em tela larga é pouco convencional e pode piorar a leitura. O Stakeholder **não prescreve** layout: pede ao PO 2 alternativas (barra inferior com largura contida/centralizada vs. menu superior com conteúdo contido) para o usuário escolher. Decisão do time (Q-F06): manter o menu superior com menu e conteúdo de largura contida/centralizada; barra inferior só no mobile; reavaliar com o uso. Sem urgência. |

## 2. Regras
- **RN-022.1:** Preferências visuais (tema, modo oculto) são **por dispositivo**, não alteram dados da família.
- **RN-022.2:** Qualquer mudança de navegação mantém os atalhos de lançamento rápido (FAB) intactos.

# Parecer do Stakeholder — Feedback do Usuário pós-R1+R2

- **Data:** 2026-10-04
- **Papel:** Agente Stakeholder (dono do problema e do valor)
- **Insumos:** feedback literal do usuário (16 sugestões), [`homologacao-r1-r2.md`](homologacao-r1-r2.md), `needs/`, backlog do PO (D-PO-01/02/03, Q-01..Q-22)
- **Fora de pauta (já com o Dev):** acesso ao ambiente dev por localhost/IP da LAN/túnel e teste das chaves Google.
- **Status:** o usuário **delegou as decisões ao time** (Gestor + Stakeholder) e não será consultado. Cada ponto em aberto (Q-F01..Q-F13) foi **decidido** na §8, com justificativa. Critérios de desempate: menor risco de retrabalho; proteção da meta de lançar em < 10 s; acerto de contas opcional, porém disponível; padrões que não exponham dados financeiros sem ação do usuário. Na dúvida, hipótese conservadora. Só ficam como pergunta ao usuário itens irreversíveis, de privacidade ou dependentes de serviço externo (§8.2).

## 1. Veredito em uma página

1. O usuário está satisfeito: o feedback é de **refinamento**, não de falha de rumo. A dor central (fechar o mês em casal) segue resolvida.
2. Há **três temas** nas 16 sugestões, e eles conversam entre si:
   - **Discrição e opcionalidade** (itens 2, 3, 9): o usuário não quer que o app imponha "cobrança" nem exponha números. Vale tratar como um pacote: acerto opcional + divisão opcional + ocultar valores.
   - **Visão do mês** (itens 7, 8, 1, 11): a Início deve responder "como está o mês?" e a análise precisa de tags e filtros.
   - **Maturidade do cadastro** (itens 13, 15, 16, 6): faltam "desfazer/corrigir" e o cartão parcelado.
3. **O achado de maior valor, e que o usuário nem listou como bug, é o item 6:** sem compra parcelada, o cartão fica incompleto. Estava no AP1; **recomendo antecipar para ser a 1ª entrega da R3**.
4. **O que não vale fazer agora:** IA generativa, grupos não familiares e múltiplos grupos, construtor de relatórios, hierarquia de tags e menu inferior "elaborado" no desktop.

## 2. Tabela de prioridades

Legenda: **Must** = sem isso a experiência real tropeça; **Should** = alto valor, pode esperar uma sprint; **Could** = bom se couber; **Futuro** = só com evidência.

| # | Sugestão | NEED | Prioridade | Release | Tipo |
| :-: | :--- | :-: | :-: | :-: | :--- |
| R1 | Rótulo da regra de divisão contradiz números (ressalva 1) | 007/018 | **Must** | **R2.1** | Ressalva |
| R2 | Dívida de mês anterior sem sinalização (ressalva 2) | 007 | **Must** | **R2.1** | Ressalva |
| R3 | Conta de origem padrão inadequada (ressalva 3) | 004/003 | **Must** | **R2.1** | Ressalva |
| R4 | Prévia de impacto ao trocar a regra + sugestão pela renda (ressalva 4) | 007 | **Should** | **R2.1** | Ressalva |
| 5 | Campo descrição ausente ao adicionar despesa | 022 | **Must** | **R2.1** | Defeito/UX |
| 2 | Acerto de contas opcional e discreto | 019 | **Must** | **R2.1** | Mudança de modelo |
| 9a | "Dividir" desligado por padrão | 018 | **Must** | **R2.1** | Mudança de regra |
| 8 | Resumo do Mês como foco; saldos em card recolhível | 015 | **Must** | **R2.1** | Reorganização |
| 3 | Ocultar valores | 014 | **Must** | **R2.1** | Novo |
| 15 | Editar família, remover membro, sair | 020 | **Must** (nome) / **Should** (remoção) | **R2.1** | Cadastro |
| 13 | Remover/arquivar conta (e cartão) | 020 | **Must** (conta) / **Should** (cartão) | **R2.1** | Cadastro |
| 12 | Detalhe da transação a partir da Início | 022 | **Should** | **R2.1** | UX |
| 14 | Tema claro/escuro | 022 | **Could** | **R2.1** | UX barato |
| 4 | Navegação inferior no desktop | 022 | **Could** (decisão do PO) | R2.1 se PO propuser solução barata; senão R3 | UX |
| 6 | Compra parcelada no cartão | 003 | **Must** | **R3 (1ª entrega)**; R2.1 só se o TL estimar pequeno | Antecipação do AP1 |
| 9b | Divisão definida no lançamento (percentual por lançamento) | 018 | **Should** | **R3** | Mudança de regra |
| 1 | Tags livres | 013 | **Should** | **R3** | Novo |
| 7 | Visões sintéticas com filtros | 016 | **Should** | **R3** (depois das tags) | Novo |
| 11 | Cor por conta/cartão | 017 | **Could** | **R3** | UX |
| 16 | Grupos / múltiplos grupos / contas privadas | 021 | **Futuro** (spike de modelo em R3) | AP4+ | Estratégico |
| 10 | IA generativa para analisar o mês | 023 | **Futuro** | Pós-v0 | Oportunidade |

## 3. Parecer item a item

### Item 1 — Tags livres (NEED-013) — Should, R3
- **Valor:** responde a perguntas transversais (viagem, reforma) sem poluir categorias nem tetos. É também o insumo das visões sintéticas (7) e, no futuro, da IA (10).
- **Regras:** tag complementa, **não substitui** a categoria (que segue obrigatória e base de tetos); nome único sem diferenciar maiúsculas; opcional, sem custo no lançamento rápido; tag não entra em acerto nem tem teto.
- **Por que R3 e não R2.1:** exige modelo de dados novo, filtros e tela de gerência; sem as visões (7) o valor é pequeno.
- **Risco:** proliferação de tags (`viagem`, `Viagem`, `viajem`). Mitigar com sugestão ao digitar e unicidade sem diferenciar caixa.

### Item 2 — Acerto de contas opcional (NEED-019) — Must, R2.1
- **Concordo com o usuário.** O acerto é o coração do produto para o casal-alvo, mas a **exposição** (card "fulano deve") é opcional por natureza. Opcional por família (Administrador) e **discreto** quando ligado.
- **O que acontece com o existente:**
  - Desligado: some card, menu e campo de divisão; **nada é apagado**; religar restaura tudo.
  - Ligado: US-009 (painel) e US-011 (registrar acerto) vivem na **aba Acerto**; a Início mostra só um indicador neutro dentro do Resumo do Mês. A ressalva 2 (dívida antiga) usa esse mesmo indicador.
  - Ao desligar com dívida em aberto: avisar e confirmar; a dívida não some.
- **Conflito:** D-GES-02 colocou o acerto no AP0 como dor vital. **Não há contradição**: ele continua entregue; muda o *padrão de exposição*. Recomendo **ligado por padrão em famílias novas** com opção de desligar no onboarding (**Q-F01**).
- **Linguagem:** trocar "deve" por "diferença do mês" / "valor a acertar".

### Item 3 — Ocultar valores (NEED-014) — Must, R2.1
- Por dispositivo, lembrado, aplicado a **todo o app** (não só à Início). É privacidade contra "olhar por cima do ombro", não segurança de dados; o texto não deve prometer mais. Baixo risco, alto valor para o uso em público. (**Q-F04**: padrão.)

### Item 4 — Navegação inferior no desktop (NEED-022) — Could
- **Honesto:** é preferência, não dor. O valor real é consistência entre dispositivos e botões agrupados. Barra inferior em tela larga é menos convencional e pode piorar a leitura. **O Stakeholder não prescreve layout:** o PO apresenta **duas alternativas baratas** (barra inferior de largura contida vs. menu superior com conteúdo contido) para o usuário escolher. Sem urgência; não deve competir com itens Must.

### Item 5 — Descrição ausente (NEED-022) — Must, R2.1
- Sem descrição, o extrato vira uma lista de categorias e a busca perde sentido. A validação atual **exige** descrição; portanto ou o campo está oculto por defeito de descoberta ou foi escondido para ganhar velocidade. **Regra proposta:** campo **visível e opcional**; vazio assume o nome da categoria. A meta de < 10 s permanece. Pedir ao Dev/PO a causa real.

### Item 6 — Compra parcelada (NEED-003) — Must, R3 (1ª entrega)
- **Confirmo a lacuna e mudo a prioridade:** estava no AP1 (NEED-003 fase 2, Épico 7). Com uso real, parcelado é o **dia a dia do cartão no Brasil**; a alternativa é lançar parcela por parcela, a dor descrita no próprio NEED-003.
- **Relação com NEED-008 (desdobramento de compra, AP2):** são **ortogonais**. Parcelar divide **no tempo**; desdobrar divide **entre categorias/membros**. Não unificar; o parcelamento sai antes, o desdobramento continua no AP2 e deve compor depois.
- **Regras-chave:** valor total + nº de parcelas, prévia ("10x de R$ 250"), arredondamento na 1ª parcela, limite consumido pelo total, cada parcela na fatura do seu mês, edição "só esta / esta e as próximas".
- **Pergunta crítica (Q-F05):** em compra dividida, o acerto conta **por parcela no mês da fatura** (recomendado, coerente com o caixa e com Q-20) ou **pelo total na compra**?
- Se o Tech Lead estimar o básico (sem edição em lote) como pequeno, o Gestor pode puxar para a R2.1; senão, 1ª entrega da R3.

### Item 7 — Visões sintéticas (NEED-016) — Should, R3
- Valor claro ("para onde foi o dinheiro?"). Regras: **mesma fonte de números do Extrato** (reconciliar sempre), compra parcelada por parcela, drill-down para o Extrato, e **escopo fechado** (poucas quebras pré-definidas guiadas por filtros, não um construtor de painéis).
- **Conflito de prioridade:** compete com o painel de tetos/disponibilidade (NEED-005/006, marcados "primordiais" no AP1). Ver §5.
- Depende de tags (1) para valer a pena; começar por categoria/membro/conta se as tags atrasarem.

### Item 8 — Resumo do Mês na Início (NEED-015) — Must, R2.1
- **Concordo plenamente**: "como está o mês?" é a pergunta real e saldo alto esconde fatura e contas a pagar.
- **Definições que precisam ficar claras para o PO/TL** (evitam número que "não bate"): despesas por **competência** (compra no cartão no mês da compra; pagamento de fatura/transferência/acerto não são despesa); "a pagar" por **caixa** (previstas pendentes + faturas a vencer, atrasadas destacadas); resultado = receitas − despesas; **saldo previsto** = saldo atual − a pagar do mês (+ receitas previstas quando existirem); tudo **reconcilia com o Extrato**.
- **Ajuste a NEED-009:** o "Saldo Livre estrito na Home" (RN08) é rebaixado para o card recolhível de saldos; a intenção de proteger a reserva permanece.
- **Q-F03:** o usuário quer cadastrar **receitas previstas** (salário)? Sem elas, "saldo previsto" é conservador. R2.1 sem; R3 com (Could).

### Item 9 — Divisão opcional e por lançamento (NEED-018) — Must (padrão) R2.1; Should (por lançamento) R3
- **Discordância do padrão ligado: concordo.** Padrão **"Só meu"**; o campo some se o acerto estiver desligado.
- **Risco real:** com padrão desligado, despesas comuns esquecidas **subestimam o acerto** e geram a discussão que queremos evitar. Salvaguardas: a categoria **lembra "dividir por padrão"** (Supermercado, Condomínio) e o fechamento do mês avisa "N despesas não divididas, revisar?".
- **Divisão definida no lançamento e a vigência da regra (Q-08/D-GES-08):**
  - **Recomendação:** três modos no lançamento (Não dividir · Pela regra da família, com o % visível · De outro jeito); o **percentual usado é gravado no lançamento**. A regra da família vira **sugestão**, não cálculo retroativo. Mantém a essência de Q-08 (mudar a regra nunca reescreve o passado) e **resolve estruturalmente a ressalva 1** (o resumo mostra o percentual efetivo/ponderado do mês).
  - Lançamentos antigos migram com o percentual que o cálculo atual já produz (nenhum número muda).
  - O caso "paguei tudo por você" (0/100) é comum e deve ser possível.
- **Faseamento:** R2.1 = padrão desligado + correção do rótulo (ressalva 1) sem alterar o cálculo. R3 = percentual por lançamento e lembrança por categoria. Motivo: mexer no cálculo do acerto é a área de maior risco do produto; fazer com testes e migração em uma entrega própria.

### Item 10 — IA generativa (NEED-023) — Futuro, pós-v0
- Valor real, mas **só com dados bons** (categorias e tags consistentes por 2-3 fechamentos).
- **Pré-condições:** v0 em produção com uso real; tags/visões prontas (a IA **explica** números calculados pelo sistema, não calcula); decisão de privacidade aprovada (ADR); custo limitado.
- **Riscos de privacidade (principais):** dados financeiros e dados de terceiros (membros) saindo do ambiente (LGPD); descrições livres podem conter nomes e estabelecimentos; retenção/treino do provedor.
- **Regras:** opt-in por família e desligado por padrão; enviar **agregados**, não descrições; mostrar o que foi enviado; só sugerir (nunca gravar sozinho); sem aconselhamento financeiro.
- **Passo intermediário recomendado:** sugestão de categoria por descrições já usadas (determinística, zero risco de privacidade).

### Item 11 — Cor por conta/cartão (NEED-017) — Could, R3
- Baixo risco, benefício visual. Regras: nunca só cor (o nome continua), paleta curta com bom contraste nos dois temas, atribuição automática editável.

### Item 12 — Detalhe da transação na Início (NEED-022) — Should, R2.1
- Tocar abre o **detalhe** (com editar/excluir/histórico, o que resolve também o achado 7 da homologação); "ver extrato" fica explícito. Baixo risco.

### Item 13 — Remover conta (NEED-020) — Must (conta) / Should (cartão), R2.1
- **Recomendo arquivar**, não apagar: sem movimentação → pode excluir de verdade; com movimentação → **arquivar** (some de listas e seletores, histórico intacto, reversível). Só arquiva com **saldo zero** (**Q-F11**); cartão sem fatura em aberto/parcelas futuras. A sugestão do usuário ("só sem movimentação") está certa para exclusão; arquivar cobre o resto.

### Item 14 — Tema claro/escuro (NEED-022) — Could, R2.1
- Padrão do sistema + escolha manual lembrada no dispositivo. Barato; cuidar do contraste dos estados (verde/amarelo/vermelho) e das cores de conta (11).

### Item 15 — Gerir família e membros (NEED-020) — Must (editar nome) / Should (remover), R2.1
- **Histórico é sagrado:** membro removido vira "ex-membro" (nome preservado nos lançamentos), com acesso encerrado na hora. Antes de remover, mostrar pendências (acerto em aberto, contas/cartões de titularidade dele, previstas sob sua responsabilidade). Último Administrador não sai sem promover outro. **Excluir a família inteira: fora de escopo** (risco de perda; suporte).
- **Q-F07:** o que acontece com as contas pessoais do membro removido (padrão arquivar, decisão do Administrador).

### Item 16 — Grupos (NEED-021) — Futuro
- A frase do usuário mistura **três necessidades** diferentes (pessoa em vários grupos; visibilidade restrita; grupos não familiares) com valores e custos muito distintos. **Não vale construir agora.**
- **Impacto no modelo:** D-PO-02 (todos veem tudo) e US-020 (permissões granulares) são justamente os pontos tensionados. Reavaliação prevista na validação de D-PO-02; aqui é um **sinal fraco** (nenhuma conta privada concreta foi pedida). A necessidade mais plausível é **(b) conta privada dentro do grupo**, a candidata natural a AP posterior.
- **Ação barata e importante:** **spike do Tech Lead na R3** para verificar se o vínculo usuário↔família já é N:N e o custo de múltiplos grupos; vira ADR. É a única forma de não pagar caro depois.
- **Q-F08:** qual é o cenário concreto que motivou isso?

## 4. Conflitos e tensões identificados

| # | Tensão | Resolução proposta |
| :-: | :--- | :--- |
| C1 | Item 2 (acerto opcional) × D-GES-02/NEED-007 (acerto é dor vital do AP0) | Mantém-se entregue e valioso; muda a **exposição**. Padrão ligado em famílias novas (Q-F01). |
| C2 | Item 9b (divisão por lançamento) × Q-08/D-GES-08 (vigência por data) | Percentual **gravado no lançamento**; regra da família vira sugestão. Passado nunca é reescrito. |
| C3 | Item 8 (resumo do mês) × NEED-009 RN08 (saldo livre estrito na Home) | NEED-009 ajustado: saldo livre vai para o card de saldos; resumo ocupa o destaque. |
| C4 | Item 6 (parcelado) × plano AP1 e NEED-008 (AP2) | Parcelamento sai do AP1 para a R3; NEED-008 permanece no AP2; ortogonais. |
| C5 | Item 16 (grupos/visibilidade) × D-PO-02 e US-020 | Não reabrir agora; spike de modelo; conta privada candidata futura. |
| C6 | Item 7 e 8 × NEED-005/006 (tetos, "primordiais" no AP1) | Ver §5: risco de a análise "empurrar" o diferencial de autocontrole. |
| C7 | Item 9a (divisão desligada) × confiabilidade do acerto | Lembrança por categoria + revisão no fechamento do mês. |
| C8 | Item 3 e 8 e 2 (números na Início) | Todos respeitam "ocultar valores"; o indicador de acerto é neutro. |

## 5. Tensão estratégica: análise vs. tetos (prioridade vs. AP1)
As sugestões 7 e 8 entregam **visão e análise**; o AP1 prometia o **autocontrole** ("quanto ainda podemos gastar na categoria?", tetos mensais, NEED-005/006), que o Stakeholder já classificou como o grande diferencial. **Q-F12 (decidida na §8.1):** a dúvida era o que o usuário quer mais: *saber como foi* (análise) ou *controlar o que vem* (tetos)? Recomendação do Stakeholder: R3 entrega parcelamento + tags + visões; o AP1 (tetos) vem logo após, porque os tetos precisam de categorias estáveis e o parcelamento projeta os meses futuros.

## 6. Fatiamento de entregas proposto

### R2.1 — "Ressalvas e ajustes de baixo risco" (sem mudar o motor do acerto)
Ordem sugerida (maior valor e menor risco primeiro):
1. Ressalvas 1, 2, 3 (rótulo, dívida antiga, conta de origem padrão) + ressalva 4 (Should).
2. **Item 5** (descrição visível).
3. **Item 8** (Resumo do Mês) + **Item 3** (ocultar valores): entregar juntos, pois o resumo é o que mais expõe números.
4. **Item 2** (acerto opcional) + **Item 9a** (dividir desligado por padrão): pacote de "discrição".
5. **Item 13** (arquivar conta) e **Item 15** (editar família, remover membro): cadastro.
6. **Item 12** (detalhe na Início), **Item 14** (tema) e, se o PO tiver solução barata, **Item 4**.
> O que **não** entra na R2.1: parcelado (a menos que o TL estime pequeno), percentual por lançamento, tags, visões, cores.

### R3 — "Cartão completo e análise"
1. **Item 6** parcelamento (+ regra de acerto por parcela).
2. **Item 9b** percentual por lançamento + lembrança por categoria + revisão no fechamento.
3. **Item 1** tags.
4. **Item 7** visões sintéticas.
5. **Item 11** cores (Could); receitas previstas para o saldo previsto (Could).
6. **Spike de modelo** para múltiplos grupos (item 16a).

### AP seguintes
AP1 (tetos/ciclo/recorrência) imediatamente após a R3, conforme Q-F12. AP2 mantém NEED-008/009/010/011. **Futuro:** IA (10), contas privadas e grupos (16).

## 7. O que NÃO vale fazer agora (honesto)
- **IA generativa** (10): sem dados bons e sem decisão de privacidade, é risco puro.
- **Grupos não familiares / vários grupos** (16): reescreve permissões e dilui o foco; só o spike.
- **Construtor de relatórios configuráveis** (7): começar com quebras fixas.
- **Hierarquia de tags, tags com orçamento ou cor** (1): complexidade sem dor comprovada.
- **Menu inferior sofisticado no desktop** (4): preferência; pedir alternativas baratas ao PO.
- **Mexer no cálculo do acerto na R2.1** (9b): fica para a R3, com migração e testes.
- **Excluir a família inteira** (15): risco de perda.

## 8. Decisões tomadas (Stakeholder, com a visão do Gestor)

### 8.1 Pontos em aberto decididos

| ID | Ponto | Decisão | Justificativa (desempate) |
| :-: | :--- | :--- | :--- |
| **Q-F01** | Acerto: padrão em famílias novas e escopo | **Ligado por padrão, configurável por família** (Administrador); opção de desligar já no onboarding. | "Opcional, porém disponível": o casal-alvo não perde a dor vital e quem não quer desliga. Por usuário geraria visões diferentes do mesmo mês (risco de discussão e retrabalho). |
| **Q-F02** | Padrão do "Dividir"; reembolso | **Padrão "Só meu"**. Reembolso = percentual 0/100 (sem modo próprio). | Protege o acerto de inflar sem ação do usuário; modo próprio seria escopo extra. |
| **Q-F03** | Receitas previstas / saldo previsto | R2.1: **saldo previsto = saldo atual − a pagar do mês**, rótulo explica a fórmula. Receitas previstas **ficam para a R3 (Could)**. | Hipótese conservadora (nunca prometer entrada que não existe); evita escopo novo na R2.1. |
| **Q-F03b** | Fatura aberta em "a pagar" | **Sim**, em linha própria "Faturas" dentro de "a pagar"; não entra duas vezes em "despesas". | É o que sairá do caixa; coerente com a regra homologada de não duplicar. |
| **Q-F04** | Ocultar valores: padrão | **Em dispositivo/sessão nova, valores começam ocultos**; depois **lembra a última escolha** do usuário no dispositivo. | Critério "não expor dado financeiro sem ação do usuário". O custo é 1 toque, só na primeira vez. |
| **Q-F05** | Parcelado dividido no acerto | **Por parcela, no mês da fatura.** | Coerente com Q-20 e com o regime de caixa do acerto; evita cobrar do outro uma dívida que ainda não saiu do bolso. |
| **Q-F06** | Navegação no desktop | **R2.1 (Could):** manter o menu superior, com **conteúdo e menu de largura contida/centralizada**; **barra inferior só no mobile**. Reavaliar se o uso mostrar dor. | Menor risco de retrabalho; resolve o "botões espalhados" sem mudar o padrão de navegação. O PO pode propor ajuste visual, sem nova rodada de decisão. |
| **Q-F07** | Contas pessoais do membro removido | **Arquivar por padrão**; o Administrador pode reatribuir a titularidade antes. Remoção bloqueada enquanto houver acerto em aberto não reconhecido (precisa confirmar). | Reversível, preserva histórico, nada se perde. |
| **Q-F08** | Cenário de "grupos" | **Sem consulta:** tratar como **Futuro**. Hipótese conservadora: a necessidade real é conta privada dentro da família (b). Só o **spike de modelo** na R3. | Não reabre D-PO-02 sem evidência; evita reescrever permissões. |
| **Q-F09** | Tags: limite e escopo | **Sem limite técnico; UI sugere até 3; só em receita/despesa/compra no cartão** (não em transferência/acerto). | Simplicidade; sem retrabalho se depois ampliar. |
| **Q-F10** | Quebras iniciais da visão sintética | **Por categoria, por membro, por conta/cartão e por tag**, com total do período e drill-down ao Extrato. | Cobre "para onde foi o dinheiro" com o menor escopo. |
| **Q-F11** | Arquivar conta com saldo | **Bloquear até saldo zero** (transferir ou ajustar antes). Exclusão definitiva **só sem nenhum lançamento**, com confirmação. | Evita saldo "sumir" do total; protege a integridade do saldo da família. |
| **Q-F12** | Análise (7) vs. tetos (AP1) | **R3 = parcelamento + tags + visões; AP1 (tetos/ciclo/recorrência) logo em seguida.** | Tetos exigem categorias estáveis e se beneficiam do parcelamento projetando meses futuros; visão do mês (R2.1) já entrega o ganho imediato de leitura. |
| **Q-F13** | Descrição | **Visível, opcional; vazio assume o nome da categoria.** | Protege a meta < 10 s sem perder identificação. |
| **Q-F14** | Parcelado na R2.1 ou R3 | **R3 (1ª entrega)**, a menos que o TL estime o básico como pequeno; decisão final do Gestor com a estimativa. | Evita inflar a R2.1 e mexer em fatura/limite junto com o resumo da Início. |

### 8.2 Perguntas que continuam com o usuário (e só estas)

| ID | Pergunta | Por que não pode ser decidida pelo time | Quando |
| :-: | :--- | :--- | :--- |
| **Q-U01** | Aceita que **agregados financeiros** da família sejam enviados a um provedor externo de IA (qual provedor, opt-in)? | Privacidade/LGPD e serviço externo. | Só após a v0 em produção; **não bloqueia R2.1/R3**. |
| **Q-U02** | **Exclusão definitiva da família** (hoje fora de escopo) e política de retenção de dados de ex-membros. | Irreversível e envolve privacidade. | Quando houver pedido real; não bloqueia nada. |

> Nada nas §8.1 depende do usuário para a R2.1 começar. As decisões podem ser revertidas pelo Gestor se a estimativa do TL ou o uso real indicar custo maior que o valor.

## 9. Pacote de handover para o Product Owner (ordenado)

Cada item abaixo deve virar história/ajuste de história com BDD; "ressalva" refere-se a [`homologacao-r1-r2.md`](homologacao-r1-r2.md) §4.

**R2.1 (nesta ordem)**
1. **Ressalva 1** — rótulo da regra de divisão (NEED-007 RN-007.4). *Aceite:* nenhum número do acerto contradiz o rótulo; mostrar percentual efetivo/ponderado e a data de vigência.
2. **Ressalva 3** — conta de origem padrão (NEED-004 revisão). *Aceite:* o padrão nunca provoca o aviso de saldo negativo se existir conta suficiente.
3. **Item 5** — descrição visível e opcional (NEED-022). *Aceite:* campo visível; vazio assume categoria; lançamento < 10 s.
4. **Item 8** — Resumo do Mês (NEED-015, definições RN-015.1..7) + saldos em card recolhível. *Aceite:* totais batem com o Extrato.
5. **Item 3** — Ocultar valores (NEED-014). *Aceite:* mascara todo o app; lembrado por dispositivo.
6. **Item 2** — Acerto opcional (NEED-019) e **ressalva 2** (RN-007.5) dentro do indicador discreto. *Aceite:* desligado não apaga dados; religar restaura.
7. **Item 9a** — "Dividir" desligado por padrão (NEED-018). *Aceite:* default "Só meu"; campo some com acerto desligado.
8. **Ressalva 4** — prévia do impacto e sugestão pela renda (NEED-007 RN-007.6).
9. **Item 13** — arquivar/excluir conta e cartão (NEED-020 RN-020.2/3).
10. **Item 15** — editar nome da família, papéis, remover membro (ex-membro), sair (NEED-020).
11. **Item 12** — detalhe da transação na Início (NEED-022).
12. **Item 14** — tema (NEED-022); **Item 4** — duas alternativas de navegação desktop para escolha do usuário.
13. Melhorias menores da homologação (achados 5 a 13), a critério do PO conforme capacidade.

**R3 (nesta ordem)**
1. **Item 6** — parcelamento (NEED-003 revisão, RN-003.4..9). Pedir estimativa ao TL para saber se o básico cabe na R2.1.
2. **Item 9b** — percentual por lançamento (NEED-018), com migração sem mudar números.
3. **Item 1** — tags (NEED-013).
4. **Item 7** — visões sintéticas (NEED-016).
5. **Item 11** — cores (NEED-017); receitas previstas (NEED-015, Q-F03).
6. **Spike TL** — modelo para múltiplos grupos (NEED-021).

**Para o Gestor:** (i) as decisões Q-F01..Q-F14 já estão fechadas na §8.1 (o PO as usa como premissa; nenhuma consulta ao usuário); (ii) pedir ao TL estimativa do parcelamento básico e do spike de grupos; (iii) decidir se a R2.1 inclui o item 4.

## 10. Riscos
- **Acerto subestimado** por "dividir" desligado (C7): mitigar com lembrança por categoria e revisão no fechamento.
- **Migração do cálculo do acerto** (9b): risco de mudar números já conferidos; exigir regressão com os valores homologados (3.169,90; cota 1.584,95 etc.).
- **Escopo da R2.1 inchar** (11 itens): proteger a ordem; cortar do fim (14, 4, 12).
- **Resumo do Mês com definições ambíguas** gera desconfiança; fixar RN-015.1..5 antes de desenhar.
- **Remoção de membro** com pendências e titularidade: caso sensível; exige confirmação clara.
- **Competição com o AP1** pelo foco do time (Q-F12).
- **Privacidade da IA** (10): bloqueia a ideia até haver ADR.

## 11. Rastreabilidade
Feedback 1..16 ↔ NEED-013..023 (e revisões de NEED-003/004/007/009) ↔ ressalvas 1..4 ↔ Q-F01..Q-F13 ↔ D-PO-01/02/03 ↔ Q-08/D-GES-08 ↔ Q-20 ↔ US-009/011/012/020.

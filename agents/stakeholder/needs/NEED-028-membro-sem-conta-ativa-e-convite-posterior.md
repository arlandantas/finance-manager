# NEED-028: Membro da Família sem Conta Ativa (Convite Posterior)

## 📋 Metadados
- **ID:** `NEED-028`
- **Área:** Governança e Membros (estende NEED-001 e NEED-020; reabre Q-01/US-021)
- **Status:** Levantado em 2026-10-26 (uso real, item 3 do usuário) — **Q-U15..Q-U17 respondidas pelo usuário em 2026-10-26**; prioridade **5ª** na ordem aprovada; depende de spike do Tech Lead
- **Prioridade de valor:** **Should (Alta)** — vira Must se o usuário confirmar que hoje não consegue cadastrar a família real por causa disso
- **Consumidores:** Product Owner, Tech Lead (modelo de membro), Segurança
- **Origem:** Item 3 do feedback de uso real

---

## 1. Dor
Montar a família no app exige que a outra pessoa já tenha entrado com Google. Quem organiza quer cadastrar o cônjuge/filho **primeiro**, vincular as contas, cartões e lançamentos dele e só depois convidá-lo. Hoje isso é impossível: o membro só existe depois do aceite. Resultado: contas e gastos dele ficam no nome de quem cadastra (acerto e "quem gastou" errados) ou o app não é usado até a outra pessoa topar entrar.

## 2. Situação atual (verificada em `estado/familia-convites-sessoes.md` e no schema)
- Todo `Member` exige usuário com login (Google); só `acceptInvitation` cria o vínculo (SEC-004). Convite é por e-mail, 7 dias.
- Q-01 (D-GES-06) deixou "dependentes sem login" **fora do MVP** (US-021, pendente). Esta NEED **não é só dependente**: é adulto que ainda não entrou. Os dois casos são o mesmo buraco (membro sem conta ativa), mas com ciclos de vida diferentes.
- Quando o convite é aceito, o convidado entra como **novo** membro sem herdar histórico (US-035 regra 18, para ex-membro). Para este pedido isso precisa ser o contrário: **herdar** o que foi atrelado.

## 3. Regras de negócio propostas (RN)
- **RN-028.1:** o Administrador (e, hipótese, qualquer membro) pode cadastrar um membro apenas com nome (e-mail opcional); ele aparece como responsável/pagador, titular de conta ou cartão e nos relatórios como qualquer outro.
- **RN-028.2 (continuidade):** ao aceitar o convite depois, a pessoa **assume** o membro já existente com todo o histórico, contas, cartões, previstas e saldo de acerto; nada é recriado nem duplicado.
- **RN-028.3 (sem acesso):** membro sem conta não entra no app, não recebe e-mail até ser convidado e não vê nada. Quem lança por ele continua sendo o **autor** (RN-001.1); a trilha de quem registrou se mantém.
- **RN-028.4 ("Só meu"):** lançamento "Só meu" de membro sem conta é controlado por quem o lançou e pelo dono da conta (RN17), e **não é apagado nem visível a mais ninguém** além do já definido; ao assumir, o membro passa a controlá-lo. Ver `estado/so-meu.md` (hipótese a validar pelo Tech Lead/Segurança).
- **RN-028.5 (acerto):** membro sem conta entra no acerto de contas se a família assim decidir (Q-U16); o acerto é só registro, sem cobrança automática.
- **RN-028.6 (convite pendente de membro):** convidar é opcional e posterior; um membro pode permanecer sem conta indefinidamente (ex.: criança).
- **RN-028.7:** e-mail do convite deve bater com o do membro quando informado; um mesmo e-mail não vira dois membros (RN existente de duplicidade).
- **RN-028.8:** remover membro sem conta segue NEED-020 (vira ex-membro com histórico preservado).

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| "Membro = usuário com login" (US-002/003, índice parcial 1 vínculo ativo por usuário) | Passa a existir membro sem usuário | Mudança de modelo: decisão do Tech Lead (ADR); do lado do negócio, só exigimos RN-028.2 |
| Q-01 / US-021 (dependentes fora do MVP) | Reabre | Fora do MVP era correto na época; o uso real mostrou a necessidade. Unificar US-021 com esta NEED |
| Aceite cria `Member` NOVO (SEC-004) | Aceite precisa "assumir" membro existente | Aceite continua explícito (SEC-004); só muda o destino do vínculo |
| NEED-001 "tripla responsabilidade" | Responsável pode ser alguém sem login | Compatível; valida o caso "filho" já citado no NEED-001 |

## 5. Perguntas em aberto (só o usuário responde)
- **Q-U15 — RESPONDIDA (usuário, 2026-10-26):** os dois casos (adulto que ainda não entrou e dependente que nunca terá login), **com o mesmo mecanismo**. US-021 unificada nesta necessidade.
- **Q-U16 — RESPONDIDA (usuário, 2026-10-26):** membro sem conta **entra no acerto** (continua opcional, NEED-019).
- **Q-U17 — RESPONDIDA (usuário, 2026-10-26):** **só o Administrador** cadastra e convida.

**Prioridade aprovada pelo usuário (2026-10-26):** 5ª (após NEED-033, 034, 032, 031). Histórias: US-092..US-095 no backlog do PO; a modelagem depende da investigação do Tech Lead.

## 6. Riscos
Modelo central ("Só meu", propriedade, remoção, sessões) foi desenhado com membro = usuário; mudar exige revisão de segurança. É por isso que a priorização é "Alta" mas **depende de spike do Tech Lead**.

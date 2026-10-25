# Decisões do Product Owner — MCP no POC com Claude, lançamento direto e hospedagem (D-PO-70..D-PO-78)

*Atualizado: 2026-10-24 · Responsável: Agente Product Owner · Insumos: D-GES-35..37, [`respostas-r4d-v2.md`](../../tech-lead/respostas-r4d-v2.md) §4, ADR-030/031, SDD-024..027 (rev. 2).*

> As decisões abaixo aguardam **ratificação do Gestor**. A D-PO-77 (troca da RN-025.4) também exige **validação do Stakeholder**.

| ID | Decisão | Histórias | Justificativa |
| :-- | :-- | :-- | :-- |
| **D-PO-70** | **EN-007 (hospedagem Vercel + Prisma Postgres, 5 pts, Habilitadora) entra no backlog com prioridade 1**, antes de qualquer item do MCP. | EN-007 | O app já está na Vercel (D-GES-36 a); o lançamento direto grava dados reais e exige travas, backup e migração conferida (D-GES-37). |
| **D-PO-71** | **EN-006 fatiada:** 006a (OAuth próprio, POC sem registro dinâmico, 7) e 006b (endpoint, contexto, taxa, auditoria, 5). POC só com o **Claude**; registro dinâmico e ChatGPT (+2) e Gemini (+1) na ampliação. | EN-006a/b | Estimativa do TL (SDD-024 §11); reduz o POC. |
| **D-PO-72** | **US-076 fatiada** em 076a (lançar direto, 5), 076b (limites no perfil, 3) e 076c (modo "exigir confirmação", 3, backlog). **Substitui a D-PO-67** (proposta + confirmação). 076a e 076b saem juntas. | US-076a/b/c | D-GES-36 (c): lançamento direto pelo chat; a salvaguarda é a 076b mais reversão pelo cartão de conferência. |
| **D-PO-73** | **US-074:** opt-in de escrita desmarcado, com **segunda ciência**; instruções só do Claude; **sem "credencial mostrada uma vez"** no OAuth (o membro cola a URL do servidor no cliente). Substitui o trecho correspondente da D-PO-66. | US-074 | OAuth não entrega segredo ao membro; escrita sem confirmação pede consentimento reforçado. |
| **D-PO-74** | **US-074b (token pessoal, 3 pts) no backlog, fora do POC.** Única exceção em que a credencial é exibida uma vez; `read` por padrão, `write` opcional com os mesmos limites. | US-074b | Resposta do usuário (D-GES-37) a TL-42; atende clientes sem OAuth. |
| **D-PO-75** | **Limites do lançamento direto:** padrão **R$ 500,00 por lançamento, 10 por dia, 5 por hora**, **configuráveis pelo membro no perfil**, inclusive **"sem limite"**, com aviso do risco de lançamentos indevidos **e** lembrete de que o app **não movimenta dinheiro em bancos reais**. Janela de data: até 60 dias atrás. Duplicata natural em 10 min. Limites de transporte fixos. | US-076a/b | D-GES-37 e TL-47. O aviso informa risco sem alarmar: o dano é de registro, não de dinheiro real. |
| **D-PO-76** | **US-077:** um registro por lançamento (sem par proposta + confirmação); registros de alteração de limites; resultado "Bloqueado pelo seu limite". | US-077 | Consequência da D-PO-72/75; SDD-027 §R2.6. |
| **D-PO-77** | **Troca da RN-025.4** ("lançamento é sugestão confirmável") por **"lançamento direto, com opt-in explícito, limites do membro e reversível (excluir/desfazer)"**. Ações destrutivas por assistente continuam fora. **Pendente de validação do Stakeholder** (NEED-025 é do Stakeholder). | US-074, 076a/b/c | O usuário decidiu (D-GES-36 c), mas a regra de negócio pertence ao Stakeholder; o PO não edita a NEED-025. |
| **D-PO-78** | **Ordem do POC:** EN-007 ➔ EN-006a ➔ EN-006b ➔ US-074 ➔ US-075 ➔ US-077 ➔ US-076a/b. Marco POC-1 (Claude consultando) após a US-075; POC-2 (Claude lançando) após a 076b. POC = **38 pts**; **ampliação = 9 pts** (registro dinâmico + ChatGPT 2, US-074b 3, US-076c 3, Gemini 1). Total MCP + hospedagem: 47. | backlog | Estimativas do TL (respostas-r4d-v2 §2). Regra de liberação: `MCP_ENABLED` em produção só com EN-007 pronta, checklist de segurança e ensaio de restauração. |

## Efeitos nas decisões anteriores
- **D-PO-66** (credencial mostrada uma vez) e **D-PO-67** (proposta + confirmação) ficam **substituídas** por D-PO-73 e D-PO-72 (ver nota nas linhas originais).
- Prazos aprovados (D-GES-36 d): conexão 30/90 dias, acesso renovado a cada 60 min, auditoria 12 meses.

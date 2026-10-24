# Parecer de viabilidade (R5): importação de fatura com extração local e remoção de dados pessoais

*2026-10-24 · De: Agente Tech Lead · Para: Gestor (cópia: PO, Stakeholder) · **Só parecer, sem SDD*** · Pedido: D-GES-28 · Histórias afetadas: US-066..069 · NEED-026 · Q-U07, Q-U09*

## 1. Pergunta
É viável extrair localmente (no servidor do app, sem LLM) o conteúdo de uma fatura em **PDF com texto** ou **CSV**, remover dados pessoais e só então, se necessário, enviar algo à LLM — de forma compatível com "anonimização máxima" (D-GES-27)?

## 2. Resposta curta
**Sim para CSV e para PDF com camada de texto dos emissores conhecidos — e, nesses casos, a LLM se torna desnecessária.** O melhor caminho para a R5 é uma **importação local sem IA**: *parsers* por emissor que leem só as linhas de lançamento (data, descrição, valor, "n/N") e descartam todo o resto. A categoria sugerida vem do **histórico da família** (já é a regra D-PO-63), não da IA. A LLM só faria sentido como *fallback* para layouts desconhecidos, e aí ela precisaria ver as **descrições** — que contêm nomes de pessoas e não são anonimizáveis com segurança. **Recomendação: R5 sem LLM**; o *fallback* por IA vira decisão explícita do usuário (com opt-in próprio `INVOICE_IMPORT`).

## 3. Análise por formato
| Formato | Extração local | Remoção de dados pessoais | Viabilidade | Custo estimado |
| :-- | :-- | :-- | :-- | :-- |
| **CSV / OFX** exportado pelo banco | Trivial (`papaparse`/parser OFX); colunas fixas por emissor | Ler **só** as colunas data/descrição/valor; o arquivo nem contém titular/endereço na maioria dos emissores | **Alta** | 3 pts por formato genérico + 1 por mapeamento de emissor |
| **PDF com texto** (gerado pelo emissor) | `pdfjs-dist` (texto com posição) ➜ linhas; regex de linha de lançamento por emissor (`dd/mm DESCRIÇÃO [n/N] valor`) | *Allowlist* de linhas: só linhas que casam o padrão de lançamento entram; cabeçalho (nome, endereço, CPF, nº do cartão), rodapé, publicidade e resumo **nunca** são lidos como dado | **Média-alta** para 3–5 emissores mais usados pela família; **frágil** a mudanças de layout (cada emissor muda 1–2×/ano) | 5 pts (motor + 1º emissor) + 2 por emissor adicional + manutenção |
| **PDF escaneado / foto** (sem texto) | Exige OCR local (Tesseract, ~30–60 MB, 2–10 s/página, erros em valores) ou envio da imagem à LLM | Imagem inteira contém nome, endereço e cartão: **não anonimizável** antes de enviar; OCR local erra dígitos (risco direto em `amountInCents`) | **Baixa** — recomendo **fora** do escopo (D-PO-59 já deixou imagem para depois) | 8–13 pts e risco alto |
| PDF protegido por senha | Exige a senha do usuário (normalmente CPF) | Pedir/guardar CPF contraria a minimização | **Não fazer**; orientar a exportar CSV | — |

## 4. Limites reais da "remoção de dados pessoais"
1. **Descrições contêm pessoas**: "PIX ENVIADO JOAO S", "PAG*MARIANASILVA", estabelecimentos com nome de pessoa ("Padaria do Zé", "Dra. Ana Lima"). Regex e lista de membros da família **não** pegam terceiros. Logo, enviar descrições à LLM **nunca** é "anonimização máxima"; é, no máximo, "minimização".
2. **Números**: nº do cartão aparece mascarado ("**** 1234") no cabeçalho e às vezes em linhas de anuidade; CPF em boletos/rodapés. A *allowlist* de linhas resolve o cabeçalho; nas linhas restantes, máscara de sequências de 4+ dígitos que não sejam valor/data.
3. **Layout**: um *parser* por emissor é dívida de manutenção; quebra silenciosa é mitigada pela **conferência de total** (Σ itens lidos = total impresso da fatura, já exigida em US-066/067) — divergência ⇒ "Não conseguimos ler esta fatura com segurança".
4. **Itens especiais** (pagamento, estorno, IOF/juros, "n/N"): reconhecíveis por palavra-chave e sinal do valor; parcelas "n/N" reutilizam o modelo do [ADR-027](adrs/ADR-027-parcelas-anteriores-ao-app.md) (contador de anteriores).
5. **Memória**: processamento em memória, sem gravar o arquivo (D-PO-62), é viável: faturas têm < 2 MB e < 20 páginas; limite proposto 5 MB / 30 páginas.

## 5. Proposta para a R5 (a detalhar em SDD quando o Gestor liberar)
- **R5-a (sem IA, Must)**: importação de **CSV/OFX** + **PDF com texto** para os emissores da família (Q nova ao usuário: quais bancos/cartões?), *allowlist* de linhas, conferência de total, revisão item a item (US-067), gravação atômica (US-068), reverter (US-069). Categoria pelo histórico. **Nada sai do app** — dispensa o opt-in `INVOICE_IMPORT`.
- **R5-b (opcional, Could, depende de decisão do usuário)**: *fallback* por LLM para layout desconhecido enviando **só as linhas já recortadas** (data relativa, descrição com dígitos mascarados, valor), com opt-in próprio e aviso explícito de que descrições podem conter nomes de terceiros.
- Estimativa preliminar R5-a: **~18–21 pts** (motor CSV 3 + PDF 5 + 2 emissores 4 + revisão/dedupe 5–8 aproveitando US-067/068 + reverter 3) — a confirmar no SDD. As estimativas do PO para US-066..069 (21) continuam uma boa ordem de grandeza.

## 6. Decisões que dependem do usuário (para o Gestor)
1. Aceita a R5 **sem IA** (recomendado) ou quer o *fallback* por LLM com envio de descrições (R5-b)?
2. Quais emissores/cartões a família usa (define os *parsers* da 1ª versão)?
3. Confirma que PDF escaneado/foto e PDF com senha ficam fora?

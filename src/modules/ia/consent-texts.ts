import { createHash } from "node:crypto";
import type { LlmPurpose } from "@/modules/ia/port";

// SDD-022 §1 / ADR-029 §1 e §7: texto de consentimento VERSIONADO no código. Mudar o texto exige
// nova versão (`version + 1`); o teste de snapshot (versão + hash) falha se o texto mudar sem subir a versão.
// O texto NÃO promete "retenção zero" nem "não usado para treino" (TL-26) e diz que o provedor fica fora do Brasil.
export type ConsentText = { version: number; summary: string; details: string[] };

export const AI_CONSENT_TEXTS: Partial<Record<LlmPurpose, ConsentText>> = {
  SPENDING_ANALYSIS: {
    version: 1,
    summary:
      "Para analisar, o app envia à Anthropic, empresa fora do Brasil, apenas totais por categoria dos últimos meses e valores de gastos recorrentes, sem nomes de pessoas, descrições, contas, cartões ou datas. Você pode desligar quando quiser.",
    details: [
      "O que é enviado: totais por categoria e por mês (em meses relativos, sem datas), a quantidade de lançamentos e o valor médio de gastos recorrentes.",
      "O que nunca é enviado: nomes e e-mails de membros, descrições e notas de lançamentos, nomes de contas e cartões, datas exatas e identificadores.",
      "Os nomes das categorias são enviados depois de remover números, e-mails e nomes de pessoas da família.",
      "Antes de cada envio, você vê exatamente o que será enviado.",
      "O provedor fica fora do Brasil (Estados Unidos): ao ligar, você consente com essa transferência internacional de dados.",
      "Desligar vale na hora e não apaga as análises já feitas.",
    ],
  },
  INVOICE_IMPORT: {
    version: 1,
    summary:
      "Para ler o PDF da fatura, o app envia à Anthropic, empresa fora do Brasil, as linhas de compra com data, descrição do estabelecimento e valor, depois de remover nomes, CPF, número do cartão, endereço e contatos. O arquivo não é guardado. Você pode desligar quando quiser.",
    details: [
      "O que é enviado: somente as linhas da fatura que têm data e valor (ou total, vencimento, pagamento, estorno e encargos), com a descrição do estabelecimento como aparece no PDF.",
      "O que é removido antes do envio: nomes de pessoas, CPF e CNPJ, e-mails, telefones, endereço, CEP e números de cartão.",
      "Antes de cada envio, você vê exatamente as linhas que serão enviadas.",
      "O arquivo PDF não é guardado: o app lê o texto na hora e descarta o arquivo e a senha.",
      "O provedor fica fora do Brasil (Estados Unidos): ao ligar, você consente com essa transferência internacional de dados.",
      "Desligar vale na hora. O CSV da fatura continua funcionando sem IA.",
    ],
  },
};

let override: Partial<Record<LlmPurpose, ConsentText>> | null = null;

/** Só para testes: injeta textos (ex.: versão 2) sem alterar a constante. */
export function setConsentTextsForTests(texts: Partial<Record<LlmPurpose, ConsentText>> | null) {
  override = texts;
}

/** Texto vigente da finalidade; `undefined` quando a finalidade não está disponível. */
export function consentTextFor(purpose: LlmPurpose): ConsentText | undefined {
  return (override ?? AI_CONSENT_TEXTS)[purpose];
}

/** Hash do texto (resumo + detalhes) para o snapshot amarrado à versão. */
export function consentTextHash(t: ConsentText): string {
  return createHash("sha256")
    .update(JSON.stringify({ summary: t.summary, details: t.details }))
    .digest("hex");
}

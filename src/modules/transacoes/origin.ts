/** Selos de origem do lançamento no DTO: assistente (US-076a) e assinatura (US-096c). */
export function originFlags(
  row: {
    origin?: string | undefined;
    assistantGrantId?: string | null | undefined;
    subscriptionCharge?: { isAmended: boolean } | null | undefined;
  },
  assistantLabels?: Map<string, string>,
): {
  viaAssistant: { label: string } | null;
  isSubscription: boolean;
  isSubscriptionAmended: boolean;
  isInvoiceImport: boolean;
} {
  return {
    viaAssistant:
      row.origin === "ASSISTANT"
        ? {
            label:
              (row.assistantGrantId ? assistantLabels?.get(row.assistantGrantId) : undefined) ??
              "assistente removido",
          }
        : null,
    isSubscription: row.origin === "SUBSCRIPTION",
    isSubscriptionAmended: row.subscriptionCharge?.isAmended === true,
    isInvoiceImport: row.origin === "INVOICE_IMPORT",
  };
}

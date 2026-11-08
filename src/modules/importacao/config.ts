// ADR-042 §8: flag da importação de fatura. Desligada (padrão), a ação some e as rotas respondem 404.
// Server-only por convenção: só serviços e Route Handlers importam este módulo.
type Env = Record<string, string | undefined>;

export function invoiceImportEnabled(env: Env = process.env): boolean {
  return env.INVOICE_IMPORT_ENABLED?.trim().toLowerCase() === "true";
}

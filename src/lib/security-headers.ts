/**
 * Cabeçalhos de segurança globais (SEC-006).
 * CSP: enviada em modo Report-Only. O script de tema (`THEME_BOOTSTRAP_SCRIPT`) e a hidratação do Next
 * usam scripts inline, e CSP estrita exige nonce por requisição (renderização 100% dinâmica); sem validar
 * isso em navegador real o app poderia quebrar. `frame-ancestors` já é imposto de forma efetiva por
 * `X-Frame-Options: DENY` e pela diretiva abaixo na política de bloqueio mínima.
 */
export function securityHeaders(isProd: boolean): Array<{ key: string; value: string }> {
  const list = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    // Aplicada (não Report-Only): só anti-clickjacking, sem risco de quebrar scripts.
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    {
      key: "Content-Security-Policy-Report-Only",
      value:
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    },
  ];
  if (isProd) {
    list.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return list;
}

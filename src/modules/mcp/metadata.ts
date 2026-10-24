import { canonicalResource, issuerOf, mcpEnabled, SUPPORTED_SCOPES } from "@/modules/mcp/config";

// SDD-024 §4.1/§4.2 (+ §11.2: no POC não há `registration_endpoint`, porque não há DCR).
type Env = Record<string, string | undefined>;

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

export function protectedResourceMetadata(env: Env = process.env) {
  const issuer = issuerOf(env);
  return {
    resource: canonicalResource(env),
    authorization_servers: [issuer],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Gestão Financeira Familiar",
    resource_documentation: `${issuer}/configuracoes/assistente`,
  };
}

export function authorizationServerMetadata(env: Env = process.env) {
  const issuer = issuerOf(env);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

export function metadataResponse(body: unknown, env: Env = process.env): Response {
  if (!mcpEnabled(env)) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      ...CORS_HEADERS,
    },
  });
}

export function metadataOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

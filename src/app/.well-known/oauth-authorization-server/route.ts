import {
  authorizationServerMetadata,
  metadataOptions,
  metadataResponse,
} from "@/modules/mcp/metadata";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export const GET = () => metadataResponse(authorizationServerMetadata());
export const OPTIONS = metadataOptions;

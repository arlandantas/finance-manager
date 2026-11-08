-- US-074b (ADR-043): valor de enum novo. Expand; sozinha porque ALTER TYPE ADD VALUE não roda junto de usos do valor.
ALTER TYPE "McpTokenKind" ADD VALUE 'PAT';

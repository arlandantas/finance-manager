/**
 * Resumo de um erro seguro para log (SEC-012). `message` e a primeira linha do `stack` NÃO entram: erros do
 * Prisma/pg costumam carregar os argumentos da consulta (descrição, nota, valores). Ficam o tipo, o código
 * (Prisma `P2002`, pg `23505`...) e os quadros da pilha, que só têm caminhos de arquivo.
 */
export function describeError(e: unknown): { name: string; code?: string; stack?: string } {
  if (!(e instanceof Error)) return { name: typeof e };
  const code = (e as { code?: unknown }).code;
  const frames = (e.stack ?? "")
    .split("\n")
    .filter((l) => /^\s+at\s/.test(l))
    .slice(0, 12)
    .join("\n");
  return {
    name: e.name,
    ...(typeof code === "string" || typeof code === "number" ? { code: String(code) } : {}),
    ...(frames ? { stack: frames } : {}),
  };
}

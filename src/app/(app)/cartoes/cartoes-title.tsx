import Link from "next/link";

/** Título de Cartões com a entrada para a lista de Assinaturas (US-098; sem item novo no menu). */
export function CartoesTitle() {
  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-semibold text-slate-900">Cartões</h1>
      <Link
        href="/assinaturas"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-800 underline"
      >
        Assinaturas
      </Link>
    </div>
  );
}

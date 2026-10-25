import Link from "next/link";
import { getEnv } from "@/lib/env";
import {
  CONTACT_PLACEHOLDER,
  POLICY_IS_DRAFT,
  POLICY_UPDATED_ON,
  POLICY_VERSION,
  RETENTION_ROWS,
} from "@/modules/privacidade/policy";

export const metadata = { title: "Privacidade · Finance Manager" };
export const dynamic = "force-dynamic";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

// US-082: página pública (sem login) com os dados tratados, retenção e direitos. Texto = RASCUNHO do PO.
export default function PrivacidadePage() {
  const contact = getEnv().PRIVACY_CONTACT_EMAIL;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/login"
          className="text-sm font-semibold text-brand-800 underline dark:text-emerald-300"
        >
          Finance Manager
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Privacidade</h1>
        <p data-testid="politica-versao" className="text-sm text-slate-600">
          Versão {POLICY_VERSION} · atualizada em {dataBR(POLICY_UPDATED_ON)}
        </p>
        {POLICY_IS_DRAFT ? (
          <p
            role="note"
            data-testid="politica-rascunho"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            Rascunho: este texto aguarda a aprovação final e não substitui orientação jurídica.
          </p>
        ) : null}
      </header>

      <section aria-labelledby="p-guardamos" className="flex flex-col gap-2">
        <h2 id="p-guardamos" className="text-xl font-semibold text-slate-900">
          O que guardamos
        </h2>
        <p className="text-slate-800">
          Seu nome, e-mail e foto da conta Google (só para identificar você); as finanças que você e
          sua família cadastram (contas, cartões, lançamentos, previstas, categorias, tags e
          acertos); suas preferências; e registros de segurança (sessões ativas e conexões de
          assistente).
        </p>
      </section>

      <section aria-labelledby="p-para-que" className="flex flex-col gap-2">
        <h2 id="p-para-que" className="text-xl font-semibold text-slate-900">
          Para quê
        </h2>
        <p className="text-slate-800">
          Para o app funcionar e para a sua família acompanhar as finanças juntas. Não vendemos
          dados nem mostramos anúncios.
        </p>
      </section>

      <section aria-labelledby="p-compartilhamos" className="flex flex-col gap-2">
        <h2 id="p-compartilhamos" className="text-xl font-semibold text-slate-900">
          Com quem compartilhamos
        </h2>
        <p className="text-slate-800">
          Os dados de uma família só aparecem para os membros dela. Se a sua família ligar os
          recursos de IA, os dados necessários são enviados ao provedor de IA contratado pelo app,
          sempre depois de mostrarmos o que será enviado. Se você conectar um assistente de IA, o
          que ele consultar vai para o provedor que você usa, fora do nosso controle. O app roda em
          provedores de hospedagem e de banco de dados.
        </p>
      </section>

      <section aria-labelledby="p-tempo" className="flex flex-col gap-2">
        <h2 id="p-tempo" className="text-xl font-semibold text-slate-900">
          Por quanto tempo
        </h2>
        <div className="overflow-x-auto">
          <table data-testid="tabela-retencao" className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-700">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Dado
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Quanto tempo
                </th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map((r) => (
                <tr key={r.dado} className="border-b border-slate-200 align-top text-slate-800">
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {r.dado}
                  </th>
                  <td className="py-2">{r.prazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="p-direitos" className="flex flex-col gap-2">
        <h2 id="p-direitos" className="text-xl font-semibold text-slate-900">
          Seus direitos
        </h2>
        <p className="text-slate-800">
          Em{" "}
          <Link href="/perfil" className="font-semibold underline">
            Perfil
          </Link>
          , você pode <strong>baixar uma cópia dos seus dados</strong> e{" "}
          <strong>excluir a sua conta</strong>. A última pessoa de uma família pode{" "}
          <strong>excluir a família inteira</strong>, o que apaga todos os dados dela de forma
          definitiva.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-slate-800">
          <li>
            <Link href="/perfil" className="underline">
              Baixar meus dados
            </Link>
          </li>
          <li>
            <Link href="/perfil/excluir-conta" className="underline">
              Excluir minha conta
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="p-contato" className="flex flex-col gap-2">
        <h2 id="p-contato" className="text-xl font-semibold text-slate-900">
          Contato
        </h2>
        <p className="text-slate-800">
          Para qualquer outra dúvida ou pedido, escreva para{" "}
          {contact ? (
            <a
              data-testid="politica-contato"
              href={`mailto:${contact}`}
              className="font-semibold underline"
            >
              {contact}
            </a>
          ) : (
            <strong data-testid="politica-contato">{CONTACT_PLACEHOLDER}</strong>
          )}
          .
        </p>
      </section>
    </main>
  );
}

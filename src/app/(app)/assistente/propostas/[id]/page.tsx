import { ProposalScreen } from "./proposal-screen";

export const metadata = { title: "Proposta do assistente · Finance Manager" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalScreen id={id} />;
}

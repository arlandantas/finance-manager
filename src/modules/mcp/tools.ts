import type { AnyTool } from "@/modules/mcp/run-tool";
import { listarCadastros } from "@/modules/mcp/tools/cadastros";
import { cartoesEFaturas } from "@/modules/mcp/tools/cartoes";
import { consultarPropostaTool } from "@/modules/mcp/tools/consultar-proposta";
import { gastosPorCategoria } from "@/modules/mcp/tools/gastos-categoria";
import { listarLancamentos } from "@/modules/mcp/tools/lancamentos";
import { lancarDespesaTool } from "@/modules/mcp/tools/lancar-despesa";
import { previstasDoMes } from "@/modules/mcp/tools/previstas";
import { proporLancamentoTool } from "@/modules/mcp/tools/propor-lancamento";
import { resumoDoMes } from "@/modules/mcp/tools/resumo";
import { consultarSaldos } from "@/modules/mcp/tools/saldos";

/**
 * Registro de ferramentas do servidor (lista fechada, SDD-026 §2). Ordem alfabética e determinística no
 * `tools/list`; mudar um nome é mudar o contrato. As de escrita (US-076a) entram junto, atrás do escopo `write`.
 */
export const mcpTools: AnyTool[] = [
  cartoesEFaturas,
  consultarSaldos,
  consultarPropostaTool,
  gastosPorCategoria,
  lancarDespesaTool,
  listarCadastros,
  listarLancamentos,
  previstasDoMes,
  proporLancamentoTool,
  resumoDoMes,
].sort((a, b) => a.name.localeCompare(b.name));

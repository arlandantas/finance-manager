import { z } from "zod";

// SEC-017b (SDD-028 §7.3, US-079): contrato do arquivo "Baixar meus dados". Valores em centavos (inteiros),
// datas de calendário como AAAA-MM-DD e instantes em ISO-8601. Nunca inclui e-mail de outras pessoas, tokens
// de sessão, de OAuth ou do Google.
const iso = z.string();
const nullableIso = z.string().nullable();
const id = z.string();
const cents = z.number().int();

export const ExportMemberSchema = z
  .object({ id, nome: z.string(), papel: z.enum(["ADMIN", "MEMBER"]), exMembro: z.boolean() })
  .strict();

export const ExportAccountSchema = z
  .object({
    id,
    nome: z.string(),
    instituicao: z.string(),
    tipo: z.string(),
    titularId: id,
    forasDoDisponivel: z.boolean(),
    arquivadaEm: nullableIso,
    excluidaEm: nullableIso,
    criadaEm: iso,
  })
  .strict();

export const ExportCardSchema = z
  .object({
    id,
    nome: z.string(),
    instituicao: z.string(),
    titularId: id,
    limiteEmCentavos: cents,
    diaFechamento: z.number().int(),
    diaVencimento: z.number().int(),
    contaPagadoraId: id.nullable(), // US-089
    arquivadoEm: nullableIso,
    excluidoEm: nullableIso,
    criadoEm: iso,
  })
  .strict();

export const ExportCategorySchema = z
  .object({
    id,
    nome: z.string(),
    tipo: z.string(),
    icone: z.string(),
    arquivadaEm: nullableIso,
  })
  .strict();

export const ExportTransactionSchema = z
  .object({
    id,
    tipo: z.string(),
    direcao: z.enum(["CREDIT", "DEBIT"]),
    contaId: id.nullable(),
    cartaoId: id.nullable(),
    faturaId: id.nullable(),
    valorEmCentavos: cents,
    data: z.string(),
    competencia: z.string(),
    categoriaId: id.nullable(),
    descricao: z.string(),
    observacao: z.string().nullable(),
    pagadorId: id.nullable(),
    autorId: id,
    dividida: z.boolean(),
    modoDivisao: z.string(),
    divisao: z
      .array(z.object({ membroId: id, bps: z.number().int(), valorEmCentavos: cents }).strict())
      .optional(),
    acertoId: id.nullable(),
    planoParcelasId: id.nullable(),
    parcela: z.number().int().nullable(),
    parcelas: z.number().int().nullable(),
    tags: z.array(z.string()).optional(), // US-045: nomes das tags (só quando houver)
    origem: z.string(),
    criadoEm: iso,
    excluidoEm: nullableIso,
  })
  .strict();

export const ExportPlannedSchema = z
  .object({
    id,
    tipo: z.enum(["EXPENSE", "INCOME"]), // US-051
    descricao: z.string(),
    valorEmCentavos: cents,
    vencimento: z.string(),
    categoriaId: id,
    responsavelId: id,
    dividida: z.boolean(),
    observacao: z.string().nullable(),
    situacao: z.string(),
    lancamentoPagoId: id.nullable(),
    recorrenciaId: id.nullable(),
    criadaEm: iso,
    excluidaEm: nullableIso,
  })
  .strict();

export const ExportRecurringSchema = z
  .object({
    id,
    descricao: z.string(),
    valorEmCentavos: cents,
    categoriaId: id,
    responsavelId: id,
    dividida: z.boolean(),
    contaPagamentoId: id.nullable(),
    diaDoMes: z.number().int(),
    mesInicial: z.string(),
    mesFinal: z.string().nullable(),
    encerradaEm: nullableIso,
    criadaEm: iso,
  })
  .strict();

export const ExportSubscriptionSchema = z
  .object({
    id,
    cartaoId: id,
    descricao: z.string(),
    categoriaId: id,
    pagadorMemberId: id,
    dia: z.number().int(),
    valorAtualEmCentavos: cents,
    inicio: z.string(),
    fim: z.string().nullable(),
    encerradaEm: nullableIso,
  })
  .strict();

export const ExportSettlementSchema = z
  .object({
    id,
    tipo: z.string(),
    data: z.string(),
    periodo: z.string().nullable(),
    devedorId: id.nullable(),
    credorId: id.nullable(),
    autorId: id,
    criadoEm: iso,
    desfeitoEm: nullableIso,
  })
  .strict();

export const ExportFamilySchema = z
  .object({
    id,
    nome: z.string(),
    meuMembroId: id,
    membros: z.array(ExportMemberSchema),
    contas: z.array(ExportAccountSchema),
    cartoes: z.array(ExportCardSchema),
    categorias: z.array(ExportCategorySchema),
    lancamentos: z.array(ExportTransactionSchema),
    previstas: z.array(ExportPlannedSchema),
    recorrentes: z.array(ExportRecurringSchema),
    assinaturas: z.array(ExportSubscriptionSchema),
    acertos: z.array(ExportSettlementSchema),
  })
  .strict();

/** Família antiga (saída/remoção): só os lançamentos feitos ou pagos pela pessoa; outros membros, só o nome. */
export const ExportFormerFamilySchema = z
  .object({
    id,
    nome: z.string(),
    meuMembroId: id,
    membros: z.array(z.object({ id, nome: z.string() }).strict()),
    lancamentos: z.array(ExportTransactionSchema),
  })
  .strict();

export const ExportSchema = z
  .object({
    version: z.literal(1),
    geradoEm: iso,
    perfil: z
      .object({
        nome: z.string().nullable(),
        email: z.string(),
        criadoEm: iso,
      })
      .strict(),
    vinculos: z.array(
      z
        .object({
          familiaId: id,
          familia: z.string(),
          membroId: id,
          papel: z.enum(["ADMIN", "MEMBER"]),
          entrouEm: iso,
          saiuEm: nullableIso,
          motivoSaida: z.enum(["REMOVED", "LEFT"]).nullable(),
        })
        .strict(),
    ),
    consentimentos: z.array(
      z
        .object({
          familiaId: id,
          finalidade: z.string(),
          acao: z.enum(["ENABLED", "DISABLED"]),
          versaoDoTexto: z.number().int(),
          em: iso,
        })
        .strict(),
    ),
    conexoesAssistente: z.array(
      z
        .object({
          id,
          familiaId: id,
          cliente: z.string(),
          tipo: z.string(),
          permissoes: z.array(z.string()),
          situacao: z.string(),
          criadaEm: iso,
          expiraEm: iso,
          revogadaEm: nullableIso,
          ultimoUsoEm: nullableIso,
        })
        .strict(),
    ),
    familiaAtual: ExportFamilySchema.nullable(),
    familiasAnteriores: z.array(ExportFormerFamilySchema),
  })
  .strict();

export type ExportFile = z.infer<typeof ExportSchema>;
export const EXPORT_MAX_BYTES = 50 * 1024 * 1024;

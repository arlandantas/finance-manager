import { z } from "zod";
import { uuidSchema, versionSchema } from "@/lib/schemas";
import { MAX_TAGS_PER_TRANSACTION, TAG_MAX, TAG_MIN } from "@/modules/tags/normalize";

export const TAG_LEN_MSG = "A tag precisa ter entre 2 e 30 caracteres";
export const TAG_CHARS_MSG = "A tag só pode ter letras, números, hífen, ponto e sublinhado";
export const TAG_MANY_MSG = "Use no máximo 20 tags por lançamento";

/** Nome digitado pelo membro (a vírgula é o separador da interface, por isso não é permitida). */
export const TagNameSchema = z
  .string({ error: TAG_LEN_MSG })
  .transform((v) => v.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(TAG_MIN, TAG_LEN_MSG)
      .refine((s) => [...s].length <= TAG_MAX, TAG_LEN_MSG)
      .regex(/^[\p{L}\p{N}_.\- ]+$/u, TAG_CHARS_MSG),
  );

export const TagNamesSchema = z.array(TagNameSchema).max(MAX_TAGS_PER_TRANSACTION, TAG_MANY_MSG);

export const ListTagsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(30).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ListTagsQuery = z.output<typeof ListTagsQuerySchema>;

export const RenameTagSchema = z.object({ version: versionSchema, name: TagNameSchema }).strict();
export const MergeTagSchema = z.object({ version: versionSchema, intoId: uuidSchema }).strict();
export const DeleteTagSchema = z.object({ version: versionSchema }).strict();
export type RenameTagInput = z.output<typeof RenameTagSchema>;
export type MergeTagInput = z.output<typeof MergeTagSchema>;
export type DeleteTagInput = z.output<typeof DeleteTagSchema>;

export type MergeTagResponse = { tag: TagDTO; movedCount: number };
export type DeleteTagResponse = { removedFromCount: number };

export type TagRef = { id: string; name: string };
export type TagDTO = {
  id: string;
  name: string;
  usageCount: number;
  version: number;
  /** `memberId` de quem alterou por último (nulo = nunca renomeada). */
  updatedBy: string | null;
};

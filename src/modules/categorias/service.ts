import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { categoriasRepo } from "@/modules/categorias/repo";
import {
  type CategoryDTO,
  type CreateCategoryParsed,
  MAX_CATEGORIES_PER_KIND,
  type UpdateCategoryInput,
} from "@/modules/categorias/schemas";

type Row = NonNullable<Awaited<ReturnType<ReturnType<typeof categoriasRepo>["findById"]>>>;
type Repo = ReturnType<typeof categoriasRepo>;

const NOT_FOUND = "Categoria não encontrada.";
export const DUPLICATE_MESSAGE = "Já existe uma categoria com este nome";
export const DUPLICATE_ARCHIVED_MESSAGE = "Já existe uma categoria arquivada com este nome";

export function toCategoryDTO(c: Row): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    archived: c.archivedAt !== null,
    version: c.version,
  };
}

export async function listCategories(
  tx: Tx,
  ctx: RequestContext,
  kind?: "EXPENSE" | "INCOME",
  includeArchived = false,
): Promise<{ items: CategoryDTO[] }> {
  const rows = await categoriasRepo(tx, ctx.familyId).list(kind, includeArchived);
  return { items: rows.map(toCategoryDTO) };
}

async function duplicateError(
  existing: { id: string; archivedAt: Date | null } | null,
): Promise<Error> {
  const archived = existing?.archivedAt != null;
  return conflict(
    "DUPLICATE_CATEGORY_NAME",
    archived ? DUPLICATE_ARCHIVED_MESSAGE : DUPLICATE_MESSAGE,
    archived ? { archived: true, categoryId: existing?.id } : undefined,
  );
}

async function versionConflict(repo: Repo, id: string): Promise<Error> {
  const fresh = await repo.findById(id);
  if (!fresh) return notFound(NOT_FOUND);
  const name = await repo.memberFirstName(fresh.updatedByMemberId);
  return conflict(
    "VERSION_CONFLICT",
    `Esta categoria foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: fresh.updatedByMemberId },
  );
}

/** US-014 (SDD-007 §4.1). */
export async function createCategory(
  tx: Tx,
  ctx: RequestContext,
  input: CreateCategoryParsed,
): Promise<{ category: CategoryDTO }> {
  const repo = categoriasRepo(tx, ctx.familyId);
  await repo.lockKind(input.kind);
  if ((await repo.countByKind(input.kind)) >= MAX_CATEGORIES_PER_KIND) {
    throw unprocessable("CATEGORY_LIMIT_REACHED", "Limite de 40 categorias por tipo atingido");
  }
  const existing = await repo.findByNormalizedName(input.kind, input.name);
  if (existing) throw await duplicateError(existing);
  try {
    const row = await repo.insert({
      kind: input.kind,
      name: input.name,
      icon: input.icon,
      sortOrder: await repo.nextSortOrder(),
      updatedByMemberId: ctx.memberId,
    });
    return { category: toCategoryDTO(row) };
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_CATEGORY_NAME", DUPLICATE_MESSAGE);
    throw e;
  }
}

/** SDD-007 §4.2. */
export async function updateCategory(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateCategoryInput & { version: number },
): Promise<{ category: CategoryDTO }> {
  const repo = categoriasRepo(tx, ctx.familyId);
  const probe = await repo.findById(id);
  if (!probe) throw notFound(NOT_FOUND);
  await repo.lockKind(probe.kind);
  const row = (await repo.findById(id)) as Row;
  if (row.archivedAt) {
    throw unprocessable(
      "CATEGORY_ARCHIVED",
      "Esta categoria está arquivada. Reative-a para alterar.",
    );
  }
  const nameChanged = input.name !== undefined && input.name !== row.name;
  const iconChanged = input.icon !== undefined && input.icon !== row.icon;
  if (!nameChanged && !iconChanged) {
    if (input.version !== row.version) throw await versionConflict(repo, id);
    return { category: toCategoryDTO(row) };
  }
  if (nameChanged && input.name !== undefined) {
    const existing = await repo.findByNormalizedName(row.kind, input.name);
    if (existing && existing.id !== row.id) throw await duplicateError(existing);
  }
  let res: { count: number };
  try {
    res = await repo.updateVersioned(id, input.version, {
      ...(nameChanged && input.name !== undefined ? { name: input.name } : {}),
      ...(iconChanged && input.icon !== undefined ? { icon: input.icon } : {}),
      updatedByMemberId: ctx.memberId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_CATEGORY_NAME", DUPLICATE_MESSAGE);
    throw e;
  }
  if (res.count === 0) throw await versionConflict(repo, id);
  return { category: toCategoryDTO((await repo.findById(id)) as Row) };
}

/** SDD-007 §4.3. */
export async function archiveCategory(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ category: CategoryDTO }> {
  const repo = categoriasRepo(tx, ctx.familyId);
  const probe = await repo.findById(id);
  if (!probe) throw notFound(NOT_FOUND);
  await repo.lockKind(probe.kind);
  const row = (await repo.findById(id)) as Row;
  if (row.archivedAt) throw conflict("ALREADY_ARCHIVED", "Esta categoria já está arquivada.");
  if (row.version !== version) throw await versionConflict(repo, id);
  if ((await repo.countActiveByKind(row.kind)) <= 1) {
    throw unprocessable(
      "LAST_ACTIVE_CATEGORY",
      row.kind === "EXPENSE"
        ? "Mantenha ao menos uma categoria de despesa ativa"
        : "Mantenha ao menos uma categoria de receita ativa",
    );
  }
  const res = await repo.setArchived(id, version, ctx.clock.now(), ctx.memberId);
  if (res.count === 0) throw await versionConflict(repo, id);
  return { category: toCategoryDTO((await repo.findById(id)) as Row) };
}

export async function unarchiveCategory(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ category: CategoryDTO }> {
  const repo = categoriasRepo(tx, ctx.familyId);
  const probe = await repo.findById(id);
  if (!probe) throw notFound(NOT_FOUND);
  await repo.lockKind(probe.kind);
  const row = (await repo.findById(id)) as Row;
  if (!row.archivedAt) throw conflict("NOT_ARCHIVED", "Esta categoria não está arquivada.");
  if (row.version !== version) throw await versionConflict(repo, id);
  const res = await repo.setArchived(id, version, null, ctx.memberId);
  if (res.count === 0) throw await versionConflict(repo, id);
  return { category: toCategoryDTO((await repo.findById(id)) as Row) };
}

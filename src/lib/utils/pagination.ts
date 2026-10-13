export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Pagination = { page: number; pageSize: number; skip: number; take: number };

type Param = string | string[] | undefined;

const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

export function parsePagination(page?: Param, pageSize?: Param): Pagination {
  const p = Number.parseInt(first(page) ?? "1", 10);
  const s = Number.parseInt(first(pageSize) ?? "", 10);
  const safePage = Number.isFinite(p) && p > 0 ? Math.min(p, 10_000) : 1;
  const safeSize = Number.isFinite(s) && s > 0 ? Math.min(s, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize };
}

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function paginated<T>(items: T[], total: number, pagination: Pagination): Paginated<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

/** Read a single string search param. */
export function param(value: Param): string | undefined {
  const v = first(value)?.trim();
  return v ? v : undefined;
}

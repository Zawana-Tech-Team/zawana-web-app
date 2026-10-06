export type Pagination = { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };

export function readPagination(query: Record<string, unknown>) {
  return {
    hasPage: typeof query.page !== "undefined",
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
  };
}

export function paginationMetadata(page: number, limit: number, total: number): Pagination {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 && total > 0 };
}

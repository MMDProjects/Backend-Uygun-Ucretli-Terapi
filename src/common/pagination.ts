const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type PaginationInput = string | string[] | number | undefined;

// Query'de aynı parametre tekrarlanırsa (?limit=1&limit=2) ilk değer kullanılır
function firstValue(value: PaginationInput): string | number | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePagination(
  page?: PaginationInput,
  limit?: PaginationInput,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): { page: number; limit: number; skip: number } {
  const defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = opts.maxLimit ?? MAX_LIMIT;

  const parsedPage = Number(firstValue(page));
  const safePage =
    Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const parsedLimit = Number(firstValue(limit));
  const safeLimit =
    Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, maxLimit)
      : defaultLimit;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return { data, total, page, limit };
}

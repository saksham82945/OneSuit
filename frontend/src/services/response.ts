/**
 * Helpers for reading Whatomate API responses.
 *
 * The backend wraps every response in an envelope: `{ status, data }`.
 * List endpoints put the items under a named key next to paging info,
 * e.g. GET /contacts -> `{ data: { contacts: [...], total, page, limit } }`.
 *
 * These helpers also accept a bare array or an unwrapped payload, so screens
 * keep working against simpler mocks.
 */

type AxiosLike = { data?: unknown };

/** The `data` payload of an envelope response (or the body itself if it isn't wrapped). */
export function readData<T = unknown>(res: AxiosLike | undefined | null): T {
  const body = res?.data as { data?: unknown } | undefined;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

/**
 * The items of a list response. `key` is the list's name in the payload
 * (e.g. 'contacts', 'templates', 'rules'). Always returns an array.
 */
export function readList<T = unknown>(res: AxiosLike | undefined | null, key: string): T[] {
  const payload = readData<unknown>(res);
  if (Array.isArray(payload)) return payload as T[];
  const items = (payload as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(items) ? (items as T[]) : [];
}

/** Total count of a paged list response, falling back to the number of items. */
export function readTotal(res: AxiosLike | undefined | null, key: string): number {
  const payload = readData<unknown>(res);
  const total = (payload as { total?: unknown } | null | undefined)?.total;
  return typeof total === 'number' ? total : readList(res, key).length;
}

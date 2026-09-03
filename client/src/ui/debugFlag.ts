/**
 * One source of truth for the debug gate. Dev build + `?debug` in the URL, so
 * a production bundle can tree-shake every branch behind it.
 */
export const debug = import.meta.env.DEV && location.search.includes('debug')

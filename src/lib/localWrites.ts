/** Transaction ids created from this tab, so background watchers don't double-notify. */
export const localTransactionIds = new Set<string>();

export function rememberLocalTransaction(id: string | null | undefined) {
  if (id) localTransactionIds.add(id);
}

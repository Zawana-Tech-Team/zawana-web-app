/** Aggregate status is derived, never stored independently of child requests. */
export function requestBatchProgress(items: { status: string }[]) {
  const terminal = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_REJECTED', 'DECLINED']);
  const resolved = items.filter(item => terminal.has(item.status)).length;
  const pending = items.filter(item => item.status === 'PENDING_CUSTOMER').length;
  return { total: items.length, resolved, pending, status: resolved === items.length ? 'Resolved' : items.every(item => item.status === 'PENDING_CUSTOMER') ? 'Pending' : 'In progress' };
}

// A workspace that signed up for a paid plan stays locked until its first payment
// (the backend answers 402). These pages stay open meanwhile.
const OPEN_PATHS = ['/billing/checkout', '/settings/billing', '/support', '/profile'];

export const CHECKOUT_PATH = '/billing/checkout';

/** True for pages a workspace awaiting its first payment can still open. */
export const pathOpenWhilePendingPayment = (path: string) =>
  OPEN_PATHS.some((p) => path === p || path.startsWith(p + '/'));

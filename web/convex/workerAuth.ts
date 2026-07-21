// The consolidation worker (worker.py) is a separate, long-lived process,
// not a Convex function -- it has to call worker-facing mutations/queries
// as PUBLIC functions over the plain Convex client, the same way any
// browser could (there's no admin/deploy-key path from the Python SDK the
// way there is from a trusted Convex-internal caller). Unlike
// convex/payments.ts's markPaymentPaid (which had to become an
// internalMutation because a bypass there means free money), the worst
// case if someone else calls these directly from devtools is queue
// interference or reading resume file URLs early -- no payment bypass, no
// cross-session data exposure beyond what a given upload's own files
// already are. Still worth raising the bar above "anyone with the public
// URL can do this for free": every worker-facing function requires this
// shared secret (set via `npx convex env set WORKER_SECRET ...` and the
// same value in the worker's environment). Deliberately lighter-weight
// than a true internal-mutation boundary, proportionate to what's
// actually at risk on this surface -- not a claim that it's unbypassable.
export function requireWorkerSecret(secret: string) {
  const expected = process.env.WORKER_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Invalid or missing worker secret");
  }
}

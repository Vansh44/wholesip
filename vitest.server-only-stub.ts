// Empty stub aliased in for the `server-only` package during tests. The real
// package intentionally fails to resolve outside a React Server Component
// graph; under vitest we just want it to be a no-op so server modules (e.g.
// lib/email/campaign-worker.ts) can be imported and unit-tested directly.
export {};

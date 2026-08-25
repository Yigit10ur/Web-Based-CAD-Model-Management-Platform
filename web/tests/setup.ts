/**
 * Values the modules under test read at import.
 *
 * Nothing here reaches a real service: the database is replaced with an
 * in-process one by `tests/db.ts`, and Auth.js only needs a secret to
 * construct itself.
 */
process.env.AUTH_SECRET ??= 'test-secret-not-used-for-anything-real';

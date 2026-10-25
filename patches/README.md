# jwks-rsa 4.1.0 runtime compatibility

Firebase Admin 14 loads jwks-rsa, which synchronously requires ESM-only jose 6.
Vercel's Node.js runtime disables native `require(esm)`, so importing
`firebase-admin/auth` fails with `ERR_REQUIRE_ESM` before handlers can run.

The pnpm patch loads jose with `import()` inside the existing asynchronous
signing-key flow and the Passport callback provider. It keeps jose 6 and the
updated Firebase Admin SDK; it does not change token validation rules.

Run `pnpm run test:firebase-runtime` to reproduce the runtime restriction and
verify key conversion and signed JWT validation without external services.
Remove the patch when an upstream release resolves
https://github.com/auth0/node-jwks-rsa/issues/507 and these tests pass unpatched.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

test('Firebase Admin modules load when native require(esm) is disabled', async () => {
  const [app, auth, firestore] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  assert.equal(typeof app.initializeApp, 'function');
  assert.equal(typeof auth.getAuth, 'function');
  assert.equal(typeof firestore.getFirestore, 'function');
});

test('Firebase signing keys and Passport verify a signed JWT without network access', async () => {
  const require = createRequire(import.meta.url);
  const adminRequire = createRequire(require.resolve('firebase-admin/auth'));
  const jwksRsa = adminRequire('jwks-rsa');
  const jwt = adminRequire('jsonwebtoken');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const options = {
    jwksUri: 'https://unused.invalid/.well-known/jwks.json',
    cache: false,
    rateLimit: false,
    getKeysInterceptor: async () => [
      { ...jwk, kid: 'runtime-test', use: 'sig', alg: 'RS256' },
    ],
  };
  const key = await new jwksRsa.JwksClient(options).getSigningKey('runtime-test');
  assert.equal(key.kid, 'runtime-test');
  assert.deepEqual(createPublicKey(key.getPublicKey()).export({ format: 'jwk' }), jwk);
  const token = jwt.sign({ sub: 'runtime-test-user' }, privateKey, {
    algorithm: 'RS256', keyid: 'runtime-test', expiresIn: '1m',
  });
  const secret = await new Promise((resolve, reject) => {
    jwksRsa.passportJwtSecret(options)({}, token, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
  assert.equal(jwt.verify(token, secret, { algorithms: ['RS256'] }).sub, 'runtime-test-user');
});

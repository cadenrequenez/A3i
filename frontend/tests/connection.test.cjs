const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.join(__dirname, '../lib/connection.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
const subject = new Module(filename, module);
subject._compile(compiled, filename);
const { signIn, API_BASE_URL } = subject.exports;
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test('successful login preserves password spaces and uses the configured backend', async () => {
  global.fetch = async (url, init) => {
    assert.equal(url, `${API_BASE_URL}/api/v1/auth/login`);
    assert.equal(init.body.get('username'), 'dad');
    assert.equal(init.body.get('password'), ' password ');
    return Response.json({ access_token: 'test-token' });
  };
  assert.equal(await signIn(' dad ', ' password '), 'test-token');
});
for (const [status, message] of [[401, /username or password is incorrect/], [429, /Too many/], [500, /service is unavailable/], [503, /service is unavailable/]]) {
  test(`HTTP ${status} produces the appropriate message without resending credentials`, async () => {
    let calls = 0;
    global.fetch = async () => { calls++; return new Response('', { status }); };
    await assert.rejects(signIn('dad', 'password'), message);
    assert.equal(calls, 1);
  });
}
test('HTML startup pages and missing tokens cannot create a session', async () => {
  global.fetch = async () => new Response('<html>Starting</html>');
  await assert.rejects(signIn('dad', 'password'), /could not complete/);
  global.fetch = async () => Response.json({});
  await assert.rejects(signIn('dad', 'password'), /could not complete/);
});
test('network failure explains connection trouble', async () => {
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(signIn('dad', 'password'), /Unable to connect/);
});
test('cold startup can exceed 15 seconds, with a bounded 90-second timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  global.fetch = async (_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  };
  const result = signIn('dad', 'password');
  const rejected = assert.rejects(result, /within 90 seconds/);
  t.mock.timers.tick(15001);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(74999);
  await rejected;
});

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/auth.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function setup() {
 const values = new Map([['a3i_token','admin-token']]);
 const listeners = new Map(); const redirects=[];
 const window={localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},location:{replace:url=>redirects.push(url)},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 const context={window,exports:{}};vm.runInNewContext(code,context);
 return {...context,values,listeners,redirects,auth:context.exports};
}
test('old tab cannot obtain another account token for a save',()=>{
 const s=setup(); assert.equal(s.auth.getToken(),'admin-token');
 s.values.set('a3i_token','daniel-token');
 assert.throws(()=>s.auth.getToken(),/account changed/);
 assert.deepEqual(s.redirects,['/login?session=changed']);
});
test('account switch, logout, and restored tabs redirect; listeners clean up',()=>{
 for(const event of ['storage','pageshow','focus']) {
  const s=setup();const cleanup=s.auth.watchAccountSession();
  s.values.delete('a3i_token');s.listeners.get(event)({key:'a3i_token'});
  assert.deepEqual(s.redirects,['/login?session=changed']);cleanup();assert.equal(s.listeners.size,0);
 }
});
test('same-tab sign in establishes the new session; unrelated storage leaves it alone',()=>{
 const s=setup();s.auth.getToken();s.auth.setToken('daniel-token');
 assert.equal(s.auth.getToken(),'daniel-token');
 s.auth.watchAccountSession();s.listeners.get('storage')({key:'other'});
 assert.deepEqual(s.redirects,[]);
});

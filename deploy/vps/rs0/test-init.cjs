const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, 'init-rs0.js'), 'utf8');
async function scenario(options = {}) {
  const commands = []; let failed = false;
  const now = Math.floor(Date.now()/1000);
  const env = {
    APOLLO_RS0_WINDOW_START: String(now-5), APOLLO_RS0_WINDOW_END: String(now+1700),
    APOLLO_RS0_WINDOW_CONFIRMED: 'HOMOLOGACAO_RS0_ONLY',
    APOLLO_RS0_RESTORE_ROLLBACK_PROVEN: 'YES', ...options.env,
  };
  const admin = { auth: () => options.auth !== false, runCommand: (x) => {
    commands.push(x);
    if (x.getCmdLineOpts) return {ok:1,parsed:{replication:{replSetName:options.set || 'rs0'},security:{keyFile:'/run/secrets/rs0.key'}}};
    if (x.replSetGetStatus && options.throwCode) throw Object.assign(new Error('mock'),{code:options.throwCode});
    if (x.replSetGetStatus) return options.initialized ? {ok:1} : {ok:0,code:options.statusCode || 94};
    if (x.replSetGetConfig) return {ok:1,config:{_id:'rs0',members:[{_id:0,host:options.host || 'mongo:27017'}]}};
    if (x.replSetInitiate) return {ok:1};
    throw new Error('unexpected command');
  }};
  const context = {process:{env},Mongo:function(){return {getDB:()=>admin};}, Date, print:()=>{},quit:()=>{failed=true;}};
  await vm.runInNewContext(code, context);
  return {failed, commands, initiated:commands.filter(x=>x.replSetInitiate).length};
}
test('requires current window confirmation before connecting',async()=>{
 const x=await scenario({env:{APOLLO_RS0_WINDOW_CONFIRMED:'NO'}});assert.equal(x.failed,true);assert.equal(x.commands.length,0);
});
test('requires restore and rollback proof',async()=>{
 const x=await scenario({env:{APOLLO_RS0_RESTORE_ROLLBACK_PROVEN:'NO'}});assert.equal(x.failed,true);assert.equal(x.initiated,0);
});
test('rejects expired, oversized and insufficient windows',async()=>{
 const now=Math.floor(Date.now()/1000);
 for(const env of [{APOLLO_RS0_WINDOW_END:String(now-1)},{APOLLO_RS0_WINDOW_END:String(now+1900)},{APOLLO_RS0_WINDOW_END:String(now+300)}]){
  const x=await scenario({env});assert.equal(x.failed,true);assert.equal(x.initiated,0);
 }
});
test('authentication and wrong server configuration never initialize',async()=>{
 for(const options of [{auth:false},{set:'production'},{statusCode:13}]){
  const x=await scenario(options);assert.equal(x.failed,true);assert.equal(x.initiated,0);
 }
});
test('NotYetInitialized permits exactly one rs0 initiation',async()=>{
 const x=await scenario();assert.equal(x.failed,false);assert.equal(x.initiated,1);
 assert.equal(x.commands.at(-1).replSetInitiate.members[0].host,'mongo:27017');
});
test('existing expected configuration is unchanged',async()=>{
 const x=await scenario({initialized:true});assert.equal(x.failed,false);assert.equal(x.initiated,0);
});
test('wrong advertised hostname refuses without reconfigure',async()=>{
 const x=await scenario({initialized:true,host:'other:27017'});assert.equal(x.failed,true);assert.equal(x.initiated,0);
});
test('mongosh thrown NotYetInitialized is handled, auth errors are refused',async()=>{
 const yes=await scenario({throwCode:94});assert.equal(yes.failed,false);assert.equal(yes.initiated,1);
 const no=await scenario({throwCode:13});assert.equal(no.failed,true);assert.equal(no.initiated,0);
});

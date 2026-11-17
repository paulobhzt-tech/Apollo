// MUTATING step: only after isolated restore+rollback proof and a confirmed window.
// stdin to mongosh --nodb --quiet inside the audited HOMOLOGATION mongo container.
// No credentials, URIs or key contents are logged.
(async () => {
  const need = (ok) => { if (!ok) throw new Error('RS0 guard refused'); };
  const env = process.env;
  const now = Math.floor(Date.now() / 1000);
  const start = Number(env.APOLLO_RS0_WINDOW_START);
  const end = Number(env.APOLLO_RS0_WINDOW_END);
  need(env.APOLLO_RS0_WINDOW_CONFIRMED === 'HOMOLOGACAO_RS0_ONLY');
  need(env.APOLLO_RS0_RESTORE_ROLLBACK_PROVEN === 'YES');
  need(Number.isSafeInteger(start) && Number.isSafeInteger(end));
  need(end > start && end - start <= 1800 && now >= start && end - now >= 600);
  const c = new Mongo('mongodb://127.0.0.1:27017/?directConnection=true');
  const admin = c.getDB('admin');
  need(admin.auth(env.MONGO_INITDB_ROOT_USERNAME, env.MONGO_INITDB_ROOT_PASSWORD));
  const opts = admin.runCommand({getCmdLineOpts: 1});
  need(opts.ok && opts.parsed?.replication?.replSetName === 'rs0');
  need(opts.parsed?.security?.keyFile === '/run/secrets/rs0.key');
  let status;
  try { status = admin.runCommand({replSetGetStatus: 1}); }
  catch (error) { need(error.code === 94); status = {ok: 0, code: 94}; }
  if (!status.ok) {
    need(status.code === 94); // NotYetInitialized only; auth/network errors never initiate.
    need(end - Math.floor(Date.now() / 1000) >= 600);
    const initiated = admin.runCommand({replSetInitiate: {
      _id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}],
    }});
    need(initiated.ok);
    print('RS0_INITIATED; wait for PRIMARY separately; application not restarted');
  } else {
    const conf = admin.runCommand({replSetGetConfig: 1});
    need(conf.ok && conf.config._id === 'rs0' && conf.config.members.length === 1);
    need(conf.config.members[0]._id === 0 && conf.config.members[0].host === 'mongo:27017');
    print('RS0_ALREADY_CONFIGURED; no reconfiguration performed');
  }
})().catch(() => { print('RS0_INIT_REFUSED; no automatic retry/reconfiguration'); quit(1); });

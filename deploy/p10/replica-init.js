const fs = require('fs');
db.getSiblingDB('admin').auth('p10_root',fs.readFileSync('/run/secrets/root_password','utf8').trim());
try { rs.status(); } catch(e) {
 if(e.code!==94) throw e;
 rs.initiate({_id:'p10',members:[{_id:0,host:'p10-mongo:27017'}]});
}
if(!db.hello().isWritablePrimary) quit(2);
print('P10 replica PRIMARY verified');

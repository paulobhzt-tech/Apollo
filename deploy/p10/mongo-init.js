const fs = require('fs');
db.getSiblingDB('apollo_p10_homolog').createUser({
 user:'p10_homolog',pwd:fs.readFileSync('/run/secrets/mongo_password','utf8').trim(),
 roles:[{role:'readWrite',db:'apollo_p10_homolog'}]
});

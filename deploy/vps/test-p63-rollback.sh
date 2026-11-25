#!/usr/bin/env bash
set -euo pipefail

candidate=${1:?Informe a imagem candidata}
rollback=${2:?Informe a imagem de rollback}
evidence=${3:?Informe a pasta de evidências}
prefix="apollo-p63-lab-$(cat /proc/sys/kernel/random/uuid)"
mongo="$prefix-mongo"
app="$prefix-app"
database=apollo_p63_lab
archive="$evidence/database-lab.archive.gz"
mkdir -p "$evidence"

capture_app() { docker logs "$app" > "$evidence/$1.log" 2>&1 || true; }
cleanup() {
  code=$?
  if (( code != 0 )); then capture_app failure; fi
  docker logs "$mongo" > "$evidence/mongo.log" 2>&1 || true
  docker rm -fv "$app" "$mongo" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for() {
  for attempt in {1..60}; do
    if "$@"; then return; fi
    sleep 1
  done
  return 1
}

mongo_eval() {
  docker exec "$mongo" mongosh --quiet "$database" --eval "$1"
}

check_app() {
  local stage=$1 commit=$2 address
  address=$(docker port "$app" 10000/tcp)
  wait_for curl -fsS --max-time 2 -o "$evidence/$stage-api.json" "http://$address/api/"
  curl -fsS "http://$address/" > "$evidence/$stage-index.html"
  curl -fsS "http://$address/build-integrity.json" > "$evidence/$stage-manifest.json"
  node -e 'const fs = require("node:fs"), c = require("node:crypto");
    const [commit, manifest, index] = process.argv.slice(1);
    const build = JSON.parse(fs.readFileSync(manifest));
    if (build.commit !== commit || build.files["index.html"] !== c.createHash("sha256").update(fs.readFileSync(index)).digest("hex")) process.exit(1);
  ' "$commit" "$evidence/$stage-manifest.json" "$evidence/$stage-index.html"
}

start_app() {
  docker run -d --network "$prefix" --name "$app" -p 127.0.0.1::10000 \
    -e "MONGO_URL=mongodb://$mongo:27017/?replicaSet=rs0" -e "DB_NAME=$database" "$1" >/dev/null
}

docker network create "$prefix" >/dev/null
docker run -d --name "$mongo" --network "$prefix" mongo:7 --replSet rs0 --bind_ip_all >/dev/null
wait_for mongo_eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)'
mongo_eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'$mongo:27017'}]})"
wait_for mongo_eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'

start_app "$rollback"
check_app previous "${rollback##*:}"
mongo_eval 'db.lab_checks.insertOne({_id:"before", source:"synthetic"})'
docker exec "$mongo" mongodump --db "$database" --archive --gzip > "$archive"
gzip -t "$archive"
capture_app previous
docker rm -fv "$app" >/dev/null

start_app "$candidate"
check_app candidate "${candidate##*:}"
mongo_eval 'quit(db.lab_checks.countDocuments({_id:"before"}) === 1 ? 0 : 1)'
mongo_eval 'db.lab_checks.insertOne({_id:"after", source:"synthetic"})'
docker restart "$app" >/dev/null
check_app candidate_restart "${candidate##*:}"
mongo_eval 'quit(db.lab_checks.countDocuments() === 2 ? 0 : 1)'
capture_app candidate
docker rm -fv "$app" >/dev/null

start_app "$rollback"
check_app rollback "${rollback##*:}"
mongo_eval 'quit(db.lab_checks.countDocuments() === 2 ? 0 : 1)'
docker exec -i "$mongo" mongorestore --archive --gzip --stopOnError \
  --nsFrom="$database.*" --nsTo=apollo_p63_lab_restored.* < "$archive"
mongo_eval 'const restored = db.getSiblingDB("apollo_p63_lab_restored").lab_checks;
  quit(restored.countDocuments() === 1 && restored.findOne({_id:"before"}) ? 0 : 1)'
capture_app rollback
printf '%s\n' 'Upgrade, reinício, rollback e restauração em base nova passaram.' > "$evidence/resultado.txt"

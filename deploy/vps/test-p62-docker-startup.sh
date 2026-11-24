#!/usr/bin/env bash
set -euo pipefail

image=${1:?Informe a imagem candidata local}
evidence=${2:?Informe o diretório de evidências}
name="apollo-p62-$BASHPID"
mongo="$name-mongo"
app="$name-app"
started=$SECONDS

mkdir -p "$evidence"
cleanup() {
  docker logs "$app" > "$evidence/candidate-docker.log" 2>&1 || true
  docker logs "$mongo" > "$evidence/mongo-docker.log" 2>&1 || true
  docker rm -fv "$app" "$mongo" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  printf '%s s\n' "$((SECONDS - started))" > "$evidence/docker-duration.txt"
}
trap cleanup EXIT

docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$image" > "$evidence/candidate-image.txt"
docker network create "$name" > /dev/null
docker run -d --network "$name" --name "$mongo" mongo:7 --replSet rs0 --bind_ip_all
docker image inspect --format '{{.Id}} {{join .RepoDigests ","}}' mongo:7 > "$evidence/mongo-image.txt"

wait_for() {
  local attempt
  for attempt in $(seq 1 60); do
    if "$@"; then return 0; fi
    sleep 1
  done
  return 1
}

wait_for docker exec "$mongo" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)'
docker exec "$mongo" mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'${mongo}:27017'}]})"
wait_for docker exec "$mongo" mongosh --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'

docker run -d --network "$name" --name "$app" -p 127.0.0.1::10000 \
  -e "MONGO_URL=mongodb://$mongo:27017/?replicaSet=rs0" \
  -e DB_NAME=apollo_test_p62_candidate \
  "$image"
address=$(docker port "$app" 10000/tcp)
printf '%s\n' "$address" > "$evidence/docker-port.txt"
wait_for curl -fsS --max-time 3 -o "$evidence/docker-api.json" "http://$address/api/"
curl -fsS --max-time 5 -o "$evidence/docker-build-integrity.json" "http://$address/build-integrity.json"
curl -fsS --max-time 5 "http://$address/" | cmp - "$evidence/docker-web/index.html"
cmp "$evidence/docker-build-integrity.json" "$evidence/docker-web/build-integrity.json"
docker inspect --format '{{.Image}} {{.State.Status}} {{.RestartCount}}' "$app" > "$evidence/candidate-container.txt"

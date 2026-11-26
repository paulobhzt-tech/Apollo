#!/usr/bin/env bash
# Inventário de leitura para o console administrativo autorizado da HostGator.
set -euo pipefail
origin=https://homologacao.apollo-pdv.com
auth=()
if [[ -n "${APOLLO_HOMOLOGATION_NETRC:-}" ]]; then
  test -r "$APOLLO_HOMOLOGATION_NETRC"
  auth+=(--netrc-file "$APOLLO_HOMOLOGATION_NETRC")
fi

printf '\nVersão servida por HTTPS\n'
if manifest=$(curl -fsS --max-time 10 "${auth[@]}" "$origin/build-integrity.json"); then
  if ! python3 -c 'import json,sys; m=json.load(sys.stdin); print(m["commit"], len(m["files"]), "arquivos")' <<< "$manifest"; then
    printf '%s\n' 'Manifesto inválido. SHA servido não confirmado.' >&2
  fi
else
  printf '%s\n' 'Manifesto indisponível. SHA servido não confirmado.' >&2
fi
if ! curl -fsS --max-time 10 "${auth[@]}" "$origin/api/"; then
  printf '%s\n' 'API indisponível ou protegida. Verifique a autenticação autorizada.' >&2
fi
printf '\nCertificado público\n'
openssl s_client -connect homologacao.apollo-pdv.com:443 -servername homologacao.apollo-pdv.com \
  -verify_hostname homologacao.apollo-pdv.com -verify_return_error </dev/null 2>/dev/null |
  openssl x509 -noout -subject -issuer -enddate
printf '\nRecursos do host e listeners\n'
free -h
df -hP / /var
swapon --show
ss -lntp
printf '\nVirtualHosts carregados\n'
if command -v apachectl >/dev/null; then apachectl -S; else httpd -S; fi
printf '\nContêineres, portas e saúde\n'
docker ps --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
printf '\nRedes e montagens dos contêineres ativos\n'
while IFS= read -r id; do
  docker inspect --format '{{.Name}} {{range $name, $_ := .NetworkSettings.Networks}}rede={{$name}} {{end}}{{range .Mounts}}mount={{.Type}}:{{.Source}}:{{.Destination}}:rw={{.RW}} {{end}}' "$id"
done < <(docker ps -q)
printf '\nConfiguração das redes Docker\n'
while IFS= read -r network; do
  docker network inspect --format '{{.Name}} driver={{.Driver}} internal={{.Internal}} ipv6={{.EnableIPv6}}' "$network"
done < <(docker network ls -q)

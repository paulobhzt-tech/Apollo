#!/usr/bin/env bash
# Inventário de leitura para o console administrativo autorizado da HostGator.
set -euo pipefail
origin=https://homologacao.apollo-pdv.com
printf '\nVersão servida por HTTPS\n'
curl -fsS --max-time 10 "$origin/build-integrity.json" |
  python3 -c 'import json,sys; m=json.load(sys.stdin); print(m["commit"], len(m["files"]), "arquivos")'
curl -fsS --max-time 10 "$origin/api/"
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

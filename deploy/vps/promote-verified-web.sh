#!/usr/bin/env bash
# Run after the dedicated homologation Apache VirtualHost and API have been audited.
set -euo pipefail
umask 077
if [[ $# != 5 ]]; then
    echo "Uso: $0 raiz-web sha-atual sha-candidato manifesto-atual manifesto-candidato" >&2
    exit 2
fi
root=$(realpath -e "$1")
current=$2
candidate=$3
current_manifest=$(realpath -e "$4")
candidate_manifest=$(realpath -e "$5")
scripts=$(cd "$(dirname "$0")" && pwd)
origin=https://homologacao.apollo-pdv.com
[[ "$root" == /srv/apollo-homologacao/web ]] || {
    echo "Raiz requerida: /srv/apollo-homologacao/web" >&2
    exit 2
}
exec 9>"$root/.promotion.lock"
flock -n 9
verify() {
    python3 "$scripts/verify-public-build.py" "$1" --origin "$origin" || return 1
    curl --fail --silent --show-error --max-time 10 "$origin/api/" |
        python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("message") != "Apollo PDV API")'
}
verify "$current_manifest" || exit 1
python3 "$scripts/switch-verified-release.py" "$root" "$current" "$candidate" "$current_manifest" "$candidate_manifest"
if verify "$candidate_manifest"; then
    exit 0
fi
echo "Falha de saúde ou integridade. Restaurando o apontamento anterior." >&2
python3 "$scripts/switch-verified-release.py" "$root" "$candidate" "$current" "$candidate_manifest" "$current_manifest" --rollback
verify "$current_manifest"
exit 1

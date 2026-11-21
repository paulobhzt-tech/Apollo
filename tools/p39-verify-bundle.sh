#!/usr/bin/env bash
set -euo pipefail
bundle="${1:?Usage: bash tools/p39-verify-bundle.sh /absolute/path/Apollo-P32-Base-Recuperada.bundle}"
test "$(stat -c %s "$bundle")" = 2301923
work="$(mktemp -d /tmp/apollo-p39.XXXXXX)"
sha256sum "$bundle" | tee "$work/P32-SHA256.txt"
git bundle list-heads "$bundle" | tee "$work/bundle-heads.txt"
git clone --mirror "$bundle" "$work/recovered.git"
git --git-dir="$work/recovered.git" bundle verify "$bundle" 2>&1 | tee "$work/bundle-verify.log"
git --git-dir="$work/recovered.git" fsck --full 2>&1 | tee "$work/fsck.log"
git --git-dir="$work/recovered.git" cat-file -e cda5ed5a36210524f2f5fe5f255867210cb35be8^{commit}
git --git-dir="$work/recovered.git" fetch https://github.com/paulobhzt-tech/Apollo.git feat/apollo-3.0.1-caixa-offline-auditoria:refs/heads/remote-reference homolog/p10-operational-web:refs/heads/remote-p10
git --git-dir="$work/recovered.git" log --all --oneline -30 > "$work/history.txt"
git --git-dir="$work/recovered.git" merge-base cda5ed5a36210524f2f5fe5f255867210cb35be8 28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec > "$work/merge-base.txt"
git --git-dir="$work/recovered.git" rev-list --left-right --count 28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec...cda5ed5a36210524f2f5fe5f255867210cb35be8 > "$work/divergence.txt"
git --git-dir="$work/recovered.git" diff --stat 28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec cda5ed5a36210524f2f5fe5f255867210cb35be8 > "$work/diff-stat.txt"
echo "Evidence: $work"
echo "No incorporation or push performed. Compare computed SHA256 with independent trusted manifest."

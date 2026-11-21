"""P44 evidence inventory. A successful CI does not waive release blockers."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET
out=Path("evidence")
commit=(out/"commit.txt").read_text().strip()
lines=["# Apollo P44 — auditoria experimental", "Commit: "+commit,
"**BLOQUEADA para liberação operacional: requisitos obrigatórios externos ainda não atendidos.**",
"Resultados históricos P43 não são resultados desta execução. Consulte o status do job e cada log; artefatos também são preservados após falhas.",
"## Suítes desta execução","| XML | Testes | Falhas | Erros | Ignorados |","|---|---:|---:|---:|---:|"]
for p in sorted(out.glob("*.xml")):
    root=ET.parse(p).getroot()
    suites=[root] if root.tag=="testsuite" else list(root.findall("testsuite"))
    values=[sum(int(s.get(k,0)) for s in suites) for k in ("tests","failures","errors","skipped")]
    lines.append("| "+p.name+" | "+" | ".join(map(str,values))+" |")
lines += ["## Evidências",
"- Backend: replica/transactions/standalone/restore/legacy XML e logs. Impressão é lógica/simulada, sem comprovação física.",
"- Frontend: vitest, lint, typecheck, dois builds e comparação SHA-256. Consulte os logs para aprovação.",
"- Chromium: operator-session usa API simulada; p40-real-api, p41-queue-recovery, p41-real-screens, p43-operational-ui e p44-pwa usam servidor real. Mobile emulado.",
"- Capturas/traces: tests/test-results. Testes P43 são reexecutados nesta candidata, sem atribuir seus resultados históricos à P44.",
"- p44-sustained-10/30/50.json: sessões autenticadas, 30 segundos cada, throughput e p50/p95/p99. p43-financial-load.json: 25 vendas e 25 reenvios executados novamente.",
"- restart-integrity e rollback-integrity: reinício do backend/banco e rollback por processos na referência preservada, no banco descartável.",
"## Correções P44",
"- Exceções de impressão agora rejeitam a operação antes da confirmação do ticket; testes simulam falha e duas vias 80 mm.",
"- Na Web, operador confirma a saída no papel antes de marcar impresso; cancelar mantém pendência.",
"- Reimpressão pelo fluxo suportado exige administrador e registra ticket/setor/operador/horário antes do envio.",
"- Aviso público de falta de conexão; nunca libera acesso offline a dados privados.",
"## Segurança e limites",
"CacheStorage contém exclusivamente manifesto público e aviso público offline. Não contém HTML autenticado, API, senha, token ou dados comerciais. CORS, CSRF e autenticação preservados.",
"Primeira abertura sem rede: indisponível. Reabertura com service worker instalado: aviso público, sem login offline nem registro de vendas. Operação offline: somente PDV previamente carregado e autenticado; fila local sujeita às regras existentes. Reconexão: retomar autenticação e conferir sincronização.",
"## Pendências obrigatórias",
"- P32: bundle localizado no arquivo preservado, 2.301.923 bytes; patch e relatório lidos. Mudança P32 é apenas de teste de recuperação. SHA-256 independente, fsck, ancestralidade e comparação binária ainda não executados. Não incorporado.",
"- Para verificador privado existente: APOLLO_P32_BUNDLE_URL (secret HTTPS válido) e APOLLO_P32_SHA256 (variável com hash independente). Não inserir URL assinada no repositório público. Ferramentas desta sessão não permitem gravar secrets nem disparar workflow_dispatch. O workflow p44-p32 tenta validar os valores existentes e preserva seu resultado separado.",
"- Infraestrutura de destino: sem acesso SSH autorizado disponível nesta sessão; isolamento, HTTPS, volumes, backup e rollback reais não comprovados. Nenhum deploy.",
"- Impressora 80 mm física, instalação PWA em Android/iPhone e Windows reais ainda não comprovados.",
"- Dois operadores compartilham o turno financeiro; dois caixas independentes não homologados. Banco independente por estabelecimento continua obrigatório.",
"- Matriz completa de zoom, todos os fluxos por tela, antifraude completo e integrações fiscais/delivery reais não recebem aprovação automática por estas suítes.",
"## Instalação e rollback",
"Somente homologação descartável: extrair fonte do commit, Node 22, Python 3.11, MongoDB 7 replica set dedicado; npm ci --legacy-peer-deps e npm run build no frontend; pip install -r backend/requirements.txt; servir frontend/dist com SERVE_FRONTEND_DIR pelo backend atrás de HTTPS. Definir DB_NAME e MONGO_URL exclusivos e CORS_ORIGINS exato. Criar apenas usuários fictícios. Não reutilizar .env ou backup da loja.",
"Antes de implantação futura: backup consistente do banco dedicado e configuração, ensaio de restauração separado, retenção do build/commit anterior. Rollback por processos foi ensaiado; isso não comprova rollback na VPS. Não executar migração destrutiva nem restaurar sobre banco real.",
"## Artefatos",
"Apollo-P44-source.zip, Apollo-P44-history.bundle, frontend/dist, web-SHA256SUMS.txt e SHA256SUMS.txt. O bundle da candidata não substitui o P32. Aprovação operacional depende da autorização explícita do proprietário após resolver bloqueantes."]
for name in ["npm-audit.json","python-audit.json","p44-sustained-10.json","p44-sustained-30.json","p44-sustained-50.json","p43-financial-load.json","restart-integrity.json","rollback-integrity.json"]:
    p=out/name
    if not p.exists():
        lines.append("**Evidência ausente:** "+name); continue
    data=json.loads(p.read_text())
    if name=="npm-audit.json": data=data.get("metadata",data)
    if name=="python-audit.json": data=[{"name":x["name"],"vulns":x.get("vulns")} for x in data.get("dependencies",[]) if x.get("vulns")]
    if name=="restart-integrity.json": data={"same":data.get("same")}
    lines += ["### "+name, "```json\n"+json.dumps(data,indent=2,ensure_ascii=False)+"\n```"]
(out/"Apollo-P44-Auditoria.md").write_text("\n\n".join(lines))
print("P44 report generated:",commit)

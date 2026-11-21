"""Build an auditable P45 package; incomplete evidence never becomes approval."""
from pathlib import Path
import json, os, subprocess, zipfile, xml.etree.ElementTree as ET
out=Path("evidence")
commit=(out/"commit.txt").read_text().strip()
lines=["# Apollo PDV 3.0.1 — P45", "Commit testado: "+commit,
"**Candidata experimental. Sem autorização operacional ou de produção.**",
"Resultado do job antes do empacotamento: "+os.environ.get("P45_JOB_STATUS","unknown"),
"## Resultados automatizados", "| Suíte XML | Testes | Falhas | Erros | Ignorados |","|---|---:|---:|---:|---:|"]
for path in sorted(out.glob("*.xml")):
    tree=ET.parse(path).getroot()
    suites=[tree] if tree.tag=="testsuite" else tree.findall("testsuite")
    counts=[sum(int(s.get(k,0)) for s in suites) for k in ("tests","failures","errors","skipped")]
    lines.append("|"+path.name+"|"+"|".join(map(str,counts))+"|")
lines += ["## Alterações e auditoria funcional",
"- Modo operator: caixas financeiros por operador, índice único por operador, abertura/movimentos/fechamento/histórico separados; API compartilhada legada preservada em modo shared.",
"- Inicialização bloqueia troca para operator com turno legado aberto e exige réplica MongoDB. Não habilitar em dados reais nesta missão.",
"- Recebimentos, pagamentos parciais, delivery e fechamento disputam a mesma revisão transacional do caixa. Reenvios de movimentos possuem referência e impressão digital dos dados.",
"- Vendas offline novas preservam o turno original. Turno alterado: 409 sem cobrança/baixa. Fila antiga identificada sem turno: 422 para revisão administrativa; nunca migrada automaticamente para novo caixa.",
"- Navegador preserva referência da sangria/suprimento após erro de conexão. Histórico de caixas fica restrito ao operador, com visão administrativa.",
"- Regressão funcional herdada cobre pedidos/mesas/clientes/estoque/lotes/compras/fiado/cozinha/QR/permissões/backup. Testes de API não comprovam todos os caminhos pelas telas.",
"- Backend de regressão: modo shared de compatibilidade. Backend HTTPS real e ensaios financeiros P45: modo operator. Nenhum resultado deve ser transferido entre os dois modos sem esse escopo.",
"## Segurança",
"Consulte python-audit.json, npm-audit.json, regressão de autorização/CSRF/CORS, cache privado e evidências de transação. Scanners não equivalem a certificação de segurança.",
"Sem alteração da validade de autenticação nesta P45. Dispositivos móveis emulados; impressão simulada.",
"## Recuperação P32",
"Bundle de 2.301.923 bytes localizado no arquivo preservado. SHA-256 original, git bundle verify, fsck e ancestralidade do binário NÃO executados: executor local indisponível e sem canal privado configurável de transferência ao runner. Nenhum hash original foi inventado.",
"Patch e relatório atuais P32 (versão 5) lidos. São alterações de teste, sem correção de produção declarada. p45-p32-equivalent.json comprova ou deixa ausente o ensaio equivalente direto na P45: processo morto após gravações transacionais, recuperação limitada a 100 segundos, mesma referência, uma venda, uma baixa e um lote.",
"Não se afirma equivalência de todo o histórico P19/P32 desconhecido. Lacunas fora do patch recuperado exigem comparação binária futura, sem impedir a execução das demais verificações.",
"## Pendências externas e limites",
"- Infraestrutura de destino: acesso/isolamento/HTTPS/volumes/backup e rollback não comprovados nesta sessão; nenhum deploy.",
"- Impressora 80 mm física e instalação PWA em Android/iPhone/Windows reais não executadas. Simulações não aprovam hardware.",
"- Cobertura exaustiva de todos os requisitos comerciais não estabelecida apenas pela quantidade de testes; fiscal e marketplaces existentes podem ser simulações.",
"- Estorno de turno anterior exige caixa ativo do operador autorizado; gera lançamento auditável negativo nesse turno e preserva o fechamento original. Sem caixa ativo, retorna 409 sem alterar venda/estoque. Consulte p45-two-cashiers.json para evidência de devolução total e parcial.",
"- Uso na loja permanece sujeito a resolver requisitos obrigatórios e aprovação explícita do proprietário.",
"## Instalação e retorno",
"Pacote Apollo-P45-homologacao.zip: fonte exata, frontend/dist e instruções. Não é instalador Windows assinado. Uso exclusivamente em ambiente isolado com dados fictícios.",
"Para dois caixas independentes definir APOLLO_CASH_MODE=operator antes da primeira abertura, MONGO_URL de réplica dedicada, DB_NAME exclusivo, CORS_ORIGINS exato e HTTPS. Na ausência da variável, usa operator; shared precisa ser escolhido explicitamente para compatibilidade legada.",
"Antes de futura atualização: encerrar todos os turnos, suspender lançamentos e preservar backup consistente do banco/configuração e build anterior. Restaurar primeiro em banco separado. Nunca ativar versão anterior para escrever enquanto houver caixas independentes abertos.",
"Rollback automatizado desta execução é por processos em banco descartável; não comprova infraestrutura de destino."]
for name in ["p45-two-cashiers.json","p45-p32-equivalent.json","p45-load-comparison.json","p44-sustained-10.json","p44-sustained-30.json","p44-sustained-50.json","p43-financial-load.json","restart-integrity.json","rollback-integrity.json"]:
    path=out/name
    if not path.exists():
        lines.append("**Evidência ausente:** "+name)
        continue
    data=json.loads(path.read_text())
    if name=="restart-integrity.json": data={"same":data.get("same")}
    lines.extend(["### "+name,"~~~json\n"+json.dumps(data,ensure_ascii=False,indent=2)+"\n~~~"])
(out/"Apollo-P45-Auditoria.md").write_text("\n\n".join(lines))
instructions="""APOLLO P45 — HOMOLOGAÇÃO ISOLADA
Sem autorização de produção. Sem dados reais.
1. Confira SHA256SUMS.txt e o commit em evidence/commit.txt.
2. Extraia source.zip em pasta nova. Instale Python 3.11, Node 22 e MongoDB 7 em réplica dedicada.
3. Instale backend/requirements.txt em ambiente virtual; instale frontend com npm ci --legacy-peer-deps.
4. O build Web já está em frontend/dist no pacote. Pode ser reconstruído com npm run build.
5. Configure MONGO_URL, DB_NAME exclusivo, CORS_ORIGINS HTTPS exato, COOKIE_SECURE=true,
   APOLLO_CASH_MODE=operator e SERVE_FRONTEND_DIR com caminho absoluto de frontend/dist.
6. Crie somente contas fictícias para testes; não reutilize senhas, arquivos .env nem backups da loja.
7. Inicie uvicorn server:app no diretório backend, somente em interface local, atrás de HTTPS.
8. Consulte Apollo-P45-Auditoria.md antes de aprovar. Hardware físico e destino continuam pendentes.
Backup/rollback: interrompa gravações e encerre ambos os caixas; gere mongodump consistente da réplica
dedicada e preserve configuração/build; restaure com mongorestore somente em OUTRO banco descartável.
Nunca restaure em banco da loja. Retorno à P44 requer ausência de turnos independentes abertos.
"""
(out/"INSTALACAO-P45.txt").write_text(instructions)
subprocess.run(["git","archive","--format=zip","-o",str(out/"Apollo-P45-source.zip"),"HEAD"],check=True)
with zipfile.ZipFile(out/"Apollo-P45-homologacao.zip","w",zipfile.ZIP_DEFLATED) as z:
    z.write(out/"Apollo-P45-source.zip","source.zip")
    z.write(out/"INSTALACAO-P45.txt","INSTALACAO-P45.txt")
    z.write(out/"Apollo-P45-Auditoria.md","Apollo-P45-Auditoria.md")
    for p in Path("frontend/dist").rglob("*"):
        if p.is_file(): z.write(p,p.as_posix())
print("P45 package prepared for review; no operational approval",commit)

"""Build an evidence-grounded audit summary; never infer store approval from CI."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

out = Path("evidence")
rows = []
for path in sorted(out.glob("*.xml")):
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.findall("testsuite"))
    fields = {key: sum(int(s.get(key, 0)) for s in suites) for key in ("tests", "failures", "errors", "skipped")}
    rows.append("| " + path.name + " | " + " | ".join(str(fields[k]) for k in ("tests", "failures", "errors", "skipped")) + " |")
commit = (out / "commit.txt").read_text().strip()
text = """# Apollo PDV 3.0.1 P41 — auditoria experimental
Estado: NÃO LIBERADO PARA A LOJA. CI não substitui os critérios operacionais abaixo.
Commit executado: """ + commit + """

## Matriz de execução
| XML | Testes | Falhas | Erros | Ignorados |
|---|---:|---:|---:|---:|
""" + "\n".join(rows) + """

Consulte vitest.log, typecheck.log, build.log, playwright.log, real-playwright.log e
queue-playwright.log e real-screens.log para os resultados específicos. Os 32 testes de interface usam
API simulada. real-playwright.log usa backend e Chromium reais; ações comerciais são
HTTP autenticado e o login é pela UI. queue-playwright.log verifica recuperação da
fila persistida pelo código da aplicação após reautenticação, com dados de fila
inseridos pelo ensaio no armazenamento do navegador; não prova lançamento offline
pela tela. real-screens.log registra navegação por 26 telas em cada perfil, exceções e 5xx;\nusa capturas sem certificar todos os botões, regras ou layouts. Mobile é emulação Chromium, não aparelho Android/iPhone físico.

## Correções e preparação
- Chamadas HTTP autenticadas enviam a origem correta sem remover CSRF/CORS.
- Mocks comerciais substituem o handle do banco e verificam a autorização de plataforma.
- Réplica, standalone, restauração, transações e testes HTTP usam bancos separados.
- Os três testes transacionais antes ignorados usam o banco explicitamente autorizado.
- Seed pode ser importado sem iniciar outro event loop.
- Jobs obrigatórios propagam erros; evidências são guardadas mesmo em falha.
- HTTPS e cookies seguros no ensaio integrado; CA temporária validada por curl.
  Chromium aceita a CA de teste via ignoreHTTPSErrors neste ambiente descartável.

## Desempenho e recuperação
read-load.json contém 100 leituras de produtos/mesas por nível de concorrência (10 e 30).
Critério pré-definido: nenhuma resposta HTTP falha e p95 <= 2 s.
Isso não é teste sustentado de vendas nem qualificação da capacidade da loja.
restart-integrity.json compara contagens e hashes de oito coleções antes/depois de
reiniciar o backend e o MongoDB descartáveis. A sessão é conferida após o reinício.
rollback-integrity.json registra o ensaio por processos P41 → referência → P41 quando concluído.\nNão confundir esses ensaios com rollback da infraestrutura de destino nem recuperação de fila durante
reinício simultâneo de todos os dispositivos.

## Segurança
python-audit.json e npm-audit.json registram os achados das bases consultadas.
A ausência de alertas nesses scanners não prova ausência de vulnerabilidades.
Os logs identificam o conjunto Python instalado; o build frontend registra as
dependências efetivamente resolvidas. A comparação de todas as branches remotas está
em remote-comparison.json; código divergente não foi incorporado automaticamente.

## Funcionalidades que não podem ser apresentadas como completas
- Emissão fiscal em lib/orders.py é MOCK, sem transmissão SEFAZ.
- /delivery/simulate é MOCK, sem webhook operacional iFood/99Food/Keeta.
- lib/tenant_scope.py informa que as coleções operacionais ainda não têm isolamento
  multiestabelecimento. Exigir implantação com banco independente por loja.
- O índice single_open_cash permite um caixa financeiro aberto; dois operadores
  simultâneos não comprovam dois turnos financeiros independentes.
- Impressão física e aparelhos reais não foram validados nesta execução.

## Bloqueios restantes de liberação
- Recuperar e verificar os bytes, SHA-256 e ancestralidade do bundle P32 localizado.
- Concluir comparação funcional e reconciliação com os artefatos históricos P10–P40.
- Validar a infraestrutura de destino e seu isolamento sem modificar serviços existentes.
- Rollback na infraestrutura de destino (o ensaio por processos está em rollback-integrity.json).
- Operação integral pela UI, lançamento offline pela UI, falhas de rede no pagamento,
  reconciliação após reinício conjunto e matriz completa de telas/zoom/temas/dispositivos.
- Tratar qualquer falha ou vulnerabilidade que conste nos relatórios desta execução.
- Testes sustentados de escrita concorrente, memória e consultas MongoDB.
Nenhuma dessas pendências deve ser convertida em aprovação por existir um build.

## Instalação para homologação
Somente em ambiente novo descartável: criar banco exclusivo fictício e usuário de
banco restrito, instalar dependências compatíveis com os registros da execução,
executar typecheck/build no frontend e iniciar o backend com MONGO_URL, DB_NAME e
SERVE_FRONTEND_DIR apontando para os recursos descartáveis. Configurar HTTPS,
COOKIE_SECURE=true e APP_URL da origem de homologação. Gerar credenciais próprias;
não usar os seeds de CI em serviços existentes. Preservar backup e versão anterior
antes de um ensaio de atualização. Não fazer deploy na loja nem merge principal.

## Entregáveis
frontend/dist: build Web/PWA experimental.
Apollo-P41-source.zip: fontes exatas do commit testado.
Apollo-P41-history.bundle: histórico Git da candidata, não recuperação do bundle P32.
SHA256SUMS.txt e web-SHA256SUMS.txt: integridade dos arquivos.
Logs, XMLs e test-results: evidências de execução. Não contêm autorização de produção.
"""
(out / "Apollo-P41-Auditoria.md").write_text(text)
print("Audit report generated for", commit)

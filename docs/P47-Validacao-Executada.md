# Apollo PDV 3.0.1 — P47
Data: 21/11/2026. Status: **CANDIDATA TÉCNICA — LIBERAÇÃO OPERACIONAL PENDENTE**.

## Referências verificadas
- Repositório: paulobhzt-tech/Apollo.
- Origem: audit/p46-homologacao-operacional-real.
- Candidata P46: 72b47cbe67ab78f3ff3b5c2ecc5f830cdd0a1e98.
- P46 estava em 959b81bb635d7d2c91ae72571563e385288ce455 na inspeção; oito commits posteriores ao candidato alteram CI, recibo e ferramentas, sem alteração de backend/frontend.
- Branch P47: audit/p47-validacao-vps-web-pwa.
- Suíte preservada P47 executada em c7f6f86d89d02f0b3734c29d839a32d9c028f031.
- Matriz adicional executada em a30c0ae1291e5c5fb1976462844249a0a68b652d.
- Diagnóstico de instalabilidade executado em caa898d9cc35886f554cc58bf18d041aa17003ff.
- Não houve alteração do código da aplicação backend/frontend nesta P47. Foram adicionados testes e workflows isolados. Não houve merge, deploy, autenticação na VPS ou gravação em bancos da loja.

## Execuções novas, diferentes dos resultados históricos P46
[Suíte P47](https://github.com/paulobhzt-tech/Apollo/actions/runs/44931987177):
443 testes backend (421+8+5+5+4), três subtestes, 56 frontend e 55 navegador aprovados.
Os 55 incluem 32 testes com API simulada e 23 dos demais cenários e layout; não representam 55 jornadas completas com API real.
Regressão backend geral em modo shared de compatibilidade; fluxos HTTPS financeiros reais em modo operator.
Lint/typecheck/build aprovados; lint mantém oito avisos e zero erros.
Dois builds comparados com hashes idênticos. Python e npm sem vulnerabilidades conhecidas nos scanners dessa execução; não é certificação exaustiva.

Dois caixas e um garçom: dez vendas únicas, dez reenvios, um pedido do garçom, onze baixas; diferenças dos dois caixas e estornos R$ 0,00.
Concorrência: cinquenta requisições/reenvios resultaram em 25 vendas únicas, 25 baixas e diferença R$ 0,00, sem erros HTTP inesperados; p95 financeiro do cenário de carga principal 0,572 s.
Recuperação após interrupção de processo: três tentativas, 74,03 s, uma venda, uma baixa e diferença zero.
Backup financeiro restaurado em OUTRO banco descartável: mesmos IDs/valores, repetição sem duplicatas e diferença zero.
SHA-256 do backup fictício: 626861f20ace0279ee27cd9770dfc2de2e1e5a2d1d69ea8ff209bb51918bc273.
Reinício, persistência e retorno de processos aprovados em banco descartável. Isso não comprova backup, rollback ou reinício seguro da VPS real.
Integridade do bundle original P32 permanece não verificada; o ensaio equivalente executado não afirma recuperar todo o histórico desconhecido.

## Integridade P46 e comparação pública
[Execução de integridade P47](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932046145):
git fsck --full e ancestralidade aprovados; fonte da aplicação inalterada.
Artefato P46 14713121325 baixado e SHA-256 dos bytes conferido:
8c846f931c1ac037aa5e751e61feac2c3e10cbdd1d12bbb042cd3873f0c8b17d.
ZIP/CRC, 94 arquivos do manifesto e 37 arquivos Web conferidos.

GET público com TLS validado, sem login ou escrita:
- https://homologacao.apollo-pdv.com/ — HTTP 200.
- https://homologacao.apollo-pdv.com/api/ — HTTP 200, mensagem genérica Apollo PDV API.
- https://teste.apollo-pdv.com/ — HTTP 200, mesmo HTML.
- OpenAPI público em ambos: 199 operações; o número sozinho não identifica um commit.
- HTML servido SHA-256: adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b, diferente do index do artefato P46.
- JS servido /assets/index-CGu9Uxm2.js e CSS /assets/index-Bp3ApKFS.css não constam do build P46 auditado.
- Manifesto coincide com P46, SHA-256 391043a2a24caf738138ffc5a0a30fb066e3b9b7a6e9b92c1b7a6c82576ea481.
Conclusão: o frontend público NÃO corresponde aos bytes do build auditado. Isso não determina o SHA de origem instalado. Backend, processo, service worker servido e cadeia fonte→build→processo da VPS não foram comprovados.

## Navegadores e PWA
[Matriz final](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932494436):
| Perfil | Resultado | Escopo |
|---|---|---|
| Chrome real, Linux headless | 3 aprovados | Mesas/comandas, transferência, pagamento misto/fechamento, fila offline e manifesto/SW/aviso offline |
| Edge real, Linux headless | 3 aprovados | Mesmo escopo |
| Android emulado com Chrome | 3 aprovados | Mesmo escopo; não é aparelho Android |
| WebKit com perfil iPhone 13 | 2 aprovados, 1 reprovado | Operação e recuperação da fila aprovadas; navegação offline falha com WebKit encountered an internal error |
Nenhum teste foi excluído ou convertido em sucesso. Causa do erro WebKit ainda não isolada entre motor, automação e aplicação; iPhone offline NÃO aprovado.

[Diagnóstico Chrome de instalabilidade](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932491324):
perfil persistente, build P46 exato servido por HTTPS descartável, Page.getInstallabilityErrors retornou lista vazia.
Não comprova instalação pelo sistema operacional ou dispositivo físico.

Correções da preparação dos testes: substituir perfil anônimo por persistente para o diagnóstico de instalação; instalar confiança na CA descartável no sistema e NSS para testar SW.
Primeiras tentativas com falhas preservadas nos runs 44932359442 e 44932167233. Nenhuma proteção TLS de produção foi alterada.

Limite funcional do PWA existente: SW armazena somente manifesto e offline.html. Reabrir sem rede mostra aviso público e NÃO permite novas vendas. Venda já iniciada com aplicação carregada usa fila persistente separada e sincroniza após reconexão sem duplicação nos cenários executados.
A recuperação usa storageState transportado para novo contexto de navegador; não é corte de energia em dispositivo físico.
Atualização real entre versões instaladas com pendências e instalação física Windows/Android/iPhone não executadas.

## Isolamento da VPS
Não há canal administrativo SSH/Webmin/console conectado exposto nesta sessão. O executor local falhou no provisionamento; terminal confirmou ausência de ambiente utilizável. GitHub Actions hospedado foi usado apenas como executor descartável, sem credenciais nem acesso administrativo à VPS.
A busca por capacidade administrativa adicional não forneceu acesso à VPS.

Não verificados: OS, processos/usuários, diretórios, portas internas, systemd, variáveis, VirtualHosts, renovação TLS, configuração MongoDB, permissões, bancos, volumes e backups.
Não comprovada separação de filas, segredos, integrações financeiras, impressoras, cozinha/bar e tarefas automáticas entre produção e homologação.
Nenhum teste com escrita foi direcionado à VPS.

A receita deploy/vps usa MongoDB standalone, incompatível com operator; o aviso P46 foi confirmado. Não foi executada nem contornada com modo shared.
Para avançar, é necessária uma sessão administrativa autorizada conectada ao Work, inicialmente somente de leitura, com acesso à configuração exclusiva de homologação e metadados suficientes para compará-la à produção. Credenciais devem ser configuradas por canal seguro, nunca no chat.
Acesso não implica autorização para alterar infraestrutura compartilhada.

## Matriz final
| Área | Status | Evidência | Pendência |
|---|---|---|---|
| VPS | Acessível publicamente; administração não validada | GET/TLS no run de integridade | Canal administrativo conectado |
| Commit instalado | Não comprovado; build público divergente | Hash HTML e assets do run de integridade | Fonte, artefato e processo da VPS |
| Isolamento | Não comprovado | Nenhuma escrita na VPS | Banco, usuários, volumes, filas, integrações, serviços |
| Backend | Suíte isolada aprovada | 443 testes + 3 subtestes | Validar instância instalada |
| Frontend | Testes/build isolados aprovados | 56 testes; build reproduzível | Publicar só após comprovar isolamento |
| Mesas/comandas | Cenários de interface aprovados | Suíte e matriz de navegadores | Cobertura operacional completa no destino |
| Caixa/pagamentos | Cenários isolados aprovados | Dois caixas/garçom; diferença R$ 0,00 | Teste fictício no destino comprovadamente isolado |
| Estoque | Regressão/baixas/estornos isolados aprovados | Suíte, onze baixas e backup financeiro | Fluxos completos de compras/produção no destino |
| Cozinha/bar | Cobertura simulada/parcial | Regressão e pedidos fictícios | Validar setores e destinos sem integração da loja |
| PWA/offline | Parcial | Chrome/Edge/Android; fila persistente | WebKit reprovado; reabertura sem vendas; atualização com fila e dispositivos físicos |
| Impressão | Física não executada | Cobertura simulada herdada; sem impressora no seed | 80 mm, duas vias, setores, fila e reimpressão física autorizada |
| Segurança | Scanners/regressões isolados aprovados | Auditorias Python/npm e testes | Isolamento/permissões reais; varredura exaustiva de segredos não comprovada |
| Backup/rollback | Aprovados somente no descartável | IDs/valores iguais; diferença zero; retorno de processos | Ensaio exclusivo e seguro na VPS |

## Artefatos
- [P47 suíte, build, fonte e evidências](https://github.com/paulobhzt-tech/Apollo/actions/runs/44931987177/artifacts/14718646247), SHA-256 8eb967f6ebbb068a8dc5fbc741eaa8d5bbcf42de72c4560d0536840f631762f6.
- [P47 integridade e comparação pública](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932046145/artifacts/14718415677).
- [P47 instalabilidade Chrome](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932491324/artifacts/14717099729).
- [P47 Chrome](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932494436/artifacts/14718396925).
- [P47 Edge](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932494436/artifacts/14718024076).
- [P47 Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932494436/artifacts/14717639008).
- [P47 WebKit, inclusive falha e trace](https://github.com/paulobhzt-tech/Apollo/actions/runs/44932494436/artifacts/14718157988).
Retenção dos artefatos listados até 05/12/2026 conforme metadados consultados.

## Decisão
CANDIDATA TÉCNICA — LIBERAÇÃO OPERACIONAL PENDENTE.
Sem autorização de produção. Bloqueios: correspondência da versão pública, acesso e isolamento da VPS, navegação offline WebKit, requisitos offline após reinício/atualização e testes físicos obrigatórios.
A suíte verde não elimina esses bloqueios. Nenhum deploy foi feito.

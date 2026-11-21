# Apollo PDV 3.0.1 — execução P48
Data: 21/11/2026. **BLOQUEADA — CORREÇÕES OBRIGATÓRIAS.**
Execução parcial com código, build e evidências verificáveis. A missão integral não foi concluída. Não há autorização de vendas reais.

## Código e rastreabilidade
- Base confirmada: audit/p47-validacao-vps-web-pwa, 9e6beabed6e66e593fb07224006c54304e9a919f.
- Branch criada exatamente dessa base: audit/p48-correcao-vps-offline-liberacao.
- Comparação P46 72b47cbe67ab78f3ff3b5c2ecc5f830cdd0a1e98 → P47: 19 commits, sem alteração de backend/frontend; alterações de testes, ferramentas, CI e documentação.
- git fsck --full e ancestralidade da base P47 aprovados no job de integridade.
- Nenhum merge, deploy ou acesso administrativo à VPS foi executado. Nenhum banco da loja foi utilizado.
- Nenhuma funcionalidade de negócio ou controle de autenticação foi alterado nesta execução.

### Alterações entregues
- 4301817a13d8a343082778d916b7f2ef54148bde: gerador de manifesto build-integrity.json, com versão, SHA Git, data do commit, identificação da execução e SHA-256 dos arquivos.
- b2debd90cd5d6b2d00a210a6c01bfc0cbc79dcb9: integração obrigatória do manifesto ao npm run build.
- 807170dadf98ba723ac976185583bdd7023f3e91: verificador de integridade com rejeição de arquivos divergentes, ausentes, adicionais, links e SHA inesperado.
- Workflows P48: aceitação isolada, integridade e matriz de quatro motores.
- 7ff5dc229f78c85190225363f9de2d32c6b0bb40 / aa5f01ca7e3676daa35a290a409bd3a47ec5e05d: teste de navegação após desligar servidor descartável, primeiro HTTP e depois HTTPS com o mesmo certificado dos testes operacionais.
- 90715eb732feaacdeb154598dc2c6b237ee78379: matriz final com diagnóstico HTTPS.
- O manifesto é informação de identidade e integridade, não assinatura digital nem certificação da VPS. Sua referência deve vir de um artefato confiável. sourceDate é a data do commit; não deve ser apresentada como horário real da compilação.

## Execuções e commits efetivamente testados
| Execução | Commit | Resultado e escopo |
|---|---|---|
| [Aceitação P48](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933540629) | f7e1bb92e09c5eeb9d31c711ce65f71597d1b6c4 | Aprovada em runner descartável |
| [Integridade P48](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933639793) | 69edccd9382c9011a9346ddc555e322a3877de51 | Build/verificador aprovados; comparação pública identifica divergência |
| [Matriz final HTTPS](https://github.com/paulobhzt-tech/Apollo/actions/runs/44934071894) | 90715eb732feaacdeb154598dc2c6b237ee78379 | Chrome/Edge/Android aprovados; WebKit reprovado no cenário original |
| [Primeira matriz](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933677070) | 709b8b96d7c4ccf9f0f5f4359675cb5e5508d7c5 | Reprovação WebKit preservada |
| [Diagnóstico HTTP](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933774669) | 40e60cbaffe4f31959c6af904aac25146a9d026d | Interrupção real HTTP aprovada; cenário original WebKit reprovado |

A suíte não foi executada no futuro commit documental deste relatório. Entre os commits testados foram acrescentados o verificador e os testes/workflows listados; o código de negócio não mudou.
Alguns nomes internos dos scripts, relatórios e arquivos do pacote de aceitação ainda contêm P45/P46/P47 por reutilização da infraestrutura. A execução, SHA e logs acima identificam a P48. Esses nomes não provam execução histórica nem homologação da VPS.

## Testes da suíte preservada
- Backend: 443 testes (421+8+5+5+4), mais três subtestes.
- Frontend: 56 testes, nove arquivos Vitest.
- Lint: zero erros e oito avisos; typecheck aprovado.
- Build: duas compilações com hashes iguais.
- Navegador: 55 aprovados, sendo 32 com API simulada e 23 dos demais cenários de integração/interface/PWA/layout. Não são 55 jornadas completas de backend real.
- Layout: nove cenários de resolução/zoom da suíte, incluindo os níveis configurados de 100/125/150%.
- Backend geral em modo shared de compatibilidade; cenários financeiros HTTPS reais isolados em modo operator.
- Scanners pip-audit/npm: zero vulnerabilidades conhecidas reportadas nesta execução. Não substituem auditoria exaustiva de segredos, permissões da VPS ou isolamento.
- Mesas/comandas, clientes compartilhados, transferência, pagamento misto e fechamento passaram nos cenários de interface existentes.
- As regressões de estoque, baixas e estornos foram reexecutadas. Isso não atesta toda a lista de funcionalidades pedida na missão ou sua operação na VPS.

### Conferência financeira e recuperação
- Dois caixas e garçom: dez vendas únicas, dez reenvios, um pedido do garçom e onze baixas. Diferenças dos dois caixas: R$ 0,00.
- Autorizações e rejeições esperadas: replay alterado 409, replay entre operadores 403, caixa antigo offline 409, contexto de turno ausente 422. Não são erros inesperados.
- Cinquenta recebimentos/reenvios concorrentes: 25 vendas únicas, 25 baixas, zero erros HTTP inesperados e diferença R$ 0,00.
- p95 financeiro do cenário principal: 0,531 s. Nas amostras pareadas adicionais houve p95 de aproximadamente 6,76 a 7,09 s em parte das medições, sem divergência financeira. Não há comprovação de SLA de produção nem de melhoria universal.
- Carga de leitura, 30 segundos por cenário: 10 sessões/2.802 requisições/p95 13,9 ms; 30/6.999/53,5 ms; 50/9.070/119,5 ms, sem erros reportados.
- Recuperação após interrupção de processo: três tentativas, 74,10 s, uma venda e uma baixa, diferença zero. Não é corte de energia físico.
- Backup financeiro restaurado em OUTRO banco descartável: mesmos IDs/valores, repetição sem duplicatas, diferença zero.
- SHA-256 do backup fictício: 39bbf13d31630009d41ea1a96630a57ea5808bb24c9eca86a91083de03f50bc3.
- Reinício e rollback de processos aprovados no descartável. Backup/restauração/rollback da VPS continuam sem validação.
- Integridade do bundle original P32 não verificada, pois seus bytes não estavam disponíveis ao runner. O ensaio equivalente não recupera histórico desconhecido.

## Integridade do build e comparação pública
O job de integridade recompilou duas vezes, comparou manifestos idênticos e verificou 37 arquivos.
Testes negativos rejeitaram:
1. HTML alterado.
2. Arquivo extra.
3. Service Worker ausente.
4. Commit esperado incorreto.
Depois de restaurar os arquivos, o build íntegro passou novamente.

Leituras HTTPS sem login/escrita, com Cache-Control: no-cache:
| Recurso publicado | Evidência | Resultado |
|---|---|---|
| / | SHA-256 adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b | HTTP 200; diferente do build P48 |
| /sw.js | SHA-256 d992d9a3743a9504338d874da69b112935c693ce1029757bb4029bd94b097737 | HTTP 200; diferente do build P48 |
| /manifest.webmanifest | SHA-256 391043a2a24caf738138ffc5a0a30fb066e3b9b7a6e9b92c1b7a6c82576ea481 | Coincide |
| /build-integrity.json | Mesmo hash do HTML público | HTTP 200 devolve HTML; não é o novo manifesto |
| /api/ | HTTP 200 | Resposta genérica; não identifica processo/commit |

A requisição nova feita pelo runner não utiliza cache de navegador nem Service Worker do usuário. Portanto, a divergência não depende apenas do cache local desse navegador. Proxy, diretório incorreto, artefato anterior/misto e pipeline continuam hipóteses; a causa administrativa exata não foi estabelecida.
A divergência NÃO foi corrigida no servidor. O job verde comprova a coleta e os testes de integridade, não a correspondência da aplicação publicada.
Não foi executada invalidação de cache, alteração de Apache ou publicação.

## PWA/offline: evidência e limites
| Perfil Linux headless | Cenários originais | Interrupção HTTPS real adicional |
|---|---|---|
| Chrome real | 3 aprovados | 1 aprovado |
| Edge real | 3 aprovados | 1 aprovado |
| Android emulado com Chrome | 3 aprovados | 1 aprovado |
| WebKit com perfil iPhone | 2 aprovados, 1 reprovado | 1 aprovado |

O cenário original WebKit continua falhando em page.goto após context.setOffline(true): “WebKit encountered an internal error”. O workflow final permanece vermelho.
O teste adicional usa o mesmo build, motor e certificado descartável e encerra um servidor HTTPS local de verdade, sem context.setOffline. A navegação e o reload carregaram o aviso offline. Isso restringe a falha ao caminho de simulação/contexto/servidor testado, mas não prova a causa interna do WebKit nem corrige o cenário reprovado. Não houve exclusão nem conversão da falha em aprovação.
Logs operacionais e traces preservam a falha; o JUnit da configuração compartilhada é regravado pelo diagnóstico posterior e deve ser lido junto aos logs e ao resultado de cada etapa.

### Bloqueio funcional ainda não corrigido
- frontend/public/sw.js guarda apenas manifesto e offline.html.
- frontend/src/lib/auth.ts exige /auth/me e /auth/sync-context válidos para vincular operador/fila; o comentário já exige fluxo de PIN offline antes de permitir acesso offline.
- frontend/src/lib/session.ts bloqueia uma nova aba e tenta revogar a sessão restaurada.
- Cache de arquivos sozinho não fornece operador autorizado, dados locais completos e estado consistente para novas vendas.
- Nenhum desses controles foi enfraquecido.
- A fila de uma venda iniciada com contexto autenticado carregado persiste e sincroniza nos cenários existentes.
- Reabrir a aplicação sem internet ainda não permite iniciar novas vendas. Mesas/comandas offline completas, autorização offline, atualização com fila pendente e conflitos entre dispositivos desconectados não foram implementados/validados nesta P48.
- Nenhum pagamento externo foi confirmado por um provedor nesta missão.

Instalação de PWA: uma vez que o destino e sua versão sejam validados, abrir online por HTTPS e usar Instalar aplicativo no Chrome/Edge, ou Adicionar à Tela de Início no Safari. Essa instrução não comprova instalação física, preparação offline completa ou autorização de operação. Não usar esta candidata para vendas reais.

## Acesso administrativo e matriz de isolamento
O ambiente selecionado falhou no provisionamento. A tentativa real de terminal retornou “No usable execution environment is available”.
Não há ferramenta SSH, console administrativo ou navegador conectado à VPS disponível nesta sessão. A descoberta adicional não forneceu uma sessão administrativa existente.
Actions executou somente runners descartáveis, sem credenciais de administração da VPS.

| Componente da homologação | Estado |
|---|---|
| Banco/coleções e instâncias MongoDB | Não comprovado |
| Usuários e permissões | Não comprovado |
| Serviços/processos e commit instalado | Não comprovado |
| Diretórios/volumes/uploads | Não comprovado |
| Variáveis/segredos | Não comprovado |
| Portas/endpoints e VirtualHosts | Não comprovado |
| Sessões/autenticação entre ambientes | Não comprovado |
| Filas offline | Não comprovado |
| Filas e destinos de impressão | Não comprovado |
| Integrações/webhooks | Não comprovado |
| Pagamentos/fiscal | Não comprovado |
| Backups/restaurações | Não comprovado |
| Jobs agendados | Não comprovado |
| Logs/temporários | Não comprovado |
| Cache/Service Workers entre destinos | Não comprovado |
| Clientes/operadores/dados reais | Não comprovado |

Conexão necessária: ambiente de execução funcional ligado ao Work e sessão SSH/console autorizada, inicialmente somente de leitura, com chave/sessão configurada por canal seguro. Deve permitir examinar a configuração exclusiva da homologação e metadados de separação da produção. Não enviar senhas, tokens ou chaves no chat.
Acesso não autoriza mudanças de DNS, certificados, portas ou infraestrutura compartilhada.
Sem comprovação dessa matriz, permanecem proibidos deploy e testes com escrita na VPS.

## Cobertura funcional e pendências
| Área | Evidência disponível | O que não está aprovado |
|---|---|---|
| Mesas/comandas | Cenários UI isolados e regressões | Toda a matriz operacional no destino |
| Caixa/pagamentos | Dois operadores, concorrência, estornos e diferença zero | Operação comercial e provedores externos |
| Estoque/compras | Regressões, baixas/estornos e reconciliação | Auditoria integral de todos os fluxos no destino |
| Cozinha/bar/KDS | Pedidos fictícios/regressões | Separação de destinos reais e equipamentos |
| Impressão | Cobertura simulada herdada | 80 mm físico, duas vias, setores e recuperação física |
| Clientes/delivery | Cobertura da suíte preservada | Auditoria integral de fidelidade/delivery/privacidade no destino |
| Relatórios/Apollo IA | Regressões existentes | Conferência integral DRE/lucro/projeções de todos os módulos |
| Segurança | Regressões e scanners isolados | Auditoria administrativa exaustiva e isolamento |
| PWA | Manifesto, SW, fila carregada e aviso offline | Novas vendas após reinício offline, atualização com pendências |
| Dispositivos | Navegadores Linux e perfis emulados | Windows 10/11, Android e iPhone físicos |

A lista inteira da missão P48 não pode ser considerada auditada só porque a suíte preservada passou.

## Artefatos e checksums
- [Pacote Web/PWA, manifesto, comparação pública e checksums](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933639793/artifacts/14717949242)
  - SHA-256 ZIP: bbaa10e98738004088748e88f8ce5825c9376fba5d753b4fcbee164ea26d9200.
  - Contém Apollo-P48-Web-PWA.tar.gz, build-first.json, public-comparison.json, negative-tests.txt e SHA256SUMS.txt.
  - Commit do build: 69edccd9382c9011a9346ddc555e322a3877de51. Não foi publicado.
- [Suíte, fonte, build e evidências P48](https://github.com/paulobhzt-tech/Apollo/actions/runs/44933540629/artifacts/14719341006)
  - SHA-256 ZIP: f9250b5481cd5f8d42c2c6edf8c4d7491c4d4c62efe27f80b642530266194c4b.
- [Apollo-P48-browser-chrome](https://github.com/paulobhzt-tech/Apollo/actions/runs/44934071894/artifacts/14719485005) — sha256:64361a48bebcbd5802b7b2061d3003e02033522adf3477592a7e0b7cef94c2a7
- [Apollo-P48-browser-android](https://github.com/paulobhzt-tech/Apollo/actions/runs/44934071894/artifacts/14719365421) — sha256:96cc83b407971f6bd56a3c221fdc0d10af9d94a1f0da1c051413fd5ce157a4bc
- [Apollo-P48-browser-msedge](https://github.com/paulobhzt-tech/Apollo/actions/runs/44934071894/artifacts/14719330686) — sha256:6c148bf916bc3b58f5a0cdd24ebe905503e94432a768f26d1e5aaf52e8d412b0
- [Apollo-P48-browser-webkit](https://github.com/paulobhzt-tech/Apollo/actions/runs/44934071894/artifacts/14718354990) — sha256:03db6e25ec26d14b05cb933e6b53577baf5e1c73932482aced07178ce619930e
Os digests dos ZIPs vêm dos metadados/logs de upload do Actions; esta sessão não baixou e recalculou os bytes dos ZIPs. Os hashes internos do build foram calculados e verificados no runner. Retenção configurada: 14 dias.

## Decisão
**BLOQUEADA — CORREÇÕES OBRIGATÓRIAS.**
Entregues: melhoria de rastreabilidade/verificação dos builds, pacote compilado, reexecução automatizada e diagnóstico adicional de WebKit.
Não entregues: correção completa do offline, resolução do cenário WebKit reprovado, causa/correção administrativa da divergência publicada e homologação operacional integral.
Bloqueios externos: executor local indisponível, sessão administrativa da VPS ausente e equipamentos/dispositivos físicos indisponíveis.
Bloqueios de implementação ainda abertos: autorização e inicialização offline completas e demais fluxos offline exigidos. Eles não são resolvidos apenas obtendo SSH.
Não há link de candidata P48 instalada/validada nem credenciais novas de acesso. O endereço público consultado não pode ser apresentado como essa candidata.
Produção não foi modificada. Liberação comercial continua dependendo da aprovação explícita do proprietário após os requisitos obrigatórios.

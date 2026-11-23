# P60 — Apollo PDV 3.0.1

**BLOQUEADA PARA LIBERAÇÃO OPERACIONAL na Espeteria Churras Burguer.**

## Rastreabilidade

| Referência | Valor |
| --- | --- |
| Origem | `audit/p59-desbloqueio-vps-build-pwa-homologacao` |
| SHA inicial conferido após fetch | `556dc631795db371f85b065262a48be60bbe2ad3` |
| Código testado da P59 | `c33c1d23b1fb5f56dee02c70af26e2df1851e9e0` |
| Branch P60 | `audit/p60-validacao-administrativa-vps-build-publico` |
| Código P60 | `31517775b35baaa01aa4f0928010562a0716ea5f` |
| SHA final | Commit documental que contém este relatório |

O sandbox original ficou sem espaço e tinha alterações de outra branch. A execução preservou esse checkout e usou uma cópia descartável em memória.

- `27e7074` implementou a ativação local de release verificada e habilitou a P60 nos workflows existentes.
- `3151777` acrescentou o modo explícito de rollback e a prova integrada de backup, validação, ativação, falha e reversão no Apache descartável.

## Acesso administrativo, build público e isolamento

Não havia canal administrativo autorizado configurado para a VPS. A consulta de capacidades não mostrou credenciais ou identidades de saída disponíveis. A inspeção executada limitou-se a GET nas rotas públicas de homologação. O mínimo necessário para a próxima etapa é uma identidade dedicada de leitura, por SSH ou console aprovado, com acesso aos VirtualHosts carregados, caminhos e metadados de artefatos, status de serviços, metadados de TLS, redes e volumes e inventário de backups. As referências de configuração podem ser conferidas com valores sensíveis ocultos. Esse escopo dispensa acesso a vendas, exportação de dados e permissões de alteração.

| Recurso | Esperado | Observado e evidência | Classificação e condição de encerramento |
| --- | --- | --- | --- |
| Manifesto público | HTTP 200 JSON com SHA e hashes do pacote aprovado | HTTP 200 HTML com SHA-256 `adbe9ff7a298ff6e0f469c6b675b8f7d6a8897ebbdf520ee7be190cb12b1bf4b`, idêntico ao de `/login` | DIVERGENTE. Inspecionar VirtualHost e DocumentRoot; validar nova implantação só em janela autorizada |
| Worker | JavaScript do pacote auditado e cache correspondente | `apollo-public-v2`, SHA-256 `d992d9a3743a9504338d874da69b112935c693ce1029757bb4029bd94b097737` | DIVERGENTE. Conferir origem, versão e hashes após implantação autorizada |
| SHA instalado | SHA da release autorizada | Desconhecido | NÃO VERIFICADO. Conferir árvore ativa e manifesto no host |
| Apache, TLS, VirtualHost e proxy | Host dedicado, cadeia TLS e backend isolado | A consulta pública mede a saída. Configuração carregada e DocumentRoot desconhecidos | NÃO VERIFICADO. Inspecionar Apache e origem do proxy |
| FastAPI, processos, portas e usuários | Serviços e contas exclusivos da homologação | Sem acesso à configuração ou aos metadados internos | NÃO VERIFICADO. Conferir serviços, redes, portas e usuários |
| MongoDB, bancos, coleções e credenciais | Namespace e identidade exclusivos da homologação | Sem acesso à configuração efetiva | NÃO VERIFICADO. Inspecionar referências, permissões e isolamento sem consultar vendas |
| Diretórios, volumes, variáveis e permissões | Áreas dedicadas e segregadas | Sem acesso a montagens ou configuração | NÃO VERIFICADO. Comparar referências e permissões |
| Filas offline e arquivos de impressão | Fila, ambiente e destinos próprios | Ensaios somente em laboratório | NÃO VERIFICADO. Conferir a origem e o destino das filas no ambiente efetivo |
| Backups e rollback | Cópias verificadas e retorno provado em homologação | Prova descartável, sem acesso ao inventário real | NÃO VERIFICADO. Conferir cópias e provar o retorno em janela autorizada |

A igualdade dos corpos demonstra a resposta pública indevida. Ainda falta observar qual regra e diretório ativos a produzem.

## Procedimento de ativação e rollback

1. Obter comprovação de isolamento e autorização específica. Registrar operador, janela, VirtualHost carregado, DocumentRoot e destino do proxy. Identificar a release atual por SHA e validar seu manifesto externo.
2. Guardar cópias da configuração ativa, da árvore estática anterior e dos manifestos auditados em armazenamento de homologação fora da raiz de releases. Gerar e conferir os hashes das cópias. Extrair a cópia dos estáticos em diretório isolado e validar novamente o manifesto. A verificação do banco deve usar metadados e prova de restauração descartável autorizada.
3. Preparar a candidata em uma árvore própria `RAIZ/SHA` e conferir seu manifesto do CI, SHA e hashes. A raiz deve ser administrada exclusivamente pela conta de implantação, com árvores retidas, sem edição concorrente. O DocumentRoot previamente aprovado deve apontar para `RAIZ/live`, com link relativo para o SHA ativo. Se o ambiente observado não obedecer a esse contrato, interromper a ativação e revisar separadamente a mudança de configuração. Validar a configuração Apache com `httpd -t` ou equivalente local.
4. Em janela autorizada, executar a troca local com os valores auditados. A rotina serializa trocas, exige que a release atual continue sendo a esperada, valida os dois pacotes e substitui somente o apontamento. O processo precisa de privilégio de escrita nessa raiz, sem privilégio de escrita em produção.

   ```bash
   python deploy/vps/switch-verified-release.py RAIZ SHA_ATUAL SHA_CANDIDATO MANIFESTO_ATUAL MANIFESTO_CANDIDATO
   ```

5. Registrar hora e operador. Conferir HTTP do manifesto, JSON e todos os hashes, login, SPA, proxy da API e Service Worker em perfil limpo. No ambiente autorizado, executar `verify-public-build.py` com o manifesto da candidata.
6. Se qualquer verificação falhar, preservar o estado e os logs, manter o bloqueio e iniciar o retorno autorizado. O modo explícito de rollback aceita que a release que falhou esteja danificada e exige a identidade esperada do apontamento e a integridade completa do destino.

   ```bash
   python deploy/vps/switch-verified-release.py RAIZ SHA_CANDIDATO SHA_ATUAL MANIFESTO_CANDIDATO MANIFESTO_ATUAL --rollback
   ```

7. Repetir a comparação pública, os testes de login, proxy e worker e conferir saúde do backend e identidade do ambiente. O retorno de arquivos estáticos preserva o banco. Se houver necessidade de recuperar configuração ou banco, tratar em janela própria, com o plano aprovado e prova de restauração isolada.

O laboratório usa um Apache em contêiner e um backend simulado para a prova de proxy. A aceitação separada usa FastAPI HTTPS e MongoDB descartável. A VPS pública permaneceu em leitura.

### Evidência de laboratório

O CI fez duas compilações P60 e uma de referência da P59. As duas P60 tiveram manifesto idêntico de 37 arquivos. Na prova HTTP, o backup do build anterior e de dois arquivos de configuração passou em SHA-256, a extração passou na verificação de integridade e `httpd -t` passou. A rotina recusou apontamento obsoleto, candidata adulterada e manifesto externo de rollback ausente. A candidata autêntica foi ativada, o Chromium confirmou o worker e o cache, e uma remoção controlada do manifesto provocou 404. Em seguida a reversão ativou `c33c1d23b1fb5f56dee02c70af26e2df1851e9e0`, conferiu os 37 hashes, voltou a responder JSON e preservou as rotas de login, SPA e API. O Chromium conferiu também o worker após o retorno.

O verificador público teve sete testes aprovados. O job fechou com falha no gate de comparação pública. A prova de troca e rollback, executada antes desse gate no mesmo job, passou.

[Workflow de integridade e rollback](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475179) · [Hashes, manifesto e logs de Apache](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475179/artifacts/14823259672)

### Arquivos alterados

- `.github/workflows/p48-browsers.yml`
- `.github/workflows/p48-integrity.yml`
- `.github/workflows/p48-web-audit.yml`
- `.github/workflows/p57-windows-ui.yml`
- `deploy/vps/switch-verified-release.py`
- `deploy/vps/test-apache-web.sh`
- `docs/homologacao/P60-APOLLO-3.0.1.md`

O gate comparou o SHA P60 `31517775b35baaa01aa4f0928010562a0716ea5f` e retornou `public_claimed_commit=null`, `public_build_matches=false` e `manifest_served_login_html=true`. Os hashes esperados para `/login` e `/sw.js` eram `86346c97f7ab7933eb1fcc0a8ad750a4e80b6cc70655b01922c25a01cfdf21b7` e `4d14f65c02ad748de87bd220313fd21f6966795ce11b4628e1d9ec854f741141`.

## Ensaio de caixa, estoque, PWA e reinício

O Chromium executou o ensaio Playwright com FastAPI HTTPS descartável, dois caixas em sessões independentes, um perfil móvel emulado e MongoDB exclusivo para a fixture.

| Prova | Resultado P60 |
| --- | --- |
| Concorrência | 50 requisições para 25 vendas únicas, com conferência de sessão, operador, horário e pagamentos |
| Caixa A | 13 vendas, R$ 78,00 em dinheiro e R$ 52,00 em PIX. Diferença R$ 0,00 |
| Caixa B | 12 vendas, R$ 72,00 em dinheiro e R$ 48,00 em PIX. Diferença R$ 0,00 |
| PWA | Dois pedidos persistiram durante a troca do worker. Um sincronizou após perda da resposta e o conflito HTTP 409 permaneceu disponível após reabertura offline |
| Estoque e filas | Espetinhos de 100 para 74 e bebidas de 100 para 99. Filas de cozinha e bar conferidas |
| CMV e estorno | CMV de R$ 80,00 em 20 espetinhos. Lote de 74 para 54 e de volta a 74 após estorno |
| Reinício do FastAPI | Snapshots idênticos de 25 vendas pagas, 1 estorno, 3 caixas fechados com diferença zero, lote 74 e estoques 74 e 99 |

[Ensaio Chromium](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101/job/137740214364) · [Logs, snapshots e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101/artifacts/14824099397)

## Navegadores, decisão técnica e dispositivos

| Perfil | Operação | Navegação offline emulada | HTTPS realmente desligado e reabertura | Cofre |
| --- | ---: | --- | --- | ---: |
| Chromium | 3/3 | Passou | Passou | 3/3 |
| Chrome | 3/3 | Passou | Passou | 3/3 |
| Edge | 3/3 | Passou | Passou | 3/3 |
| Firefox | 3/3 | Falhou | Passou | 3/3 |
| Android emulado | 3/3 | Passou | Passou | 3/3 |
| WebKit com perfil iPhone | 3/3 | Falhou | Passou | 3/3 |

O SHA P60 encerrou a matriz em 28/30. Os 6 testes com desligamento real e os 18 testes adicionais de cofre passaram. O Playwright 1.62.0 em Ubuntu 24.04 repetiu as reproduções mínimas sem Apollo nem CacheStorage. No Firefox 153.0 a requisição direta foi bloqueada enquanto a navegação feita pelo worker chegou ao HTTPS, com HTTP 200 e sem fallback. No WebKit 26.5, `page.goto` retornou erro interno com a emulação ativa e a requisição não chegou ao servidor. O Chromium 151.0.7922.34 entregou o fallback emulado. Os três diagnósticos verificaram ainda o desligamento real.

**Avaliação técnica.** As duas falhas ficaram restritas à emulação nos ensaios realizados. A indisponibilidade real de HTTPS foi exercitada separadamente. As asserções originais permaneceram ativas e o gate exige decisão explícita do responsável sobre os riscos residuais, inclusive o comportamento em aparelhos reais. A comparação foi feita com a versão travada 1.62.0. A versão 1.65.1 estava disponível no registro e não foi executada neste ciclo.

Windows Server 2022 virtual aprovou quatro cenários Chromium com API simulada. Android e iPhone foram emulados. Os contratos de fila de cozinha e bar foram exercitados no ensaio integrado. Impressora 80 mm, duas vias, desconexão e recuperação física, Windows 10/11, Android e iPhone reais e instalação do PWA nesses dispositivos permanecem pendentes.

[Matriz](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101) · [Firefox](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101/artifacts/14825126967) · [WebKit](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101/artifacts/14824323915) · [Android emulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475101/artifacts/14825880416) · [Windows virtual](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475113/artifacts/14825005967)

## Regressão, segurança, backup e carga

| Suíte | Resultado P60 |
| --- | --- |
| Backend com replica set descartável | 422 testes principais e 3 subtestes aprovados. Grupos adicionais com 8, 5, 5 e 3 aprovações |
| Backend complementar | 253 testes e 3 subtestes aprovados, 1 ignorado. Há sobreposição entre suítes |
| HTTP legado | 4 testes aprovados |
| Frontend | 64 Vitest, lint, typecheck e build aprovados. A bateria adicional executou 38 testes de fila e reconciliação |
| Interface Linux | 32 casos com API simulada, 6 com backend real, 6 de operação e offline, 4 de fronteira do worker e 9 de largura e zoom |
| Segurança | Autenticação, CSRF, permissões e pagamentos aprovados, com verificações de dependências concluídas |
| Backup e recuperação do banco | Backup financeiro restaurado em banco descartável separado. A recuperação após interrupção confirmou venda idempotente e diferença de R$ 0,00 |
| Carga financeira separada | 50 requisições, 25 vendas únicas, estoque 73 para 48, diferença de R$ 0,00, P95 de 515 ms |

| Sessões de leitura | Requisições P60 em 30 s | P95 P60 | Erros P60 | P95 P59 |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 2.801 | 13 ms | 0 | 19 ms |
| 30 | 7.014 | 55 ms | 0 | 61 ms |
| 50 | 8.706 | 129 ms | 0 | 128 ms |

A P59 é referência histórica. Os executores diferiram e o consumo de recursos não foi medido nessas tabelas.

[Aceitação isolada](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475255) · [Artefato de carga, evidências financeiras, regressão e backup](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475255/artifacts/14825591366) · [Bateria](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475231) · [Segurança](https://github.com/paulobhzt-tech/Apollo/actions/runs/45188475126)

## Gates e condições de encerramento

| Gate | Resultado e dependência |
| --- | --- |
| 1. Build público | Reprovado. Inspecionar o ambiente ativo, obter autorização específica e conferir correspondência pública de SHA, manifesto, hashes e worker |
| 2. VPS | Pendente. Obter acesso administrativo de leitura e documentar a identidade e a segregação de cada recurso |
| 3. Rollback | Aprovado no laboratório. Falta conferir configuração e backups reais e provar a recuperação em janela autorizada |
| 4. Navegadores | Pendente. Duas falhas em emulação com causas observáveis reproduzidas fora do Apollo. Manter os testes e obter decisão explícita sobre os riscos residuais |
| 5. Caixa | Aprovado nos cenários descartáveis executados |
| 6. Estoque | Aprovado nos cenários descartáveis executados |
| 7. PWA | Aprovado em laboratório para cofre, sincronização, reinício e atualização |
| 8. Impressão | Pendente. Realizar impressão física, duas vias, desconexão e recuperação em impressora autorizada |
| 9. Dispositivos | Pendente. Instalar e validar em Windows 10/11, Android e iPhone da operação |
| 10. Segurança | Suítes executadas aprovadas. A segregação da infraestrutura real permanece no gate 2 |
| 11. Aprovação humana | Pendente. O responsável precisa autorizar a utilização após comprovação dos demais gates |

**Decisão P60: bloqueada para liberação operacional.** A publicação ficou restrita à branch experimental. Produção e dados reais permaneceram intocados.

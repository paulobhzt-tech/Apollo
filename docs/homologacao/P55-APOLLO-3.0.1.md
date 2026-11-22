# Apollo PDV 3.0.1 — P55

**P55 BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.**

Em 22 de novembro de 2026, a branch remota P54 apontava para `5cad98506dd3862acab9bf0c1ac5cafb3034f85d`. A branch `audit/p55-correcao-final-offline-vps-operacional` partiu desse SHA. Código e testes publicados em `f8a595a772636054e68f6802fbae8b0b47a3199d`.

## Implementação

- O garçom pode preparar o cofre online e reabrir o mesmo perfil com a senha local após reiniciar sem HTTPS. A API fornece ao garçom apenas os atendimentos ocupados atribuídos a ele. Caixa e administrador podem usar atendimentos existentes e criar novas mesas ou comandas.
- Cada rascunho de atendimento existente carrega o par de IDs da mesa e do pedido da última consulta. A reconciliação valida sessão, identidade de sincronização, estado do atendimento e atribuição do garçom dentro da transação. Se o atendimento mudou, o rascunho fica no cofre para revisão.
- O cofre aberto tenta enviar ao receber o evento de reconexão e a cada dez segundos enquanto há pedidos elegíveis. A sondagem também funciona quando o Wi-Fi continua ligado e apenas o HTTPS volta. A fila mantém registros ainda sem confirmação e conflitos de negócio. O operador pode solicitar uma nova tentativa manual.
- O cofre mantém criptografia, validade local e revalidação da sessão online para concluir envios. Uma sessão expirada ou revogada exige autenticação. Cofre fechado ou aplicativo encerrado exige reabertura para acesso à chave em memória.
- O recibo de idempotência exige que o lote concluído ainda exista no pedido. A resposta HTTP 409 preserva o rascunho se um backup retirou o lançamento do banco restaurado. As referências P54 dos rascunhos de criação continuam compatíveis.

## Testes e evidências

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck`, `npm run lint`, Vitest e build | 58 testes de frontend, compilação e verificação de 37 arquivos. Lint terminou com avisos. |
| `playwright test --config=p47.config.ts p55-offline-tables.spec.ts` | Ensaio com MongoDB em réplica, perfil persistente e proxy HTTPS desligado e reativado no mesmo endereço. Testa administrador, caixa e garçom, fila após recarga, senha errada, validade, retomada automática, reenvio de referência e conflitos. [Matriz e artefatos](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935) |
| Backend, transações, segurança, restauração e fila de impressão | Passou no código final. [Bateria de testes](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545985) · [Segurança e compilação](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545932) |
| Build verificável, incluindo cenários negativos | Passou no código final. [Artefato de integridade](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545936/artifacts/14767761829) |
| Aceitação isolada Web/PWA | Passou no código final, incluindo caixa, estoque, restauração, recuperação, carga e rollback de processo. [Execução](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056546024) · [Artefato](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056546024/artifacts/14767872685) |

A rodada inicial encontrou timeout no seletor do garçom e, em dois perfis, na instalação do Service Worker. Um ensaio isolado em Chromium reproduziu o rótulo exato ausente no seletor e confirmou a associação explícita corrigida. O executor P55 fixa a chave pública do certificado HTTPS descartável no lançamento Chromium. As asserções de navegação e autorização continuam em vigor. [Rodada anterior](https://github.com/paulobhzt-tech/Apollo/actions/runs/45055860139)

Os testes com escrita usam contas fictícias e ambiente descartável. A matriz roda em Linux. Android e iPhone são perfis emulados.

### Matriz do código final

A matriz histórica repetiu **28/30**. Firefox recebeu resposta sem o cabeçalho de fallback e WebKit retornou erro interno durante a emulação. O teste de desligamento real de HTTPS passou nos seis perfis. O ensaio P55 registrou **17/18 na primeira execução**, com **6/6 para garçom**, **6/6 para caixa** e **5/6 para administrador**. A falha de administrador no Chromium foi um timeout de 20 segundos aguardando o controle da página pelo Service Worker, antes de testar o envio. A repetição do job no mesmo commit aprovou os três perfis de operador no Chromium, completando 18/18 no ensaio P55 após reteste. A intermitência de instalação continua registrada. [Execução e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935)

| Perfil | Matriz histórica | Cofre P55, primeira tentativa | Artefato |
| --- | ---: | ---: | --- |
| Chromium | 5/5 | 2/3, com 3/3 no reteste | [Primeira tentativa](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767736698) · [Reteste](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767932018) |
| Google Chrome | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14768125508) |
| Microsoft Edge | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767951213) |
| Firefox | 4/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767981068) |
| Android emulado | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767886352) |
| WebKit com perfil iPhone | 4/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935/artifacts/14767354945) |

Os 25 lançamentos concorrentes e seus reenvios, com um garçom offline, passaram no cenário operacional. Os dois caixas fecharam com diferença de R$ 0,00. O cenário validou baixa única e estoque fracionário em ambiente descartável. [Run de integração](https://github.com/paulobhzt-tech/Apollo/actions/runs/45056545935)

## VPS e pendências de homologação

**VPS NÃO VALIDADA.** Os GETs públicos em `https://homologacao.apollo-pdv.com` devolveram HTTP 200 para o login. O Service Worker continua expondo `apollo-public-v2`, com SHA-256 `d992d9a3743a9504338d874da69b112935c693ce1029757bb4029bd94b097737`. O manifesto Web coincidiu com o build testado. Service Worker, CSS e JavaScript divergiram. `/build-integrity.json` retornou HTTP 200 com `text/html`. A auditoria administrativa, o SHA instalado, o isolamento dos serviços e bancos e o rollback de VPS seguem sem comprovação.

A retomada cobre o fluxo de pedidos no cofre. O garçom recebe atendimentos já atribuídos online. Abertura autônoma do garçom, transferência, cancelamento, recebimento e fechamento completos offline seguem fora do fluxo validado. O cofre protegido precisa estar aberto para reenvio. Impressão e dispositivos físicos, além de instalação PWA física, aguardam validação. Produção, branch principal e VPS permaneceram sem alterações.

## Commits e arquivos

- `21c165e` atendimento atribuído, retomada automática, verificação de recibos e ensaio em navegadores.
- `2410326` ensaio de retomada com o cofre aberto e casos de autorização de garçom.
- `f8a595a` rótulo explícito do atendimento, limpeza da seleção no bloqueio e certificado descartável no executor.
- [Comparação completa desde a P54](https://github.com/paulobhzt-tech/Apollo/compare/5cad98506dd3862acab9bf0c1ac5cafb3034f85d...f8a595a772636054e68f6802fbae8b0b47a3199d)

# Apollo PDV 3.0.1 — P56

**P56 BLOQUEADA PARA LIBERAÇÃO OPERACIONAL.**

Em 22 de novembro de 2026, a branch remota P55 confirmou `fde7f026df3f40f470cf39eb2ebcd3d7c64a5ab0`. A branch `audit/p56-validacao-vps-offline-operacional` partiu desse commit. O código final é `4a4a68e5cd874a820632ec3a827e3152ab700533`.

## VPS e identidade pública

**VPS NÃO VALIDADA.** O verificador P56 executou GET por HTTPS, com a validação TLS padrão e bloqueio de redirecionamentos. `/build-integrity.json` respondeu como `text/html`, com o mesmo SHA-256 da resposta de `/login`. O verificador terminou com código 1, sem SHA público verificável. O `/sw.js` ainda anuncia `apollo-public-v2` e seu hash divergiu do build P56; o manifesto Web coincidiu. A consulta mediu respostas públicas, e a auditoria administrativa, o isolamento de serviços, banco e volumes e o rollback da VPS seguem sem evidências.

A verificação passou a reprovar o CI P56 quando o manifesto é inválido, o commit diverge ou arquivos essenciais têm conteúdo ou tipo MIME incompatível. Quando o manifesto confere, a ferramenta verifica também cada arquivo listado. O resultado registra separadamente a verificação administrativa. Em ambiente HTTPS descartável, o build íntegro passou com 39 GETs. Mantendo os mesmos bytes e servindo o Service Worker como `text/html`, a ferramenta reprovou. Cinco testes automatizados do verificador passaram.

Comando da conferência pública:

```bash
python deploy/vps/verify-public-build.py frontend/dist/build-integrity.json
```

## Retomada offline

- O cofre do navegador passou a gravar rejeições HTTP 400, 409 e 422 como pendências de revisão no IndexedDB criptografado. A marcação fica local, preserva a referência original, atravessa a reabertura e exige solicitação manual de novo envio. Os itens elegíveis continuam na fila automática.
- Bloquear o cofre ou abandonar a tela cancela novas tentativas encadeadas pelo ciclo de sincronização. Um pedido que já chegou ao servidor continua sujeito à conciliação idempotente.
- A aplicação inicia o registro do Service Worker assim que o módulo carrega. A matriz continua exigindo controle ativo e fallback, com ensaios de interrupção real separados da emulação.

## Evidências

| Verificação | Resultado |
| --- | --- |
| Typecheck, lint, Vitest e verificação local do build | 58 testes passaram e os hashes de 37 arquivos do build final foram verificados. Lint concluiu com avisos existentes. |
| Saída durante envio, Chromium local e API simulada | A saída encerrou o primeiro POST, impediu o segundo e preservou os dois rascunhos ao reabrir o cofre. |
| Backend, transações, restauração e fila de impressão | Passou. [Bateria de testes](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790357) |
| Segurança e compilação | Passou. [Execução](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790390) |
| Integridade e verificação pública | Verificação de build e ensaios negativos passaram. A conferência da VPS reprovou. [Artefato com laudo JSON e build](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790402/artifacts/14768708441) |
| Navegadores | 18/18 no cofre, 6/6 na interrupção real e 28/30 na matriz histórica. [Matriz e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394) |
| Aceitação ampliada | Passou, incluindo caixa, estoque, carga, restauração, recuperação, rollback de processo e benchmark. [Artefato de `b2f6f5d`](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060733349/artifacts/14769736832). O commit seguinte alterou apenas o verificador da VPS e seus testes. |

### Navegadores e conflitos

Administrador, caixa e garçom passaram no ensaio do cofre nos seis perfis. O administrador também confirmou que um conflito real de número duplicado permanece revisável após reabrir o cofre, fica fora da tentativa automática e pode ser reenviado manualmente sem baixar estoque. As falhas da matriz histórica ocorreram na emulação do Firefox, com retorno sem cabeçalho de fallback, e do WebKit, com erro interno de navegação. Os ensaios com desligamento real passaram nos seis perfis. A instalação do Service Worker no Chromium passou nesta execução, sem o timeout observado na primeira rodada P55.

| Perfil | Histórico | Cofre P56 | Evidências |
| --- | ---: | ---: | --- |
| Chromium | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14769665312) |
| Google Chrome | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14768818449) |
| Microsoft Edge | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14768969587) |
| Firefox | 4/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14769765322) |
| Android emulado | 5/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14769173834) |
| WebKit com perfil iPhone | 4/5 | 3/3 | [Logs e traces](https://github.com/paulobhzt-tech/Apollo/actions/runs/45060790394/artifacts/14769567233) |

## Bloqueios operacionais

A VPS exige acesso administrativo autorizado para confirmar o destino real da homologação, a identidade da aplicação e a separação de banco, usuários, volumes, filas e backups, além do rollback. A fila validada é a do cofre de pedidos. Transferência, cancelamento, recebimento e fechamento offline seguem fora da cobertura. Instalação em aparelhos reais e impressão física aguardam validação.

Produção, VPS e branch principal permaneceram sem alterações. Os testes com escrita utilizaram contas fictícias e MongoDB descartável.

## Commits

- `b2f6f5d` persistência de conflitos, cancelamento de sincronização, inicialização do Service Worker e verificação pública.
- `4a4a68e` verificação do tipo MIME dos arquivos públicos.
- [Comparação completa desde a P55](https://github.com/paulobhzt-tech/Apollo/compare/fde7f026df3f40f470cf39eb2ebcd3d7c64a5ab0...4a4a68e5cd874a820632ec3a827e3152ab700533)

# Apollo P64.3 — candidata isolada

Código na branch `feat/p64-3-interface-impressao-final`. A base é `a116da3d21a397c3a2bbf84d596c77d0b236fb22` e a candidata é `fe85d9c`. [Comparar código e commits](https://github.com/paulobhzt-tech/Apollo/compare/a116da3...fe85d9c)

| Área | Estado da etapa | Evidência |
|---|---|---|
| Vínculo Windows | Implementado, conexão de saída HTTPS, credencial revogável e vinculada a uma fila nomeada de 80 mm e a um setor. | Testes HTTP e de configuração no navegador. |
| Fila automática | Implementada para tickets de produção criados desde o vínculo. A reserva concorre de forma atômica com o fluxo legado. Confirmações podem ser repetidas sem novo envio. | MongoDB descartável, teste concorrente e reenvio de confirmação. |
| Processamento Windows | PowerShell 5.1 com System.Drawing em C#, fila específica, trabalhos separados por via e estado local gravado antes do spooler. A retomada de uma saída ambígua exige conferência. | Compilação do renderizador em Windows no CI e simulação no navegador. Execução física Epson da Espeteria pendente. |
| Pré-conta e KDS | A pré-conta manual recebeu ajustes no espaçamento das colunas e na quebra de linha. O KDS reorganiza cartões e distingue spooler de saída conferida. | [Captura do laboratório](kds-envio-spooler-simulado.png), sem impressão física. |
| Financeiro, estoque, offline, segurança e backup | Regressões existentes mantidas. A suíte local de impressão passou com 9 testes e a biblioteca frontend passou com 67. | [Bateria de regressão](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568018547) · [Segurança e build](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568018566). A auditoria integral por fluxo operacional permanece pendente. |
| Instalador Windows | Ensaios limpos ampliados para 2022 e 2025 com o mesmo SHA-256 e desinstalação no canal de teste. | [Instalador e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568022219). A investigação do NSIS continua aberta. Atualização e recuperação completas pendentes. |
| Interface restante | Zoom, atalhos recolhíveis, tabelas e pagamento da P64.2 mantidos. | A reformulação integral das demais telas segue pendente. [Matriz anterior](https://github.com/paulobhzt-tech/Apollo/blob/audit/p64-2-evidencias/MATRIZ.md). |

[Matriz de continuidade por item](MATRIZ.md).

## Builds, instalação e retorno

- [Agente Windows e SHA-256](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568018659/artifacts/15001495448).
- [Web/PWA, Docker, checksums e ensaio de rollback para P64.2](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568018449/artifacts/15001875434).
- [Auditoria visual e integração do agente simulado](https://github.com/paulobhzt-tech/Apollo/actions/runs/45568025739).
- [Vínculo, inicialização, teste físico Epson e retorno à Central](https://github.com/paulobhzt-tech/Apollo/blob/fe85d9c/docs/homologacao/P64-3-PRINT-AGENT.md).

O agente desta etapa requer uma sessão Windows e execução manual. Autoinício, impressão de pré-conta pelo agente e homologação física ponta a ponta estão em aberto. A candidata permanece bloqueada para operação na Espeteria até a conferência do papel, dos cortes, da falha entre vias e do comportamento no computador piloto. A VPS fica fora do ensaio.

No Docker, o ensaio de mudança para P64.3 e retorno à P64.2 passou. A restauração em base separada recuperou 18 documentos, sem falhas.

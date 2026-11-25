# Evidências de laboratório — P63 Apollo Print Pro

A candidata final está no commit [b3b470a](https://github.com/paulobhzt-tech/Apollo/commit/b3b470a0912ad2a3ace1119ee16857d8410ededa). As capturas usam o commit 7048a85. As alterações seguintes corrigiram o empacotamento Windows, com o mesmo código Web e Mobile.

## Verificações

- Web/PWA compilado e manifesto verificado para 37 arquivos.
- 67 testes de frontend, 8 testes de impressão e autorização com MongoDB descartável e 15 testes da base Electron passaram.
- Chromium com viewport do Pixel 7 e operador garçom autenticado. Um atendimento com itens de cozinha e bar gerou dois tickets. A Central, com a chamada Electron simulada, enviou exatamente um comprovante a cada fila de teste e exibiu o aceite do spooler simulado. O telefone consultou os mesmos estados. Veja [Garçom Mobile](estado-garcom-mobile.png) e [Central de Impressão](central-impressao.png).
- Teste local de concorrência com três tickets sintéticos por pedido, dois solicitantes por ticket e até 32 operações simultâneas. O registro persistido manteve uma tentativa por ticket em cada rodada. As medidas incluem operações MongoDB e simulam o aceite. O teste usa tickets sintéticos inseridos diretamente na base e cobre a fila de produção. As validações financeiras, de estoque, de rede e de equipamento do cenário P63 completo seguem pendentes. [Dados brutos](carga-impressao.jsonl)

| Pedidos fictícios | Tickets | Duplicações de reserva bloqueadas | Tempo |
|---:|---:|---:|---:|
| 100 | 300 | 300 | 0,37 s |
| 500 | 1.500 | 1.500 | 2,42 s |
| 1.000 | 3.000 | 3.000 | 8,27 s |

## Artefatos

- [Build Web/PWA](Apollo-P63-Web-PWA.zip) e [manifesto](build-integrity.json).
- [Pacote Docker da candidata](https://github.com/paulobhzt-tech/Apollo/actions/runs/45552816817) e [pacote Docker da base P63 para rollback](https://github.com/paulobhzt-tech/Apollo/actions/runs/45539397158). Ambos os workflows geram manifesto de arquivos, ID de imagem, revisão de origem e SHA-256.
- [Instalador Windows de teste e logs](https://github.com/paulobhzt-tech/Apollo/actions/runs/45552817107).
- [Auditoria visual em navegadores](https://github.com/paulobhzt-tech/Apollo/actions/runs/45552433449). A primeira rodada Firefox falhou na tabela anual do DRE no tema escuro.
- [Manual, configuração pelo celular e checklist físico](https://github.com/paulobhzt-tech/Apollo/blob/b3b470a0912ad2a3ace1119ee16857d8410ededa/docs/homologacao/P63-IMPRESSAO.md).
- [Diagnóstico Windows](https://github.com/paulobhzt-tech/Apollo/blob/b3b470a0912ad2a3ace1119ee16857d8410ededa/desktop/scripts/diagnosticar-impressoras.ps1).

A homologação física e o inventário dependem da execução no Windows autorizado da Espeteria. A candidata está isolada para testes.

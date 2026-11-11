# Apollo PDV 3.0.2 em homologação

Base da branch: `8657e42` da homologação 3.0.1. O número de versão do desktop é 3.0.2. O workflow de instalador não roda por push nesta branch.

| Área | Entregue nesta rodada | Pendente |
| --- | --- | --- |
| Offline | Migração individual com confirmação da origem e consulta autenticada pela referência. A cópia original fica intacta. Diagnóstico confirma a identidade e mede o tempo de resposta. A fila vinculada volta a tentar o envio após login. | Validar dois caixas e um celular juntos, interrupção após envio e retomada após reinício em Windows e PWA. A origem dos registros sem identidade depende da conferência manual. Registros duplicados, divergentes ou sem prova suficiente exigem revisão. |
| Segurança e caixa | O estorno compara o estado do pedido antes de atualizar estoque, nota e fiado. Um pedido alterado por outra operação retorna conflito para revisão. | Autenticação offline com expiração e revogação, turnos independentes e teste de falha entre o estorno e seus efeitos no estoque, nota e fiado. |
| Backup e impressão | Novos backups portáteis carregam soma SHA-256. Restaurações em MongoDB com suporte a transações agrupam as gravações em uma transação. Já existe agendamento para backup do servidor e Google Drive. | Testar falha real em MongoDB replicado. MongoDB independente mantém a cópia de segurança anterior para recuperação manual. Revisar impressão de 80 mm, fila offline e autorização de reimpressão. |
| Operação | A base já inclui QR por mesa e comandas, divisão de pagamentos e tickets separados por ambiente. | Verificar fluxos com dispositivos reais e completar as melhorias de prioridades e aviso de pedido pronto. |
| Estoque, mobile e IA | A base já inclui compras, fornecedores, lotes, ficha técnica e telas de relatórios e Apollo IA. | Revisar os fluxos existentes e validar as melhorias restantes em conjunto com a operação móvel. |

## Testes

- Executar Vitest e TypeScript no frontend, com casos de migração, duplicidade e fila offline.
- Executar os testes Python de replay, auditoria, pagamentos e restauração em ambiente descartável. Os testes de restauração transacional simulam a falha de aplicação e verificam que o código não repete a operação fora da transação.
- Executar os testes do desktop para a persistência local e a detecção do servidor. A homologação física de Windows 10/11 e celular segue pendente.

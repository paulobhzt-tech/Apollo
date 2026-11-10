# Backup ao sair — homologação Windows (sem produção)

## Objetivo
Adicionar ao fechamento do Electron as opções **Fazer backup e sair**, **Sair sem backup** e **Cancelar**. Não alterar o agendamento existente das 22h.

## Sequência segura
1. O usuário solicita encerramento e escolhe uma opção.
2. Se houver pedidos ou gravações pendentes, aguardar sua persistência ou impedir o encerramento com aviso; não descartar filas offline.
3. Na opção backup, fechar o Electron normalmente e aguardar o processo terminar **antes** de copiar o LevelDB (não copiar com LOCK ativo).
4. Um processo auxiliar independente deve aguardar o PID do Electron encerrar, validar que não há outro Apollo usando o mesmo userData, e somente então copiar `pdv-dados.bin`, `pdv-dados.bin.bak`, `config.json`, `Local Storage` e `Session Storage`.
5. Criar destino único com timestamp em `G:\Meu Drive\backup churras`, sem sobrescrever backups anteriores. Escrever em pasta temporária e publicar a pasta final somente após verificar cada SHA-256. Registrar manifesto de hashes e log, sem expor segredos de config.json.
6. Não declarar sincronização com a nuvem antes de confirmar pelo serviço Google Drive. Em caso de falha, manter arquivos originais intactos, registrar erro e permitir nova tentativa.
7. Se Google Drive não estiver montado, registrar erro e não apagar ou mover dados de origem.
8. Não tentar restaurar automaticamente. Dados criptografados com Electron safeStorage podem depender do perfil Windows original.
9. A opção **Sair sem backup** deve encerrar sem copiar; **Cancelar** deve manter a janela aberta.
10. O backup local do desktop não substitui o backup do banco de dados no servidor.

## Critérios de aceite
- Teste de cada uma das três opções de encerramento.
- Teste com escrita offline pendente, LevelDB aberto e dois processos concorrentes.
- Teste sem Google Drive, falta de espaço, acesso negado e arquivos ausentes.
- Comparação SHA-256 para todos os arquivos e verificação de pasta final.
- Teste de recuperação funcional em ambiente isolado, sem conexão com produção.
- Testes Windows 10 e 11, incluindo instalação e atualizador.
- Nenhuma venda real, cobrança ou mudança em produção.

## Estado
Documento de implementação e critérios de aceite. **Não representa funcionalidade já implementada ou testada.**

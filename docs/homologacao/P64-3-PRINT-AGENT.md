# Apollo Print Agent — piloto de homologação P64.3

## Vínculo e inicialização

1. Use dados fictícios e um servidor Apollo isolado com HTTPS confiável no Windows. No Apollo, em Configurações → Impressoras, cadastre uma fila Windows de 80 mm com o nome exato que aparece no diagnóstico local. Vincule-a a um setor com impressão automática. Na Espeteria, confirme o nome da fila Epson TM-T20X e a porta TMUSB001.
2. Em **Terminais de impressão Windows**, vincule um terminal ao cadastro da impressora. O administrador recebe uma credencial revogável. Transfira-a pelo canal autorizado e oculte-a após configurar.
3. Extraia os dois arquivos do agente para uma pasta do usuário. Abra o Windows PowerShell 5.1 como o usuário que tem acesso à fila. Exemplo com servidor e fila fictícios:

   ```powershell
   .\apollo-print-agent.ps1 -Pair -Server 'https://apollo-homologacao.example' -Queue 'Fila Windows de homologação'
   .\apollo-print-agent.ps1
   ```

   A credencial é solicitada em campo protegido e armazenada com DPAPI no perfil atual. O agente consulta o servidor por HTTPS com conexão de saída e valida o nome da fila a cada consulta. A tela do Apollo informa a última consulta. O piloto roda em sessão Windows de usuário e atende um setor por processo configurado. Desative o envio automático da Central para o mesmo setor durante o ensaio.

## Ensaio físico e interpretação dos estados

- Depois de vincular e iniciar o terminal, envie pedidos fictícios do PWA com itens de setores diferentes. O piloto considera tickets criados a partir do vínculo, enquanto pendentes de entrega. Confira que o agente recebe somente as linhas do setor associado e imprime na fila configurada.
- Configure duas vias no Apollo e confira dois trabalhos de uma via cada. Use um ticket breve e um longo com texto e acentos. Confira quebra de linha, paginação e corte na Epson.
- Desconecte a rede após o envio ao spooler, e reconecte. A confirmação local pendente deve ser entregue ao servidor sem reenvio ao spooler. Encerre o processo durante um teste controlado e reinicie. Para uma tentativa cuja saída é incerta, confronte o spooler e o papel e só então use a revisão administrativa.
- Revogue o vínculo no Apollo e verifique que a próxima consulta do Windows é rejeitada. Uma entrega anterior à revogação já pode estar no spooler. Em caso de reinstalação, preserve os registros em `%LOCALAPPDATA%\ApolloPrintAgent` para conferência. Após encerrar o processo, revogar e resolver trabalhos em aberto, arquive a pasta antes de configurar uma credencial nova.
- **Aceito pelo spooler** é o retorno da chamada Windows. A confirmação da saída física exige conferência. Se a resposta de reserva se perder antes de chegar ao terminal, o servidor deixa a tentativa pendente de revisão. O agente repete a confirmação quando necessário e bloqueia o reenvio automático de uma tentativa ambígua.
- Este piloto cobre tickets de produção. A pré-conta continua usando o caminho manual já existente, com o perfil de 80 mm, e sua integração ao agente permanece pendente. Inicialização automática e execução validada no Windows 10/11 da Espeteria também permanecem pendentes.

Para reverter a ativação da fila, encerre o agente e revogue seu vínculo. Verifique os resultados indeterminados antes de retomar a Central de Impressão. O pacote de aplicação pode ser revertido em uma instância de homologação usando a imagem anterior e o procedimento de rollback P63, preservando a base de laboratório.

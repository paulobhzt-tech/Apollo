# Acesso administrativo na homologação

Confira o endereço de servidor exibido no login antes de configurar ou recuperar uma conta. As contas pertencem ao banco do servidor selecionado. O instalador Windows carrega o painel online desse servidor, que precisa executar o frontend e o backend do mesmo commit de homologação.

Em um terminal autorizado no servidor de homologação, dentro do ambiente do backend, use:

- `python first_run.py --list-admins` para conferir IDs, usuários e status dos administradores. A listagem não exibe senhas, PINs ou hashes.
- `python first_run.py` para configurar o primeiro administrador quando ainda não houver nenhum cadastrado. Informe um usuário livre e uma senha escolhida na hora. O PIN é opcional.
- `python first_run.py --recover ID` para redefinir a senha de um administrador ativo selecionado. Se a conta antiga só usava PIN, informe um usuário livre para a mesma conta. O comando preserva o PIN, registra a recuperação na conta e invalida as sessões anteriores dela.

Em instalações com Docker Compose, execute os comandos dentro do serviço do Apollo, por exemplo `docker compose exec apollo python first_run.py --list-admins`. Confirme o serviço e o banco de homologação antes de qualquer comando de configuração ou recuperação. A execução deve ocorrer em terminal interativo para que o sistema leia os segredos sem eco.

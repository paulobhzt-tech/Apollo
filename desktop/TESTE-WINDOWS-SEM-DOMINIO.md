# Testar o instalador Apollo PDV no Windows antes do domínio

Este procedimento é **somente para testes**, com a instalação MongoDB/Apollo já funcionando na VPS HostGator. O instalador de teste não libera a VPS na internet, não contém senhas nem altera a porta da aplicação.

## Criar e baixar o EXE

1. Acesse [GitHub Actions — Instalador Windows](https://github.com/paulobhzt-tech/Apollo/actions/workflows/windows-installer.yml).
2. Clique **Run workflow** e selecione **test**.
3. Ao concluir, abra a execução e baixe o artefato ZIP chamado `Apollo-PDV-Setup-test`, que contém `Apollo-PDV-Setup.exe`.
4. Extraia o ZIP em uma pasta do Windows antes de executar o instalador. Confira a origem do download. O EXE ainda não está assinado digitalmente e o Windows pode alertar sobre o fabricante desconhecido.

Se o workflow falhar, abra o log do job "build-windows" e identifique o erro; não considere o instalador concluído sem o job verde e o artefato disponível.

## Conectar o Windows à sua VPS sem domínio

Na VPS, confirme os contêineres em execução:
```bash
cd /opt/apollo/deploy/vps
docker compose ps
```

No **Windows em que será instalado o EXE**, abra um PowerShell separado e execute:
```powershell
ssh -N -L 18080:127.0.0.1:18080 -p 22022 root@143.95.184.142
```

Depois de autenticar no SSH, deixe esse PowerShell aberto. O instalador `test` foi configurado para usar `http://localhost:18080`; sem o túnel, não acessará o servidor da VPS. Não abra a porta 18080 no firewall e não use esse instalador fora desse computador.

Antes de abrir o Apollo instalado, abra `http://localhost:18080` no navegador do mesmo Windows. Se o login não funcionar no navegador, resolva o acesso antes de testar o aplicativo.

## Testes que precisam ser feitos manualmente

- [ ] O instalador abre e o atalho Apollo PDV aparece.
- [ ] Apollo inicia com a janela de login e o nome do estabelecimento.
- [ ] O administrador entra com o PIN sem compartilhá-lo com ninguém.
- [ ] Mesas e comandas abrem sem erro.
- [ ] É possível simular uma venda sem pagamento real.
- [ ] O fechamento de caixa de teste não modifica dados reais.
- [ ] Impressoras são listadas (teste com hardware físico antes de produção).
- [ ] Ao desconectar o túnel, o programa informa que perdeu a conexão; **não considere o modo offline homologado apenas porque alguma tela abriu**.
- [ ] Ao reconectar, confira cuidadosamente se não houve duplicidade de registros.

Se a tela não carregar no Electron ou o login falhar, capture a mensagem de erro **sem mostrar PINs, senhas ou dados de clientes**.

## Produção depois de ativar HTTPS

Quando `pdv.apollo-pdv.com` estiver com DNS e certificado TLS funcionando:
- GitHub → Settings → Secrets and variables → Actions → **Variables** → configure `PDV_SERVER_URL=https://pdv.apollo-pdv.com`.
- Execute **Instalador Windows** com a opção **production**.
- Faça nova homologação em Windows antes de distribuir o EXE.

O instalador de teste é descartável. Não o distribua para clientes; ele requer o túnel SSH particular do operador.

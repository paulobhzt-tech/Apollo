# Apollo PDV — servidor local seguro (HTTPS)

Use para operar vários caixas, garçons e cozinha na mesma rede da loja, inclusive sem internet externa.

## Instalação Windows

1. Escolha um computador Windows 10/11 que permanecerá ligado e reserve um **IP IPv4 fixo** para ele no roteador.
2. No computador servidor, execute o PowerShell como administrador:
   `powershell -ExecutionPolicy Bypass -File local-server\instalar-servidor.ps1`
3. O script cria uma autoridade certificadora exclusiva da loja e emite um certificado TLS para o IP identificado, `localhost` e `127.0.0.1`. O servidor passa a atender em **https://IP-LOCAL:8001** com cookies `Secure`.
4. O próprio PC servidor confia na autoridade local. Nos outros PCs e celulares, o administrador deve instalar **apenas** `C:\ApolloPDV\security\apollo-local-ca.crt` na lista de autoridades confiáveis, seguindo a política de segurança do aparelho. Não ignore alertas de certificado. Alguns celulares exigem habilitar manualmente a confiança no certificado.
5. Configure o aplicativo Apollo PDV e os navegadores dos celulares para usar `https://IP-LOCAL:8001` (não HTTP). Teste em cada equipamento.
6. Execute `local-server\criar-admin.ps1` no servidor para configurar o primeiro administrador, caso ainda não exista. A senha é escolhida no terminal e o PIN é opcional. Para localizar uma conta existente use `-Listar`. Para recuperar a senha de uma conta ativa use `-Recuperar ID`. Consulte o [roteiro de acesso](../docs/homologacao/acesso-administrativo-3.0.1.md).

## Segurança e manutenção

- **Nunca distribua** `C:\ApolloPDV\security\server.key`. O instalador restringe o acesso a essa chave ao SYSTEM e administradores.
- A autoridade local assinou o certificado do servidor. Instale sua chave pública **somente em dispositivos da loja**. Não instale em dispositivos não gerenciados.
- A alteração do IP fixo exige um novo certificado, nova verificação e possivelmente nova confiança nos dispositivos.
- O banco de dados local é separado do banco da nuvem. Faça backup antes de atualizar ou reinstalar.
- A instalação migra `COOKIE_SECURE`, `APP_URL` e `CORS_ORIGINS` do arquivo `C:\ApolloPDV\backend\.env`, sem substituir as demais credenciais.
- O agendamento de backup consulta a API local por HTTPS em `https://localhost:8001`.
- Operações autenticadas que alteram dados devem partir da mesma origem do PDV. Requisições de outros sites são bloqueadas, inclusive se um cookie estiver presente.
- O servidor local precisa ter sua conectividade e certificados validados nos aparelhos reais antes de ser usado no caixa.

## Observações

O aplicativo desktop que opera contra a nuvem continua usando o endereço publicado. O funcionamento sem rede externa de todos os dispositivos requer o servidor local Windows ligado e a rede Wi-Fi funcionando.

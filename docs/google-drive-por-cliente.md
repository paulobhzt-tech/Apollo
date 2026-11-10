# Google Drive individual por estabelecimento — homologação

## Implementado nesta etapa
- Biblioteca de preparação do OAuth2 PKCE para aplicativo Windows.
- Escopo `drive.file`, sem solicitar acesso irrestrito ao Drive.
- Validação de estado OAuth contra CSRF e testes unitários.

## Pendente antes de uso
1. Registrar um OAuth Client ID **Desktop** no Google Cloud e configurar tela de consentimento. Não embutir client secret.
2. Criar callback localhost de porta dinâmica e troca de código por tokens; validar resposta e fechar servidor temporário.
3. Proteger refresh tokens com Electron safeStorage/Windows DPAPI, por perfil e estabelecimento, com revogação e desconexão.
4. Associar conta a tenant/estabelecimento autorizado e impedir cruzamento de dados.
5. Implementar upload de arquivo de backup **criptografado** com Google Drive API e manifesto SHA-256; nunca enviar dados locais em claro.
6. Tratar renovação de tokens, falhas de rede, quota, falta de espaço, cancelamento e retry idempotente.
7. Implementar fluxo **Fazer backup e sair** com processo auxiliar pós-encerramento, e interface de configurações.
8. Testar recuperação isolada, compatibilidade entre máquinas e dados do servidor.
9. Executar testes Windows 10/11 e revisão de segurança. Sem publicar em produção.

**A biblioteca não autentica nem envia dados ao Google ainda.** Não solicitar senhas Google no Apollo.

# Apollo PDV 3.0.1 no Windows — conexão de homologação

O NSIS instala o Electron e as telas web em `resources/app.asar`. O backend FastAPI, MongoDB e o túnel não fazem parte do pacote. A configuração de uma instalação existente fica no perfil do Apollo. A fila offline continua no armazenamento local do aplicativo.

A compilação de teste usa `https://teste.apollo-pdv.com` como endereço inicial. Um endereço de produção salvo é descartado na seleção da conexão de teste. O antigo padrão `localhost:18080` pode ser selecionado novamente quando houver um túnel de homologação ativo. O aplicativo não procura serviços em portas vizinhas nem inicia serviços do Windows.

Antes de abrir o painel, o aplicativo verifica se `/api/` identifica a API Apollo e se `/api/auth/profiles` responde com a lista usada no login. Se a API ou o serviço de login estiver indisponível, a janela apresenta o endereço e permite tentar novamente ou escolher o túnel local. A configuração só é salva depois de uma resposta válida da API.

O ambiente HTTPS precisa de frontend, API e banco de teste provisionados separadamente. A consulta feita durante a correção não confirmou a disponibilidade desse domínio. Sem esse ambiente ou um túnel funcional, o instalador abre o diagnóstico e o login continua indisponível.

## Verificação

- Testes Node verificam migração da configuração, bloqueio da URL de produção, respostas de serviços alheios, prontidão do login e erros de rede.
- O smoke Windows instala o NSIS, abre o frontend embutido e usa uma API simulada em porta livre para reproduzir a falha inicial e verificar a reconexão.
- No Windows 10/11 de homologação, verificar instalação sobre a versão anterior, diagnóstico com o servidor desligado, login com conta de teste quando a API estiver pronta e preservação da fila local.

## Configuração e credenciais

O aplicativo aceita `config.json` em UTF-8 com ou sem BOM. Em homologação, JSON ilegível ou endereço inválido levam ao diagnóstico antes de qualquer tentativa de login. Ao gravar uma nova configuração após a confirmação, o arquivo anterior com erro é preservado ao lado do original.

A tela de login mostra o servidor selecionado e orienta a escolher PIN para contas antigas que foram cadastradas apenas com PIN. A consulta de perfis verifica disponibilidade do serviço sem testar credenciais. Uma resposta 401 do login continua genérica no servidor. Para homologação manual, compare o endereço exibido com o ambiente em que a conta foi criada, selecione o método cadastrado e use uma conta de teste existente.

Nesta revisão também foram atualizadas a busca do menu sem acentos, a validação de compras, a proteção contra estornos concorrentes e a verificação SHA-256 dos novos backups portáteis. Turnos independentes, validação ponta a ponta do modo offline e compatibilidade em celular continuam sujeitos à homologação.

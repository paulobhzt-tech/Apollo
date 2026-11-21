# Apollo P46 — homologação presencial e destino
Status inicial: **BLOQUEADO**. Este roteiro não é evidência de execução.

## Preparação
Usar somente endereço HTTPS de homologação validado, banco fictício exclusivo,
dois operadores de caixa e um garçom. Registrar commit instalado e hash do pacote,
data/hora, responsável, modelo/OS do dispositivo, versão do navegador e impressora.
Não reutilizar credenciais, filas ou banco da loja. Não registrar senhas nas evidências.

## Impressora térmica 80 mm
1. Configurar largura 80 mm no driver e no navegador, escala 100%, margens mínimas,
   sem cabeçalho/rodapé do navegador. Confirmar o modelo e a conexão reais.
2. Criar pedido fictício com espetinho destinado à cozinha e bebida destinada ao bar.
   Conferir mesa/comanda, número do pedido, operador, horário, quantidades,
   observações, acentos, valores e ausência de cortes no papel.
3. Imprimir duas vias e conferir identificação/destino de cada setor.
   Confirmar impressão no sistema somente após verificar a saída.
4. Desconectar a impressora e enviar novo pedido. Registrar a fila, reconectar,
   processar a pendência e contar as vias. Marcação verde sozinha não comprova papel.
5. Desconectar a rede do dispositivo após carregar e autenticar a aplicação.
   Registrar pedido fictício, fechar/reabrir quando suportado, reconectar e conferir
   uma única cobrança, uma única baixa e os tickets esperados.
6. Reimprimir com operador autorizado e justificativa; tentar sem permissão.
   Conferir auditoria, identificação de reimpressão e ausência de nova venda/baixa.
7. Fotografar cada via e anexar IDs dos pedidos/tickets, eventos da fila e auditoria.
   Qualquer duplicação, perda ou corte bloqueia aprovação até correção e reteste.

## PWA em dispositivos físicos
Executar separadamente em Android, iPhone e Windows; emulação não substitui:
1. Abrir HTTPS sem erro de certificado. Instalar pelo Chrome/Edge no Android/Windows;
   no iPhone, Safari > Compartilhar > Adicionar à Tela de Início.
2. Abrir pelo ícone instalado e registrar versão, acesso e navegação em tela cheia.
   Conferir mesas, pagamento, teclado, zoom e rolagem.
3. Com aplicação carregada e autenticada, perder conexão, lançar operação fictícia,
   conferir pendência, reconectar e verificar ID único no servidor e estoque/caixa.
   A primeira abertura sem rede não é suportada; registrar separadamente o
   comportamento da reabertura offline, sem presumir que a tela autenticada é cacheada.
4. Com uma pendência, atualizar para novo build de homologação. Conferir aviso de
   atualização, preservação da fila e sincronização única antes de encerrar o turno.
5. Fechar aplicativo, reiniciar dispositivo, reabrir e conferir recuperação,
   sessão/identificação do operador e ausência de dados de outro operador.
6. Registrar vídeo/capturas, IDs e logs do servidor, versão anterior e nova,
   resultado observado e falhas. Aprovação exige as três plataformas reais.

## Destino de homologação
Antes de qualquer publicação, obter acesso administrativo por canal seguro e
identificar domínio, diretório, serviço, usuário, porta, banco e volumes reais.
Comprovar que são exclusivos de homologação e não compartilham dados ou segredos
com produção. Não imprimir .env, URI com senha ou tokens em logs.

Verificar DNS e cadeia TLS válida, renovação, redirecionamento HTTP, cookie Secure,
origem HTTPS exata no CORS/CSRF, backend privado, MongoDB privado autenticado em
réplica, permissões mínimas e ausência de credenciais padrão. Definir
APOLLO_CASH_MODE=operator, DB_NAME exclusivo e SERVE_FRONTEND_DIR absoluto.
O Compose antigo deploy/vps não é compatível como está com esse modo.

Preservar versão/configuração anterior, executar backup consistente e restaurar
em outro banco descartável. Comparar vendas, pagamentos, caixa, devoluções,
estoque e auditoria; ensaiar reinício e retorno. Não ativar versão anterior para
gravação com caixas independentes abertos.

Somente após essas provas publicar em homologação e validar externamente:
GET /api/, login, dois caixas, garçom, transação fictícia, offline e recuperação.
Registrar HTTPS, commit servido e evidências sem senhas. Nenhum deploy em produção.

## Registro por cenário
| Campo | Preencher |
|---|---|
| Commit/hash/URL homologação | |
| Data/hora e responsável | |
| Dispositivo/OS/navegador/impressora | |
| Cenário e IDs fictícios | |
| Resultado esperado/observado | |
| Foto/vídeo/log verificável | |
| Aprovado ou falha e reteste | |

Sem evidência preenchida e verificável, marcar **NÃO EXECUTADO**.

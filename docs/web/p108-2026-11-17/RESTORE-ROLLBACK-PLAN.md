# P10.8 — plano de restauração e rollback antes de rs0

Preparado após recebimento do preflight real. **Não executado.** Esta sessão permite documentação e diagnóstico seguro; não autoriza criação de Mongo, transferência de dados privados, suspensão de escritores, migração ou restart na VPS. Nenhum segundo Mongo será executado na VPS compartilhada.

## 1. Destino e prova de origem

Escolher host separado disponível e autorizado, com Docker/ferramentas já instalados ou instalação aprovada à parte, recursos medidos e isolamento de rede. Não contratar serviço nem instalar dependência sem decisão do proprietário. Identificar responsável, capacidade, versão/digest Mongo 7.0.45 compatível e localização privada dos resultados. O host não recebe rota/credenciais para bancos ativos; chaves privadas GPG continuam fora da VPS.

Artefato de origem: backup atualizado de 7.243 bytes, SHA-256 ebbb6988098a5d910bfe65503ba84fd5d7e18ea2b7df7c1da13a844246c4c2cb. A cópia para o destino exige canal protegido e aprovação do local receptor; não anexar o archive ao GitHub/chat. Verificar hash antes e depois, tamanho e GZIP, mantendo original intacto. Se usar cópia GPG do Drive, seguir recuperação/descriptografia no computador do proprietário e identificar que esse ciphertext contém exatamente este arquivo — não apenas um consolidado anterior.

O host separado deve guardar artefatos/evidências em diretório exclusivo privado, sem sobrescrever nomes existentes. A relação backup → dump restaurado → relatório é identificada por hashes, sem dados pessoais públicos. Se a cópia externa independente ainda estiver pendente, manter essa pendência explícita.

## 2. Restauração real standalone do arquivo selecionado

Preparar um único Mongo descartável no host separado, sem portas publicadas, sem mounts da VPS, sem acesso a produção e com limites orçados. Para preservar documentos com índices TTL durante a comparação, planejar TTL monitor desativado **somente no destino descartável**, antes do restore; documentar a diferença e reativação no ensaio funcional quando apropriada. Isso não altera TTL ou dados ativos.

Executar mongorestore real com erro fatal em falhas, em destino novo e vazio, com mapeamento de namespace auditado, sem --drop, sem --dryRun e sem apagar destino anterior. Capturar logs em arquivo privado; publicar resumo sanitizado. Não considerar zero falhas suficiente se foram restauradas zero coleções/documentos inesperadamente. Falha → preservar logs/snapshot, parar; não tentar “consertar” backup ou origem.

**Valores esperados precisam representar o ponto do backup.** O banco vivo hoje tem 29/37/69; isso é referência atual, não manifesto do snapshot anterior. A restauração histórica tinha 29/36. Obter do snapshot/manifesto/log privado o inventário correspondente, se existir. Sem inventário contemporâneo, registrar a limitação: restaurar prova legibilidade/recuperação do conteúdo disponível, mas não prova completude exata em relação ao banco vivo que mudou. Não editar o backup para fazê-lo coincidir com a captura atual.

## 3. Comparação e identidades

| Item | Comparação exigida | Evidência pública permitida |
|---|---|---|
| Namespace | Todos os bancos/coleções esperados no escopo, incluindo views/opções | Quantidades, divergências por categoria; nomes sensíveis ficam privados |
| Documentos | Contagem exata por coleção e total do mesmo ponto; conteúdo normalizado preservando tipos BSON e IDs | Hashes de manifestos privados, totais e resultado; nunca dumps/identificadores pessoais |
| Índices | Nome/chaves/ordem, unique, sparse, partialFilterExpression, TTL, collation e opções relevantes | Resultado semanticamente normalizado; não publicar valores privados de filtros |
| Usuários Mongo | Confirmar se archive contém identidades/roles necessárias ou se dependem de material separado | Quantidade/roles e hashes de identidade; nunca hashes de senha, tokens ou credentials |
| Identidades Apollo | employees/roles, hashes de autenticação, estado de sessão e política de revogação/reprovisionamento | Resultado da conferência; nada de credenciais no relatório |
| Financeiro | Pedidos/pagamentos/estornos, caixa, fiado, estoque/lotes e marcadores conciliados | Contagem de achados e revisão; nenhum reparo automático |

Dump limitado a apollo_homologacao não certifica os usuários root@admin. Não importar identidades de produção para obter um PASS. Criar credenciais administrativas novas apenas no destino isolado sob autorização e verificar equivalência de permissões; diferenciar “usuário restaurado do backup” de “usuário reprovisionado por plano de desastre”. Se o desastre exigir admin novo, provar o procedimento sem depender de senha no servidor perdido. Material de autenticação permanece privado.

O reconciliador `backend/tools/reconcile_backup.py` recebe JSON/BSON de coleção → documentos, não archive.gz. Exportar apenas do destino restaurado em ambiente privado e executar com dependências compatíveis. Ele produz relatório, mas sua execução bem-sucedida não significa ausência de achados: analisar o campo findings. Qualquer achado financeiro ou ausência de evidência exigida bloqueia aceite até revisão; não reparar registros automaticamente. Ausência de achado não certifica toda a história.

## 4. Ensaio de conversão e retorno — apenas no clone

Com restauração aceita, preparar um ensaio sequencial no mesmo host separado, sem tocar a VPS:

1. Registrar baseline standalone (image ID/digest/FCV, config, usuários, índices e hashes de conteúdo) e capturar ponto frio validado após parada limpa do **clone**. Guardar os arquivos/volumes originais do ensaio; nunca copiar WiredTiger ativo como snapshot consistente.
2. Converter apenas o clone para rs0 com keyfile próprio do ensaio, DNS interno mongo:27017, PRIMARY autenticado e conexão compatível; testar a imagem de aplicação correspondente em rede privada sem saída externa. Não ativar o perfil P10 incompatível apenas para preencher uma variável.
3. Realizar trilha financeira fictícia com referência única e reconciliação; limitar concorrência a dois operadores. Dados do backup não são presumidos fictícios: se houver dados reais, manter a etapa apenas em comparação privada e usar dataset sintético separado para testes de escrita. Não enviar emails, notas, PIX ou webhooks reais.
4. Exercitar o rollback escolhido, medir duração e conferir autenticação, dados, índices, permissões e comportamento da aplicação. Se houver novas escritas fictícias, documentar quais serão preservadas ou descartadas no clone; não inferir que restaurar um snapshot anterior preserva commits posteriores.
5. Validar retorno standalone no mesmo volume **somente se** o ensaio demonstrar que a versão/configuração exatas suportam esse retorno. Caso contrário, provar restauração em novo volume/destino vazio a partir do ponto validado, mantendo o anterior intacto. Não apagar local/system.replset para forçar retorno.
6. Repetir leitura de dados e comparar com baseline do ponto correto. Guardar cronologia e resultado. Retorno a standalone recupera o baseline de disponibilidade, não garante suporte às transações que motivaram rs0.

Qualquer erro de autenticação, mount errado, perda/divergência de dados, índice faltante ou rollback não determinístico encerra o ensaio e bloqueia migração. O init-rs0.js e testes mockados não substituem essa prova. Não usar um container de recuperação na VPS para este ensaio adicional.

## 5. Orçamento e futura janela de homologação

Antes de solicitar autorização da janela, entregar: destino/configuração exatos revisados, todos os escritores identificados, mecanismo de controle e retomada, backup do ponto com prova de recuperação, perfil/origem coerentes, saúde inicial de produção por leitura, capacidade disponível representativa, tempos medidos de migração/validação/rollback e responsável pela decisão.

Reservar no máximo 30 minutos por execução, com rollback medido R e margem de pelo menos max(R+2 min,10 min). Se os tempos completos não couberem, não abrir janela nem pedir aprovação de um plano impossível. Definir checkpoints e horário limite antes de T0; sem ampliação tácita. A autorização precisa confirmar que aquela janela específica continua válida. Esta retomada **não solicita nem inicia janela**, porque faltam os pré-requisitos.

## 6. Ficha de aceite do ensaio

| Campo | Estado atual |
|---|---|
| Host/digest/recursos/destino separado autorizado | A definir |
| Cópia do arquivo exato e SHA verificado no destino | Não executada nesta retomada |
| Início/fim e duração de restore real | Não medidos |
| Inventário esperado do ponto do backup | Não disponibilizado |
| Coleções/documentos/índices restaurados e comparação | Não executados |
| Usuários/roles e desastre de autenticação | Não comprovados |
| Reconciliação financeira privada e revisão | Não executadas |
| Conversão/retorno no clone | Não executados |
| Tempo de rollback e margem | Não medidos |
| RPO/RTO | Não medidos; RTO técnico termina após validação, não na conclusão do comando |
| Decisão para pedir janela de rs0 na VPS | BLOQUEADA |

Próxima entrada necessária: identificação/capacidade/autorização de um host separado e disponibilidade protegida do arquivo/inventário do snapshot. Não solicitar senha ou chave privada no chat. A aprovação do preflight de leitura não se estende à execução deste plano mutante.

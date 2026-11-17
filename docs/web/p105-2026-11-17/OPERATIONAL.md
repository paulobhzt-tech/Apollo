# P10.5 operacional — HostGator

17/11/2026. PR #25; scripts aprovados e preservados integralmente em `79b71b33badf4266e7e562b73206954fbe33999e`. Este documento complementa BACKUP-RECOVERY.md; não substitui seu histórico nem altera a implementação aprovada.

**Veredito: BLOQUEADO para conclusão operacional, P10.6 e produção.** Preparação local concluída. Não houve SSH, inspeção da VPS, backup real, transferência ou restauração nesta retomada. A ausência de acesso não é falha medida da infraestrutura.

## Evidência e procedência

| Item | Confirmação do proprietário nesta missão | Verificação direta nesta retomada |
|---|---|---|
| Sistema/recursos | AlmaLinux 9, Virtualmin, 1 vCPU, 1,7 GiB RAM, 3 GiB swap, ~23 GB livres, outro site | Pendente |
| Mongo | 7.0.45, autenticado, standalone, dois containers | Pendente |
| Volumes | Produção e homologação distintos | Pendente |
| Histórico | Backups de homologação existentes | Arquivos não disponibilizados |
| Armazenamento externo | apollo-criptografado: acessível; SHA-256 históricos externos conferidos | Resultado informado; hashes, arquivos, horários e métodos não disponibilizados nesta retomada |
| Git/PR | HEAD aprovado 79b71b3 | PR aberto/draft, sem merge; HEAD confirmado; checkout limpo no início |
| Integridade dos scripts | Mesma implementação aprovada | Cinco arquivos conferidos byte a byte contra commit e SHA-256 |
| Testes | — | 18 unitários aprovados novamente; Bash -n e py_compile aprovados |
| CI do HEAD aprovado | — | Seis runs completed/success; IDs no JSON de evidências |

As informações novas do proprietário atualizam o inventário declarado, sem transformar confirmação verbal em medição remota. A versão 7.0.45 precisa orientar a escolha do Mongo/Database Tools do ensaio; não reutilizar a antiga imagem de laboratório 7.0.16 por suposição.

### Hashes do material para revisão

| Caminho | SHA-256 |
|---|---|
| deploy/vps/backup-mongo.sh | d3c029f2212bf6d7a3650c6299b59a75073c60664eac0edfd312ae287c953982 |
| deploy/vps/restore-drill.sh | c06cd7ec9e9b5a947636ba838912aab7d3e44b6c416d4f2373461345b10da02f |
| deploy/vps/inspect-recovery.sh | ba7a1dc9f7eb35045a1ef38f2f2f87ac3b9020d7f0b6da2d4481864339fb0a88 |
| deploy/vps/mongo_recovery.py | 809e0eb6e912d5acd1e8845c66b06718872b00e44890ac0ed267a1b19131ac97 |
| docs/web/p105-2026-11-17/BACKUP-RECOVERY.md | 12f62bb95f5a50c5c0b1ebc25b2e097d12b240d570b6982080debaad14b30b8e |

## Bloqueio imediato: acesso

Neste executor há cliente SSH, mas não há destino fornecido, agente SSH com autenticação, configuração SSH ou known_hosts. Nenhum host foi presumido a partir do domínio ou do hostname do inventário. Rclone está disponível, mas o remote apollo-criptografado não está configurado localmente. Isso não contradiz sua existência na VPS.

Para avançar por SSH: disponibilizar host/IP de gerenciamento, porta, usuário, fingerprint SHA-256 da chave do servidor conferida no painel/console por fonte independente e autenticação temporária por canal seguro. Não enviar senha, chave privada, .env, rclone.conf ou token no chat/PR. O host separado de restauração também precisa ser identificado e disponibilizado, com capacidade e autorização próprias.

A autorização para inspeção não destrutiva já foi concedida. Falta acesso, não uma nova aprovação genérica. Alternativa: o proprietário executar os comandos de leitura do diretório revisado e devolver apenas a saída sanitizada, mantendo o estado como inspeção executada pelo proprietário.

## Sequência de inspeção autorizada, ainda não executada

1. Confirmar identidade SSH estritamente; não desativar checagem de host key. Preparar material por commit em diretório exclusivo de revisão, preservando checkouts e segredos. Conferir hashes acima antes de executar. Não git pull nos checkouts operacionais nem substituir scripts existentes.
2. No diretório de revisão aprovado, executar:

```bash
sha256sum deploy/vps/backup-mongo.sh deploy/vps/restore-drill.sh deploy/vps/inspect-recovery.sh deploy/vps/mongo_recovery.py
bash -n deploy/vps/backup-mongo.sh deploy/vps/restore-drill.sh deploy/vps/inspect-recovery.sh
bash deploy/vps/inspect-recovery.sh
```

3. Conferir DB_NAME, host/porta internos e caminho de banco da URI, projeto Compose, image ID/digest, redes e nomes dos volumes dos quatro containers. Não imprimir Config.Env, docker compose config completo, logs brutos ou URIs. Anotar bancos reais; não preencher apollo_pdv por inferência.
4. Validar autenticação com mongosh dentro de cada Mongo usando as variáveis existentes somente em memória, retornando apenas sucesso/falha, versão e standalone. Não passar senha em argv. Inspecionar versões das ferramentas e suporte de mongodump --config sem criar dump. Comparar o destino efetivo de MONGO_URL com o Mongo correto; autenticação root válida não prova o destino da aplicação.
5. Identificar escritores: duas Webs, desktops, integrações, cron/timers, scripts, sessões administrativas e clientes externos. Atual conexão sem gravação não garante ausência de gravações futuras. currentOp em amostra não substitui inventário de clientes nem prova uma janela.
6. Revisar cron root, demais usuários relevantes, /etc/cron.d e diretórios periódicos, timers e mecanismos de agendamento dos containers. O script existente mostra candidatos/contagens, não horário/comando completos. Conferir localmente horários, identidade, destino e exclusões; publicar só horários/resumo sanitizados, nunca comandos com segredos. Não alterar nenhum agendamento.
7. Medir recursos sem carga artificial: free, df/inodes, docker stats, vmstat e /proc/pressure/io/memory/cpu se disponíveis, séries curtas até 60 segundos em período representativo e dados históricos disponíveis. Separar consumo do outro site. Não instalar iostat ou executar benchmark para completar inventário. Registrar pico, swap-in/out, espaço do filesystem de backup e tamanho estimado não comprimido do banco. Disco livre não prova capacidade de tmpfs/memória.
8. Inspecionar backups legados sem modificar: nomes/tamanhos/data, leitura GZIP em streaming e SHA-256 dos arquivos/sidecars conhecidos. Fazer leitura pesada de um arquivo por vez em horário de baixo impacto acordado; checksums antigos não comprovam o conteúdo financeiro nem o banco selecionado. Não converter arquivo legado em bundle novo inventando contagens ou declaração de consistência.
9. Conferir rclone no usuário correto: tipo crypt e opções de criptografia por resumo booleano gerado localmente, sem imprimir configuração ou segredos. Listar somente o prefixo Apollo necessário; evitar varredura de todo o Drive. Confirmar acesso de leitura e digest do conteúdo descriptografado, sem upload nesta fase. A possibilidade de leitura não prova permissão de escrita.

## Parâmetros preparados, ainda não aprovados por inspeção

| Ambiente | APOLLO_ENV | Projeto candidato | Mongo | Aplicação | Raiz proposta |
|---|---|---|---|---|---|
| Produção | producao | apollo-pdv | apollo-pdv-mongo-1 | apollo-pdv-apollo-1 | /var/backups/apollo/producao |
| Homologação | homologacao | apollo-homologacao | apollo-homologacao-mongo-1 | apollo-homologacao-apollo-1 | /var/backups/apollo/homologacao |

APOLLO_DB e APOLLO_EXPECTED_DB permanecem **não preenchidos**: dependem do banco efetivo e do inventário de escritores. Projetos/aplicações devem ser confrontados com labels, não apenas nomes. Não definir APOLLO_WRITES_QUIESCED=YES até a janela efetivamente controlada e comprovada.

## Intervenções que precisam de autorização posterior

| Intervenção concreta | Condição para apresentar pedido de autorização |
|---|---|
| Controle/suspensão de gravações em produção ou homologação | Identificar todos os escritores, mecanismo, responsáveis, início/fim da janela, impacto no PDV e recuperação em falha; não há mecanismo aprovado definido |
| Execução de backup consistente | Janela autorizada e ativa, banco/conexões confirmados, espaço e recursos avaliados; não executar só com declaração genérica |
| Criar diretórios definitivos e instalar/substituir scripts | Diff e destinos exatos revisados; scripts antigos permanecem intactos até aprovação operacional |
| Upload de bundles novos | Confirmar crypt/usuário/prefixo/cotas, integridade local e autorização para transmitir dados reais; usar --immutable e verificação por leitura |
| Recuperar dados para host separado e executar Mongo descartável | Identificar host, recursos, digest compatível, proteção dos dados e destino exclusivo; nenhuma restauração na VPS compartilhada |
| Alterar agendamento, retenção ou credenciais OAuth | Aprovação específica; não abrangida por inspeção |

Não se solicita restart, deploy, rollback, alteração do outro site, limpeza Docker ou merge: permanecem fora do escopo autorizado. Material de revisão separado não substitui scripts instalados.

## Recuperação externa e restauração real: plano de aceitação

1. Selecionar bundle novo completo (manifest.json e dump.archive.gz), com evidência da janela consistente; identificá-lo por ambiente, banco, horário e SHA. Não usar um histórico externo apenas porque seu hash confere.
2. Após upload autorizado, executar o check por download do script. Em sessão independente no host separado, recuperar o prefixo exato para diretório novo, sem sync/delete, e conferir SHA/GZIP/manifesto. Registrar bytes e duração de download; proteger credenciais e dados no destino.
3. Conferir tamanho descomprimido e estimativa de restore, RAM/disco/CPU do host. O script atual limita tmpfs de dados a 384 MiB e RAM a 768 MiB; sem prova de que a base cabe, não executar nem remover limites na HostGator. Eventual ajuste requer plano separado, sem refazer a implementação aprovada por presunção.
4. Usar digest Mongo compatível com origem 7.0.45, disponível no host, e ferramentas verificadas. Só no host separado autorizado definir APOLLO_DISPOSABLE_HOST=YES e executar restore-drill.sh. O script usa mongorestore real, namespace isolado, contagens e reconciliação; não usar dryRun como aprovação.
5. **Gate adicional de índices:** o manifesto aprovado não registra índices e o ensaio atual não os compara. Antes de uma aprovação completa, preservar inventário sanitizado dos índices/opções de coleção da origem durante a janela e comparar semanticamente com o restaurado (normalizando nome do banco e opções transitórias). Não alegar que o PASS atual certifica índices. Como o container é descartado no final, essa evidência deve ser planejada em ensaio supervisionado complementar no host separado, ou por extensão previamente revisada; não prometer coletá-la depois que o container tiver sido removido.
6. Comparar dados por coleção e identificadores e obter evidência de conteúdo, não só contagens; conferir o relatório de reconciliação aplicável (caixa, pedidos, pagamentos, fiado, estoque, lotes e marcadores). Dados com achados exigem revisão, nunca reparo automático. O script aprovado não emite um inventário de hashes por documento nem preserva relatório detalhado; planejar captura privada adicional antes de certificar recuperação completa. Não publicar BSON/JSON financeiro ou identificadores pessoais no PR.
7. Registrar sucesso/falhas, etapas e tempos com relógio UTC e cronômetro monotônico. RTO técnico = intervalo do início da recuperação independente até verificações concluídas; descrever o escopo, pois não inclui automaticamente retorno do PDV e aceite humano. RPO observado = diferença entre o horário de referência do incidente ensaiado e o último ponto consistente recuperado, incluindo eventuais lacunas. Não derivar RPO apenas da agenda pretendida.

### Google Drive: client_id compartilhado

**Pendência registrada:** migrar o client_id compartilhado para cliente OAuth próprio, após planejamento de consentimento, escopos mínimos, quotas, renovação e reversão. Não expor client_id/client_secret/token, não rotacionar credenciais em uso e não desconectar o destino existente nesta missão. Ensaiar leitura/upload/download com a nova identidade em prefixo separado antes de qualquer troca autorizada. Migração pendente não invalida hashes históricos conferidos, mas mantém dependência operacional de quotas e credenciais compartilhadas.

## Critérios de saída e recomendação P10.6

| Entrega | Estado nesta retomada |
|---|---|
| Commit/hashes/documentação integral | APROVADO no escopo local |
| Testes unitários e CI existente | APROVADO; ferramentas externas simuladas nos unitários |
| Estado atual da VPS/cron/escritores | PENDENTE: acesso não disponível |
| Backups consistentes dos dois ambientes | NÃO EXECUTADOS |
| Integridade externa histórica | INFORMADA PELO PROPRIETÁRIO; sem nova verificação direta |
| Upload/download de bundle novo | NÃO EXECUTADOS |
| Restauração real, índices, conteúdo e reconciliação | NÃO EXECUTADOS |
| Capacidade do host de restauração | NÃO INFORMADA/COMPROVADA |
| RPO/RTO medidos | INDISPONÍVEIS |
| P10.6 / produção | BLOQUEADAS |

Recomendação: prosseguir primeiro com acesso e inspeção de leitura; depois apresentar a janela concreta para autorização, executar backups e comprovar recuperação independente. Não avançar à P10.6 com base apenas em CI, SHA histórico ou informação de que há volumes distintos. Produção exige recuperação comprovada e aceite humano. Nenhum desenvolvimento aprovado foi refeito e nenhum script operacional foi alterado nesta retomada.

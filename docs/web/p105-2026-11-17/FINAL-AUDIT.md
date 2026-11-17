# P10.5 final — auditoria e recuperação

17/11/2026. Base desta retomada: `46f0d906bc8a2b3628e8063e51c78db2c3d71d9e`; scripts aprovados: `79b71b33badf4266e7e562b73206954fbe33999e`. PR #25 aberto, draft, sem merge. Checkout inicialmente limpo; nenhum script/aplicação alterado.

**Veredito: BLOQUEADO para concluir P10.5 operacional e liberar homologação humana. Produção permanece BLOQUEADA até aprovação expressa.** Preparação documental pode avançar; não é autorização de implantação.

## Executado pelo Work nesta retomada

- PR/branch/HEAD conferidos pelo conector GitHub; preservado o histórico P10.4, P10.5 BACKUP-RECOVERY/OPERATIONAL/STATUS e roteiro humano P10.3.
- Disponibilidade de acesso conferida: sem agente SSH, configuração de usuário ou known_hosts. Primeira tentativa SSH abortou localmente por permissões de configuração global. Nova tentativa com `-F /dev/null`, BatchMode e StrictHostKeyChecking=yes retornou exit 255, `Network is unreachable`. Não houve autenticação, sessão nem comando executado na VPS. Não se alterou configuração local ou remota para contornar o bloqueio de rede.
- Resolução local do domínio falhou com gaierror. Não prova NXDOMAIN autoritativo e não permite concluir validade/invalidade do certificado. TLS/proxy/DNS continuam sem confirmação direta.
- Código da transação e guards de homologação revisados, identificando a divergência de topologia abaixo.
- Preparados comandos assistidos sanitizados e plano de backup/recuperação/aceite. Não se repetiram campanhas aprovadas de aplicação ou performance sem mudança de código; nenhum teste anterior foi apresentado como nova restauração operacional.

## Estado informado pelo proprietário — aceito como evidência declarada

| Item | Informação recebida | Limite da conclusão |
|---|---|---|
| Backups | Produção e homologação gerados/verificados | IDs, hashes, horários e consistência ainda não revalidados pelo Work |
| Restore anterior | Container existente apollo-backup-teste-301 | Não recriar/reiniciar; inspecionar em leitura |
| Isolamento | Rede none, sem portas/volumes/bind, 512 MiB, CPU 1, restart desativado | Precisa conferir limites/cgroup e Mounts efetivos |
| Produção restaurada | p105_restore_producao_20261117: 20 coleções, 18 documentos | Recontagem pendente; coleções vazias podem explicar documentos < coleções |
| Homologação restaurada | p105_restore_homologacao_20261117: 29 coleções, 36 documentos | Recontagem pendente; não confundir com banco ativo |
| GPG | Consolidado criptografado, chave recuperada/descriptografia testadas no Windows, SHA do recuperado validado | Teste criptográfico não é restauração Mongo end-to-end |
| Google Drive | Backup criptografado e recuperação de chaves copiados/conferidos | Ainda não houve recuperação independente observada pelo Work |
| Recuperação de chaves | Senhas físicas com proprietário | Chave privada/senhas ficam fora da VPS/chat/PR |
| Segunda cópia | Localização independente pendente | Drive único não satisfaz duas localizações independentes |
| Capacidade | 1 vCPU, 1,7 GiB RAM; última amostra ~754 MiB disponíveis, swap usada ~1,4 GiB; disco ~23 GB livres | Informada, não medida nesta retomada; sem série de pico/I/O/reserva do outro site |

Não tratar as contagens como teste de identidade dos dados, integridade financeira ou consistência multicoletânea. Copiar chave de recuperação e ciphertext ao mesmo provedor não cria segundo domínio de falha. Se a chave exportada ao Drive não estiver cifrada/protegida, revisar acesso e proteção em canal privado; não rotacionar ou remover sem plano autorizado.

## Divergências entre histórico e estado informado

1. Relatórios antigos dizem “destino SSH não informado”: IP e porta agora foram fornecidos; bloqueios atuais são conectividade deste executor, fingerprint independente e autenticação disponibilizada. Não publicar endereço de gerenciamento no PR.
2. “Nenhum backup/restore” era a execução anterior do Work: o proprietário agora relata backups/restauração/GPG/Drive concluídos. Atualizar procedência, sem apagar histórico nem afirmar nova execução pelo Work.
3. Plano previa host separado para restore; existe um container de recuperação na própria VPS compartilhada. Rede none não isola CPU/RAM/disco/kernel. Não criar outro Mongo, não aumentar limites, não remover o container; apenas inspeção leve do já existente está autorizada.
4. **Standalone versus transações:** `backend/lib/transactions.py` usa sessão/start_transaction com snapshot/primary/majority e converte falha Mongo em 503 com requisito de replica set. `backend/lib/homologation.py` exige replicaSet=p10 na URI e setName/PRIMARY no hello; `deploy/p10/compose.yml` inicia Mongo com --replSet p10. Se os bancos ativos continuam standalone, a configuração não corresponde à topologia da aplicação homologada. MongoDB 7 ou restauração em standalone não comprovam suporte aos fluxos transacionais. Confirmar topologia em leitura; não converter/reconfigurar banco nesta missão.
5. O ensaio aprovado de backup compara coleções/contagens e reconcilia, mas não certifica índices/conteúdo documento a documento. Isso continua sendo requisito adicional de recuperação, não motivo para reescrever os scripts sem autorização.

## Matriz final

| Etapa | Estado |
|---|---|
| Implementação P10.5 e CI do HEAD aprovado | APROVADOS anteriormente no escopo documentado; preservados |
| Recuperação criptográfica/restore histórico | INFORMADOS PELO PROPRIETÁRIO; sem revalidação remota nesta sessão |
| Saúde dos cinco containers, OOM, logs e recursos | PENDENTES: sem conexão |
| Contagens 20/18 e 29/36 | PENDENTES DE RECONTAGEM |
| Índices, conteúdo e reconciliação financeira recuperados | PENDENTES |
| Ciclo Drive → GPG fora da VPS → novo destino → Mongo → conciliação | NÃO EXECUTADO PELO WORK |
| RPO/RTO | NÃO MEDIDOS; não estimar a partir de teste parcial |
| P10.6 | PLANO PREPARADO, EXECUÇÃO BLOQUEADA |
| P10.7/homologação humana | CHECKLIST PREPARADO, LIBERAÇÃO BLOQUEADA |
| Produção | BLOQUEADA; requer aprovação expressa posterior |

Próximo passo concreto: executar [inspeção assistida](ASSISTED-AUDIT.md) na sessão SSH do proprietário, depois fornecer somente resumos sanitizados. Alternativamente disponibilizar conectividade, host key conferida independentemente e autenticação segura ao Work. A autorização de leitura já existe. O [plano de recuperação e liberação](RECOVERY-READINESS.md) identifica intervenções separadas; nenhuma foi realizada.

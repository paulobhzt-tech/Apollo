# Recuperação, backup e prontidão P10.6/P10.7

Plano preparado em 17/11/2026, sem implantação ou restauração executada pelo Work. Complementa FINAL-AUDIT.md, BACKUP-RECOVERY.md e P10.3-HUMAN-TESTS.md. A instrução atual autoriza somente leitura e documentação; prevalece sobre autorizações gerais de implantação registradas em STATUS.md em sessões anteriores.

## Ensaio completo do GPG — pendente

O proprietário já demonstrou recuperação da chave e descriptografia no Windows. O passo restante não é repetir a exportação de chaves: é ligar essa evidência à recuperação Mongo verificada, preservando chaves fora da VPS.

1. Escolher o ciphertext e SHA-256 aprovados pelo proprietário, com data/ponto de consistência e inventário do conteúdo. Recuperar cópia do Drive para diretório novo em computador/host separado autorizado. Nunca baixar chave privada para VPS nem enviar senha/chave ao Work. Validar SHA do ciphertext antes de descriptografar.
2. No Windows, com GPG já configurado e material de recuperação mantido localmente, usar diretório privado novo e saída inexistente. Exemplo PowerShell (não executado nesta missão):

```powershell
$ApolloEncrypted = Read-Host 'Caminho local do backup cifrado recuperado'
$ApolloExpectedHash = Read-Host 'SHA-256 esperado do ciphertext'
$ApolloActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ApolloEncrypted).Hash
if ($ApolloExpectedHash -notmatch '^[a-fA-F0-9]{64}$' -or $ApolloActualHash -ine $ApolloExpectedHash) { throw 'SHA-256 divergente; parar' }
$ApolloPlain = Read-Host 'Caminho de saida NOVO em diretorio privado'
if (Test-Path -LiteralPath $ApolloPlain) { throw 'Saida existente; nao sobrescrever' }
$ApolloRecoveryClock = [Diagnostics.Stopwatch]::StartNew()
gpg --no-options --no-auto-key-retrieve --no-auto-key-import --no-auto-key-locate --output "$ApolloPlain" --decrypt "$ApolloEncrypted"
if ($LASTEXITCODE -ne 0) { throw 'Falha GPG; preservar evidencias e parar' }
Get-FileHash -Algorithm SHA256 -LiteralPath $ApolloPlain
$ApolloRecoveryClock.Stop()
$ApolloRecoveryClock.Elapsed.TotalSeconds
```

A senha é digitada exclusivamente no pinentry local. Não usar --passphrase em argumentos, variável de ambiente ou arquivo. Não incluir --yes; GPG não deve sobrescrever saída. O tempo acima mede apenas descriptografia/hash, **não RTO completo**. Conferir SHA do plaintext contra valor conhecido e autenticado, não simplesmente anotar um hash novo. Proteger o diretório por permissões do usuário antes de executar; não executar esse bloco na VPS.

3. Inspecionar o formato recuperado sem extrair cegamente: consolidado pode conter vários dumps, manifestos e caminhos. Listar metadados privadamente e rejeitar caminhos absolutos/../links antes de extrair em diretório exclusivo; não publicar listagem sensível. Não presumir que todo .gpg contém um único archive Mongo. Obter os SHA dos dumps de ambos os ambientes.
4. Em host separado com recursos suficientes e sem acesso aos bancos ativos, preparar plano exato e autorização para criar destinos novos. Se necessário transferir plaintext por canal privado verificado somente a esse host; chave privada fica no computador do proprietário. Proibir rede de saída dos dados restaurados e não montar diretórios da VPS.
5. Restaurar cada namespace em destino novo, autenticação e versão/ferramentas compatíveis. Usar somente arquivos recuperados do ciphertext, não os dumps originais já disponíveis. mongorestore real, sem --drop e sem reutilizar bancos originais. Não criar/reconfigurar container na VPS nesta missão.
6. Conferir 20/18 e 29/36 como referências históricas, se os dumps correspondem ao mesmo ponto. Comparar coleção a coleção, índices/opções/uniqueness/TTL e conteúdo privado normalizado, incluindo IDs/marcadores/contadores. Diferenças de ponto de backup requerem novos valores esperados, não ajuste do observado para obter PASS.
7. Executar reconciliação financeira somente sobre dados restaurados no destino isolado: pedidos, pagamentos/estornos, caixa, fiado, estoque/lotes e marcadores. O reconciliador existente recebe mapeamento JSON/BSON, não archive.gz; exportação e dependências devem ser preparadas em host separado. Arquivos privados e achados ficam protegidos; publicar só contagens/categorias e hashes. Nenhum reparo automático.
8. Registrar início/fim UTC por etapa e cronômetro: obtenção externa, descriptografia, extração, restore, índices/conteúdo e reconciliação. RTO de recuperação = início da obtenção até validação completa; RTO operacional ainda inclui abertura controlada/aceite. RPO = referência do incidente menos ponto consistente recuperado; data do upload não é ponto de consistência. Resultado só será APROVADO se todas as etapas tiverem evidência.

O container existente apollo-backup-teste-301 serve para leitura da restauração anterior, mas não demonstra que o backup GPG recuperado é a origem daqueles dados. Não sobrescrevê-lo para criar essa prova. Limpeza de plaintext, containers ou chaves após ensaio depende de autorização específica; manter acesso restrito enquanto aguardam decisão.

## Política proposta de backup — não agendada

| Controle | Proposta | Aceite |
|---|---|---|
| Frequência | Diária após operação e antes de mudanças relevantes; produção/homologação separadas | Janela consistente aprovada e todos os escritores controlados; ausência de janela = bloqueio, não backup declarado consistente |
| Retenção | 7 diárias, 4 semanais, 3 mensais; preservar último restore aprovado, cópia pré-mudança e cópias sob investigação | Até aprovação específica, nenhuma cópia antiga é apagada; alertar disco e suspender novas capturas se reserva insuficiente |
| Integridade | SHA-256 e validação do formato antes da publicação; manifesto/contagens/ponto consistente | Hashes comparados com referência confiável; GZIP/SHA não provam consistência financeira |
| Proteção | Staging privado, nomes exclusivos, GPG/crypt aprovado, chaves e senhas fora da VPS | Não publicar backup, segredos, dumps ou relatórios financeiros privados |
| Cópias | VPS + Drive cifrado + segunda localização independente, idealmente offline/imutável | Segunda conta/pasta no mesmo Drive não equivale a outro provedor/dispositivo/domínio de falha |
| Rotação | Política revisada com lista de cópias protegidas e simulação de seleção | Nenhuma exclusão automática habilitada nesta missão |
| Recuperação | Ensaio mensal e após alteração de formato/chaves/ferramentas/runtime | Cópia recuperada externamente → GPG → Mongo real → conteúdo/índices → reconciliação |
| Monitoramento | Falha, idade da última cópia consistente, última verificação externa/restore, disco/inodes e risco de quota | Primeiro backup diário atrasado gera alerta ao responsável; rotina de checagem diária a confirmar |
| OAuth Drive | Migrar client_id compartilhado para cliente próprio | Ensaiar nova identidade/prefixo sem invalidar destino atual; não alterar credenciais sem autorização |

Responsabilidades propostas: proprietário aprova janela, mantém senhas/chaves e assina aceite; administrador executa/verifica cópias e monitora falhas; revisor financeiro compara saldos/históricos recuperados; operador testa equipamentos e fluxos. Nomes/contatos e agenda permanecem a designar, sem dados pessoais no PR. Não há RPO/RTO contratado ou medido nesta missão.

## Gates objetivos para P10.6 e P10.7

| Requisito | Evidência obrigatória | Estado |
|---|---|---|
| Recuperação P10.5 | Ciclo GPG externo completo, índices/conteúdo/financeiro sem divergência não explicada, segunda cópia independente | PENDENTE |
| Topologia Mongo | hello/URI/runtime coerentes com replica set transacional da aplicação aprovada | DIVERGÊNCIA standalone informada; não alterar em leitura |
| Capacidade compartilhada | Série representativa sem OOM, crescimento sustentado de swap/I/O/PSI, reserva acordada para outro site e orçamento de serviços | NÃO COMPROVADA; última amostra informada 754 MiB disponíveis/1,4 GiB swap não basta |
| DNS/HTTPS | Resolução autoritativa adequada, certificado público válido/cadeia/hostname/renovação, endpoint restrito | NÃO VERIFICADO; resolução local falhou |
| Proxy | Configuração Virtualmin real revisada, origem única, forwarded headers substituídos e confiança limitada | PENDENTE; sem reload nesta missão |
| Runtime | Imagem/digest aprovado, ambiente/banco/volumes exclusivos e dados fictícios | PENDENTE no destino; pacote P10.4 não autoriza produção |
| Autenticação/perfis | Contas sintéticas individuais, negativos 401/403/429 e sessão/logout/cookies verificados no destino | CI histórico não substitui destino |
| Integridade financeira | Trilha humana conciliada e idempotência em concorrência normal; sem duplicidade | PENDENTE |
| Falhas/monitoramento | Readiness, logs sem segredos, métricas e alertas definidos; teste de falha só isolado e autorizado | PENDENTE; sem matar serviços ativos |
| Impressão/equipamentos | Ticket físico fictício em impressora real; gaveta/leitor aplicáveis, browser/dispositivo e confirmação humana | PENDENTE; declarar exclusões por dispositivo, não presumir funcionamento |
| Rollback | Versão/config anterior preservadas, compatibilidade de dados e ensaio isolado revisado | PLANO; nenhum rollback executado/autorizado |
| Aceite humano | Casos H01–H19 aplicáveis do roteiro P10.3 com esperado/observado/evidência, revisão financeira e assinatura | NÃO EXECUTADO |
| Produção | Aceite, recuperação/capacidade comprovadas e aprovação expressa separada | BLOQUEADA |

P10.6 deve começar por plano concreto de destino/proxy/topologia/recursos para autorização, após resolver P10.5. Não converter standalone para replica set, alterar DNS, publicar HTTPS, instalar pacote, abrir tráfego, reiniciar Web/Mongo/Apache ou modificar o outro site com a autorização de leitura atual. P10.7 pode ter fichas de teste preparadas agora; a sessão humana só é liberada após gates técnicos.

Condições de parada na homologação futura: divergência financeira, acesso indevido, dados reais/efeito externo, pressão no outro site, falha de recuperação ou comportamento transacional incompatível. Preservar evidências; não resetar dados para ocultar falha. A interrupção técnica necessária deve estar prevista na autorização da sessão, sem assumir permissão para reiniciar serviços compartilhados.

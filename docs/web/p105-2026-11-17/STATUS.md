> **Missão posterior P10.8 — 17/11/2026:** ver [relatório atual](../p108-2026-11-17/REPORT.md). Autorizadas verificações e correções reversíveis no escopo definido; manutenção exclusivamente de homologação exige pré-requisitos e confirmação de cada janela atual de até 30 minutos. Nenhuma janela/migração foi iniciada pelo Work. Os limites desta missão posterior prevalecem sobre autorizações históricas abaixo. Produção permanece bloqueada.

> **Atualização — missão P10.5 final, 17/11/2026:** a instrução mais recente autoriza **somente leitura e documentação**. Implantação, mudanças de serviços/DNS, restart, exclusões e produção exigem autorização separada; a autorização geral histórica abaixo não permite essas ações nesta missão. Destino SSH foi informado, mas tentativa segura neste executor retornou `Network is unreachable`; nenhuma sessão remota foi estabelecida. Backups/restore/GPG/Drive foram informados pelo proprietário e ainda não revalidados pelo Work. Ver [auditoria atual](FINAL-AUDIT.md), [comandos assistidos](ASSISTED-AUDIT.md) e [plano de recuperação e prontidão](RECOVERY-READINESS.md). **Homologação humana e produção BLOQUEADAS**; divergência standalone versus replica set transacional requer verificação e plano autorizado.

# P10.5–P10.7 — retomada autorizada e prontidão de produção

Data: 17/11/2026. PR #25, branch `homolog/p10-operational-web`.
HEAD recuperado: `a6cd4dedf67bc12f30fcdfade6b581a79a3bc5c9`.
HEAD do pacote ensaiado: `e7b11c065d984144a21532989a33477cfeb73eed`.

## Autorização atual

O proprietário autorizou nesta sessão SSH seguro, inventário e implantação exclusiva na HostGator, condicionados à identidade do servidor, capacidade comprovada, backup recuperável e proteção do outro site. Inclui dependências necessárias, ambiente/banco privados, Apache/Virtualmin/proxy/HTTPS, inicialização, backup criptografado, monitoramento e testes fictícios. Não é necessário pedir novamente essa autorização geral.

Permanecem as condições expressas: interromper implantação sem evidência suficiente de capacidade; não executar operação destrutiva, carga prejudicial ou desativação de proteções; pedir confirmação específica antes de reload/restart compartilhado se houver possibilidade de interrupção do site; pedir confirmação final antes de abrir produção e habilitar dados reais. Nenhum merge está autorizado.

Os documentos P10.3/P10.4 descrevem a autorização ausente naquela entrega histórica. A autorização desta sessão substitui esse bloqueio administrativo; não substitui acesso ou prova técnica.

## Execução realizada nesta retomada

- PR #25 confirmado aberto, draft, sem merge, no HEAD de referência; nenhuma alteração posterior encontrada na branch durante a consulta.
- Relatórios P6/P7/P8/P9/P10 e HOSTGATOR.md recuperados/lidos. Preservados o histórico de reprovação P7/P8, aprovação P9 restrita ao runner e limitações P10.
- Workflow P10 44075810541 confirmado completed/success, tentativa 2; P104 44075810608 completed/success, tentativa 1, ambos no HEAD do pacote acima. São resultados anteriores reconsultados, não novos testes de aplicação.
- Artefato GitHub 14324732733 confirmado disponível/não expirado, 410.140.098 bytes, digest SHA-256 `300a81c65b192475a5a8d97587b8bbdcc05fc6ec92f3bea15e3d91e36bf07e82`.
- Cópia retida novamente verificada integralmente: ZIP SHA-256/tamanho e CRC aprovados; tar SHA-256 `ddc3152583dc0486caf6e7f3ebfb96887ba132bbf7a94c9e17c655b1874e2254`; tamanho/hash dos 18 arquivos do manifesto aprovados.
- SSH cliente disponível neste executor. Nenhum endereço SSH identificado foi fornecido nesta sessão; nenhuma configuração de destino ou identidade via agente SSH disponível foi encontrada. Não se tentou conectar a IP presumido ou usar o domínio de homologação como identidade do servidor.
- Nenhuma conexão SSH, consulta remota, instalação, mudança de serviço/Virtualmin/SELinux/firewall/DNS, emissão TLS, banco remoto, migração, publicação, backup remoto ou carga foi executada. Sem dados reais.

## Matriz de prontidão

APROVADO significa apenas o escopo identificado na linha. Ausência de evidência é PENDENTE, não reprovação medida.

| Requisito | Estado | Evidência / condição restante |
|---|---|---|
| Autorização geral condicionada | APROVADO | Instrução expressa do proprietário nesta sessão |
| Origem e integridade do pacote P10.4 | APROVADO | Artefato/hash/CRC/tar/18 arquivos reconferidos |
| Regressões automatizadas isoladas | APROVADO | P10.4: 413 +3 subtestes, 60 P10 e 44 P6; timeout inicial notebook preservado |
| Backup/restore e retirada do volume no laboratório | APROVADO | P104; não é restauração do site ou da VPS |
| Identidade e acesso seguro à VPS | PENDENTE | Host/IP, porta, usuário, fingerprint independente e autenticação disponibilizada |
| CPU/RAM de pico, swap, disco/inodes/I/O e reserva do site | PENDENTE | Nenhuma medição remota; capacidade NÃO COMPROVADA |
| Serviços, portas/sub-redes e consumo do outro site | PENDENTE | Inventário somente leitura ainda não executado |
| Backup recuperável do site existente | PENDENTE | Evidência de cópia independente e restauração separada |
| Configuração real Apache/Virtualmin/SELinux/firewall | PENDENTE | Laboratório AlmaLinux não certifica a VPS |
| Implantação restrita, DNS e certificado público | PENDENTE | Nenhum endpoint de homologação publicado nesta missão |
| Serviços de inicialização e reinício do host | PENDENTE | Unidade/configuração específica ainda depende do inventário |
| Backups, retenção, destino externo e monitoramento operacionais | PENDENTE | Configuração e teste no destino não executados |
| Restauração isolada e rollback no destino | PENDENTE | Sem ensaio remoto; rollback entre versões não certificado |
| Testes funcionais/segurança/navegadores no destino | PENDENTE | Sem aplicação implantada |
| Homologação humana | PENDENTE | Requer operação real com dados fictícios e aceite registrado |
| Impressoras/equipamentos aplicáveis | PENDENTE | Definir escopo e validar fisicamente |
| Configuração separada de produção | PENDENTE | Sem copiar banco sintético, marcadores ou credenciais de desenvolvimento |
| Confirmação final de produção/dados reais | PENDENTE | Só solicitar após requisitos críticos aprovados |

**Parecer atual: PRODUÇÃO BLOQUEADA; capacidade NÃO COMPROVADA; instalação não iniciada.** Não há critério medido de insuficiência da VPS; também não há evidência para aprová-la. Não se recomenda contratar upgrade por uma medição inexistente.

## Retomada operacional

1. Receber o host/IP de gerenciamento, porta, usuário e fingerprint SHA-256 da chave do servidor confirmada no painel/console por fonte independente. Providenciar autenticação temporária por chave ou outro canal seguro. Não colar senha, chave privada ou token em chat/PR. Endereço IP e login não serão publicados no repositório.
2. Validar a identidade com checagem estrita de host key; nunca usar StrictHostKeyChecking=no ou aceitar fingerprint presumido. Verificar conectividade ao destino informado, sem instalar ferramenta durante inventário.
3. Executar os comandos de leitura e ficha já preparados em [HOSTGATOR.md](../p104-2026-11-17/HOSTGATOR.md) e no checklist P10.3. Revisar logs localmente e publicar somente resumo sanitizado.
4. Se dados de pico/reserva/backup forem insuficientes, parar implantação, registrar faltantes e solicitar as evidências. Não fazer stress no servidor para descobrir se cabe.
5. Se capacidade e recuperação do site forem comprovadas, preparar configuração exclusiva e diff adaptado à VPS; a autorização geral já permite avançar dentro dessas condições. Qualquer reload/restart compartilhado com risco ao site exige a confirmação específica prevista pelo proprietário.
6. Carregar exclusivamente o pacote reconferido, manter Mongo privado e homologação restrita com dados fictícios. Aplicar testes funcionais/segurança sem carga prejudicial; coletar evidências reais e aceite humano.
7. Preparar produção em configuração e persistência separadas, com segredos novos. O pacote P10.4 é de homologação sintética: não basta remover banner, marcador ou guard para permitir dados reais. Validar as diferenças de configuração, integrações e recuperação sem alterar regras financeiras aprovadas.
8. Reavaliar a matriz. Somente com todos os requisitos críticos aprovados apresentar evidências e solicitar a confirmação final do proprietário para entrada em produção.

Bloqueio imediato: acesso ao servidor identificado ainda não disponibilizado. A autorização já está registrada e não precisa ser repetida.

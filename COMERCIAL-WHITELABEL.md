# Apollo PDV comercial — preparação inicial (White Label)

## O que funciona nesta etapa
- O Apollo tem nome do estabelecimento e logo HTTPS configuráveis na tela **Configurações → Empresa & PIX**.
- O login exibe essa marca em vez de um nome fixo da Espeteria.
- Banco novo inicia sem produtos e sem funcionários de demonstração. **Não rode `backend/seed.py` em produção**: esse script apaga coleções.
- O primeiro administrador é criado por terminal autorizado: `docker compose exec apollo python first_run.py`. O PIN não fica em código ou em arquivos de exemplo.
- Um registro local administrativo permite acompanhar clientes, plano, valor e vencimento; não existe integração com cobrança nem bloqueio automático.

## Cadastro inicial de cada instalação
1. Crie uma instalação isolada com banco MongoDB próprio e credenciais exclusivas. **Não configure vários estabelecimentos apontando para o mesmo `DB_NAME` ou coleção**.
2. Publique a instalação em HTTPS com um hostname independente, ex.: `cliente1.seu-dominio.com.br`.
3. Dentro do contêiner da instalação (administrado pelo operador do servidor):
   `docker compose exec apollo python first_run.py`
4. Acesse o login, entre com o PIN criado e registre nome, razão social, logomarca, PIX e dados fiscais em Configurações.
5. Cadastre funcionários, mesas, produtos, impressoras e valide vendas de teste antes de liberar operações reais.

## Painel administrativo privado (já implementado)
O painel web está em `management/panel.py`. Ele oferece cadastro de restaurantes, listagem de planos, status, vencimentos, valor mensal e **registro manual** de pagamentos. É uma aplicação **separada** do PDV e usa banco SQLite administrativo próprio.

No computador que terá o painel (Python 3.11+ instalado):

```powershell
$env:APOLLO_ADMIN_PASSWORD = Read-Host "Senha forte do painel (minimo 16 caracteres)"
$env:APOLLO_LICENSE_DB = "$HOME\\apollo-admin\\licencas.sqlite3"
python -m management.panel
```

Abra `http://127.0.0.1:8787` no mesmo computador. Usuário: `admin`; senha: a que você acabou de definir. **Não exponha a porta 8787 na internet, não use proxy público para esse painel e não coloque a senha no GitHub**. Para usá-lo em uma VPS remota, execute o painel no servidor privado e acesse somente com túnel SSH (`ssh -L 8787:127.0.0.1:8787 usuario@IP-DA-VPS`) — SSH com credenciais individuais e acesso restrito.

Os registros manuais não cobram por Pix, cartão ou boleto, não renovam vencimentos automaticamente, não criam instâncias do cliente e não bloqueiam seu caixa. É um painel administrativo inicial, **não** uma plataforma SaaS pronta.

## Controle de mensalidades (cadastro administrativo local)
O script `management/licenses.py` exige somente Python 3.11+ e SQLite, e foi feito para rodar **somente no computador do proprietário**, fora da aplicação pública:

```bash
export APOLLO_LICENSE_DB=/caminho/seguro/apollo-licencas.sqlite3
python management/licenses.py create --customer "Restaurante Exemplo" --monthly-cents 9900 --days 30 --domain cliente1.seu-dominio.com.br
python management/licenses.py list
python management/licenses.py renew APL-CODIGO --days 30
python management/licenses.py status APL-CODIGO suspended
```

O script **não cobra**, **não integra Pix/cartão**, **não valida pagamentos**, **não suspende automaticamente o acesso do PDV** e **não é um painel web**. É um cadastro inicial para organizar contratos. Mesmo com licença vencida, bloquear um caixa durante o expediente exige regras contratuais, avisos e planejamento de continuidade.

## Arquitetura para venda SaaS
O modelo seguro recomendado é **uma instância de aplicação e um banco isolado por cliente**, com backups separados, credenciais distintas e domínio individual. O `deploy/vps/compose.yaml` atual é um modelo de **uma instalação**, não um multitenant pronto para atender vários clientes. Hospedar diversos clientes na mesma VPS exige um gateway HTTPS que encaminhe os subdomínios às instâncias certas e uma rotina automatizada de provisionamento, monitoramento e recuperação.

A VPS NVMe 2 tem capacidade limitada. Meça RAM, CPU, disco e operações reais antes de prometer atendimento simultâneo a diversos estabelecimentos. Para escalar, use infraestrutura separada ou uma arquitetura multitenant projetada e auditada.

## Etapas ainda pendentes antes de vender
- Painel web protegido do proprietário: primeira versão administrativa pronta; endurecimento, backup, observabilidade e autenticação forte ainda pendentes.
- Provisionamento automático de novas instâncias e bancos isolados.
- Serviço de licenciamento por instância, renovações e notificações.
- Gateway de pagamentos e emissão fiscal conforme regras aplicáveis.
- Testes de integração, segurança, backup/restore e homologação em Windows, celulares e impressoras.
- Políticas de LGPD, contratos, condições de suporte e disponibilidade.

**Nunca publique a base de licenças, senhas, PINs ou arquivos `.env` no GitHub.**

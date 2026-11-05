# Apollo PDV — demonstração comercial separada (ainda não publicada)

Este ambiente serve para apresentar o Apollo a compradores, com mesas, produtos, comandas, pedidos, relatórios e funcionários **totalmente fictícios**. Não importa dados da espeteria nem de clientes pagantes. O aviso de demonstração aparece na interface e a marca é "Restaurante Demonstração Apollo".

## Antes de executar

- VPS com status Ativo, IP público, Linux/Docker Compose v2 configurados e domínio apontando para ela.
- Serviço Caddy central configurado conforme `deploy/saas/README.md` e imagem `apollo-pdv:latest` construída.
- Capacidade de memória e disco checada: uma VPS de 2 GB pode não suportar bem várias instâncias MongoDB + Apollo.
- A demonstração inicia **sem site publicado**, intencionalmente.

## 1. Criar os arquivos isolados

Na raiz do projeto (preferencialmente com usuário administrativo restrito):

```bash
python3 -m management.demo_setup --base /opt/apollo-saas prepare --slug demo-apollo --domain demo.SEUDOMINIO.com.br
```

O script faz três coisas: gera uma aplicação e MongoDB separados em `/opt/apollo-saas/tenants/demo-apollo`; usa banco `apollo_demo_demo_apollo`; e deixa a rota Caddy como `demo-apollo.disabled` para ninguém acessar antes de colocar autenticação. O arquivo `.env` contém segredos gerados automaticamente e não pode ir para o GitHub.

## 2. Conferir e iniciar apenas a instalação demo

```bash
cd /opt/apollo-saas/tenants/demo-apollo
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d
```

**Não rode** `docker compose down -v`, porque isso apaga o volume MongoDB.

## 3. Criar conteúdo demonstrativo

Use exclusivamente dentro da pasta da demonstração:

```bash
cd /opt/apollo-saas/tenants/demo-apollo
docker compose exec -e APOLLO_ALLOW_DEMO_RESET=RESET_DEMO_DATA apollo python seed.py
```

O comando apaga os dados **somente do banco da demonstração** e coloca novos produtos, mesas e vendas fictícias. Ele mostra os PINs aleatórios criados naquele momento no terminal do operador. Armazene-os em local seguro e só forneça acesso a quem for autorizado a usar a demonstração.

Os PINs **mudam a cada execução** do seed. Não publique PINs em um site ou manual. O script exige tanto o nome de banco `apollo_demo_...` quanto autorização explícita. Não execute esse comando em instalação de cliente.

## 4. Habilitar autenticação no gateway, antes de publicar

Gere um hash bcrypt do Caddy para uma senha longa e exclusiva usando um terminal administrativo de confiança. Nunca coloque a senha pura nos parâmetros de comando, histórico do shell, GitHub ou chat. Em seguida:

```bash
python3 -m management.demo_setup --base /opt/apollo-saas enable --slug demo-apollo --bcrypt-hash 'HASH_BCRYPT_GERADO_PELO_CADDY'
```

O script recusa senha simples e só aceita hash bcrypt. A configuração resultante exige usuário `visitante` e a senha correspondente, **antes** de encaminhar a requisição ao Apollo. Verifique a configuração Caddy e recarregue manualmente:

```bash
cd /opt/apollo-saas/gateway
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
```

O subdomínio precisa resolver para a VPS, e as portas 80/443 devem estar liberadas para emissão do certificado HTTPS. Nunca habilite uma rota demo sem autenticação e TLS.

## 5. Validar a demonstração

- Acesso sem senha retorna solicitação de autenticação HTTP.
- HTTPS tem certificado válido, sem alertas do navegador.
- A faixa **DEMONSTRAÇÃO — DADOS FICTÍCIOS** aparece em todas as telas.
- Nome do estabelecimento no login: Restaurante Demonstração Apollo.
- Conferir produtos, mesas, comandas, PDV, cozinha, caixa, estoque e relatórios.
- Confirmar que operações no demo não aparecem em nenhuma instalação real.
- Simular vendas, estornos e fechamento de caixa; evitar qualquer Pix, dados bancários ou pagamentos reais.

## 6. Reiniciar a demonstração

Execute novamente o comando de `seed.py` do passo 3 **somente quando não houver compradores usando a demo**. Ele recria dados fictícios e altera todos os PINs. De preferência, faça a reposição em horário combinado, não durante apresentações.

## Limitações

A demonstração está **preparada em código, não publicada**, enquanto a VPS não estiver ativa. Os testes do GitHub verificam isolamento, configuração, proteção da rota e compilação, mas não substituem teste operacional com usuários, impressoras, celular ou servidor real. Dados demonstrativos podem conter imagens externas e exemplos antigos de cardápio — são apenas exemplos e não devem ser confundidos com a marca de qualquer cliente. Nunca use este ambiente como caixa real.

# P64.8 · verificação e retorno da candidata experimental

A base para retorno é `5111b8fcda3fa53399b1c47cf870026750f8f874`. Identifique também o SHA atualmente servido na VPS. Um retorno ao serviço ativo usa seu SHA e seu próprio backup, que podem ser diferentes da base de código deste ensaio.

## Conferência em laboratório isolado

Extraia o artefato Docker da execução da branch experimental. Na pasta do pacote:

```bash
sha256sum -c SHA256SUMS.txt
sha256sum -c SHA256WEB.txt
sha256sum -c SHA256ROLLBACK.txt
docker load -i Apollo-P63-Espeteria-Candidata.tar.gz
docker load -i Apollo-P63-Rollback.tar.gz
```

No checkout experimental, aponte `PACOTE` para o diretório absoluto já conferido. Execute em um host de laboratório com Docker e MongoDB descartável:

```bash
sha=$(cat "${PACOTE:?Informe o diretório do pacote}/source-commit.txt")
test "$sha" = "$(git rev-parse HEAD)"
test "$(docker image inspect "apollo-p63-candidata:$sha" --format '{{.Id}}')" = "$(cat "$PACOTE/docker-image-id.txt")"
bash deploy/vps/test-p63-rollback.sh \
  "apollo-p63-candidata:$sha" \
  apollo-p63-rollback:5111b8fcda3fa53399b1c47cf870026750f8f874 \
  /tmp/apollo-p648-ensaio
```

## Auditoria administrativa na HostGator

Com acesso autorizado, execute somente inspeções de leitura:

```bash
bash deploy/vps/audit-homologation-host.sh
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all-zones
sudo nft list ruleset
docker network ls
```

Confira o manifesto servido, o VirtualHost, a porta de loopback, as redes internas, a política de DNS e a identidade da réplica MongoDB. Use o console administrativo para confirmar credenciais e configurações locais, preservando os segredos. Valide a autenticação com uma conta de teste autorizada, incluindo a resposta do login, os atributos dos cookies, a sessão após recarga e o log correspondente do Apache e da API. Registre os resultados sem gravar o valor dos cookies.

Uma candidata para avaliação exige serviço, volumes, conta de banco, rede e porta próprios. A publicação exige isolamento comprovado, retorno ensaiado no próprio host e autorização expressa. Para uma instalação que já use o apontamento estático auditado, siga os comandos de troca e reversão do [roteiro Apache](P60-APOLLO-3.0.1.md#procedimento-de-ativação-e-rollback). Em uma instalação com proxy para contêiner, preserve o serviço anterior e valide o retorno do proxy à sua porta de loopback antes de solicitar a troca.

Para impressão física de 80 mm, confirme o SHA do agente C#, a impressora e a saída no papel usando os dados fictícios do [roteiro operacional](P64-6-ROTEIRO-OPERACIONAL.md). O teste do agente, da fila ou do spooler registra a respectiva etapa.

# P62 — Apollo PDV 3.0.1: auditoria inicial OCI e bloqueios

Data: 2026-11-24. Branch: `audit/p62-rollback-docker-homologacao`.
Base P61.1: `1320c709c969c98ebe9fab3598250b0fa0e2e4f2`.

## Execução efetiva em laboratório local
- Pacote de entrada: `apollo-legado-reconstituido.tar.gz`, 239.026.825 bytes.
- SHA-256 calculado: `0f591972d707d9e2f8b6b3fb8e41f3ced0263bcc1a844784cf9022f00fc4e899` — corresponde ao esperado.
- OCI: 16/16 blobs `blobs/sha256` com hash válido.
- Índice OCI de referência: `sha256:79bd8f288f495818dc83680a6f855d97cec6bacebbec59d575a6994325faa402`.
- Plataforma do manifesto: `linux/amd64`; configuração Docker `sha256:6936d7f426a6077a86bf0dda7b38cee3fbea8031d7f505182e795eec98c60bea`; 10 camadas.
- Reconstituição estática dos arquivos `/app/web` por sobreposição ordenada das camadas: 36 arquivos presentes, 36/36 hashes idênticos ao manifesto legado coletado; zero ausentes, extras ou divergentes.
- A imagem legada está disponível como arquivo OCI no ambiente local, mas não foi importada nem iniciada. O índice OCI não é necessariamente o ID local de imagem reportado por `docker image inspect`.

## Não executado — bloqueios
- Docker, Podman, Nerdctl, Buildah e containerd CLI indisponíveis no executor local. Sem importação, inicialização, logs de contêiner ou rollback operacional.
- O pacote OCI está no ambiente de conversa, **não** no GitHub Actions; nenhuma transferência do binário para runner remoto foi realizada. Não afirmar que o runner possui a imagem.
- Nenhuma evidência nova de `firewalld`, `nftables`, `iptables`, permissões MongoDB ou isolamento efetivo da VPS.
- Não foram executados novos testes funcionais ou físicos nesta etapa. CI P61 anterior não equivale a CI P62.

## Critérios de desbloqueio
1. Em executor Docker autorizado e descartável, importar pacote OCI **verificando o digest antes**; conferir `docker image inspect`, arquitetura, camadas, 36 hashes e inicialização com dados fictícios.
2. Ensaiar legado → P61 → falha → legado com banco descartável, reversão de rotas e verificação das filas; repetir e registrar logs, hashes, duração e dados.
3. Coletar regras efetivas e sanitizadas do firewall e escopo de identidade MongoDB sem consultar coleções de produção.
4. Preservar `teste.apollo-pdv.com` em `18081`; qualquer troca de VirtualHost exige isolamento comprovado e autorização específica.
5. Validar Firefox/WebKit e dispositivos físicos conforme critérios operacionais.

**Decisão: P62 BLOQUEADA para ativação em homologação e para uso na loja.** Nenhum deploy, merge ou alteração de produção foi realizado.

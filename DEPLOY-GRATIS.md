# Apollo PDV — publicação gratuita fora da Emergent

Este repositório contém `render.yaml` e `Dockerfile` para publicar o mesmo backend e frontend em uma única origem HTTPS no Render. O banco deve ser um MongoDB Atlas Free externo; **não** armazene vendas no filesystem temporário do Render.

## Configuração necessária

1. Em https://www.mongodb.com/cloud/atlas crie um projeto e um cluster Free, crie um usuário de banco com senha forte e autorize somente os IPs necessários. O Render Free pode utilizar endereços de saída dinâmicos: verifique as opções de rede do seu projeto antes de permitir conexões. Nunca inclua a URI do banco no GitHub.
2. Em https://dashboard.render.com/ conecte o repositório `paulobhzt-tech/Apollo` e selecione **New → Blueprint**. Escolha a branch `paulobhzt-tech/Apolo` e o arquivo `render.yaml`. Confirme o plano **Free**, sem mudar para plano pago.
3. Quando o Render pedir `MONGO_URL`, cole a URI de conexão do Atlas (secreta). O `DB_NAME` será `apollo_pdv`. As demais variáveis principais são geradas ou pré-configuradas no Blueprint.
4. Aguarde o serviço terminar o deploy e verifique `https://<seu-servico>.onrender.com/api/`. Esse endereço **é criado pelo Render**; não há URL válida antes disso.
5. No GitHub, em **Settings → Secrets and variables → Actions → Variables**, configure `PDV_SERVER_URL` com a URL HTTPS real atribuída pelo Render. Só então execute o workflow **Instalador Windows**. O instalador receberá a URL no processo de compilação.
6. No Windows, se o Apollo já foi instalado anteriormente, revise `%APPDATA%\\Apollo PDV\\config.json` e substitua o endereço antigo, porque o arquivo de configuração do usuário prevalece sobre os novos defaults.

## Cuidados operacionais

- Render Free entra em suspensão após cerca de 15 minutos sem tráfego. O primeiro acesso pode demorar aproximadamente um minuto. **Não é recomendado como servidor único de um PDV comercial em horários críticos**.
- Atlas Free tem limites de espaço e operações. Não há migração automática dos dados da Emergent: exporte e restaure um backup somente após validar compatibilidade e integridade.
- O conteúdo de imagens/arquivos guardados no disco local do servidor pode se perder. Use armazenamento externo para uploads persistentes.
- A URL de pré-visualização da Emergent foi retirada do padrão do desktop, mas a publicação do Render e a conexão Atlas precisam ser autorizadas nas respectivas contas.
- Para funcionar sem internet e manter caixas, garçons e cozinha operando, prefira o servidor local HTTPS da loja, já previsto em `local-server/`.

# PDV 3.0 para Windows — Espeteria Churras Buguer

Aplicativo desktop (Electron) que usa **o mesmo servidor e o mesmo banco do sistema publicado**.
Nada muda no site: navegador e celulares continuam funcionando igual.

## Como funciona
- **Com internet**: abre o endereço publicado (sempre a versão mais nova, mesmos dados).
- **Sem internet**: abre a cópia das telas que vem dentro do instalador. O PDV continua vendendo
  com o cardápio salvo e o último operador deste computador. As vendas ficam num arquivo **criptografado
  pelo Windows** (`%APPDATA%\PDV 3.0\pdv-dados.bin`).
- **Quando a internet volta** (verificado a cada 15 s): o app volta para o sistema online e envia as vendas.
  Cada venda tem código único (`pc-xxxxxx-…`): reenviar **nunca duplica**. O servidor recalcula os preços
  e baixa o estoque quando a venda chega. Vendas recusadas (ex.: caixa fechado) ficam em
  *Configurações → Sincronização* para reenviar ou descartar; nada é apagado sem você ver.
- **Impressão direta**: em *Configurações → Impressoras*, escolha a "Impressora no Windows" de cada
  ambiente/caixa. Tickets, pré-conta e cupom saem sem janela de confirmação.
- Abre junto com o Windows, uma única janela, F11 = tela cheia, F5 = recarregar.

## Endereço do servidor
Fica em `config.default.json` (vai no instalador) e, depois de instalado, em
`%APPDATA%\PDV 3.0\config.json` — pode ser trocado sem reinstalar:
```json
{ "serverUrl": "https://SEU-ENDERECO-PUBLICADO", "startWithWindows": true, "fullscreen": false }
```

## Gerar o PDV-3.0-Setup.exe
### Opção A — GitHub (recomendado)
1. Envie o projeto para o GitHub (botão "Save to GitHub" na Emergent).
2. No repositório: *Settings → Secrets and variables → Actions → Variables* → crie `PDV_SERVER_URL`
   com o endereço publicado.
3. *Actions → Instalador Windows → Run workflow*. Ao terminar, baixe o artefato **PDV-3.0-Setup**.

### Opção B — no seu PC Windows
Instale Node.js 20 e Yarn (`npm i -g yarn`), depois na pasta do projeto:
```bat
cd desktop
yarn install
set PDV_SERVER_URL=https://SEU-ENDERECO-PUBLICADO
yarn dist
```
O instalador sai em `desktop\dist\PDV-3.0-Setup.exe`. Para testar sem instalar: `yarn web && yarn start`.

## Observações
- O instalador não é assinado digitalmente: o Windows pode mostrar "Editor desconhecido" →
  *Mais informações → Executar assim mesmo*. Para remover o aviso é preciso um certificado de assinatura de código.
- Nenhuma senha/chave vai dentro do .exe; o login continua sendo o PIN.
- Desinstalar não apaga as vendas pendentes deste computador.
- Offline cobre as vendas de balcão deste computador. Mesas, cozinha (KDS), delivery e celulares dos garçons
  precisam de internet, porque o servidor está na nuvem.

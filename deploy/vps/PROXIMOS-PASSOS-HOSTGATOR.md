# Apollo PDV — próximas etapas após primeiro login na VPS HostGator

Estado confirmado pelo operador em 05/11/2026: AlmaLinux 9.8, IP 143.95.184.142, SSH **22022**, Docker e Compose instalados, MongoDB e Apollo executando; primeira conta administrativa criada. O Apollo está acessível **somente** via túnel SSH com mapeamento privado 127.0.0.1:18080 -> contêiner 10000. A VPS tem 1,7 GiB RAM: não publicar vários restaurantes antes de testar capacidade.

## 1. Diagnóstico seguro, sem modificar a VPS

Na conexão SSH já autorizada, execute:

```bash
cd /opt/apollo
git pull
python3 -m management.vps_preflight
```

Não cole senhas, conteúdo do `.env` ou tokens no chat. O diagnóstico verifica se os dois serviços estão executando e se o domínio ainda é temporário, sem mostrar segredos.

## 2. Registrar domínio e habilitar HTTPS

É necessário registrar um domínio sob seu controle. Exemplo **ilustrativo, não registrado**: `seudominio.com.br`.

1. No painel DNS do seu registrador, aponte `pdv.seudominio.com.br` (registro **A**) para `143.95.184.142`.
2. Confirme que o domínio resolve para esse IP. Antes de alterar o firewall, confira que SSH TCP 22022 está permitido em firewalld e no painel do provedor, idealmente restrito ao seu IP. Não abra a porta 22 por engano.
3. Autorize TCP 80/443 (e UDP 443 se desejar HTTP/3) no firewall do AlmaLinux **após** verificar a zona ativa e no firewall da HostGator. Não exponha TCP 27017, 10000 ou 18080. Não desative o firewall.
4. Faça backup e registre o valor atual de `APOLLO_DOMAIN`, sem exibir o `.env` ou credenciais no chat. Substitua **somente** o domínio temporário no `.env` por `pdv.seudominio.com.br`. Preserve as senhas MongoDB originais.
5. Valide `docker compose config --quiet`. Inicie o proxy com `docker compose up -d --no-build caddy`. Verifique DNS, logs e HTTPS, e só então teste o login pelo navegador.

**Atenção:** o `APP_URL` e cookie `secure` do Apollo usam HTTPS em produção. O túnel HTTP local da fase de testes **não** substitui TLS para acesso público. Antes de expor o site, reveja proxy, certificados, proteção CSRF e autenticação. O subdomínio deve ter certificado válido antes de entregar o instalador Windows.

## 3. Gerar o instalador Windows

O aplicativo Electron é compilado por `.github/workflows/windows-installer.yml`, com nome `Apollo-PDV-Setup.exe`. **Não** insira IP num instalador: ele foi planejado para se conectar à URL HTTPS oficial.

Após HTTPS validado:
1. Abra o repositório GitHub → Settings → Secrets and variables → Actions → Variables e configure `PDV_SERVER_URL` com a URL completa, por exemplo `https://pdv.seudominio.com.br`.
2. GitHub → Actions → `Instalador Windows (Apollo-PDV-Setup.exe)` → Run workflow.
3. Se o workflow concluir, baixe o artefato `Apollo-PDV-Setup` e instale primeiro em **um Windows de testes**, não no caixa de produção.
4. Verifique login, impressoras, vendas, PDV mobile e comportamento sem rede antes de qualquer uso comercial. O modo offline necessita homologação em campo. Instaladores sem assinatura de código podem exibir alertas do Windows SmartScreen.

Sem domínio e HTTPS ainda não há instalador configurado para o servidor definitivo.

## 4. Painel comercial, licença e Pix

- `management/panel.py`: painel **privado** de clientes e vencimentos, acessível apenas em localhost/SSH, separado do banco MongoDB da loja.
- `management/pix_billing.py`: geração de Pix avulso no Mercado Pago e conciliação por consulta autenticada; não executa cobranças sem token privado nem agenda renovações automaticamente.
- Configure `APOLLO_LICENSE_DB`, `APOLLO_ADMIN_PASSWORD` e `MP_ACCESS_TOKEN` somente no ambiente administrativo protegido, nunca no GitHub, no browser ou em screenshots.
- Antes de operar, homologue tarifas, credenciais de produção, conciliação, reemissão, cancelamento e erros de rede. Implemente agendamento e backup externo da base comercial.
- Nem o painel nem a licença administrativa bloqueiam automaticamente o caixa dos clientes. Esse comportamento requer projeto, contrato, aviso prévio e testes de continuidade.

## Checklist para clientes pagantes

- [ ] Domínio registrado, DNS validado, certificado HTTPS válido
- [ ] Firewall revisto: SSH 22022, portas web 80/443; sem MongoDB público
- [ ] Usuários, permissões, PIN e vendas homologados
- [ ] Impressora real, estoque, caixa e pagamentos testados
- [ ] Backups externos criptografados e restauração completa testada
- [ ] Monitoramento de uso de RAM, disco, disponibilidade e logs
- [ ] Instalação Windows gerada e testada em computador real
- [ ] Atendimento, LGPD, contrato e cobrança aprovados
- [ ] Capacidade da VPS medida antes de instalar outros restaurantes

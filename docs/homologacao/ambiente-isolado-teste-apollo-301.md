# Apollo PDV 3.0.1 — ambiente de homologação isolado

## Estado
Preparação documentada. **Não há implantação, DNS ou SSL confirmados.** Não publicar automaticamente.

## Regras obrigatórias
- Produção `pdv.apollo-pdv.com` intocada: não modificar Apache/ProxyPass, banco, variáveis, certificados, dados ou release atual.
- Ambiente pretendido: `teste.apollo-pdv.com`, com DNS e TLS próprios, virtual host separado e diretório/serviço isolados.
- Backend de homologação em porta distinta, vinculada a loopback; **banco de dados de teste independente**, sem credenciais de produção e sem cópia de dados pessoais ou financeiros reais.
- Desativar cobrança, integrações financeiras, emissão fiscal, notificações reais, delivery externo e qualquer ação com efeito de produção.
- Exigir autenticação e limitar acesso aos testadores. Backups e rollback próprios do ambiente de homologação.
- Não alterar a branch principal, não executar merge, não criar release comercial.

## Checklist antes de ativar
- [ ] Confirmar acesso administrativo autorizado à VPS, provedor DNS e configuração de SSL, sem compartilhar senhas em chats ou commits.
- [ ] Identificar Apache/Nginx e diretórios atuais, preservando configuração e backup da produção.
- [ ] Criar DNS `teste.apollo-pdv.com` apontando ao servidor correto.
- [ ] Provisionar virtual host HTTPS exclusivo, certificado válido e reverse proxy para serviço de homologação isolado.
- [ ] Provisionar banco de dados de teste vazio e contas de teste; verificar ausência de acesso ao banco real.
- [ ] Compilar o frontend do commit escolhido da branch `feat/apollo-3.0.1-caixa-offline-auditoria`.
- [ ] Validar navegação por grupos sem rolagem horizontal e atalho Ctrl+K no Chrome e Electron.
- [ ] Validar login, permissões, cadastros, caixa fictício, filas offline, restauração, auditoria e instalação Windows 10/11.
- [ ] Registrar hash do artefato, commit, evidências e falhas; obter aprovação humana antes de produção.

## Observação diagnóstica
A interface publicada em produção apresenta menu horizontal antigo. O aplicativo Electron pode carregar telas do servidor quando online; por isso uma recompilação local não corrige necessariamente a UI publicada. O instalador de teste existente usa `http://localhost:18080` e não deve ser tratado como cliente de produção.

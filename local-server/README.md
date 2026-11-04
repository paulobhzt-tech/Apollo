# Apollo PDV — Servidor local na loja (IP fixo)

Use quando a loja precisa funcionar **sem internet** com vários aparelhos (caixas, garçons, cozinha) na rede Wi-Fi.

1. Escolha um PC que fique sempre ligado. No roteador, reserve um **IP fixo** para ele (ex.: `192.168.0.10`).
2. Copie a pasta do projeto para esse PC e rode, como Administrador:
   `powershell -ExecutionPolicy Bypass -File local-server\instalar-servidor.ps1`
   - Instala Python, MongoDB e o servidor (porta **8001**), inicia junto com o Windows e libera o firewall.
   - Agenda o **backup local automático** todo dia às 03:00 (fica no próprio servidor, em Configurações → Backup).
3. Primeiro acesso: `local-server\criar-admin.ps1 -Nome "Paulo" -Pin 1234`
   ou restaure um backup da nuvem em Configurações → Backup.
4. Nos caixas (app Apollo PDV): **Configurações → Sistema → Adicionar servidor** `192.168.0.10:8001` → **Usar**.
5. Celulares: abra `http://192.168.0.10:8001` no navegador (Wi-Fi da loja).

Observações
- O servidor local tem banco próprio, separado do sistema publicado na nuvem. Leve os dados com backup/restauração.
- O backup no Google Drive também funciona no servidor local (precisa de internet e das credenciais do Google).
- Configurações do servidor ficam em `C:\ApolloPDV\backend\.env` (`COOKIE_SECURE=false` porque a rede local usa http).

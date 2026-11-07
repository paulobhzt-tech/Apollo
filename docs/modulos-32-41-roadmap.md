# Apollo PDV 3.0 — Planejamento aprovado: módulos 32 a 41

**Autorização do proprietário:** incluir os módulos 32 a 41 no planejamento. **Prioridade absoluta:** robustez e estabilidade da versão de testes Windows. **Ambiente de produção:** não alterar nem publicar sem autorização específica. **Branch de desenvolvimento:** `fix/windows-production-server`.

## Módulos e critérios mínimos de aceite

| Nº | Módulo | Critérios de aceite |
|---|---|---|
| 32 | Backup automático e recuperação | Backups agendados, criptografados, com retenção e restauração testada; não armazenar segredos em logs. |
| 33 | Antifraude e auditoria inteligente | Registro imutável ou resistente a adulteração de cancelamentos, descontos e alterações financeiras; alertas configuráveis e controle de acesso. |
| 34 | Central de integrações | Conectores desacoplados, credenciais protegidas, webhooks autenticados, idempotência, retries e painel de status. |
| 35 | Painel do proprietário no celular | Métricas de vendas e caixa com permissões por estabelecimento; atualização segura e conciliação com relatórios. |
| 36 | Promoções inteligentes | Happy hour, combos e descontos com regras de prioridade, vigência e auditoria; testes de conflitos e preços. |
| 37 | Controle de chope e bebidas | Cadastro de barris (incluindo 30 e 50 litros), conversão de unidades, consumo, perdas, custo e margem; integração ao estoque. |
| 38 | Modo emergência | Operação essencial durante queda de rede, fila local segura, IDs únicos, reenvio idempotente e resolução de conflitos sem duplicar cobranças. |
| 39 | Conciliação financeira automática | Cruzar pagamentos, taxas e recebíveis por identificadores, detectar divergências e permitir revisão humana. |
| 40 | Gestão de múltiplas unidades | Isolamento de dados por empresa/unidade, permissões e relatórios consolidados; testes de vazamento entre unidades. |
| 41 | Apollo IA avançado | Consultas autorizadas sobre indicadores reais, explicações verificáveis, limites de acesso e consentimento explícito para IA externa. |

## Sequenciamento

1. **Estabilização Windows:** login/permissões, mesas/comandas, cozinha, pagamentos/caixa, estoque, operação offline, backup e recuperação, instalador e testes automatizados.
2. **Segurança financeira e operação:** módulos 32, 33, 37, 38 e 39, conforme dependências e maturidade do núcleo.
3. **Comercial e integrações:** módulos 34, 35, 36, 40 e 41, de modo incremental.
4. Manter os módulos 13–31 já planejados no backlog; evitar duplicar funções existentes.
5. Nenhum módulo é considerado concluído só por estar documentado. Exigir implementação, testes e validação operacional.

**Status inicial:** planejamento aprovado; implementação e homologação dos módulos 32–41 pendentes.

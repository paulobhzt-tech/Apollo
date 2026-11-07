# Integração opcional: WhatsApp Bot

## Objetivo
Oferecer atendimento automatizado por restaurante, sem obrigar o cliente do Apollo a contratar WhatsApp Business Platform.

## Requisitos
- Módulo desativado por padrão, com ativação individual por empresa.
- Integração via API oficial WhatsApp Business Platform (Cloud API) e webhooks HTTPS.
- Credenciais por empresa armazenadas de forma segura; nunca expor tokens ao frontend ou logs.
- Validar assinatura de webhooks, idempotência de eventos, limites de requisição e isolamento entre empresas.
- Associar cada número de telefone à empresa correta; não permitir acesso cruzado a pedidos, clientes ou cardápios.
- Fluxos: boas-vindas, consulta de cardápio, criação de pedido, delivery, consulta de status, reserva (quando disponível), atendimento humano.
- Exigir confirmação explícita do cliente antes de registrar pedido ou cobrança; nunca confirmar pagamento somente por mensagem.
- Notificações proativas apenas com consentimento e modelos aprovados quando exigidos pela Meta.
- Registrar histórico mínimo e política de retenção conforme LGPD, com opção de exclusão/exportação.
- Falhas na integração não devem bloquear PDV, caixa, cozinha ou operação offline.
- Permitir configuração de horários, mensagens e habilitação de funcionalidades por empresa.
- Documentar requisitos de contratação, eventuais tarifas da Meta e processo de configuração.

## Critérios de aceite
1. Empresa sem módulo ativo não envia nem recebe eventos do bot.
2. Webhook inválido ou repetido não cria pedidos duplicados.
3. Pedido de WhatsApp só entra no PDV após confirmação e validação dos itens/preços no servidor.
4. Conversa pode ser transferida a atendente humano.
5. Eventos e credenciais de uma empresa nunca aparecem em outra.
6. Testes automatizados cobrem assinatura, idempotência, autorização, fluxo de pedido e indisponibilidade externa.

## Status
Especificação adicionada ao planejamento. Implementação, homologação e ativação ainda pendentes.

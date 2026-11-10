# Apollo 3.0.1 — etapa 1 de homologação

Data: 10/11/2026. Branch: feat/apollo-3.0.1-caixa-offline-auditoria.

## Implementado nesta etapa
- Caixa: F4 exige confirmação antes de limpar itens, consistente com o botão Limpar. Atalhos F2 e busca por código já existiam.
- Offline: pausa no primeiro erro transitório (rede, autenticação, conflito ou servidor), preservando a ordem dos registros restantes para próxima tentativa. Mantida a referência idempotente.
- Auditoria inicial: evento de criação persistido junto ao pedido com operador, horário e referência; sem PIN, senha ou CPF no evento. Replay de venda de outro operador exige administrador.
- Corrigido mock dos testes offline: isolamento do banco completo evita acessar Mongo real por handles temporários do Motor.
- Corrigido escape de seletores CSS do tema claro.
- Windows: push nesta branch gera canal test apontando localhost:18080, mesmo se solicitado production. Empacotamento usa --publish never; não cria release. Canal manual padrão agora test.
- CI: validação frontend e regressões offline habilitadas nesta branch.

## Evidências locais
- Python: 20 testes aprovados e 3 subtestes (offline/replay, autenticação, CSRF, demo guard).
- Frontend: 2 testes Vitest aprovados (pausa/reenvio FIFO e deduplicação).
- Desktop: 3 testes Node aprovados (conexão/configuração).
- Compilação Python e build TypeScript/Vite aprovados. Build inicial apontou CSS inválido corrigido; bundle principal ainda excede 500 kB.

## Pendências e limites
- Confirmar CI do commit e disponibilização do artefato Apollo-PDV-Setup-test; nenhum executável foi validado localmente neste ambiente Linux.
- Smoke automático é Windows Server 2025/2022: não substitui homologação real em Windows 10 e 11, impressoras, permissões, reinicialização e atualização.
- Instalador de teste exige backend de homologação via túnel em localhost:18080; não inclui servidor Mongo/API.
- Auditoria é inicial, embutida no pedido, sem garantia criptográfica contra alteração do banco; painel, cancelamentos/estornos, alertas e segregação completa ainda precisam ser implementados.
- Exercitar queda de energia, armazenamento cheio, múltiplas janelas, mudança de operador, expiração de sessão, preços/estoque alterados e falha após pagamento antes de cozinha/estoque.
- Reprocessamento legado sem waiter_id mantém comportamento anterior; dados existentes precisam de revisão.
- Não houve publicação nem alterações em produção. Não liberar vendas reais com esta etapa.

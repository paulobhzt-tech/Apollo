# Apollo PDV 3.0 — plano de melhorias e homologação

Branch de trabalho isolada. **Não mesclar ou publicar em produção** antes de revisão, CI e homologação em Windows 10/11 e celular.

## Etapa 1 — piloto 3.0.1
- [ ] Caixa ultrarrápido: favoritos, busca por nome/código, atalhos acessíveis, pagamento com poucos cliques, sem bypass de caixa fechado.
- [ ] Offline inteligente: persistência local segura, fila de operações, IDs idempotentes, reconexão sem perda de estado, tratamento de conflitos e isolamento por estabelecimento.
- [ ] Auditoria antifraude: eventos imutáveis para descontos, cancelamentos, estornos, reaberturas, sangria e suprimento; ator, data, justificativa, estabelecimento e correlação.
- [ ] Corrigir formulários de fornecedores e insumos reportados na homologação.
- [ ] Menu superior compacto com ícones e sem rolagem horizontal, agrupado por área.
- [ ] Instalação Windows: validar build, login, impressoras, backup e restauração.

## Etapa 2
- [ ] Cozinha/bar inteligentes e alertas de preparo.
- [ ] Estoque com previsão de compras, validade e lote.
- [ ] QR Code por mesa e consumo com permissões.

## Etapa 3
- [ ] Conciliação financeira de PIX/cartões e recebíveis.
- [ ] Atualização segura com backup, rollback e versionamento.

## Etapa 4
- [ ] Apollo IA para sugestões gerenciais, sem executar ações financeiras automaticamente.
- [ ] Central de módulos, planos, revendedores e franquias.

## Critérios de aceite da etapa 1
1. Testes unitários, integração e CI aprovados, evidências registradas.
2. Nenhum pedido ou pagamento duplicado após reconexão e reenvio.
3. Operações restritas exigem autorização no backend, não apenas na interface.
4. Caixa fechado não aceita vendas reais; homologação usa dados e pagamentos simulados.
5. Teste real do instalador Windows 10/11 e validação no celular.
6. Backup íntegro e restauração comprovada antes de qualquer distribuição.

## Status
Documento de escopo criado; **implementação de código, testes e instalador ainda não concluídos**.

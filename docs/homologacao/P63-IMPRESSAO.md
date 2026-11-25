# Apollo PDV 3.0.1 — Impressão de produção

A extensão usa a candidata Docker P63 e preserva os cadastros existentes. A Central registra a primeira tentativa por ticket e setor antes de abrir o diálogo do navegador ou enviar ao Windows. A recepção pelo spooler é exibida como **Aceito pelo spooler**. A saída conferida por uma pessoa tem estado próprio. A segunda via segue a autorização administrativa existente e recebe a marca **REIMPRESSÃO**.

## Inventário e configuração

1. Abra o PowerShell em um Windows 10 ou 11 autorizado com a mesma conta que usa o Apollo. Execute `& .\desktop\scripts\diagnosticar-impressoras.ps1`. A opção `-Saida` aceita o caminho de um novo JSON. O inventário inclui filas, portas, dados reportados pelo CIM, drivers, spooler e falhas de consulta.
2. No Apollo, abra **Configurações → Impressoras**. Edite o cadastro do setor e confira a fila configurada. No aplicativo Windows, use **Detectar impressoras instaladas** ou **Atualizar lista**. No aplicativo ou na Web, use **Importar inventário** para ver os nomes exatos do JSON. Escolha a fila e confira setor, papel e vias antes de salvar.
3. Mantenha o JSON no ambiente autorizado. A prévia usa o arquivo no navegador e o formulário salva apenas a fila escolhida e as demais opções do cadastro. A coleta e a prévia preservam os registros, drivers e filas existentes.
4. Para reverter um ajuste de cadastro, restaure o nome exato anterior no próprio formulário. Registre as opções anteriores antes de editar. Use o backup e o procedimento de rollback da instalação P63 para reversão do ambiente completo.

## Pedidos do celular

1. Em um Windows com acesso às filas, abra o Apollo, entre na **Central de Impressão**, selecione os setores e ligue a impressão automática. Mantenha a tela aberta e a sessão ativa.
2. Abra o Garçom Mobile pelo mesmo servidor autorizado no Android ou iPhone. Envie os itens ao atendimento. O pedido gera os tickets por setor e a Central no Windows consulta a fila.
3. Abra **Status da impressão por setor** no atendimento para acompanhar os tickets ou consulte a Central. Em **Conferência necessária**, pare o envio no terminal envolvido, confira a fila do Windows e o papel e peça ao administrador para registrar a saída ou liberar outra tentativa. Uma tentativa em processamento acima de cinco minutos também exige conferência.
4. Na Web, o envio usa o diálogo do navegador. Confirme no Apollo após conferir a saída. O fluxo atual de pré-conta continua disponível no atendimento.

A consulta automática conserva a janela dos tickets recentes do fluxo P63. A consulta de tentativas indeterminadas inclui tickets antigos. O terminal Windows atual usa uma sessão de operador e a Central aberta. Apollo Print Bridge independente, reserva automática, autenticação por dispositivo e sincronização de trabalhos offline seguem pendentes.

## Checklist de homologação física

Use uma base de homologação isolada. Registre horário, operador, ticket, tentativa, fotos dos comprovantes e o estado no aplicativo. Preencha uma linha por fila e setor.

| Fila Windows | Modelo e driver | Conexão | Setor | Papel e vias | Resultado/evidência |
|---|---|---|---|---|---|
| A coletar no Windows autorizado | | | | | |

- [ ] Conferir a página de teste de cada fila, largura, acentos, valores, legibilidade e duas vias.
- [ ] Enviar pedido com cozinha, churrasqueira e bar. Conferir cada papel e repetir com um complemento.
- [ ] Validar pré-conta, pagamento e reimpressão identificada com operador autorizado.
- [ ] Verificar corte, gaveta e falta de papel nos modelos com esses recursos.
- [ ] Desconectar a impressora e reiniciar Windows, spooler ou aplicativo durante a tentativa. Conferir o papel e a fila antes de liberar outra tentativa.
- [ ] Testar perda de internet, perda de LAN, retorno da conexão e contingência. Registrar quais capacidades funcionam no ambiente.
- [ ] Enviar pelos fluxos Web, Android e iPhone e vincular cada saída ao ticket.

Validação física pendente. O inventário local será gerado no computador autorizado no dia da homologação.

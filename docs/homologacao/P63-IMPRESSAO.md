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

## Evidência física parcial — Epson TM-T20X (25/11/2026)

Relato do operador durante teste presencial na Espeteria Churras Burguer (sem venda, caixa ou estoque):

- Fila Windows: `EPSON TM-T20X Receipt`; driver `EPSON TM-T(203dpi) Receipt6`; porta USB `TMUSB001`.
- Spooler em execução, inicialização automática; fila padrão, estado Normal, WorkOffline=False, compartilhamento desativado.
- Driver: papel 80 × 297 mm, 203 × 203 dpi, retrato, monocromático, uma via padrão.
- Primeiro teste PowerShell com Out-Printer: saída física confirmada pelo operador, porém com excesso de papel.
- Segundo teste: System.Drawing.Printing.PrintDocument, PaperSize personalizado 315 × 394 centésimos de polegada (aprox. 80 × 100 mm), uma via, margens 10/10/5/5; operador confirmou impressão correta e economia de papel. Não alterou preferências globais do driver.
- Próximos testes: comprimento calculado pelo conteúdo, duas vias, corte, acentos e pedidos enviados pelo Apollo Web/Mobile. O teste acima é do Windows/driver, não comprova a integração do Apollo nem o comprimento físico exato, e não substitui homologação completa. Sem foto ou medição anexada.

Não fixar o nome da fila para todos os estabelecimentos: utilizar a configuração por dispositivo/setor. Preservar a fila e o driver existentes.

### Continuação do teste físico — duas vias e corte

- Teste PowerShell com `PrintDocument`, papel personalizado de aproximadamente 80 × 100 mm e `PrinterSettings.Copies = 2`: operador confirmou que saiu somente uma via.
- Reteste com dois objetos `PrintDocument` independentes, cada um com `Copies = 1`, documento identificado como via 1/2 ou 2/2, mesmo papel e margens do teste econômico e intervalo de um segundo: operador confirmou duas vias separadas e corte correto. O teste não altera preferências globais nem gera venda.
- Requisito de implementação: permitir estratégia de cópias independentes por perfil de impressora, com identificação e acompanhamento individual de cada via. Persistir o estado antes do envio, tratar resultado indeterminado sem reenvio automático e não repetir uma via já aceita. Não inferir confirmação física apenas pelo retorno do spooler. Preservar outros perfis e configurações existentes.
- Evidência baseada no relato presencial do operador; não há foto ou medição anexada. Ainda pendentes: comprimento variável calculado pelo conteúdo, acentos, integração real Web/PWA/garçom, recuperação de falha entre vias e validação de outros equipamentos.

### Perfil operacional da Espeteria — impressora única

O proprietário confirmou em 25/11/2026 que a Epson TM-T20X USB é a única impressora física da loja e que não existe gaveta de dinheiro conectada.

Configuração candidata para homologação, ainda não aplicada ao ambiente da loja:

- Compartilhar a fila Windows `EPSON TM-T20X Receipt` entre os setores caixa, cozinha, churrasqueira e bar, conforme os setores efetivamente cadastrados. Não criar filas Windows duplicadas nem alterar o driver ou o compartilhamento.
- Preservar a separação lógica por setor, com cabeçalho destacado, mesa/comanda, número do pedido, horário, itens e observações. Encaminhar somente itens do setor e somente complementos novos.
- Serializar trabalhos pela fila física, inclusive vias independentes; não repetir automaticamente trabalhos com resultado indeterminado. Configurar duas vias conforme preferência do proprietário, mantendo a quantidade ajustável por tipo de documento/setor.
- Gaveta de dinheiro desativada neste estabelecimento; nenhuma dependência de gaveta, nenhum pulso de abertura.
- Manter configuração genérica para outros estabelecimentos, sem hardcode do nome da fila em código compartilhado. A impressora única é um ponto de falha: manter fila persistente e avisos; não inventar impressora reserva.
- Testar pedido misto fictício com espetinhos, porções e bebidas pelo Garçom Mobile, conferir tickets por setor na mesma Epson, depois pré-conta e comprovante de caixa. Validar integração e comprimento dinâmico antes da liberação.

Não foi realizada alteração em produção, cadastro de impressoras ou dados reais neste registro.

### Teste físico complementar — comprimento variável e acentuação

Em 25/11/2026, o operador executou presencialmente no Windows da Espeteria dois trabalhos fictícios via PowerShell/System.Drawing.Printing.PrintDocument, com papel personalizado de largura aproximada de 80 mm e altura em centésimos de polegada calculada por `Max(394, numero_de_linhas * 18 + 40)`. O pedido curto solicitou cerca de 100,1 mm (10 linhas); o longo solicitou cerca de 147,3 mm (30 linhas, 580 centésimos de polegada), com 20 itens numerados, complementos, observação e marcador de fim. O operador confirmou que ambos imprimiram corretamente, com comprimentos diferentes, acentuação e corte correto. Nenhuma alteração permanente do driver ou dados operacionais foi solicitada.

Evidência por relato presencial, sem fotografia ou medição física anexada. O resultado valida os formatos personalizados testados pelo driver e não valida o algoritmo de medição Chromium/Electron da candidata, a paginação de documentos extremos ou o fluxo integrado do Apollo. Permanecem obrigatórios os testes do instalador atualizado, agente independente, fila persistente e Garçom Mobile.


### Apollo Print Lite — validação presencial parcial (25/11/2026)

- Equipamento ASUS S400CA, Windows 11 Pro 64 bits, i5-3317U, 4 GB instalados (3,89 GB utilizáveis), 0,63 GB livres no diagnóstico anterior. Epson TM-T20X USB. Não instalar dependências pesadas no caixa nesta etapa.
- Script desktop/scripts/apollo-print-lite.ps1 da candidata 8422a43, executado em PowerShell com RemoteSigned após desbloqueio individual do arquivo baixado. Sem alteração permanente da política de execução.
- Trabalho fictício 43b9a3719e6a4ba0aed0d3b066295cad: operador relatou duas vias; console registrou ambas enviadas ao Windows. Quatro marcadores persistidos (started e accepted por via), às 03:00:44–03:00:46 locais.
- Nova execução com o mesmo JobId foi bloqueada com a mensagem prevista "Job ja iniciado. Confira papel e registros; nao ha reenvio automatico.", antes de qualquer nova chamada Print(). A evidência demonstra bloqueio entre processos no mesmo usuário e diretório, não idempotência distribuída nem recuperação após queda de energia.
- Marcadores accepted significam retorno da chamada de impressão, não confirmação física automática. Ainda pendentes: confirmação física específica de ausência de nova via na repetição, simulação de tentativa indeterminada, consumo de memória, autenticação do dispositivo, integração com API/PWA e contingência offline. Nenhuma venda, estoque ou alteração de produção.


### Simulação de tentativa indeterminada — Print Lite

Em 25/11/2026, no computador da Espeteria, o operador executou o script de homologação com o JobId 0303614cbea0429b8a71b3855ab29ee6 após a instrução de criar um marcador started sem accepted. O console retornou a rejeição prevista na linha 39, antes de Print(). O registro comprova a rejeição de trabalho previamente iniciado na simulação; não comprova desligamento real durante impressão, retomada seletiva de vias, confirmação física automática, nem integração distribuída. O marcador simulado deve permanecer separado de trabalhos reais. Não houve alteração de produção solicitada.


### Viabilidade do agente C# leve — teste presencial

Em 25/11/2026 o operador confirmou .NET Framework Release 533509 e compilador Framework64/v4.0.30319/csc.exe no Windows 11 Pro. Um executável de laboratório C# compilado localmente com System.Drawing.dll enumerou a Epson TM-T20X Receipt, OneNote e Microsoft Print to PDF, com WorkingSet64 de 17,18 MB. Um processo PowerShell independente medido anteriormente apresentou 65,55 MB. São medições pontuais de programas diferentes, não benchmark equivalente de agentes completos. O teste C# não imprime, não estabelece conexão com VPS, não permanece residente e não valida fila ou segurança. A meta de até 50 MB em repouso continua pendente de medição do agente integrado. Nenhuma alteração no Consumer ou produção foi solicitada.


### Impressão C# — primeira submissão no Windows da Espeteria

Em 25/11/2026, o operador compilou ApolloPrintTest.cs localmente com csc.exe e System.Drawing.dll e executou o programa de laboratório. PrintDocument.Print() retornou sem exceção para a fila EPSON TM-T20X Receipt, uma via, papel personalizado 315 × 394 centésimos de polegada, com medição pontual de WorkingSet64 de 37,68 MB após a chamada. A saída física, corte e acentos ainda aguardam confirmação específica do operador. Não se trata de agente residente ou integrado: autenticação, HTTPS, fila durável em C#, reconciliação e desempenho sustentado não foram testados. Nenhuma alteração em produção ou Consumer foi solicitada.


### C# — persistência simulada por via e bloqueio entre processos

O operador compilou e executou localmente ApolloPrintQueue.exe, protótipo sem chamada de impressão. Job 77fc91eca25b45089bb8dd43dbde2c05: duas vias registradas com arquivos started e simulated, WorkingSet64 de 17,41 MB. Segunda execução com mesmo ID retornou BLOQUEADO: pedido ja iniciado. Os quatro arquivos foram listados no diretório de laboratório. Evidência de persistência entre execuções no mesmo usuário e bloqueio local, não de fila integrada à Epson, recuperação seletiva, concorrência distribuída, queda de energia ou operação offline completa. Sem dados reais ou produção.


### C# — submissão integrada com marcadores persistentes por via

O operador executou o laboratório ApolloPrintBridgeLab.cs publicado no commit b6b8143cf0dd3a8eb7c44240fae2cf646c2b3bce. Job fictício f498b780a97046dc839fb239d7678863: console confirmou retorno de Print() para vias 1 e 2, WorkingSet64 pontual de 37,56 MB e diretório local de registros. A segunda execução com o mesmo ID foi bloqueada antes de Print(). Os marcadores individuais ainda devem ser conferidos por listagem, e a saída física, acentos, corte e ausência de nova via devem ser confirmados pelo operador. Trata-se de laboratório local, não de agente residente conectado à API. Retomada seletiva, concorrência distribuída, falha real e consumo sustentado permanecem pendentes. Sem implantação ou alteração de produção.


### Correção da avaliação física do laboratório C# integrado

O operador confirmou que o job f498b780a97046dc839fb239d7678863 não gerou papel, embora os quatro marcadores started/accepted existam. Fila Epson vazia, status Normal, TMUSB001 e spooler Running. A página de teste do Windows e o executável C# anterior ApolloPrintTest.exe (DrawString único com texto multilinha) imprimiram normalmente segundo o operador. A candidata 26dc815f1af0b46d81546f290d20dc2fc7bf48cf aproxima renderização e nome do documento do teste bem-sucedido e explicita que o retorno de Print() não confirma impressão física. Causa ainda não comprovada; reteste com novo GUID obrigatório. Preservar registros anteriores, não reenviar o trabalho indeterminado. Homologação física integrada permanece bloqueada.

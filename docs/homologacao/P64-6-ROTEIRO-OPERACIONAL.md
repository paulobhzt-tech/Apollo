# P64.6 · roteiro da Espeteria Churras Burguer

Use um MongoDB descartável, contas de teste e dados fictícios. Antes do turno,
confirme o commit no manifesto servido e o destino da fila de impressão. O
pacote de laboratório contém a candidata e a imagem anterior ensaiada.

## Antes de ativar homologação

Execute este bloco no Shell administrativo autorizado da HostGator a partir
do checkout da P64.6. A saída fica na sessão administrativa.

```bash
bash deploy/vps/audit-homologation-host.sh
```

Confronte o inventário do host com o virtual host, a porta loopback, as redes,
as contas de serviço, as montagens e o MongoDB autorizados para homologação.
Confirme as referências das credenciais no console. Preserve imagem,
configuração Apache, volumes, manifesto e arquivo de backup da versão ativa.
Confira os hashes e ensaie a restauração e o retorno em ambiente separado.
Use o procedimento de troca verificável da P60 quando o host usar o ponteiro
de releases descrito naquele runbook.

- [Troca e rollback da P60](P60-APOLLO-3.0.1.md)
- [Backup externo e restauração](../../deploy/vps/README.md)
- [Pareamento do Print Agent](P64-3-PRINT-AGENT.md)

## Turno fictício

1. No Windows, instale ou abra o pacote de teste, confirme o SHA e entre com
   os dois operadores de caixa. Em Android e iPhone físicos, instale a PWA,
   entre como garçom e confirme os limites da sessão e o bloqueio por PIN.
2. Abra os caixas, registre a entrada de insumos e envie pedidos simultâneos
   para cozinha e bar. Em cada setor, verifique papel de 80 mm, destino,
   logomarca, duas vias quando configuradas, legibilidade e acentuação.
   Registre separadamente a aceitação pelo spooler e a conferência no papel.
3. Marque pedidos prontos, confira o aviso no telefone, transfira produtos
   e mesa, divida a conta e gere a pré-conta. Registre dinheiro, PIX e cartão
   fictícios ou em sandbox e um recebimento a prazo. Guarde os IDs fictícios.
4. Registre sangria, suprimento e cancelamento autorizado. Interrompa a rede
   com pedidos pendentes, feche o aplicativo, reabra e depois reconecte.
   Confira a fila, o estoque, o reenvio único e o histórico por operador.
5. Encerre os caixas com conferência cega e confira diferença de R$ 0,00.
   Compare o estoque antes e depois e execute backup e restauração isolada.
6. Anote SHA, dispositivo, versão do sistema, impressora, resultado e tempo
   da restauração. A liberação de produção exige autorização do proprietário.

# Instalação e homologação da candidata P63

## Laboratório Windows e Epson

1. Baixe o instalador de teste no artefato Actions do mesmo commit da candidata. Compare o SHA-256 com o valor publicado no passo **Conferir executável gerado**. Use um perfil Windows de homologação e um servidor com banco descartável.
2. Instale e selecione o servidor autorizado de homologação. Para laboratório na própria máquina, use o endereço de loopback oferecido pelo instalador de teste. Confira o SHA em `/build-integrity.json`.
3. No Windows autorizado que enxerga a impressora, execute `& .\desktop\scripts\diagnosticar-impressoras.ps1`. Confira os dados informados pelo proprietário no inventário. A fila esperada é **EPSON TM-T20X Receipt**, driver **EPSON TM-T(203dpi) Receipt6**, porta **TMUSB001** e bobina **80 mm**.
4. Em **Configurações → Impressoras**, vincule essa fila aos setores necessários. Configure as vias por cadastro e ative **Comprimento econômico no Windows** nos perfis térmicos que serão testados. A interface permite a mesma fila em vários setores. Mantenha a gaveta e a reserva fora do ensaio do piloto.
5. Abra a Central de Impressão, selecione os setores e ative o envio automático. Use o Garçom Mobile no mesmo servidor de homologação. Confira filas, rótulos e papéis por setor.
6. Valide um ticket de 1, 3, 10, 20, 50 e 100 itens em cada perfil aplicável. Registre comprimentos, paginação, textos longos, acentos, valores, corte e total. Confira pré-conta e cupom. Com duas vias, confirme dois trabalhos na fila e dois cortes. Induza falha entre as vias apenas no laboratório e confira a fila e os papéis antes de liberar qualquer reenvio.
7. Registre SHA, versão Windows, driver, porta, tickets, horários e evidência física. Teste perda de conexão e recuperação. O perfil de 58 mm exige fila e equipamento compatíveis.

## Auditoria de leitura na VPS

Execute na VPS autorizada com uma conta que já possua as permissões necessárias. Substitua `CONTAINER_HOMOLOGACAO` pelo nome verificado. A existência de um contêiner separado é apenas uma das condições de isolamento.

```bash
docker version
docker compose version
docker ps --format '{{.Names}} {{.Image}} {{.Ports}} {{.Networks}}'
docker volume ls
docker network ls
docker system df
docker inspect --format '{{.Name}} {{.Image}} {{json .Mounts}} {{json .NetworkSettings.Ports}}' CONTAINER_HOMOLOGACAO
apachectl -t
apachectl -S
ss -lnt
df -h
free -h
```

Compare nomes de usuários e bases, montagens, sub-redes, portas e vhosts com o inventário autorizado. Confira firewall e permissões pelo console administrativo. Consulte `/api/` e `/build-integrity.json` na URL de homologação após validar o DNS e o certificado. Registre apenas identificadores e resultados sem valores de variáveis, segredos ou conteúdo de bases. O ensaio Docker do CI usa um MongoDB sintético e rede descartável.

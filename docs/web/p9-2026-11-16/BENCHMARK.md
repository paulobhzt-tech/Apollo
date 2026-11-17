# P9 — resultados completos da campanha controlada

Fonte: artefato 14287487902, run 43983212080. P8=e670c5e; P9=dd10ded3. Quantis HTTP/par do cliente, em ms; pares/s usa tráfego + drenagem e exclui autenticação. Controle e candidata no mesmo runner, réplica nova por rodada. Não calcular médias de percentis como se fossem amostras brutas.

| Rodada | Versão | Operadores | HTTP p50/p95/p99 ms | Par p50/p95/p99 ms | Pares/s | Erros/esgotadas | Limites da linha |
|---|---|---:|---|---|---:|---|---|
| p9h1 | P8 | 50 | 555,95/711,37/3.167,46 | 1.101,90/1.270,97/3.763,42 | 40,97 | 0/0 | FALHOU: HTTP p99 |
| p9h2 | P9 | 50 | 547,35/672,57/730,62 | 1.092,71/1.161,11/1.180,51 | 45,49 | 0/0 | PASSOU |
| p9a1 | P8 | 5 | 53,69/67,28/108,18 | 106,26/134,75/186,58 | 45,56 | 0/0 | PASSOU |
| p9a1 | P8 | 10 | 109,83/135,85/150,55 | 217,07/238,25/274,19 | 45,46 | 0/0 | PASSOU |
| p9a1 | P8 | 20 | 217,54/265,30/289,45 | 431,99/465,87/470,94 | 45,77 | 0/0 | PASSOU |
| p9a1 | P8 | 30 | 323,35/398,18/434,46 | 644,84/694,57/710,10 | 46,00 | 0/0 | PASSOU |
| p9a1 | P8 | 50 | 543,56/660,04/690,08 | 1.084,14/1.152,07/1.157,05 | 45,73 | 0/0 | PASSOU |
| p9b1 | P9 | 5 | 50,39/63,22/83,82 | 100,80/105,59/140,98 | 49,06 | 0/0 | PASSOU |
| p9b1 | P9 | 10 | 101,82/126,62/145,12 | 203,24/227,61/251,64 | 48,68 | 0/0 | PASSOU |
| p9b1 | P9 | 20 | 206,21/251,69/259,74 | 412,45/445,71/465,80 | 48,52 | 0/0 | PASSOU |
| p9b1 | P9 | 30 | 310,43/386,16/422,01 | 619,94/679,13/692,24 | 47,79 | 0/0 | PASSOU |
| p9b1 | P9 | 50 | 539,52/781,70/851,88 | 1.072,00/1.298,10/1.418,34 | 45,38 | 0/0 | PASSOU |
| p9b2 | P9 | 5 | 50,38/63,58/96,33 | 100,52/117,11/151,93 | 48,75 | 0/0 | PASSOU |
| p9b2 | P9 | 10 | 97,95/122,58/154,89 | 195,88/234,94/244,10 | 50,53 | 0/0 | PASSOU |
| p9b2 | P9 | 20 | 195,41/241,72/266,36 | 385,89/440,29/450,08 | 50,99 | 0/0 | PASSOU |
| p9b2 | P9 | 30 | 294,49/362,20/395,09 | 580,80/633,75/644,75 | 50,79 | 0/0 | PASSOU |
| p9b2 | P9 | 50 | 495,27/612,11/677,77 | 984,91/1.078,68/1.099,92 | 50,21 | 0/0 | PASSOU |
| p9a2 | P8 | 5 | 51,37/64,40/93,91 | 102,95/110,99/162,28 | 47,91 | 0/0 | PASSOU |
| p9a2 | P8 | 10 | 104,81/131,53/154,30 | 208,85/243,31/250,67 | 47,37 | 0/0 | PASSOU |
| p9a2 | P8 | 20 | 213,23/271,93/324,52 | 425,53/501,93/509,31 | 46,26 | 0/0 | PASSOU |
| p9a2 | P8 | 30 | 313,72/404,77/660,27 | 636,52/751,77/930,93 | 46,61 | 0/0 | PASSOU |
| p9a2 | P8 | 50 | 495,98/621,04/884,43 | 989,96/1.336,73/1.355,29 | 49,34 | 0/0 | PASSOU |
| p9base | P8 | 50 | 513,63/638,33/684,45 | 1.024,87/1.135,32/1.188,29 | 48,54 | 0/0 | PASSOU |
| p9candidate | P9 | 50 | 501,14/646,38/708,64 | 987,01/1.176,65/1.265,41 | 49,54 | 0/0 | PASSOU |

Todas as linhas P9 passam. O controle histórico p9h1 reprova HTTP p99; as linhas restantes P8 passam. Isso não impede a aprovação dos critérios da candidata e não deve ser ocultado. Em ABBA a 50 operadores, p95 P8=621,04–660,04 ms e P9=612,11–781,70 ms: sobreposição e variabilidade, sem melhora uniforme. No prolongado, P9 p95/p99 são ligeiramente maiores, com throughput maior.

## Cronologia

Horários abaixo em America/Sao_Paulo (16/11/2026). Tempo do processo inclui autenticação e auditoria; tempo de tráfego está nos resultados. Prolongados configurados com 1.800 segundos ativos, sem redução.

| Rodada | Início | Fim | Processo (s) | Cargas | Ativo por carga (s) | Exit |
|---|---|---|---:|---|---:|---:|
| p9h1 | 16/11/2026 20:55:18 | 16/11/2026 20:55:53 | 34,52 | 50 | 30,00 | 0 |
| p9h2 | 16/11/2026 20:55:58 | 16/11/2026 20:56:32 | 34,35 | 50 | 30,00 | 0 |
| p9a1 | 16/11/2026 20:56:35 | 16/11/2026 20:57:58 | 83,40 | 5,10,20,30,50 | 15,00 | 0 |
| p9b1 | 16/11/2026 20:58:00 | 16/11/2026 20:59:24 | 83,43 | 5,10,20,30,50 | 15,00 | 0 |
| p9b2 | 16/11/2026 20:59:26 | 16/11/2026 21:00:49 | 83,38 | 5,10,20,30,50 | 15,00 | 0 |
| p9a2 | 16/11/2026 21:00:52 | 16/11/2026 21:02:15 | 83,38 | 5,10,20,30,50 | 15,00 | 0 |
| p9base | 16/11/2026 21:02:18 | 16/11/2026 21:32:25 | 1.806,50 | 50 | 1.800,00 | 0 |
| p9candidate | 16/11/2026 21:32:30 | 16/11/2026 22:02:36 | 1.806,10 | 50 | 1.800,00 | 0 |

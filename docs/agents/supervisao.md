# Supervisão de execuções longas (gestor e agentes)

Subagentes, `pnpm test:int`, `pnpm test:e2e` e dev servers rodam em segundo plano e podem morrer, travar ou terminar sem entregar o relatório, sem que ninguém perceba.

## A cada 5 minutos, enquanto algo roda
1. `ListAgents`: todo subagente que o gestor espera deve estar `running`. Se estiver `completed` e o relatório não chegou, leia a última mensagem de texto do transcript (`subagents/agent-<id>.jsonl`) em vez de esperar.
2. `ps -eo pid,etimes,pcpu,args | grep -E "next|playwright|vitest|tsx"`: sem processo de teste vivo, o agente que o esperava não vai receber nada.
3. Processo vivo há muito tempo (>30 min), 0% de CPU e sem saída nova: travou. Mate `next dev`/`playwright` órfãos, apague `.next-e2e` e reexecute isolado com `--timeout=120000`.
4. Carga alta de outros processos (`uptime`, `ps --sort=-pcpu`) explica timeouts: registre no STATE em vez de culpar o código.
5. Aviso "esperando trabalho em segundo plano" repetido sem relatório: confira (1) e (2), não aceite o aviso como progresso.

## Regras
- Agente que lança suíte longa deve dizer o que rodou e o que não rodou; não rodado nunca vale como passou.
- O gestor confere o commit (`git log`, `git status`) quando um relatório se perde, antes de reenviar a tarefa.
- Reenviar a tarefa só depois de provar que o agente morreu.

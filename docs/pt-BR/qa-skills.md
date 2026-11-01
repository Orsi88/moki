# Skills de QA e agentes

Uma **skill** reúne as instruções de uma atividade: etapas, regras, saída e onde parar para a sua aprovação. A IA lê. Um **agente** é um papel que usa uma ou mais skills.

As atividades que vêm com o Moki:

| Atividade | O que você recebe | Estado |
|---|---|---|
| [Revisar histórias](../../skills/requirements-review/SKILL.md) | Ambiguidades, lacunas, uma pergunta por vez, uma matriz de revisão (Excel) e um relatório final de definições (PDF). | pronta |
| [Projetar testes](../../skills/test-design/SKILL.md) | Mapa de cenários e, depois do seu OK, casos de teste manuais em Excel. | pronta |
| [Pré-análise de falha](../../skills/failure-analysis/SKILL.md) | Uma nota curta para o time de desenvolvimento, a partir da sua descrição e do log. | pronta |
| [Montar evidências](../../skills/qa-orchestrator/references/workflows/test-evidence.md) | O item de trabalho e as gravações do Jam, depois uma planilha e um documento Word com os prints, nos seus modelos quando você tiver. | pronta |
| [Contexto do projeto](../../skills/project-context/SKILL.md) | Onboarding, atualizações e o plano de um projeto em branco. | pronta |
| [Automação](../../skills/automation/SKILL.md) | Construir, implementar ou evoluir um projeto de automação. | ainda não disponível |
| [Documentação](../../skills/documentation/SKILL.md), [smoke test](../../skills/smoke-test/SKILL.md) | Planejadas. A IA avisa e para. | ainda não disponível |

**Pronta** quer dizer utilizável, ainda em conferência entre ferramentas de IA. Peça em linguagem natural ("revise esta história", "mapeie os testes", "segue o log"). As que vêm com o app identificam o projeto, registram uma execução e param quando precisam de uma decisão. "ok", "aprovado" ou "pode seguir" aceita a etapa que está na frente. Elas não inventam requisitos, mensagens nem resultados: o que falta vira pendência.

Sequências como "revise isto e, quando eu aprovar, mapeie os testes" passam pelo orquestrador, que mostra o plano e espera em cada ponto. As definições estão em [skills/qa-orchestrator/references/workflows/](../../skills/qa-orchestrator/references/workflows/).

Skills que você adiciona ficam com o projeto (`<pasta vinculada>/.claude/skills/` ou `workspace/projects/<id>/skills/`) ou para todos os projetos (`~/.claude/skills/` e `~/.agents/skills/`). Agentes que você cria seguem a mesma divisão; a cópia de um agente pronto fica em `workspace/library/agents/`. O pedido cita os nomes. O Moki não executa uma skill sozinho. Mais sobre agentes: [agents.md](../agents.md).

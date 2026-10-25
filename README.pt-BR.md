# Moki

🇺🇸 [Read in English](README.md)

<p align="center"><img src="app/public/hero.png" alt="Moki" width="280" /></p>

<p align="center">
  <a href="https://github.com/Orsi88/quality-agents/releases/latest"><b>⬇️ Baixar o Moki para Windows</b></a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/quality-agents/releases/download/v0.2.1/Moki.Setup.0.2.1.exe">Moki.Setup.0.2.1.exe</a>
  &nbsp;·&nbsp; <a href="#instalar">como instalar</a>
</p>

O Moki é um app local para a ferramenta de IA que você já usa. Ele guarda um projeto no seu computador — arquivos, conhecimento confirmado, skills e o registro de cada atividade — e abre o Claude Code, o Cursor, o Codex, o Gemini ou um chat com o pedido pronto.

Quem faz o trabalho é a sua ferramenta de IA. O Moki prepara o pedido e guarda os arquivos. Não há conta nem servidor.

Começou como trabalho de qualidade de software: revisar uma história, projetar testes, olhar uma falha, montar evidências. Isso continua no app. Um projeto também pode ser uma pasta que você já tem, um projeto em branco que a IA planeja com você, ou skills e agentes que você mesmo adiciona.

---

## Instalar

### Windows

1. Baixe o [Moki.Setup.0.2.1.exe](https://github.com/Orsi88/quality-agents/releases/download/v0.2.1/Moki.Setup.0.2.1.exe) (ou o arquivo mais recente em [Releases](https://github.com/Orsi88/quality-agents/releases)).
2. Se o Windows disser que protegeu o computador, escolha **Mais informações → Executar assim mesmo**. O instalador ainda não tem assinatura digital.
3. Conclua. Um atalho **Moki** aparece na área de trabalho e no menu Iniciar.

A primeira abertura cria **Documentos\Moki**: os arquivos do app e a sua `workspace/`, onde ficam os projetos. Um instalador mais novo atualiza os arquivos do app e deixa a `workspace/` quieta. Desinstalar também mantém essa pasta.

Instale também uma ferramenta de IA (Claude Code, Cursor, Codex, Gemini, ou um chat que você já usa). Excel, Word e PDF das atividades que vêm com o app precisam do [Node.js 22.18+](https://nodejs.org) (LTS). O app em si abre sem ele.

macOS, Linux, ou uma cópia deste repositório: [A partir do código](#a-partir-do-código).

## Usar

Abra o Moki. O último projeto volta sozinho. O canto da tela inicial escolhe **inglês ou português** e o tema **claro ou escuro**. Criar um projeto é um botão nessa tela, não um passo obrigatório.

**Tela inicial.** Projetos à esquerda, notas soltas embaixo. Fixe um projeto para mantê-lo no topo. *Desvisualizar* tira o projeto da lista e os arquivos continuam no computador; ele vai para **Ocultos** até você mostrar de novo.

**Criar um projeto** digitando o nome:

| Começar com | O que você ganha |
|---|---|
| **Arquivos de contexto de QA** | Glossário, regras de negócio, módulos, fluxos, permissões e o resto, para um sistema que você testa. |
| **Um projeto em branco** | Ainda sem contexto. Você descreve o objetivo; a IA pergunta o que precisa e escreve um plano. Os arquivos de contexto só aparecem depois da sua aprovação. |
| **Uma pasta que já existe** | *Abrir um projeto* escolhe uma pasta. O projeto recebe o nome dela (você pode editar), vincula essa pasta e abre *Configurar &lt;nome&gt;*. As configurações de IA da pasta são copiadas para `.moki-backup/` dentro dela. Nada mais ali muda. |

O formulário de criar ainda diz "um projeto por sistema que você testa". Um projeto em branco e uma pasta vinculada usam o mesmo formulário.

**Workspace.** A árvore do projeto: contexto, inbox, atividades, notas. Solte arquivos sobre a janela e eles são copiados para o inbox — até 40 arquivos, 200 MB cada. Pastas são ignoradas. Markdown aparece formatado; **Ctrl+E** edita, **Ctrl+S** salva, **Ctrl+W** fecha. Arquivos Word viram texto para qualquer IA conseguir ler. Excel e PDF abrem no programa deles. Os arquivos que a IA salva aparecem na árvore assim que chegam.

**Abrir na sua ferramenta de IA** (o botão de play):

1. Escolha a atividade.
2. Se quiser, escolha quem deve fazer (um agente) e quais arquivos do inbox entram.
3. Acrescente uma observação e escolha a ferramenta.

Claude Code, Codex, Gemini CLI, Antigravity CLI e Cursor Agent abrem numa aba de terminal do app. Cursor e VS Code abrem a pasta com o pedido copiado. ChatGPT, claude.ai, Gemini web e *Just show the request* deixam o texto na tela, pronto para copiar. Se a abertura ainda estiver rodando depois de cerca de 20 segundos, o assistente avisa.

Aí você conversa nessa ferramenta como de costume. O pedido cita o projeto, a pasta vinculada e as skills e os agentes instalados nele.

**Configurações** (a engrenagem) tem três abas:

| Aba | O que você faz ali |
|---|---|
| **Agentes** | Papéis que usam uma ou mais skills. Duplique um pronto, ou crie o seu para este projeto ou para todos. |
| **Skills** | O que já está instalado, o que vem com o Moki, e **Adicionar skill**: busque no registro público [SkillMD](https://skillmd.com) (programação, design, QA, segurança, documentação) ou descreva uma para a sua ferramenta de IA redigir. |
| **Modelos** | Fonte, cores, cabeçalho, rodapé, logo e marca d'água dos PDF, Word e Excel que as atividades geram. Um estilo para todos os projetos, ou o de um projeto. |

Notas de um projeto são arquivos Markdown em `notes/` e abrem numa janela própria. Notas soltas da tela inicial ficam no app até você enviar uma para um projeto.

## Projetos

Um projeto é um trabalho. O id é curto e em minúsculas (`billing-portal`), e a pasta é `workspace/projects/<id>/`.

Um projeto de qualidade fica assim. Um projeto em branco tem o mesmo esqueleto e só ganha `context/` depois que você aprova o `plan.json`.

```text
workspace/projects/billing-portal/
├── project.json          # nome, idioma, pasta vinculada, quem pode ver os dados
├── context/              # somente conhecimento confirmado
├── proposed-updates.md   # o que a IA notou, esperando você
├── plan.json             # projeto em branco: o plano, até você aprovar
├── activity-log.md
├── inbox/                # arquivos que você entrega à IA
├── notes/
└── runs/<run-id>/        # uma pasta por atividade
    ├── state.json        # etapa atual, para parar e retomar
    ├── inputs/  outputs/  evidence/  logs/
```

Durante uma atividade, a IA pode notar algo que parece uma regra geral. Ela grava isso em `proposed-updates.md` e pergunta antes de virar contexto. Texto confirmado é o único texto que ela pode tratar como sabido.

Os entregáveis saem em **inglês**, a menos que você defina `"deliverableLanguage": "pt-BR"` no `project.json` ou peça outro idioma na atividade. A conversa segue o idioma em que você escreve. Mensagens citadas ficam no idioma original.

Para compartilhar o contexto com o time, coloque **a pasta daquele projeto** num repositório Git privado. Ela já ignora `runs/`, `inbox/` e `temporary/`. Dados de projeto não entram neste repositório público.

## Skills e agentes

Uma **skill** reúne as instruções de uma atividade: etapas, regras, saída e onde parar para a sua aprovação. A IA lê. Um **agente** é um papel que usa uma ou mais skills.

As atividades que vêm com o Moki:

| Atividade | O que você recebe | Estado |
|---|---|---|
| [Revisar histórias](skills/requirements-review/SKILL.md) | Ambiguidades, lacunas, uma pergunta por vez, uma matriz de revisão (Excel) e um relatório final de definições (PDF). | pronta |
| [Projetar testes](skills/test-design/SKILL.md) | Mapa de cenários e, depois do seu OK, casos de teste manuais em Excel. | pronta |
| [Pré-análise de falha](skills/failure-analysis/SKILL.md) | Uma nota curta para o time de desenvolvimento, a partir da sua descrição e do log. | pronta |
| [Montar evidências](skills/qa-orchestrator/references/workflows/test-evidence.md) | O item de trabalho e as gravações do Jam, depois uma planilha e um documento Word com os prints, nos seus modelos quando você tiver. | pronta |
| [Contexto do projeto](skills/project-context/SKILL.md) | Onboarding, atualizações e o plano de um projeto em branco. | pronta |
| [Automação](skills/automation/SKILL.md) | Construir, implementar ou evoluir um projeto de automação. | ainda não disponível |
| [Documentação](skills/documentation/SKILL.md), [smoke test](skills/smoke-test/SKILL.md) | Planejadas. A IA avisa e para. | ainda não disponível |

**Pronta** quer dizer utilizável, ainda em conferência entre ferramentas de IA. Peça em linguagem natural ("revise esta história", "mapeie os testes", "segue o log"). As que vêm com o app identificam o projeto, registram uma execução e param quando precisam de uma decisão. "ok", "aprovado" ou "pode seguir" aceita a etapa que está na frente. Elas não inventam requisitos, mensagens nem resultados: o que falta vira pendência.

Sequências como "revise isto e, quando eu aprovar, mapeie os testes" passam pelo orquestrador, que mostra o plano e espera em cada ponto. As definições estão em [skills/qa-orchestrator/references/workflows/](skills/qa-orchestrator/references/workflows/).

Skills que você adiciona ficam com o projeto (`<pasta vinculada>/.claude/skills/` ou `workspace/projects/<id>/skills/`) ou para todos os projetos (`~/.claude/skills/` e `~/.agents/skills/`). Agentes que você cria seguem a mesma divisão; a cópia de um agente pronto fica em `workspace/library/agents/`. O pedido cita os nomes. O Moki não executa uma skill sozinho. Mais sobre agentes: [docs/agents.md](docs/agents.md).

## Voltar depois

Feche a sessão quando quiser. Cada atividade grava o `state.json` no caminho. Peça à IA para continuar aquela execução — na mesma ferramenta ou em outra — e ela lê o arquivo, resume onde você parou e segue dali. As ferramentas não compartilham memória. Os arquivos são a memória. Num chat, envie de novo o `state.json` e o contexto que importa.

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| A biblioteca do app e os seus projetos, depois do instalador | `Documentos/Moki` |
| Um projeto | `workspace/projects/<id>/` |
| Conhecimento confirmado | `.../context/` |
| Uma atividade | `.../runs/<run-id>/` |
| Skills e agentes deste projeto | `workspace/projects/<id>/skills` e `agents`, ou `<pasta vinculada>/.claude/` |
| Skills e agentes de todos os projetos | `~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents` |
| Cópias de agentes prontos | `workspace/library/agents/` |
| Aparência dos documentos | `workspace/document-style.json`, ou o mesmo arquivo dentro de um projeto |

## Privacidade

Os projetos ficam no seu computador. A `workspace/` não faz parte deste repositório Git. Cada projeto é uma pasta; a IA lê a que está ativa. Senhas e tokens não entram em arquivo nenhum — cite o nome de uma variável de ambiente. Enviar documentos para uma IA online é decisão sua e política daquele fornecedor; registre a regra do time em `project.json` → `externalDataSharingAllowed`.

Detalhes: [docs/privacy-and-isolation.md](docs/privacy-and-isolation.md).

## A partir do código

Use isto para rodar o Moki a partir de uma cópia do repositório, no macOS ou no Linux, ou para alterar o app. Quem instalou o `.exe` no Windows pode pular.

Você precisa de Git e Node.js 22.18 ou mais recente.

```bash
git clone https://github.com/Orsi88/quality-agents.git
cd quality-agents
npm run setup
npm run qa
```

O `npm run setup` instala as ferramentas, constrói o app, cria a `workspace/` e liga a verificação que bloqueia commits de dados de projeto ou segredos. Rode de novo depois de um `git pull`.

| Comando | O que faz |
|---|---|
| `npm run qa` | Abre o app. Um `npm link` e o `qa` funciona de qualquer pasta. |
| `qa --terminal` | A mesma preparação num menu de terminal, se você preferir isso à janela. |
| `npm run new-project -- <id> "<Nome>" [--blank]` | Cria a pasta de um projeto. `--blank` deixa de fora os arquivos de contexto de QA. |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Gera um instalador naquele sistema. A saída fica em `release/`. |
| `npm run check` e `npm test` | Validam o repositório e rodam os testes dele. |

O `qa --terminal` é em inglês e ainda pergunta *Which project (system under test)?*. Qualquer id de projeto serve.

### Alterar o Moki

Edite `skills/` e `core/` para o comportamento, `app/` e `desktop/` para a janela. Depois:

```bash
npm run build
npm run typecheck
npm run check
npm test
```

Não edite `.agents/skills/` nem `.claude/skills/` à mão; o `npm run build` reescreve essas pastas. Os exemplos ficam fictícios. Quando este guia mudar, atualize `README.md` e `README.pt-BR.md` juntos.

Como a janela é construída: [docs/desktop-app.md](docs/desktop-app.md). Como uma skill é formada: [docs/skill-standard.md](docs/skill-standard.md).

| Caminho | O que é |
|---|---|
| `AGENTS.md` | O que uma ferramenta de IA lê quando esta pasta é aberta: regras e o catálogo de skills |
| `skills/`, `agents/`, `core/` | Skills, agentes prontos, políticas comuns — edite aqui |
| `app/`, `desktop/` | A janela |
| `workspace/` | Projetos locais — nunca versionados |

## Licença

[MIT](LICENSE)

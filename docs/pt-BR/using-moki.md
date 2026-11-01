# Usando o Moki

## Dentro de um projeto

**Dentro de um projeto.** A árvore do projeto: contexto, entrada (inbox), atividades, notas. Solte arquivos sobre a janela e eles são copiados para o inbox — até 40 arquivos, 200 MB cada. Pastas são ignoradas. Markdown aparece formatado; **Ctrl+E** edita, **Ctrl+S** salva, **Ctrl+W** fecha. Arquivos Word viram texto para qualquer IA conseguir ler. Excel mostra os valores e PDF abre com texto selecionável; com o PdfCraft instalado dá para destacar e comentar, e editar as páginas (girar, mover, inserir, excluir), o título e o autor (um arquivo do inbox, e qualquer edição de página, vai para uma cópia `-edited.pdf`). O botão ao lado abre qualquer um no programa dele, e o "…" deixa escolher qual (Excel, Word e PDF). Os arquivos que a IA salva aparecem na árvore assim que chegam.

**Abrir na sua ferramenta de IA** (o botão de play):

1. Escolha a atividade.
2. Se quiser, escolha quais arquivos do inbox entram, qual contexto compartilhado manter (quando o projeto tem tags, veja [Tags](#tags)) e quem deve fazer (um agente).
3. Acrescente uma observação e escolha a ferramenta.

Claude Code, Codex, Gemini CLI, Antigravity CLI e Cursor Agent abrem numa aba de terminal do app. Cursor e VS Code abrem a pasta com o pedido copiado. ChatGPT, claude.ai, Gemini web e *Só mostrar a solicitação* deixam o texto na tela, pronto para copiar. Se a abertura ainda estiver rodando depois de cerca de 20 segundos, o assistente avisa.

Aí você conversa nessa ferramenta como de costume. O pedido cita o projeto, a pasta vinculada e as skills e os agentes instalados nele.

**Configurações** (a engrenagem) tem seis abas, cada uma uma lista com filtros e busca:

| Aba | O que você faz ali |
|---|---|
| **Agentes** | Papéis que usam uma ou mais skills. Duplique um pronto, ou crie o seu; as tags dizem a quais projetos ele chega. |
| **Atividades** | Os pedidos prontos que você escolhe em "Abrir na sua ferramenta de IA": os do Moki e os seus (o que pedir, a qual skill, agente, workflow ou operação, com quais arquivos). Veja [Atividades](activities.md). |
| **Operações** | Agentes ligados por setas numa operação multiagente. Veja [Agents and operations](../agents.md) (em inglês). |
| **Skills** | O que já está instalado, o que vem com o Moki, os plugins do app (em roxo) e **Adicionar skill**: busque no registro público [SkillMD](https://skillmd.com) ou descreva uma para a sua ferramenta de IA redigir. |
| **Servidores MCP** | As ferramentas que a IA recebe, globais ou para projetos escolhidos. Veja [MCP servers](../mcp-servers.md) (em inglês). |
| **Templates** | Fonte, cores, cabeçalho, rodapé, logo e marca d'água dos PDF, Word e Excel que as atividades geram; as tags dizem quais projetos usam cada um. |

**Favoritos.** A estrela num card de Atividades, Agentes, Operações, Templates ou Skills torna o item favorito: os favoritos aparecem primeiro na lista deles, e as atividades favoritas aparecem primeiro em todo lugar onde se escolhe uma atividade. Eles ficam guardados por workspace em `library/favorites.json`.

Notas de um projeto são arquivos Markdown em `notes/` e abrem numa janela própria. Notas avulsas da tela inicial ficam no app até você enviar uma para um projeto.

## Projetos

Um projeto é um trabalho. O id é curto e em minúsculas (`billing-portal`), e a pasta é `workspace/projects/<id>/` — ou `<pasta do workspace>/projects/<id>/` em outro workspace.

Um projeto de qualidade fica assim. Um projeto em branco tem o mesmo esqueleto e só ganha `context/` depois que você aprova o `plan.json`.

```text
workspace/projects/billing-portal/
├── project.json          # nome, idioma, pasta vinculada, quem pode ver os dados
├── context/              # somente conhecimento confirmado
├── proposed-updates.md   # o que a IA notou, esperando você
├── plan.json             # projeto em branco: o plano, até você aprovar
├── tags.json             # tags de arquivos avulsos
├── activity-log.md
├── inbox/                # arquivos que você entrega à IA
├── notes/
└── runs/<run-id>/        # uma pasta por atividade
    ├── state.json        # etapa atual, para parar e retomar
    ├── inputs/  outputs/  evidence/  logs/
```

Durante uma atividade, a IA pode notar algo que parece uma regra geral. Ela grava isso em `proposed-updates.md` e pergunta antes de virar contexto. Texto confirmado é o único texto que ela pode tratar como sabido.

Os entregáveis saem em **inglês**, a menos que você defina `"deliverableLanguage": "pt-BR"` no `project.json` ou peça outro idioma na atividade. A conversa segue o idioma em que você escreve. Mensagens citadas ficam no idioma original.

## Tags

As tags ligam projetos do mesmo workspace. Dê uma tag a um projeto ou a um arquivo (abaixo do nome do projeto, ou na barra acima de um arquivo aberto); digite um nome novo para criar uma.

Um projeto com uma tag pode usar, nas atividades:

- o **contexto confirmado** (`context/`) de todos os outros projetos com aquela tag — não o inbox, as execuções nem as evidências deles;
- todos os **arquivos** marcados com ela, em qualquer projeto.

Ao abrir uma atividade, o passo *Qual contexto a IA deve considerar?* lista esses arquivos, todos marcados. Desmarque o que essa atividade não deve usar; arquivos do próprio projeto também podem ficar de fora ali. O pedido então lista exatamente os arquivos compartilhados que a IA pode ler. Ela só lê, não grava nada nos outros projetos, diz de qual projeto veio cada informação e propõe o conhecimento novo em `proposed-updates.md`, em vez de tratá-lo como confirmado.

O catálogo de tags é o `tags.json` da pasta do workspace; as tags de um projeto ficam no `project.json` dele.

## Compartilhar um projeto

Para compartilhar o contexto com o time, coloque **a pasta daquele projeto** num repositório Git privado. Ela já ignora `runs/`, `inbox/` e `temporary/`. Dados de projeto não entram neste repositório público.

## Voltar depois

Feche a sessão quando quiser. Cada atividade grava o `state.json` no caminho. Peça à IA para continuar aquela execução — na mesma ferramenta ou em outra — e ela lê o arquivo, resume onde você parou e segue dali. As ferramentas não compartilham memória. Os arquivos são a memória. Num chat, envie de novo o `state.json` e o contexto que importa.

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| A biblioteca do app e os seus projetos, depois do instalador | `Documentos/Moki` |
| Outros workspaces | `workspaces/<nome>/` na pasta do Moki, ou a pasta que você escolheu; a lista é `workspaces/workspaces.json` |
| Um projeto | `workspace/projects/<id>/` (ou `projects/<id>/` em outro workspace) |
| Conhecimento confirmado | `.../context/` |
| Uma atividade | `.../runs/<run-id>/` |
| Skills e agentes deste projeto | `workspace/projects/<id>/skills` e `agents`, ou `<pasta vinculada>/.claude/` |
| Skills e agentes de todos os projetos | `~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents` |
| Cópias de agentes prontos | `workspace/library/agents/` |
| Aparência dos documentos | `workspace/document-style.json`, ou o mesmo arquivo dentro de um projeto |
| Tags | `workspace/tags.json` (catálogo), `project.json` → `tags`, e `tags.json` dentro de um projeto (os arquivos dele) |

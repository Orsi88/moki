# Usando o Moki

## Dentro de um projeto

**Dentro de um projeto.** A árvore do projeto: contexto, entrada (inbox), atividades, notas. Solte arquivos sobre a janela e eles são copiados para o inbox — até 40 arquivos, 200 MB cada. Pastas são ignoradas. Arraste um arquivo para outra pasta para movê-lo, ou solte um arquivo do computador sobre uma pasta para copiá-lo para ela. Arquivos de execuções ficam de fora das duas coisas. Markdown aparece formatado num editor TipTap, e um desenho ou diagrama ali continua um cartão que é desenhado; **Ctrl+E** troca para o código, **Ctrl+S** salva, **Ctrl+W** fecha. O botão de atualizar o arquivo lê de novo o que está no disco, então a versão que a IA acabou de gravar aparece sem fechar a aba. O menu ⋯ e o botão direito mandam um arquivo ou pasta para a lixeira; as pastas fixas (contexto, entrada, notas, temporários, arquivos de execuções) são esvaziadas e continuam, e o `project.json` não se apaga por aí. Excluir um projeto de vez fica na lista de projetos e não vai para a lixeira. O cartão do assistente também começa citando uma skill: o pedido abre na IA escolhida e nomeia essa skill. Arquivos Word viram texto para qualquer IA conseguir ler. Excel mostra os valores e PDF abre com texto selecionável; com o PdfCraft instalado dá para destacar e comentar, e editar as páginas (girar, mover, inserir, excluir), o título e o autor (um arquivo do inbox, e qualquer edição de página, vai para uma cópia `-edited.pdf`). O botão ao lado abre qualquer um no programa dele, e o "…" deixa escolher qual (Excel, Word e PDF). Os arquivos que a IA salva aparecem na árvore assim que chegam.

**Abrir na sua ferramenta de IA** (o botão de play):

1. Escolha a atividade.
2. Se quiser, escolha quais arquivos do inbox entram, qual contexto compartilhado manter (quando o projeto tem tags, veja [Tags](#tags)) e quem deve fazer (um agente).
3. Acrescente uma observação e escolha a ferramenta. Ela já vem na sua IA padrão (**Configurações › Minhas IAs**); escolher outra aqui vale só para este pedido.

Claude Code, Codex, Gemini CLI, Antigravity CLI e Cursor Agent abrem numa aba de terminal do app. Cursor e VS Code abrem a pasta com o pedido copiado. ChatGPT, claude.ai, Gemini web e *Só mostrar a solicitação* deixam o texto na tela, pronto para copiar. Se a abertura ainda estiver rodando depois de cerca de 20 segundos, o assistente avisa.

Para conversar sobre uma ideia sem atividade, o **Chamar agente** do painel do projeto escolhe um dos agentes do projeto (e, se quiser, o assunto) e abre a sua IA como esse agente, numa conversa: nenhum run começa e nada é gravado sem você pedir.

Aí você conversa nessa ferramenta como de costume. O pedido cita o projeto, a pasta vinculada e as skills e os agentes instalados nele.

**Configurações** (a engrenagem) tem sete abas; fora Minhas IAs, cada uma é uma lista com filtros e busca:

| Aba | O que você faz ali |
|---|---|
| **Agentes** | Papéis que usam uma ou mais skills. Duplique um pronto, ou crie o seu; as tags dizem a quais projetos ele chega. |
| **Atividades** | Os pedidos prontos que você escolhe em "Abrir na sua ferramenta de IA": os do Moki e os seus (o que pedir, a qual skill, agente, workflow ou operação, com quais arquivos). Veja [Atividades](activities.md). |
| **Minhas IAs** | As IAs que o Moki abre (de terminal e editores), cada uma com a versão (o caminho aparece ao passar o mouse). O ícone do cartão faz a ação principal (instalar, ou instalar ou atualizar a extensão do Moki) e o menu **…** tem as outras, como **Tornar padrão**, que escolhe em qual as atividades começam (numa atividade você ainda pode escolher outra, só para ela). **Instalar** uma IA de terminal que falta: uma aba de terminal mostra o comando oficial e só o roda depois que você digita `y`; depois, **Verificar de novo**. No VS Code e no Cursor, **Instalar a extensão do Moki e abrir** instala a extensão da versão deste app (da release dele, conferida por SHA-256) e abre o editor na pasta ligada do projeto; um editor que falta tem **Baixar**. No Cursor a extensão aparece como *Não verificado*. Uma IA não encontrada, escolhida ao começar uma atividade, traz você para esta aba. |
| **Operações** | Agentes ligados por setas numa operação multiagente. Veja [Agents and operations](../agents.md) (em inglês). |
| **Skills** | O que já está instalado, o que vem com o Moki, os plugins do app (em roxo) e **Adicionar skill**: busque no registro público [SkillMD](https://skillmd.com), descreva uma para a sua ferramenta de IA redigir ou **Envie** skills e agentes de uma pasta `.claude` (ou de um `.zip`) do seu computador. O mesmo envio está em **Configurar projeto** (para o projeto ou para todos os projetos) e na tela inicial sem projeto aberto (para todos os projetos). Você escolhe os itens e confirma antes de qualquer instalação. Caveman e superpowers ficam desligados até você ligá-los na aba Skill do projeto; ligados, entram em toda sessão de IA aberta a partir desse projeto. |
| **Servidores MCP** | As ferramentas que a IA recebe, globais ou para projetos escolhidos. Veja [MCP servers](../mcp-servers.md) (em inglês). |
| **Templates** | Fonte, cores, cabeçalho, rodapé, logo e marca d'água dos PDF, Word e Excel que as atividades geram; as tags dizem quais projetos usam cada um. |

**Apps ArtCraft.** O menu **+** dos terminais termina com **Baixar apps ArtCraft…**: os 16 apps do [ArtCraft Launcher](https://github.com/storytold/craft-launcher) (o launcher primeiro: ele instala e atualiza os outros). **Baixar** mostra o arquivo, a release e o endereço e pede a sua confirmação; o Moki então baixa o arquivo do seu computador, confere o SHA-256, salva onde você escolher na janela do sistema e mostra a pasta. Quando o seu sistema tem mais de um formato (no Linux, o pacote da sua distribuição, como .rpm ou .deb, um AppImage ou um .tar.gz; no Windows, um .msi ou um .zip portátil), você escolhe qual, com o mais adequado marcado como recomendado. Ele nunca instala nem executa o arquivo: abra-o você mesmo (um .rpm ou .deb roda os scripts de instalação quando você o abre). Mensagens: [Solução de problemas](troubleshooting.md).

**Favoritos.** A estrela num card de Atividades, Agentes, Operações, Templates ou Skills torna o item favorito: os favoritos aparecem primeiro na lista deles, e as atividades favoritas aparecem primeiro em todo lugar onde se escolhe uma atividade. Eles ficam guardados por workspace em `library/favorites.json`.

Notas de um projeto são arquivos Markdown em `notes/` e abrem numa janela própria. Notas avulsas da tela inicial ficam no app até você enviar uma para um projeto. Num PDF, selecionar um texto oferece **Criar nota daqui**: uma nota no `notes/` do mesmo projeto, com o título `<arquivo> p<página>`, a citação e uma linha de origem (arquivo, página, retângulo em pontos); o PDF não é alterado. Uma nota de projeto pode ser exportada pela janela dela em **PDF** (exige Edge, Chrome ou Chromium), **Markdown** ou **texto**: uma janela de salvar pergunta onde, e o arquivo vai para lá (fora do workspace, só por essa escolha); as imagens embutidas na nota ficam no PDF e no Markdown e viram `[descrição]` no texto.

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

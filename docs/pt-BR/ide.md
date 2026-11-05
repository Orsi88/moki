# Moki na IDE (VS Code)

A extensão do Moki para o VS Code (*Moki light*) leva o conhecimento e as ferramentas de um projeto para a IA que você já usa no editor. Ela não substitui essa IA e não precisa do app desktop aberto: entrega ao Claude Code ou ao Copilot Chat o contexto, os agentes, as skills e os servidores MCP do projeto, e permite iniciar atividades e operações multiagente por um painel lateral.

Este guia cobre a instalação, a configuração, todos os caminhos de uso e o que fazer quando algo não funciona. A referência curta da extensão é o [ide/vscode/README.md](../../ide/vscode/README.md); os servidores MCP são gerenciados como descrito em [Servidores MCP](../mcp-servers.md) (em inglês).

Os nomes no painel seguem o idioma do VS Code. Com o VS Code em inglês, o painel mostra os nomes em inglês (por exemplo, *Connect Claude Code* em vez de *Conectar ao Claude Code*). Os comandos da paleta (**Moki: …**) estão sempre em inglês.

## O que chega na IDE

São três peças separadas. Saber qual é qual explica quase tudo o que vem depois.

| Peça | O que é | Para que serve |
|---|---|---|
| **O painel do Moki** | Uma barra lateral com a cara do app: Atividades, Agentes, Contexto, Execuções | Iniciar uma atividade ou operação, escolher o que a IA lê, acompanhar as execuções |
| **O servidor MCP do Moki** | Um servidor só de leitura, preso a um projeto ([ide/mcp/server.ts](../../ide/mcp/server.ts)) | A IA da IDE lê o contexto confirmado, as notas, o contexto compartilhado, os agentes e as skills do projeto enquanto você trabalha |
| **Os servidores MCP do projeto** | Os servidores cadastrados no MCP Manager do app (Playwright, Azure DevOps, Jira…) que valem para o projeto e estão ligados | A IA da IDE usa as mesmas ferramentas externas do app e das operações, configuradas uma vez só |

```text
App Moki ── Configurações › Servidores MCP ──┐
                                             ├──> IA da IDE (Claude Code, Copilot Chat)
Projeto Moki (contexto, notas, agentes)      ┘        ▲
          └── Servidor MCP do Moki (só leitura) ──────┘
```

Cadastrar uma ferramenta no Moki, em vez de direto na IDE, faz com que os agentes, as operações e a IDE a recebam, com as credenciais guardadas como `${VARIAVEL}`. Um servidor adicionado só na IDE funciona só lá, e a IA da IDE continua sem saber nada do projeto.

## Requisitos

- VS Code 1.101 ou mais novo.
- Pelo menos um projeto Moki no workspace ativo. Projetos são criados no app desktop.
- Para **Abrir no Claude Code** e para as operações: uma IA que roda no terminal (Claude Code, Codex, Gemini CLI, Antigravity CLI ou Cursor Agent) instalada no computador.
- Para compilar a extensão: Node.js 22.18 ou mais novo.

## Instalação

**Pelo app desktop.** **Configurações › Minhas IAs › Instalar a extensão do Moki e abrir**, no cartão do VS Code, instala a extensão da versão do app (baixada da release e conferida por SHA-256) e abre o VS Code na pasta ligada do projeto. O cartão do Cursor faz o mesmo, marcado como *Não verificado*.

**Pela release.** Baixe o [moki-0.3.0.vsix](https://github.com/Orsi88/moki/releases/download/v0.3.0/moki-0.3.0.vsix) da [release mais recente](https://github.com/Orsi88/moki/releases/latest) e rode:

```bash
code --install-extension moki-0.3.0.vsix --force
```

**A partir do código.** Na raiz do repositório:

```bash
npm install
npm run vscode:package                                   # release/moki-<versão>.vsix
code --install-extension release/moki-<versão>.vsix --force
```

Depois rode **Developer: Reload Window** no VS Code. Reinstale do mesmo jeito a cada build novo; uma janela que não foi recarregada continua com a versão antiga.

**Sem instalar (desenvolvimento).** `npm run vscode:build` e depois `code --extensionDevelopmentPath="$PWD/ide/vscode"`. Nesse modo a extensão usa o próprio repositório em vez de `<Documentos>/Moki`.

**O que acontece na primeira vez.** A extensão instalada guarda a cópia do framework em `<Documentos>/Moki`, a mesma pasta do app desktop, então os dois enxergam os mesmos workspaces e projetos (`QA_ROOT` escolhe outra pasta). Ela abre o workspace que estava **ativo no app** quando o VS Code iniciou. O ícone do Moki (o gato) aparece na barra de atividades e **Moki: …** na barra de status.

## Configuração

### 1. Ligar a pasta a um projeto

A extensão encontra o projeto da pasta aberta no VS Code:

| Situação | O que ela faz |
|---|---|
| Você já escolheu um projeto para este workspace do VS Code | Usa esse projeto enquanto ele existir |
| A pasta (ou uma pasta acima) está ligada a exatamente um projeto | Usa esse projeto |
| Está ligada a mais de um | Barra de status: **Moki: choose a project** |
| Não está ligada a nenhum | Barra de status: **Moki: no project** |

Para ligar uma pasta de vez, abra o projeto no app desktop e use o botão de **vincular** da barra lateral (a corrente): toda janela do VS Code nessa pasta passa a abrir o projeto sozinha. Para escolher um projeto só para este workspace do VS Code, clique na barra de status, no seletor no topo do painel, ou rode **Moki: Choose Project**. A pasta ligada pelo app aparece primeiro, como *Linked to this folder*.

### 2. Conectar a IA aos servidores MCP do Moki

| Como você usa a IA | O que fazer |
|---|---|
| **Copilot Chat** | Nada. A extensão registra o **Moki** e os servidores do projeto sozinha (`MCP: List Servers` mostra todos) |
| **Claude Code aberto pelo painel** (*Abrir no Claude Code*) | Nada. Ele abre com `--mcp-config` do projeto, como no app |
| **Claude Code aberto por você** (o chat do Claude Code, ou `claude` digitado no terminal) | **Conectar ao Claude Code** uma vez por pasta (rodapé do painel, ou **Moki: Connect Claude Code**) |
| **Cursor** aberto na pasta ligada ao projeto | **Moki: Sync MCP Servers to Cursor** |
| **Só o painel** | Nada. O painel funciona sem MCP |

**Conectar ao Claude Code** grava o servidor do Moki e os servidores ligados do projeto no `.mcp.json` da pasta, depois que você confirma. Só as entradas do Moki (`moki`, `moki-*`) mudam e as suas ficam; o arquivo atual vai antes para `.moki-backup/`; um `.mcp.json` novo fica fora do Git (`.git/info/exclude`), e você é avisado quando o arquivo já é versionado. Ele grava uma **cópia**: depois de ligar ou desligar servidores no app, ou de trocar de projeto, conecte de novo. O Copilot acompanha essas mudanças sozinho.

### 3. Escolher o que a IA pode ler

Em **Atividades**, **Agentes** e **Operações** o painel lista só os itens com estrela (as mesmas do app) e os 5 mais usados, contados quando você inicia algo pelo painel. A caixa de busca encontra os outros. Sem estrela nem uso ainda, aparecem os 5 primeiros.

Em **Contexto**, cada arquivo de contexto, nota e arquivo compartilhado por tags tem um botão de ligar. Desligado, ele fica fora dos pedidos e fora do que a IA consegue ler pelo servidor MCP do Moki. A estrela dá prioridade: a IA recebe o arquivo primeiro, com o texto, no pacote de contexto. Arquivos compartilhados por tags com outros projetos começam desligados e esperam você ligar. As escolhas ficam por projeto em `workspace/projects/<id>/companion.json`.

## O painel

| Aba | O que você faz |
|---|---|
| **Atividades** | Escolhe uma atividade, arquivos da entrada, um agente, uma nota e o idioma, e depois **Abrir no Claude Code** ou **Copiar para o chat** |
| **Agentes** | Os agentes habilitados no projeto e o que cada um faz; escolha um para trabalhar com ele |
| **Contexto** | Liga e desliga arquivos para a IA; marca com estrela os que ela deve ler primeiro |
| **Execuções** | Atividades para retomar, e operações multiagente para iniciar e acompanhar passo a passo |

O rodapé mostra quantos servidores MCP do projeto estão ligados (**MCPs: n ligados**), **Conectar ao Claude Code** e **Atualizar**. A barra de título da view tem *Choose Project* e *Refresh*; o menu "…" tem *Connect Claude Code*, *Sync MCP Servers to Cursor* e *Show What the AI Read*.

## Caminhos de uso

### Perguntar à IA da IDE sobre o projeto

Enquanto programa ou escreve testes, pergunte em linguagem natural: *"quais regras de negócio valem para o frete grátis?"*, *"o que o fluxo de checkout diz sobre cupons?"*. Com o servidor do Moki conectado (automático no Copilot; **Conectar ao Claude Code** para o chat do Claude Code), a IA responde com o contexto confirmado do projeto, em vez de chutar. Ela pode chamar:

| Ferramenta | Retorna |
|---|---|
| `moki_get_project` | Nome, descrição, idioma dos entregáveis, tags, agentes, skills e servidores MCP |
| `moki_get_context` | Um pacote de contexto para uma tarefa: os arquivos com estrela, com o texto (até cerca de 24.000 caracteres), e referências aos arquivos mais relacionados |
| `moki_search_knowledge` | Linhas que batem com a busca nos arquivos que ela pode ler |
| `moki_list_resources` / `moki_get_resource` | Referências, e o texto de um arquivo de contexto, nota, arquivo compartilhado, agente ou skill |
| `moki_get_agent` | As instruções de um agente (ler não executa o agente) |

### Iniciar uma atividade de QA

Em **Atividades**, escolha uma (*Revisar histórias de usuário*, *Desenhar testes*, *Revisar e depois desenhar testes*, *Pré-análise de falha*, *Montar evidências de teste*, *Contexto do projeto*…), os arquivos da entrada que ela precisa, opcionalmente um agente e uma nota, e o idioma. Depois:

- **Abrir no Claude Code** abre o Claude Code num terminal do VS Code chamado **Moki · Claude Code**, com o pedido e os servidores MCP do projeto. Você continua a conversa lá.
- **Copiar para o chat** copia o mesmo pedido e põe o cursor no chat do Claude Code, ou abre o Copilot Chat com ele digitado: é só colar e enviar. Use quando preferir o chat ao terminal.

O pedido é o mesmo que o app desktop monta: ele cita o projeto, a skill da atividade, os arquivos escolhidos e os arquivos que você desligou em Contexto. As skills param nos pontos de aprovação exatamente como no app.

### Trabalhar como um agente do projeto

Em **Agentes**, escolha um agente e comece por ali, ou escolha o agente dentro de uma atividade. Num chat já aberto, *"aja como o agente test-designer deste projeto"* também funciona: a IA lê as instruções do agente com `moki_get_agent`.

### Retomar uma atividade

**Execuções › Atividades para retomar** lista as execuções que pararam num ponto de aprovação ou esperando informação. Escolha uma para abrir a IA com a execução, que continua a partir do `state.json` dela.

### Rodar uma operação multiagente

Uma operação vinculada ao projeto no app começa em **Execuções**: escolha a operação, a IA de cada passo, preencha o que os agentes precisam (texto e arquivos da entrada) e o que você quer, e clique em **Iniciar a operação**.

- Cada passo abre no próprio terminal do VS Code (**Moki · <IA>**). Um passo termina quando escreve o resumo (`handoff/<passo>.md`) e as entregas; o próximo começa sozinho, mesmo com o painel fechado.
- Abra a execução para **responder** a pergunta de um passo (digitada no terminal dele quando está aberto; senão o passo reabre com a sua resposta), **aprovar**, **devolver com observações** ou **encerrar** um passo que espera aprovação, **tentar de novo** um passo que falhou, com a mesma IA ou outra, **escolher o caminho** quando nenhuma seta serve para o resultado ou um passo rodaria vezes demais, **pausar**, **cancelar** (o terminal dele fecha) e **ver o terminal**.
- As execuções são as mesmas do app (mesmo motor e mesma pasta), então uma execução iniciada na IDE pode ser acompanhada no app e vice-versa. Criar e editar operações, e vinculá-las a um projeto, continua sendo no app.

### Automatizar testes com o contexto do projeto

Cadastre o servidor MCP do Playwright no app (Configurações › Servidores MCP), como global ou para o projeto, e na IDE peça à IA para automatizar um cenário: ela lê as regras e os fluxos pelo servidor do Moki e controla o navegador pelo Playwright enquanto escreve e confere o teste. O mesmo vale para qualquer ferramenta cadastrada no Moki: Azure DevOps ou Jira para ler um item de trabalho ao investigar uma falha, Figma para comparar uma tela com o design.

### Trazer para o Moki as ferramentas que você já tem na IDE

Servidores configurados direto no Claude Code, no Cursor ou no VS Code aparecem no app em **Configurações › Servidores MCP › Encontrados nas IAs**. **Importar para o Moki** adiciona o servidor ao catálogo, para os agentes e as operações também usarem; uma credencial escrita nele vira uma `${VARIAVEL}`.

### Ver o que a IA leu

**Moki: Show What the AI Read** abre `workspace/projects/<id>/logs/companion.log`: cada leitura feita pelo servidor do Moki, com a ferramenta e o que foi pedido.

### Outras IAs e editores

Qualquer ferramenta que fale MCP por stdio pode usar o servidor do Moki: `npm run mcp -- --project <id>` a partir do repositório (ou `--folder <caminho>` para achar o projeto de uma pasta). O Cursor aberto na pasta ligada ao projeto recebe os servidores com **Moki: Sync MCP Servers to Cursor**.

## App ou IDE: onde fica cada coisa

| Tarefa | App | IDE |
|---|---|---|
| Criar um projeto, ligar a pasta, preparar o contexto | Sim | Não |
| Cadastrar servidores MCP e escolher os projetos deles | Sim | Não (a IDE usa) |
| Criar e editar agentes e operações; vincular operações a um projeto | Sim | Não |
| Iniciar atividades e agentes | Sim | Sim |
| Escolher o contexto que a IA lê | Sim (por atividade) | Sim (por projeto, `companion.json`) |
| Iniciar e acompanhar operações | Sim | Sim |
| A IA lê o projeto enquanto você programa | Não | Sim (servidor MCP do Moki) |

## Exceções e solução de problemas

As mensagens da extensão aparecem em inglês.

| O que aparece | Por quê | O que fazer |
|---|---|---|
| Barra de status **Moki: no project**; painel *Esta pasta não está vinculada a um projeto do Moki* | A pasta aberta não está ligada a nenhum projeto | Escolha um projeto no painel, ou ligue a pasta no app (**Escolher minha pasta**) |
| **Moki: choose a project** | A pasta está ligada a mais de um projeto | Escolha um; a escolha fica guardada para este workspace do VS Code |
| *There are no projects in the active workspace* | O workspace ativo no app não tem projetos, ou outro workspace estava ativo quando o VS Code iniciou | Crie um projeto no app, ou deixe o workspace certo ativo no app e rode **Reload Window** |
| Os projetos listados são de outro workspace | A extensão abre o workspace ativo no app quando o VS Code inicia | Troque o workspace no app e rode **Reload Window** |
| *Choose the Moki project of this folder first.* | Um comando foi rodado sem projeto escolhido | Escolha o projeto e rode de novo |
| *Open a folder in the IDE first.* (Conectar ao Claude Code) | O VS Code não tem pasta aberta, então não há onde gravar o `.mcp.json` | Abra a pasta do sistema |
| O chat do Claude Code não enxerga o Moki | O `.mcp.json` nunca foi gravado, ou foi gravado antes de os servidores mudarem | **Conectar ao Claude Code** e abrir uma sessão nova do Claude Code |
| O Copilot não lista um servidor | A `${VARIAVEL}` dele não existe neste computador (ele fica de fora), ou ele está desligado ou não vale para este projeto no app | Defina a variável e reinicie o VS Code; confira o servidor no app |
| **MCPs: 0 ligados** | Nenhum servidor cadastrado no app vale para este projeto e está ligado | Esperado quando você usa só o servidor do Moki; senão, cadastre ou ligue servidores no app |
| *This project has no linked folder on this computer* (Sync to Cursor) | A pasta do projeto nunca foi ligada neste computador | Ligue no app (botão de **vincular** da barra lateral) |
| *project.json does not allow writing to …* | O projeto define `writeAllowed: false` para a pasta | Grave o arquivo você mesmo, ou permita a escrita no `project.json` |
| *… is not installed on this computer (command "…" not found).* | A IA escolhida (para o pedido ou para um passo) não está instalada ou não está no PATH | Instale, ou escolha outra IA (no app desktop, **Configurações › Minhas IAs › Instalar**, ou uma aba de terminal da IA ausente, instala depois que você digita `y`). Um passo que não consegue abrir falha uma vez e espera: **Tentar de novo** oferece as IAs instaladas |
| *The terminal of this step is not open in VS Code.* | O terminal do passo foi fechado, ou o VS Code foi reiniciado | Responda o passo no painel (ele reabre com a resposta) ou use **Reabrir o passo** |
| Um passo aparece como **Falhou** | O terminal fechou antes do resumo, ou a IA dele não abriu | **Tentar de novo**, com a mesma IA ou outra; o que ele entregou fica na pasta dele |
| *No AI tool that runs in a terminal is installed* | As operações precisam de uma IA de terminal (Claude Code, Codex, Gemini CLI, Antigravity CLI, Cursor Agent) | Instale uma |
| *{agent} uses the MCP server {mcp}, which is not configured for {ai}* | O agente do passo precisa de um servidor que a IA escolhida não recebe | Escolha outra IA para o passo, ou disponibilize o servidor |
| O painel parece uma versão antiga depois de um build | O pacote instalado é mais antigo que o build, ou a janela não foi recarregada | Reinstale o `.vsix` com `--force` e rode **Reload Window** |
| *This workspace has no operations yet* | Não existe nenhuma operação no workspace | Crie uma no app (Configurações › Operações) e vincule ao projeto |

## Segurança e privacidade

- O servidor MCP do Moki é **só leitura** e fica preso a um projeto quando inicia; nenhuma ferramenta muda o projeto ou alcança outro. Arquivos de outros projetos só são alcançáveis por uma tag compartilhada, e só depois que você os liga.
- Arquivos com cara de segredo (`.env*`, chaves e certificados, `credentials*`, `secrets*`, chaves SSH) nunca são listados nem lidos.
- O painel roda num webview com Content-Security-Policy própria (scripts só com o nonce da página, sem rede) e conversa só com uma lista fechada de chamadas, que sempre usam o projeto ao qual o VS Code está conectado.
- As IAs abrem como um comando com argumentos, nunca por um shell.
- As credenciais dos servidores MCP são referências `${VARIAVEL}` lidas do ambiente deste computador; o Moki nunca guarda os valores.
- Os servidores MCP do projeto fazem o que eles fazem: um servidor marcado como *executa* espera sua aprovação nas operações, mas dentro do chat da própria IDE quem decide quando chamá-lo é a IA da IDE.

## Arquivos que a extensão grava

| Arquivo | Quando |
|---|---|
| `workspace/projects/<id>/companion.json` | Você liga, desliga ou marca com estrela arquivos de contexto |
| `workspace/projects/<id>/logs/companion.log` | A IA lê algo pelo servidor do Moki |
| `<pasta>/.mcp.json` e `<pasta>/.moki-backup/` | **Conectar ao Claude Code**, depois que você confirma |
| `<pasta ligada>/.cursor/mcp.json` e `.moki-backup/` | **Sync MCP Servers to Cursor**, depois que você confirma |
| `workspace/library/usage.json` | Você inicia uma atividade, agente ou operação pelo painel (a contagem das "mais usadas") |
| `workspace/projects/<id>/runs/…` | Atividades e operações iniciadas pelo painel, como no app |
| `<Documentos>/Moki` | A cópia do framework, atualizada quando uma versão nova da extensão inicia |

## Limites

- Um projeto por janela do VS Code de cada vez.
- Projetos, servidores MCP, agentes e operações são criados e editados no app; a IDE usa.
- O workspace é escolhido quando o VS Code inicia (o que está ativo no app).
- O `.mcp.json` é uma foto: conecte de novo depois de mudar servidores ou projeto.
- A extensão é feita e testada para o VS Code. Editores baseados nele (Cursor e outros) podem instalá-la, mas isso não foi verificado.

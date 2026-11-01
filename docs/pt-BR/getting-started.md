# Primeiros passos

## Instalar

### Windows

1. Baixe o [Moki.Setup.0.3.0.exe](https://github.com/Orsi88/moki/releases/download/v0.3.0/Moki.Setup.0.3.0.exe) (ou o arquivo mais recente em [Releases](https://github.com/Orsi88/moki/releases)).
2. Se o Windows disser que protegeu o computador, escolha **Mais informações → Executar assim mesmo**. O instalador ainda não tem assinatura digital.
3. Conclua. Um atalho **Moki** aparece na área de trabalho e no menu Iniciar.

A primeira abertura cria **Documentos\Moki**: os arquivos do app e a sua `workspace/`, onde ficam os projetos. Um instalador mais novo atualiza os arquivos do app e deixa `workspace/` e `workspaces/` quietas. Desinstalar também mantém essas pastas.

Instale também uma ferramenta de IA (Claude Code, Cursor, Codex, Gemini, ou um chat que você já usa). Excel, Word e PDF das atividades que vêm com o app precisam do [Node.js 22.18+](https://nodejs.org) (LTS). O app em si abre sem ele.

macOS, Linux, ou uma cópia deste repositório: [A partir do código](#a-partir-do-código).

## Usar

Abra o Moki e escolha um **workspace**, como um cofre do Obsidian. O canto dessa tela escolhe **inglês ou português** e o tema **claro ou escuro**.

**Workspaces.** Um workspace é uma pasta com seus próprios projetos, tags e configurações — por exemplo, um por cliente ou empresa. A `workspace/` que você já tem é o primeiro, então nada muda de lugar. Na primeira tela você pode:

- abrir um workspace da lista (o aberto por último fica marcado);
- **criar um novo workspace** — por padrão em `workspaces/<nome>/`, dentro da pasta do Moki, ou numa pasta que você escolher;
- **abrir uma pasta como workspace** — uma pasta que você já tem; o Moki cria uma pasta `projects/` dentro dela;
- renomear um workspace, ou removê-lo da lista (a pasta continua no computador).

Troque de workspace no rodapé da lista de projetos, ou volte para a lista com *Gerenciar workspaces…*. Os projetos de um workspace nunca enxergam outro.

**Tela inicial.** Projetos à esquerda, notas avulsas embaixo, o workspace no rodapé. Fixe um projeto para mantê-lo no topo. *Desvisualizar* tira o projeto da lista e os arquivos continuam no computador; ele vai para **Ocultos** até você mostrar de novo. Fixados e ocultos são guardados por workspace; as notas avulsas não pertencem a nenhum.

**Busca** (a lupa, ou **Ctrl+Shift+F**) toma o lugar da lista e procura no workspace ativo: nome e descrição dos projetos, e nome e texto dos arquivos deles (Markdown, texto, JSON, CSV e o texto dos arquivos Word). As tags aparecem ali como filtros; texto e tags se combinam. Um resultado abre o projeto com o arquivo.

**Criar um projeto** digitando o nome e, se quiser, as tags:

| Começar com | O que você ganha |
|---|---|
| **Arquivos de contexto de QA** | Glossário, regras de negócio, módulos, fluxos, permissões e o resto, para um sistema que você testa. |
| **Um projeto em branco** | Ainda sem contexto. Você descreve o objetivo; a IA pergunta o que precisa e escreve um plano. Os arquivos de contexto só aparecem depois da sua aprovação. |
| **Uma pasta que já existe** | *Abrir um projeto* escolhe uma pasta. O projeto recebe o nome dela (você pode editar), vincula essa pasta e abre *Configurar &lt;nome&gt;*. As configurações de IA da pasta são copiadas para `.moki-backup/` dentro dela. Nada mais ali muda. |

O formulário de criar ainda diz "um projeto por sistema que você testa". Um projeto em branco e uma pasta vinculada usam o mesmo formulário.

## A partir do código

Use isto para rodar o Moki a partir de uma cópia do repositório, no macOS ou no Linux, ou para alterar o app. Quem instalou o `.exe` no Windows pode pular.

Você precisa de Git e Node.js 22.18 ou mais recente.

```bash
git clone https://github.com/Orsi88/moki.git
cd moki
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
| `npm run vscode:package` | Gera a extensão do VS Code (`release/moki-<versão>.vsix`). Para testar antes: `npm run vscode:build` e depois `code --extensionDevelopmentPath="$PWD/ide/vscode"`. Veja [Moki na IDE](ide.md). |
| `npm run check` e `npm test` | Validam o repositório e rodam os testes dele. |

O `qa --terminal` é em inglês e ainda pergunta *Which project (system under test)?*. Qualquer id de projeto serve. Os comandos trabalham na `workspace/`; defina `QA_WORKSPACE=<pasta>` para usar outro workspace.

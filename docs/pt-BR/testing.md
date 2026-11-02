# Testes automatizados

O que é testado no Moki, como, onde roda e como acrescentar um teste. Todos os testes ficam em `tests/`. Cada cenário, um por linha, com os totais por tipo e por área: [Catálogo de testes](test-catalog.md) (o `npm run test-catalog` gera o catálogo de novo a partir dos arquivos de teste).

## Visão geral

| Suíte | Executor | Onde | Roda na CI |
|---|---|---|---|
| Unidade e integração | `node --test` (o executor de testes do próprio Node, rodando TypeScript direto) | `tests/*.test.ts`, `tests/*.test.mjs` | Sim (`npm test`) |
| Interface (ponta a ponta) | Playwright controlando o app Electron | `tests/ui/app.spec.ts` | **Não** |
| Verificações do repositório | `scripts/validate.mjs`, `check-artifacts.mjs`, `check-secrets.mjs` | — | Sim (`npm run check`) |
| Checagem de tipos | `tsc` para o código do desktop e da linha de comando, e para o app | — | Sim (`npm run typecheck`) |

```bash
npm test          # unidade e integração
npm run test:ui   # compila o app desktop e roda os testes de interface
npm run check     # validação, artefatos de execução, segredos
npm run typecheck
```

Rode a partir de um terminal **sem** `QA_ROOT`, `QA_MCP_SERVER` ou `QA_RUN_TOOL` definidos (o app instalado e a extensão do VS Code definem essas variáveis): com o `QA_ROOT`, os testes, as verificações e o hook de pré-commit leem a cópia instalada em `Documentos/Moki`, e não o repositório. Rode `unset QA_ROOT QA_MCP_SERVER QA_RUN_TOOL` antes.

## Os três tipos

- Testes de **unidade** chamam uma função com dados montados no próprio teste: parsers, formatos, regras, renderização, reescrita de links. Sem app, sem processo.
- Testes de **integração** rodam módulos reais juntos, em arquivos reais, num workspace temporário: o serviço do desktop (`createService`) com lançadores falsos, a API do painel da IDE, o servidor MCP do Moki por stdio, o validador no repositório real, a sincronização do framework pelo instalador.
- Testes de **interface** abrem a janela real do Electron (`app/` + `desktop/`) num workspace temporário e clicam nela, em português, com as ferramentas de IA simuladas.

## Testes de unidade e de integração (`node --test`)

| Arquivo | Tipo | O que cobre |
|---|---|---|
| `framework.test.mjs` | Unidade + integração | O validador no repositório real e numa cópia de teste (estrutura, workflows, espelhos e divergências), frontmatter, geração de subagentes, verificação de artefatos e de segredos, o schema do estado das execuções, geração e preenchimento de xlsx e docx, verificação das saídas, o assistente `qa` (atividades, pedidos, cópias para a entrada), renderização de Markdown |
| `desktop.test.ts` | Integração (+ alguns de unidade) | Projetos (criar, excluir, árvore, ler e editar arquivos, arquivos soltos na entrada, notas), confinamento de arquivos (`fs-guard`), "abrir com" e PdfCraft, abertura das ferramentas de IA (escolhas conferidas contra listas fixas, montagem do pedido, extração de Word, UTF-8 no Windows, sem shell), tags, agentes e a biblioteca de agentes, operações multiagente (definições, execuções, desvios e loops, falhas e novas tentativas, reprovação, respostas, cancelamento), skills (registro, criação, configuração, globais), pastas vinculadas e escrita no repositório, renderização de Markdown/docx/planilhas, sincronização do instalador, a ponte de pedidos da interface, janelas de notas, workspaces, busca |
| `companion.test.ts` | Integração | Como uma pasta encontra o projeto, o que a IA pode ler (contexto compartilhado espera, segredos nunca), isolamento entre projetos, modos de contexto e o pacote de contexto, o protocolo MCP (inicialização, ferramentas, registro), uma sessão presa a um projeto, o servidor por stdio |
| `companion-api.test.ts` | Integração | Só as chamadas do painel existem, estado, agentes, ligar e desligar contexto, abrir o Claude Code com `--mcp-config`, copiar para o chat, *Conectar ao Claude Code*, sem projeto, operações pelo painel |
| `mcp.test.ts` | Unidade + integração | O catálogo (ids, credenciais só como `${VARIAVEL}`, onde um servidor vale), o que um agente recebe, importar configurações, configurações do Claude Code e do Cursor e a mesclagem, variáveis ao iniciar, abertura com `--mcp-config`, sincronização com o Cursor, o serviço e os resultados dos testes, uma execução mantendo os servidores dela, o que a IDE lista, teste de um servidor stdio real |
| `activities.test.ts` | Unidade + integração | Atividades: a lista com as ações do app, as do Moki e as suas, o texto do pedido, a conferência dos arquivos, tags e favoritas, e, pelo serviço, criar, duplicar, excluir e abrir (uma skill, um agente ou uma operação) |
| `favorites.test.ts` | Unidade + integração | Favoritos do workspace: uma lista por tipo (atividades, agentes, operações, templates, skills), a ordem, os ids aceitos e o serviço |
| `pdf-local.test.ts` | Unidade | Comentários num PDF sem o PdfCraft: destaques, comentários, respostas, edições e exclusões gravados pelo próprio Moki |
| `md-comments.test.ts` | Unidade | Comentários guardados dentro de um arquivo Markdown (invisíveis em outros visualizadores), respostas, edições e exclusões |
| `tool-path.test.ts` | Unidade | Encontrar as ferramentas de IA a partir do app instalado: o PATH que ele monta com o do terminal e as pastas de instalação de sempre |
| `tags.test.ts` | Unidade | A regra única (sem tag = todos os projetos) e a migração de agentes e modelos de documento para tags |
| `usage.test.ts` | Unidade | As janelas de uso dos planos do Claude e do Codex, memória por terminal e por projeto |
| `i18n.test.ts` | Unidade (estático) | Todo texto do app tem tradução em pt-BR que mantém os `{marcadores}` |
| `icon-font.test.mjs` | Unidade | O desenho do gato na barra de status e a conversão dos caminhos SVG |
| `wiki.test.mjs` | Unidade | A wiki gerada a partir de `docs/`: todas as páginas, links reescritos, o aviso de versão em desenvolvimento, links quebrados param a geração |

Dois testes de `desktop.test.ts` são pulados no Windows (*app plugins load only in app sessions* e *terminal tabs start only the chosen tool…*): eles conferem linhas de comando POSIX e rodam na CI, no Linux.

### Como são escritos

- **Um workspace temporário por arquivo.** O `desktop.test.ts` cria uma pasta (`mkdtemp`) com uma cópia do framework e um serviço para o arquivo inteiro, e apaga tudo no final; cada teste acrescenta o que precisa e limpa depois. Os testes de operações criam o próprio serviço, com dependências falsas.
- **Dependências falsas, não mocks de módulo.** O serviço recebe os efeitos como dependências (`launch`, `openFolder`, `detectTools`, `killTerminal`, `terminalAlive`, `writeTerminal`, `fetch`, `pickFolder`…); os testes passam funções que registram o que foi pedido.
- **O título diz o comportamento**, numa frase que dá para conferir: *"operations: a step whose AI tool cannot open fails once (no retry loop) and is tried again with another AI"*.
- **Processos reais onde importa:** o servidor MCP do Moki por stdio, um servidor MCP stdio real para o teste de conexão.

## Testes de interface (`tests/ui/app.spec.ts`)

O Playwright abre o app Electron compilado (o `npm run test:ui` compila antes). Cada bloco `describe` tem o próprio workspace temporário e o próprio perfil de usuário, e os testes dele rodam em ordem, na mesma janela (`workers: 1`).

| Bloco | O que cobre |
|---|---|
| Moki settings | As listas das Configurações (Agentes, Operações, Skills, Servidores MCP, Templates), modelos de documento (layout, logo, marca d'água, modelos por projeto), skills e *Adicionar skill*, a página de um agente e a sua cópia dele, o editor de operações (cards, setas, aprovação, mapeamento das entradas) |
| Moki tags | Uma tag de projeto traz outro projeto para o contexto da atividade |
| Moki workspaces | A escolha de workspace, excluir um projeto oculto, notas avulsas e a janela do caderno |
| Moki project tree | Copiar um caminho, criar arquivos e pastas, comandos com barra e checklists nas notas, notas favoritas, notas do projeto no caderno |
| Moki operations in a project | Iniciar uma operação pelo formulário e acompanhar no quadro (estados, reprovar com motivo, responder uma pergunta, aprovar, a visão em lista); resultados escolhendo as setas, loops, a decisão do usuário |
| Moki terminals outlive the project screen | Sair do projeto mantém o terminal; voltar traz a aba e a saída dela |
| Moki MCP servers list | O botão Global, a escolha de projetos, os chips e tirar um projeto |
| Moki activities | Criar uma atividade em Configurações, marcar com estrela e encontrar ela primeiro ao abrir a ferramenta de IA |
| Moki favorites | A estrela nos cards de Agentes, Operações, Templates e Skills, e os favoritos primeiro |
| Moki settings without a project | Num workspace sem projetos, a aba Skills mostra a lista e, sem projeto, só o envio de skills adiciona (para todos os projetos) |
| Moki PDF comments | Comentar uma seleção numa página de PDF e num arquivo Markdown |

### Como são escritos

- O `fixture()` copia `skills/`, `agents/` e `templates/` para uma pasta temporária e acrescenta o projeto `acme` (*Acme Library*); o `addProject()` acrescenta outros.
- O `openApp()` abre o app em português num projeto, com o próprio perfil (`QA_USER_DATA`), então nunca mexe no app que você está usando.
- O `QA_FAKE_TOOLS=1` faz toda ferramenta de IA parecer instalada e não abre nenhuma; os testes gravam o que um agente entregaria (saídas, resumo, uma pergunta) e conferem que a janela acompanha.
- Os seletores usam papéis e nomes acessíveis (`getByRole('button', { name: '…' })`), com os textos em português que a pessoa vê.

## Acrescentar um teste

| O que você mudou | O que acrescentar |
|---|---|
| Uma função sem efeitos (parser, formato, regra) | Um teste de unidade no arquivo da área |
| Algo que o serviço do desktop faz | Um teste de integração em `desktop.test.ts` (ou `mcp.test.ts`, `companion*.test.ts` nessas áreas), com uma dependência falsa para cada efeito |
| O que a pessoa vê ou clica | Um teste de interface em `tests/ui/app.spec.ts`, no bloco da tela |
| Um texto do app | A tradução em pt-BR (o `i18n.test.ts` falha sem ela) |

Depois rode o `npm run test-catalog`: ele acrescenta o cenário ao catálogo e para se um arquivo de teste novo não tiver regra em `scripts/catalog-tests.mjs` (dê a área e o tipo dele lá). Acrescente o título do cenário em português em `docs/pt-BR/test-scenarios.json`: até lá o catálogo em português mostra o cenário em inglês, e o script avisa quais faltam.

Antes de um commit: `npm run typecheck`, `npm run check`, `npm test` e, quando a janela mudou, `npm run test:ui`.

## O que não tem teste automatizado

| Parte | Por que importa | Coberta hoje por |
|---|---|---|
| A ligação do processo principal do desktop (`desktop/main.ts`: canais de IPC, o aviso de fim de terminal) | Liga a janela, os terminais e o serviço | Indiretamente, pelos testes de interface |
| O host da extensão do VS Code (`ide/vscode/host.ts`, `extension.ts`) e o painel dela (`app/src/companion/`) | Detecção do projeto, registro MCP, terminais e operações na IDE | Só a API do painel (`companion-api.test.ts`) |
| A saída guardada dos terminais para quando a aba volta (`desktop/terminals.ts`) | Terminais que continuam rodando fora do projeto | Um teste de interface |
| Os comandos auxiliares (`new-project`, `new-run`, `runs`) e o menu de terminal (`qa --terminal`) | Comandos documentados para as IAs e para as pessoas | Sem teste |
| Os testes de interface na CI | Só rodam quando alguém roda | Fora da CI |
| Cobertura | Saber o que os testes deixam de fora | Não é medida |

# Testes automatizados

O que é testado no Moki, como, onde roda e como acrescentar um teste. Todos os testes ficam em `tests/`. Cada cenário, um por linha, com os totais por tipo e por área: [Catálogo de testes](test-catalog.md) (o `npm run test-catalog` gera o catálogo de novo a partir dos arquivos de teste).

## Visão geral

| Suíte | Executor | Onde | Roda na CI |
|---|---|---|---|
| Unidade e integração | `node --test` (o executor de testes do próprio Node, rodando TypeScript direto) | `tests/*.test.ts`, `tests/*.test.mjs` | Sim (`npm test`) |
| Interface (ponta a ponta) | Playwright controlando o app Electron, headless | `tests/ui/*.spec.ts` | **Não** |
| Memória e carga | `tests/perf/measure-memory.mjs` controlando o app Electron, headless | `tests/perf/` | **Não** |
| Verificações do repositório | `scripts/validate.mjs`, `check-artifacts.mjs`, `check-secrets.mjs` | — | Sim (`npm run check`) |
| Checagem de tipos | `tsc` para o código do desktop e da linha de comando, e para o app | — | Sim (`npm run typecheck`) |

```bash
npm test          # unidade e integração
npm run test:ui   # compila o app desktop e roda os testes de interface (sempre headless)
npm run measure:memory -- --label baseline   # bateria de memória e carga (precisa do npm run app:build)
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
| `md-preserve.test.ts` | Unidade | O editor formatado reescreve só o trecho editado de um arquivo Markdown: finais de linha do Windows e o espaçamento original ficam como estavam |
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

### Sempre headless

Os testes de interface nunca abrem uma janela na sua tela. O Electron não tem modo headless; por isso, no Linux, o `npm run test:ui` roda o Playwright dentro de um display X virtual (`xvfb-run`, do pacote `xvfb` / `xorg-x11-server-Xvfb`): sem o `xvfb-run` ele para com um erro e nunca cai para a sua tela real. No Windows e no macOS roda direto com `QA_UI_HEADLESS=1`. Todo teste abre o app pelo `launchMoki()` de `tests/ui/launch.ts`, que se recusa a iniciar sem `QA_UI_HEADLESS=1` e, no Linux, sem `DISPLAY` virtual ou com `WAYLAND_DISPLAY` definido; ele também limpa o `PWDEBUG` e pede ao Electron o backend X11. Não chame `electron.launch` num spec e não rode `playwright test` direto (ele para na primeira abertura). Opções do Playwright vão depois de `--`, por exemplo `npm run test:ui -- -g "PDF comments"`.

## Bateria de memória e carga

O `npm run measure:memory -- --label <nome>` (depois do `npm run app:build`) abre o app compilado num workspace temporário, headless como os testes de interface, e roda catorze cenários, três vezes cada: S0 ocioso com projeto, S1 sem projeto, S2 PDF de 25 MB (abrir, rolar, fechar), S3 o PDF três vezes (vazamento), S4 o PDF aberto com 20 arquivos mudando, S5 três terminais com saída intensa, S6 árvore de 20.000 arquivos (abrir, buscar), S7 Markdown com 3 Excalidraw e 3 Mermaid, S8 várias janelas, S9 sessenta segundos de consulta da barra de status com três terminais, S11 um PDF leve de 300 páginas (abrir, rolar até o fim, fechar), S12 uma rajada de 200 arquivos em `runs/` ao longo de cerca de 20 s com três abas Markdown abertas (uma com 5 imagens, outra com um diagrama Mermaid e um Excalidraw), S13 digitação numa nota de 300 KB e num `.md` de 300 KB (3 imagens cada) com uma árvore de 2.000 linhas expandida, e o S-floor, um Electron em branco no `about:blank` sem nada do Moki (`tests/perf/floor-main.mjs`, não precisa do build do app), que mede o custo do próprio Electron para que todo outro número possa ser lido como piso mais Moki. A janela tem 1360×860. Todos os dados (o PDF, feito com `pdf-lib` a partir de uma semente fixa, e a árvore) ficam na pasta temporária do sistema e são apagados no fim.

Por cenário ele informa, como mediana das repetições e com a dispersão (CV): pico e memória estabilizada de toda a árvore de processos (PSS de `/proc` no Linux, o working set do Electron nos outros), a parte do renderer, o tempo de abertura e a CPU do processo principal em segundos (`cpu_main_s`, o tempo de CPU do processo principal na janela do cenário; valor absoluto, porque o percentual sobe quando a janela encurta mesmo sem o trabalho ter crescido). Um relatório feito antes do `cpu_main_s` só tem `cpu_main_pct`: o `compare` mostra `n/d` nessa métrica em vez de falhar. A tabela é impressa e salva em `build/memory/<nome>-<data>.json` (o `build/` não é versionado). Um cenário que não pode rodar (por exemplo, sem `node-pty`) aparece como FAILED, nunca preenchido com números.

**Por tipo de processo, RSS, PSS e USS.** No Linux todo cenário também registra, por tipo de processo (`browser` = o principal, `renderer`, `gpu`, `utility` = serviço de rede e outros auxiliares, `zygote`, `other` = tudo na árvore que não é processo Electron, como o shell de um terminal) e no total, o RSS, o PSS e o USS em MB (`by_type` no JSON, por repetição, e chaves planas `bt_<tipo>_<rss|pss|uss>_mb` que recebem mediana e CV como qualquer outra métrica). O RSS conta uma página compartilhada por inteiro em cada processo que a mapeia (é o que a barra de status somava, o `workingSetSize` do `app.getAppMetrics()`), o PSS a divide entre esses processos (a soma é o consumo real), o USS é só o que é privado (`Private_Clean` + `Private_Dirty`, o que seria liberado se o processo saísse). O JSON também traz `bar_rss_mb` (a soma dos working sets, o que a barra mostrava), `pss_metrics_mb` (o PSS dos mesmos processos), `rss_pss_ratio` (o primeiro sobre o segundo: quanto a barra inflava o número) e `app_metrics` (cada processo com `workingSetSize`, `privateBytes` e `sharedBytes` como o Electron informa, em kB; os dois últimos podem vir vazios no Linux). Fora do Linux só há o working set, então os campos de PSS e USS não existem.

```bash
npm run measure:memory -- --label baseline          # antes de uma mudança
npm run measure:memory -- --label after-1a          # depois dela
npm run measure:memory -- compare build/memory/baseline-<data>.json build/memory/after-1a-<data>.json [--goal c1,c2,c3,c5,perf]
QA_PERF=1 npm run measure:memory -- --label after-1a --only S6,S11,S12,S13   # os cenários novos, com a sonda do processo principal
npm run measure:memory -- --label floor --only S-floor --reps 5           # só o piso: não precisa do build do app
```

O `compare` imprime a variação em MB e em % e PASS/FAIL por métrica: nenhuma métrica de memória pode ficar pior que `max(5%, 2×CV)` da baseline, nenhum tempo de abertura mais que `max(15%, 2×CV)`, a primeira renderização do Excalidraw no máximo 400 ms a mais; o `--goal` soma as metas de um lote de tarefas (c1 diagramas, c2 consulta da barra de status com pelo menos -80% de CPU, c3 pico do PDF no máximo 60% e nenhum PDF reenviado nas mudanças de arquivo, c5 renderer com terminais cheios pelo menos -30%, perf as metas absolutas abaixo). Depois da tabela ele imprime, só como informação (nunca muda um veredito), a quebra por tipo: RSS, PSS e USS por tipo de processo, antes e depois, em MB e %, e a razão RSS/PSS da barra de status de cada cenário. Sai com 1 se algo falhar. Opções: `--reps`, `--only S2,S5` (`S-floor` é um id como os outros), `--s9-seconds`, `--matrix` (abaixo). S11, S12, S13 e o atraso do laço de eventos do S6 são novos e ninguém os rodou ainda: espere ajustá-los, e aos limites abaixo, depois da primeira medição real.

**Sonda do processo principal (`QA_PERF=1`).** Opcional: o `tests/perf/main-hook.mjs` é injetado no processo principal depois que a janela está de pé (pelo mesmo canal que a bateria já usa; o `desktop/` não é tocado) e acrescenta a todo cenário `loop_lag_max_ms` (maior atraso de um timer de 20 ms no processo principal), `ipc_calls_total`, `ipc_bytes` (o que as chamadas devolvem: caracteres de textos e bytes de buffers) e `exec_file_sync_calls`, mais as chamadas por método (`ipc_by_method`, impresso depois da tabela). O S6 informa o atraso só das duas buscas; o S12 precisa da sonda e falha sem ela. Limites: ela lê o mapa privado de handlers do Electron (`ipcMain._invokeHandlers`), então outra versão do Electron pode escondê-lo; conta só o canal `qa:call` (não terminais, watch nem janelas de nota); e não vê o que rodou antes da injeção, como a consulta ao shell na partida. O `ipc_bytes` é uma estimativa do tamanho, não do que o Electron serializa.

**Switches do Chromium (`QA_ELECTRON_ARGS`).** O app aplica, antes do `ready`, os `DEFAULT_SWITCHES` do `desktop/chromium-switches.ts` e depois os da `QA_ELECTRON_ARGS`. A `DEFAULT_SWITCHES` está vazia nesta versão e, por decisão de produto, a GPU fica sempre ativa quando o computador tem uma: nenhum padrão pode conter `--disable-gpu`, `--disable-software-rasterizer` nem `--in-process-gpu`. Numa máquina sem GPU o Chromium cai sozinho para renderização por software; nada é forçado. A `QA_ELECTRON_ARGS` é uma lista separada por espaço; ela soma aos padrões e, para o mesmo switch, sobrescreve o padrão. `QA_NO_DEFAULT_SWITCHES=1`, ou `QA_ELECTRON_ARGS=` (definida e vazia), desliga os padrões, para comparar uma rodada em A/B com exatamente a lista dela. Com `QA_PERF=1` os switches realmente aplicados vão para o stderr. A lista é filtrada: o `desktop/electron-args.ts` aceita só `--disable-gpu`, `--disable-software-rasterizer`, `--in-process-gpu`, `--enable-features=`, `--disable-features=` e `--js-flags=` (valor limitado a letras, dígitos e `_ . , : = + -`, um token de no máximo 200 caracteres, no máximo 20 switches; no `--js-flags` isso quer dizer uma única flag do V8, como `--js-flags=--max-old-space-size=512`). Todo o resto (`--no-sandbox`, `--remote-debugging-*`, `--inspect*`, `--user-data-dir`, `--proxy-*`, `--load-extension`…) é ignorado e listado no stderr. Os três switches de GPU ficam na lista permitida só como ferramenta de medição, para entender onde a memória vai; não são candidatos a padrão. O ambiente chega ao app porque o `tests/ui/run.mjs` e o `tests/ui/launch.ts` repassam o `process.env` ao Electron (só `QA_SCREENSHOT`, `ELECTRON_RUN_AS_NODE` e `PWDEBUG` são removidos). Compare uma rodada com um switch com uma sem ele na mesma máquina; no Xvfb não há GPU real, então o efeito de um switch de GPU ali não é o que um usuário veria.

**Matriz A/B de switches.** Cada configuração é a `QA_ELECTRON_ARGS` de uma rodada inteira, para entender o que cada switch custa ou economiza: E0 vazio, E1 `--disable-gpu`, E2 `--disable-gpu --disable-software-rasterizer`, E3 `--enable-features=NetworkServiceInProcess2`, E4 = E1 + E3, E5 `--js-flags=--max-lazy`. É uma ferramenta para entender o consumo, não para escolher um padrão (a decisão sobre a GPU já está tomada, veja acima). O `npm run measure:memory -- --label ab --matrix E0,E1,E2,E3,E4,E5 --only S-floor,S0,S2` repete os cenários escolhidos uma vez por configuração, com `QA_NO_DEFAULT_SWITCHES=1` para que cada uma seja exatamente a sua lista, e grava `build/memory/ab-e0-<data>.json`, `ab-e1-<data>.json`… (compare quaisquer dois com o `compare`). Dá para fazer o mesmo à mão com um laço de shell: `for a in "" "--disable-gpu"; do QA_ELECTRON_ARGS="$a" npm run measure:memory -- --label "x$RANDOM" --only S-floor,S2; done`. Todo arquivo de resultado registra os switches usados em `meta.electron_args`: a `QA_ELECTRON_ARGS` crua (`null` quando não definida, vazia quando definida e vazia), a `QA_NO_DEFAULT_SWITCHES`, os switches aceitos e os rejeitados (o que o `desktop/electron-args.ts` descarta) e o que o próprio app imprimiu sobre eles no stderr, quando foi capturado. O S-floor aplica a mesma `QA_ELECTRON_ARGS` (o `tests/perf/floor-main.mjs` tem uma cópia pequena do parser) para a matriz ser comparável ali; ele não aplica a `DEFAULT_SWITCHES`, que está vazia. A memória se lê na máquina real, não no Xvfb, para qualquer conclusão sobre a GPU ou sobre números absolutos.

**Na máquina do próprio usuário (`proc-snapshot.sh`).** O `bash tests/perf/proc-snapshot.sh [pid]` (Linux, só leitura: apenas lê o `/proc`, não envia sinal e não altera nada; não é marcado como executável) imprime RSS, PSS e USS em MB por tipo (`browser`, `renderer`, `gpu`, `utility`, `zygote`, `other`), o total e uma última linha com o que a barra de status mostrava antes (a soma de RSS) contra o PSS e a razão entre eles. Ele olha só os processos cujo executável é o `node_modules/electron/dist/electron` deste repositório; com um `pid`, mantém esse processo e seus descendentes que sejam processos Electron deste repositório (os renderers e o processo de GPU que o Chromium cria a partir do zygote, não só os filhos diretos). Shells de terminal não são Electron, então não entram. Um processo que some ou não pode ser lido é pulado; sem nada para ler, ele avisa e sai com 0. Use com o app rodando (`npm run app:dev` ou uma build instalada iniciada a partir deste repositório) para ver o consumo real sem o Xvfb.

**Cenários novos.** O S11 informa `open_ms`, o pico e a memória estabilizada do renderer, `pages`, `canvas_peak` e `canvas_end` (canvases vivos em `.pdf-pages`, contados durante a rolagem e no fim), `canvas_after_close` e `renderer_growth_pct` (memória do renderer no fim da rolagem contra os 25% dela). O S12 informa, só para a rajada, `cpu_main_s`, as chamadas e bytes de IPC, `loop_lag_max_ms` e as chamadas de `readFile` por aba aberta (`tab_readfile_calls`, `readfile_tab_a/b/c`); os arquivos das abas não mudam, então toda releitura é desperdício (`tab_files_changed` é 0). O S13 informa `tree_rows` e, para a nota e para o `.md` (prefixos `note_` e `md_`), a latência da tecla até o quadro seguinte (`_key_p50_ms`, `_key_p95_ms`, `_key_max_ms`) e as tarefas longas (acima de 50 ms) na janela (`_long_tasks`, `_long_task_max_ms`).

**Critérios de aceite sugeridos** (`--goal perf` confere S2, o crescimento do S11, S12 e S6 só com o relatório "depois"): pico do S2 de no máximo 590 MB; S11 sem crescimento linear (`renderer_growth_pct` de no máximo 10 e `canvas_peak` sem crescer com as páginas); renderer do S5 pelo menos 30% abaixo da baseline original (`--goal c5`); S12 com releituras de aba no máximo iguais ao número de arquivos realmente alterados; `loop_lag_max_ms` do S6 de no máximo 50 ms. No Xvfb a GPU é desenhada por software; compare execuções da mesma máquina, os números absolutos não são o que a pessoa vê.

## Acrescentar um teste

| O que você mudou | O que acrescentar |
|---|---|
| Uma função sem efeitos (parser, formato, regra) | Um teste de unidade no arquivo da área |
| Algo que o serviço do desktop faz | Um teste de integração em `desktop.test.ts` (ou `mcp.test.ts`, `companion*.test.ts` nessas áreas), com uma dependência falsa para cada efeito |
| O que a pessoa vê ou clica | Um teste de interface em `tests/ui/app.spec.ts`, no bloco da tela |
| Um texto do app | A tradução em pt-BR (o `i18n.test.ts` falha sem ela) |

Depois rode o `npm run test-catalog`: ele acrescenta o cenário ao catálogo e para se um arquivo de teste novo não tiver regra em `scripts/catalog-tests.mjs` (dê a área e o tipo dele lá). Acrescente o título do cenário em português em `docs/pt-BR/test-scenarios.json`: até lá o catálogo em português mostra o cenário em inglês, e o script avisa quais faltam.

Antes de um commit: `npm run typecheck`, `npm run check`, `npm test` e, quando a janela mudou, `npm run test:ui` (e o `npm run measure:memory` contra uma baseline quando a mudança é de memória ou carga).

## O que não tem teste automatizado

| Parte | Por que importa | Coberta hoje por |
|---|---|---|
| A ligação do processo principal do desktop (`desktop/main.ts`: canais de IPC, o aviso de fim de terminal) | Liga a janela, os terminais e o serviço | Indiretamente, pelos testes de interface |
| O host da extensão do VS Code (`ide/vscode/host.ts`, `extension.ts`) e o painel dela (`app/src/companion/`) | Detecção do projeto, registro MCP, terminais e operações na IDE | Só a API do painel (`companion-api.test.ts`) |
| A saída guardada dos terminais para quando a aba volta (`desktop/terminals.ts`) | Terminais que continuam rodando fora do projeto | Um teste de interface |
| Os comandos auxiliares (`new-project`, `new-run`, `runs`) e o menu de terminal (`qa --terminal`) | Comandos documentados para as IAs e para as pessoas | Sem teste |
| Os testes de interface na CI | Só rodam quando alguém roda | Fora da CI |
| Cobertura | Saber o que os testes deixam de fora | Não é medida |

# Catálogo de testes

Todos os cenários de teste automatizado do Moki, um por linha: 155 cenários. O cenário é o título do teste, que diz o comportamento verificado; os títulos vêm de `docs/pt-BR/test-scenarios.json` (o original, em inglês, está no código). Como as suítes rodam e como os testes são escritos: [Testes automatizados](testing.md).

> Gerado pelo `npm run test-catalog` a partir dos arquivos de teste; não edite à mão. Rode de novo depois de criar ou renomear um teste.

## Totais

| Tipo | Cenários |
|---|---|
| Unidade | 53 |
| Integração | 79 |
| Interface | 23 |

| Área | Unidade | Integração | Interface |
|---|---|---|---|
| [Projetos](#projetos) |  | 3 |  |
| [Arquivos e confinamento](#arquivos-e-confinamento) | 1 | 7 |  |
| [Abrir com](#abrir-com) | 1 | 1 |  |
| [PDF (PdfCraft)](#pdf-pdfcraft) | 4 | 3 |  |
| [Notas](#notas) |  | 3 |  |
| [Renderização](#renderização) | 8 |  |  |
| [Busca](#busca) |  | 1 |  |
| [Workspaces](#workspaces) |  | 1 |  |
| [Tags](#tags) | 3 | 1 |  |
| [Abrir as ferramentas de IA](#abrir-as-ferramentas-de-ia) | 1 | 6 |  |
| [Encontrar as ferramentas de IA](#encontrar-as-ferramentas-de-ia) | 2 |  |  |
| [Atividades e execuções](#atividades-e-execuções) |  | 1 |  |
| [Agentes](#agentes) |  | 4 |  |
| [Operações multiagente](#operações-multiagente) |  | 7 |  |
| [Skills e configuração](#skills-e-configuração) |  | 6 |  |
| [Pasta vinculada](#pasta-vinculada) |  | 3 |  |
| [Servidores MCP](#servidores-mcp) | 8 | 8 |  |
| [Ponte do app (IPC)](#ponte-do-app-ipc) |  | 1 |  |
| [Instalador](#instalador) |  | 2 |  |
| [Uso na barra de status](#uso-na-barra-de-status) | 4 |  |  |
| [Traduções](#traduções) | 2 |  |  |
| [IDE: API do painel](#ide-api-do-painel) |  | 10 |  |
| [IDE: contexto e servidor MCP](#ide-contexto-e-servidor-mcp) |  | 8 |  |
| [Ícone da IDE](#ícone-da-ide) | 2 |  |  |
| [Framework](#framework) | 14 | 3 |  |
| [Documentação](#documentação) | 3 |  |  |
| [Configurações (UI)](#configurações-ui) |  |  | 8 |
| [Tags (UI)](#tags-ui) |  |  | 1 |
| [Workspaces (UI)](#workspaces-ui) |  |  | 3 |
| [Árvore do projeto (UI)](#árvore-do-projeto-ui) |  |  | 5 |
| [Operações num projeto (UI)](#operações-num-projeto-ui) |  |  | 2 |
| [Terminais que continuam fora do projeto (UI)](#terminais-que-continuam-fora-do-projeto-ui) |  |  | 1 |
| [Lista de servidores MCP (UI)](#lista-de-servidores-mcp-ui) |  |  | 1 |
| [Comentários em PDF (UI)](#comentários-em-pdf-ui) |  |  | 2 |

## Testes de unidade e de integração

Rodam com `npm test`.

### Projetos

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | projetos e criação de projeto | Integração | [desktop.test.ts:83](../../tests/desktop.test.ts#L83) |
| 2 | excluir um projeto exige a palavra "delete" e remove só a pasta dele | Integração | [desktop.test.ts:94](../../tests/desktop.test.ts#L94) |
| 3 | a árvore lista o projeto, esconde arquivos com ponto e anota as atividades | Integração | [desktop.test.ts:111](../../tests/desktop.test.ts#L111) |

### Arquivos e confinamento

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o readFile renderiza cada tipo de arquivo | Integração | [desktop.test.ts:121](../../tests/desktop.test.ts#L121) |
| 2 | o acesso a arquivos nunca sai da pasta do projeto | Integração | [desktop.test.ts:141](../../tests/desktop.test.ts#L141) |
| 3 | a edição é limitada a arquivos Markdown/texto já existentes | Integração | [desktop.test.ts:148](../../tests/desktop.test.ts#L148) |
| 4 | arquivos soltos no workspace são copiados para a entrada e ficam lá | Integração | [desktop.test.ts:185](../../tests/desktop.test.ts#L185) |
| 5 | abrir pasta / abrir com o programa padrão ficam confinados e filtrados | Integração | [desktop.test.ts:203](../../tests/desktop.test.ts#L203) |
| 6 | arquivos e pastas novos: só Markdown/texto, nomes seguros, nunca dentro das atividades | Integração | [desktop.test.ts:212](../../tests/desktop.test.ts#L212) |
| 7 | onde um item está neste computador: mostrado na pasta dele ou pelo caminho completo, só dentro do projeto | Integração | [desktop.test.ts:235](../../tests/desktop.test.ts#L235) |
| 8 | isolamento do fs-guard e regras de tipo de arquivo | Unidade | [desktop.test.ts:1711](../../tests/desktop.test.ts#L1711) |

### Abrir com

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | "abrir com" lista os programas do sistema e só abre com um deles | Integração | [desktop.test.ts:254](../../tests/desktop.test.ts#L254) |
| 2 | saída do gio mime: o programa padrão e depois os recomendados | Unidade | [desktop.test.ts:273](../../tests/desktop.test.ts#L273) |

### PDF (PdfCraft)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | scripts do PdfCraft: abrir, alterar, salvar no lugar ou numa cópia, listar | Integração | [desktop.test.ts:282](../../tests/desktop.test.ts#L282) |
| 2 | pdfcraft-cli fora do PATH: pastas de instalação no Windows, pastas bin de sempre nos outros sistemas | Unidade | [desktop.test.ts:310](../../tests/desktop.test.ts#L310) |
| 3 | as alterações de PDF vindas da interface são conferidas | Integração | [desktop.test.ts:318](../../tests/desktop.test.ts#L318) |
| 4 | os cartões de comentário ao lado de um PDF: cada um no seu lugar, empurrado para baixo quando cobriria o de cima | Unidade | [desktop.test.ts:337](../../tests/desktop.test.ts#L337) |
| 5 | uma seleção nas páginas desenhadas vira quadriláteros em pontos | Unidade | [desktop.test.ts:343](../../tests/desktop.test.ts#L343) |
| 6 | os comentários em PDF passam pelo PdfCraft, dentro do projeto, sem nunca alterar o arquivo da entrada | Integração | [desktop.test.ts:353](../../tests/desktop.test.ts#L353) |
| 7 | sem o PdfCraft, o próprio Moki destaca, comenta, responde, edita e exclui no PDF | Unidade | [pdf-local.test.ts:32](../../tests/pdf-local.test.ts#L32) |

### Notas

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | notas: a seção sempre aparece e as notas novas recebem nomes únicos | Integração | [desktop.test.ts:156](../../tests/desktop.test.ts#L156) |
| 2 | notas: uma é excluída pela tela inicial; nada fora de notes/ é excluído | Integração | [desktop.test.ts:164](../../tests/desktop.test.ts#L164) |
| 3 | janelas de nota: só notes/<arquivo>.md de um projeto listado ou o id de uma nota avulsa, uma janela por nota | Integração | [desktop.test.ts:1692](../../tests/desktop.test.ts#L1692) |

### Renderização

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as tabelas de Markdown desenham células mescladas (<< e ^^) como uma célula só | Unidade | [desktop.test.ts:1535](../../tests/desktop.test.ts#L1535) |
| 2 | a renderização de Markdown escapa HTML e injeção de atributos | Unidade | [desktop.test.ts:1541](../../tests/desktop.test.ts#L1541) |
| 3 | imagens relativas do Markdown só são embutidas de dentro do projeto | Unidade | [desktop.test.ts:1549](../../tests/desktop.test.ts#L1549) |
| 4 | a extração de docx mantém títulos, listas e tabelas | Unidade | [desktop.test.ts:1567](../../tests/desktop.test.ts#L1567) |
| 5 | a extração de docx mantém formatação, listas numeradas, links, notas, comentários e imagens | Unidade | [desktop.test.ts:1578](../../tests/desktop.test.ts#L1578) |
| 6 | os formatos de número das planilhas mostram os valores como os programas de planilha mostram | Unidade | [desktop.test.ts:1612](../../tests/desktop.test.ts#L1612) |
| 7 | um comentário marca o trecho dele e vai para o bloco no final; qualquer visualizador de Markdown esconde os dois | Unidade | [md-comments.test.ts:8](../../tests/md-comments.test.ts#L8) |
| 8 | respostas, edições e exclusões mantêm o texto do próprio arquivo | Unidade | [md-comments.test.ts:24](../../tests/md-comments.test.ts#L24) |

### Busca

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | busca: projetos por nome, arquivos por nome e texto, filtros por tag | Integração | [desktop.test.ts:1778](../../tests/desktop.test.ts#L1778) |

### Workspaces

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | workspaces: cada um tem os próprios projetos; os pedidos citam um workspace fora do padrão | Integração | [desktop.test.ts:1731](../../tests/desktop.test.ts#L1731) |

### Tags

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as tags compartilham contexto entre projetos; a abertura lista esse contexto e aplica as exclusões | Integração | [desktop.test.ts:426](../../tests/desktop.test.ts#L426) |
| 2 | uma regra só: sem tag = todos os projetos; a tag do próprio projeto; uma tag compartilhada | Unidade | [tags.test.ts:38](../../tests/tags.test.ts#L38) |
| 3 | agentes: as listas antigas por projeto viram tags, e cada projeto mantém exatamente o que tinha | Unidade | [tags.test.ts:45](../../tests/tags.test.ts#L45) |
| 4 | templates: os estilos antigos viram uma lista; cada projeto usa o padrão dele, senão o que não tem tag | Unidade | [tags.test.ts:66](../../tests/tags.test.ts#L66) |

### Abrir as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a abertura confere cada escolha contra listas fixas | Integração | [desktop.test.ts:402](../../tests/desktop.test.ts#L402) |
| 2 | a abertura monta o pedido; arquivos Word são extraídos | Integração | [desktop.test.ts:414](../../tests/desktop.test.ts#L414) |
| 3 | plugins por projeto: o caveman é salvo no project.json e só chega às aberturas daquele projeto | Integração | [desktop.test.ts:1071](../../tests/desktop.test.ts#L1071) |
| 4 | pedidos com caracteres não ASCII chegam às ferramentas no Windows por um arquivo de pedido em UTF-8 | Integração | [desktop.test.ts:1465](../../tests/desktop.test.ts#L1465) |
| 5 | os plugins do app só carregam nas sessões do app: no Claude por pasta, no Codex como uma linha de instrução *(pulado no Windows)* | Integração | [desktop.test.ts:1476](../../tests/desktop.test.ts#L1476) |
| 6 | o lançador mantém o texto do usuário fora de qualquer linha de comando de shell | Unidade | [desktop.test.ts:1506](../../tests/desktop.test.ts#L1506) |
| 7 | as abas de terminal só iniciam a ferramenta escolhida, na raiz do framework, com o pedido como um único argumento *(pulado no Windows)* | Integração | [desktop.test.ts:1514](../../tests/desktop.test.ts#L1514) |

### Encontrar as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | PATH: o PATH mais recente e as pastas de ferramentas de sempre se juntam ao atual, sem repetições | Unidade | [tool-path.test.ts:5](../../tests/tool-path.test.ts#L5) |
| 2 | PATH: as pastas globais do npm e dos instaladores estão entre as de sempre | Unidade | [tool-path.test.ts:14](../../tests/tool-path.test.ts#L14) |

### Atividades e execuções

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | detalhes da execução e atividades em aberto | Integração | [desktop.test.ts:395](../../tests/desktop.test.ts#L395) |

### Agentes

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | biblioteca de agentes: os agentes prontos são só leitura, as cópias são editáveis e validadas | Integração | [desktop.test.ts:472](../../tests/desktop.test.ts#L472) |
| 2 | agentes nas operações: entradas, saídas, servidores MCP e IA são lidos, validados e salvos | Integração | [desktop.test.ts:500](../../tests/desktop.test.ts#L500) |
| 3 | agentes por projeto: a lista de habilitados no project.json controla a abertura | Integração | [desktop.test.ts:1051](../../tests/desktop.test.ts#L1051) |
| 4 | agentes criados em Skills e agentes só usam skills instaladas na própria pasta | Integração | [desktop.test.ts:1217](../../tests/desktop.test.ts#L1217) |

### Operações multiagente

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | operações: uma linha de agentes; as setas passam as saídas, o resto vai para o formulário inicial; salvas na biblioteca | Integração | [desktop.test.ts:570](../../tests/desktop.test.ts#L570) |
| 2 | operações num projeto: vinculadas, iniciadas pelo formulário inicial, executadas passo a passo por arquivos | Integração | [desktop.test.ts:628](../../tests/desktop.test.ts#L628) |
| 3 | as operações desviam pelo resultado de um agente, voltam em loop até um limite e perguntam ao usuário quando nada serve | Integração | [desktop.test.ts:736](../../tests/desktop.test.ts#L736) |
| 4 | operações: um passo cujo terminal fecha falha até ser tentado de novo, um passo reprovado volta com os motivos, cancelar fecha o terminal | Integração | [desktop.test.ts:836](../../tests/desktop.test.ts#L836) |
| 5 | operações: a pergunta de um passo é respondida pelo Moki, no terminal dele ou reabrindo o passo quando o terminal não existe mais | Integração | [desktop.test.ts:935](../../tests/desktop.test.ts#L935) |
| 6 | operações: um passo cuja ferramenta de IA não abre falha uma vez (sem loop de tentativas) e é tentado de novo com outra IA | Integração | [desktop.test.ts:995](../../tests/desktop.test.ts#L995) |
| 7 | operações: na primeira vez, um exemplo no idioma do app; excluído, ele não volta | Integração | [desktop.test.ts:1035](../../tests/desktop.test.ts#L1035) |

### Skills e configuração

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | registro de skills: busca paginada, instalação verificada por projeto ou global, o pedido cita as skills do projeto | Integração | [desktop.test.ts:1172](../../tests/desktop.test.ts#L1172) |
| 2 | criar skill: a ferramenta de IA redige uma proposta no projeto; instalar copia a proposta revisada | Integração | [desktop.test.ts:1257](../../tests/desktop.test.ts#L1257) |
| 3 | aba global e tela inicial: lista, abre e remove (para a lixeira) só o que está instalado para todos os projetos | Integração | [desktop.test.ts:1288](../../tests/desktop.test.ts#L1288) |
| 4 | configurar: descrição e skills globais vinculadas por referência; os pedidos citam essas skills | Integração | [desktop.test.ts:1335](../../tests/desktop.test.ts#L1335) |
| 5 | configurar: as skills ArtCraft do framework podem ser vinculadas; os pedidos citam essas skills a partir da raiz do framework | Integração | [desktop.test.ts:1360](../../tests/desktop.test.ts#L1360) |
| 6 | projeto em branco: sem arquivos de contexto de QA; o plano da IA é filtrado e aprovado em Configurar | Integração | [desktop.test.ts:1371](../../tests/desktop.test.ts#L1371) |

### Pasta vinculada

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | pasta vinculada: vincular registra a pasta e faz backup das configurações de IA dentro dela | Integração | [desktop.test.ts:1082](../../tests/desktop.test.ts#L1082) |
| 2 | pasta vinculada: dá para criar um projeto a partir de uma pasta existente escolhida na janela | Integração | [desktop.test.ts:1135](../../tests/desktop.test.ts#L1135) |
| 3 | aba do repositório: instalações, agentes e remoções num .claude vinculado exigem confirmação e backup; writeAllowed: false recusa | Integração | [desktop.test.ts:1409](../../tests/desktop.test.ts#L1409) |

### Servidores MCP

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | MCPs: a última seção lista os servidores configurados onde as ferramentas de IA iniciam | Integração | [desktop.test.ts:173](../../tests/desktop.test.ts#L173) |
| 2 | um catálogo: os ids são estáveis e únicos, os nomes podem se repetir | Unidade | [mcp.test.ts:54](../../tests/mcp.test.ts#L54) |
| 3 | credenciais nunca são guardadas: só ${VARIAVEL} | Unidade | [mcp.test.ts:66](../../tests/mcp.test.ts#L66) |
| 4 | onde um servidor vale: global, ou só nos projetos escolhidos; desligado, não chega a nenhum projeto | Unidade | [mcp.test.ts:79](../../tests/mcp.test.ts#L79) |
| 5 | um agente recebe só os servidores que o contrato dele cita e que o projeto tem ligados | Unidade | [mcp.test.ts:94](../../tests/mcp.test.ts#L94) |
| 6 | importação: formatos Claude/Cursor, VS Code e mapas simples; credenciais viram variáveis | Unidade | [mcp.test.ts:100](../../tests/mcp.test.ts#L100) |
| 7 | configurações para o Claude Code e o Cursor; a mesclagem mantém as entradas da pessoa | Unidade | [mcp.test.ts:112](../../tests/mcp.test.ts#L112) |
| 8 | as variáveis só são lidas quando um servidor inicia; quando falta uma, diz qual, nunca um valor | Unidade | [mcp.test.ts:124](../../tests/mcp.test.ts#L124) |
| 9 | o Claude Code aberto pelo Moki recebe --mcp-config com os servidores do projeto e o do próprio Moki | Integração | [mcp.test.ts:132](../../tests/mcp.test.ts#L132) |
| 10 | o Cursor aberto pelo Moki: as entradas moki do <raiz>/.cursor/mcp.json, mantendo as da pessoa | Integração | [mcp.test.ts:146](../../tests/mcp.test.ts#L146) |
| 11 | sincronizar com o Cursor na pasta vinculada: pergunta antes, respeita o writeAllowed, faz backup | Integração | [mcp.test.ts:154](../../tests/mcp.test.ts#L154) |
| 12 | Codex: o Moki grava só a própria região do .codex/config.toml; as tabelas da pessoa ficam; uma variável nunca é gravada como valor | Unidade | [mcp.test.ts:169](../../tests/mcp.test.ts#L169) |
| 13 | serviço: um catálogo com onde cada servidor vale, resultados dos testes guardados sem valores | Integração | [mcp.test.ts:197](../../tests/mcp.test.ts#L197) |
| 14 | uma execução de operação mantém os servidores com que começou | Integração | [mcp.test.ts:216](../../tests/mcp.test.ts#L216) |
| 15 | o IDE Companion lista os servidores ligados, sem comando nem variáveis | Integração | [mcp.test.ts:227](../../tests/mcp.test.ts#L227) |
| 16 | teste de conexão: um servidor stdio real (o do próprio Moki) e um HTTP | Integração | [mcp.test.ts:233](../../tests/mcp.test.ts#L233) |

### Ponte do app (IPC)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | os pedidos da interface só executam métodos do serviço e devolvem os erros como mensagens | Integração | [desktop.test.ts:1681](../../tests/desktop.test.ts#L1681) |

### Instalador

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a sincronização do framework pelo instalador atualiza os arquivos do framework e nunca mexe em workspace/ | Integração | [desktop.test.ts:1634](../../tests/desktop.test.ts#L1634) |
| 2 | as cópias instaladas mantêm o framework no QA_ROOT, na pasta antiga ou em <Documentos>/Moki | Integração | [desktop.test.ts:1665](../../tests/desktop.test.ts#L1665) |

### Uso na barra de status

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as janelas de uso do plano do Claude vêm de limits[], com o modelo de um limite restrito | Unidade | [usage.test.ts:7](../../tests/usage.test.ts#L7) |
| 2 | as janelas de uso do plano do Codex são nomeadas pela duração | Unidade | [usage.test.ts:26](../../tests/usage.test.ts#L26) |
| 3 | um terminal conta a memória de tudo o que ele iniciou, uma vez só | Unidade | [usage.test.ts:33](../../tests/usage.test.ts#L33) |
| 4 | a memória é listada por projeto e, dentro dele, por terminal | Unidade | [usage.test.ts:40](../../tests/usage.test.ts#L40) |

### Traduções

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | todo texto do app tem tradução em pt-BR | Unidade | [i18n.test.ts:30](../../tests/i18n.test.ts#L30) |
| 2 | as traduções mantêm os {marcadores} do texto em inglês | Unidade | [i18n.test.ts:40](../../tests/i18n.test.ts#L40) |

### IDE: API do painel

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | só existem as chamadas do painel; o serviço inteiro nunca fica acessível | Integração | [companion-api.test.ts:80](../../tests/companion-api.test.ts#L80) |
| 2 | estado: o projeto conectado, a lista para trocar, os servidores MCP ligados | Integração | [companion-api.test.ts:87](../../tests/companion-api.test.ts#L87) |
| 3 | agentes: só os que o projeto usa | Integração | [companion-api.test.ts:95](../../tests/companion-api.test.ts#L95) |
| 4 | contexto: desligar um arquivo deixa ele fora dos pedidos e do que a IA lê | Integração | [companion-api.test.ts:100](../../tests/companion-api.test.ts#L100) |
| 5 | abrir: o Claude Code com o pedido, as exclusões e o --mcp-config, só para o projeto ativo | Integração | [companion-api.test.ts:113](../../tests/companion-api.test.ts#L113) |
| 6 | copiar para o chat: o mesmo pedido copiado, nada é aberto | Integração | [companion-api.test.ts:126](../../tests/companion-api.test.ts#L126) |
| 7 | conectar ao Claude Code: pergunta antes, grava só as entradas do Moki, faz backup e esconde do Git | Integração | [companion-api.test.ts:135](../../tests/companion-api.test.ts#L135) |
| 8 | conectar ao Cursor e ao Codex pelo mesmo menu: cada um no próprio arquivo da pasta | Integração | [companion-api.test.ts:154](../../tests/companion-api.test.ts#L154) |
| 9 | sem projeto, o painel pede um | Integração | [companion-api.test.ts:166](../../tests/companion-api.test.ts#L166) |
| 10 | operações pelo painel: iniciadas, cada passo no próprio terminal, avançadas pelo loop | Integração | [companion-api.test.ts:174](../../tests/companion-api.test.ts#L174) |

### IDE: contexto e servidor MCP

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a pasta aberta encontra o projeto dela: a pasta vinculada primeiro, subpastas também | Integração | [companion.test.ts:45](../../tests/companion.test.ts#L45) |
| 2 | recursos: contexto e notas do próprio projeto, o contexto compartilhado espera a pessoa, nenhum segredo | Integração | [companion.test.ts:54](../../tests/companion.test.ts#L54) |
| 3 | isolamento: ids de outros projetos ou caminhos fora são recusados | Integração | [companion.test.ts:73](../../tests/companion.test.ts#L73) |
| 4 | recursos manuais ficam escondidos até serem selecionados; os modos são salvos no companion.json | Integração | [companion.test.ts:82](../../tests/companion.test.ts#L82) |
| 5 | pacote de contexto: primeiro o texto selecionado, dentro do limite, depois as referências relacionadas | Integração | [companion.test.ts:99](../../tests/companion.test.ts#L99) |
| 6 | MCP: initialize, tools/list, tools/call, e toda chamada é registrada | Integração | [companion.test.ts:113](../../tests/companion.test.ts#L113) |
| 7 | MCP: a sessão fica presa a um projeto, ou explica por que não | Integração | [companion.test.ts:133](../../tests/companion.test.ts#L133) |
| 8 | servidor MCP por stdio | Integração | [companion.test.ts:145](../../tests/companion.test.ts#L145) |

### Ícone da IDE

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o gato da barra de status: um glifo em U+E000, nas medidas do codicon | Unidade | [icon-font.test.mjs:24](../../tests/icon-font.test.mjs#L24) |
| 2 | conversão dos caminhos: linhas, curvas e arcos terminam onde o SVG termina | Unidade | [icon-font.test.mjs:39](../../tests/icon-font.test.mjs#L39) |

### Framework

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o repositório real passa na validação | Integração | [framework.test.mjs:35](../../tests/framework.test.mjs#L35) |
| 2 | a cópia de teste passa na validação, incluindo os espelhos | Integração | [framework.test.mjs:39](../../tests/framework.test.mjs#L39) |
| 3 | o validador recusa problemas de estrutura | Unidade | [framework.test.mjs:44](../../tests/framework.test.mjs#L44) |
| 4 | o validador confere os workflows | Unidade | [framework.test.mjs:70](../../tests/framework.test.mjs#L70) |
| 5 | a divergência das cópias geradas é detectada | Unidade | [framework.test.mjs:91](../../tests/framework.test.mjs#L91) |
| 6 | leitor de frontmatter | Unidade | [framework.test.mjs:102](../../tests/framework.test.mjs#L102) |
| 7 | agentes só leitura viram subagentes do Claude Code sem as ferramentas de edição | Unidade | [framework.test.mjs:110](../../tests/framework.test.mjs#L110) |
| 8 | verificação de artefatos | Unidade | [framework.test.mjs:116](../../tests/framework.test.mjs#L116) |
| 9 | verificação de segredos | Unidade | [framework.test.mjs:133](../../tests/framework.test.mjs#L133) |
| 10 | schema do estado das execuções | Unidade | [framework.test.mjs:146](../../tests/framework.test.mjs#L146) |
| 11 | ida e volta de xlsx e aviso de planilha ausente | Unidade | [framework.test.mjs:161](../../tests/framework.test.mjs#L161) |
| 12 | o preenchimento de xlsx mantém o modelo, limpa as linhas de exemplo e mapeia os cabeçalhos | Unidade | [framework.test.mjs:173](../../tests/framework.test.mjs#L173) |
| 13 | docx: imagens, links, marcadores e modelos de exemplo | Unidade | [framework.test.mjs:187](../../tests/framework.test.mjs#L187) |
| 14 | verificação das saídas | Unidade | [framework.test.mjs:211](../../tests/framework.test.mjs#L211) |
| 15 | assistente qa: atividades, pedidos, caminhos, cópias para a entrada | Integração | [framework.test.mjs:229](../../tests/framework.test.mjs#L229) |
| 16 | Markdown: listas aninhadas, títulos setext, linhas horizontais e links automáticos | Unidade | [framework.test.mjs:255](../../tests/framework.test.mjs#L255) |
| 17 | Markdown para HTML | Unidade | [framework.test.mjs:269](../../tests/framework.test.mjs#L269) |

### Documentação

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | toda página do docs/wiki.json é gerada, com a Home, a barra lateral e o rodapé | Unidade | [wiki.test.mjs:12](../../tests/wiki.test.mjs#L12) |
| 2 | os links viram páginas da wiki ou links do GitHub; uma página diz onde é editada e aponta para a tradução | Unidade | [wiki.test.mjs:20](../../tests/wiki.test.mjs#L20) |
| 3 | outra branch recebe o aviso de versão em desenvolvimento; um link quebrado para a geração | Unidade | [wiki.test.mjs:36](../../tests/wiki.test.mjs#L36) |

## Testes de interface

Rodam com `npm run test:ui`. Cada área é um bloco de `tests/ui/app.spec.ts`; os cenários dela rodam em ordem, na mesma janela.

### Configurações (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | Templates rola e os controles dela têm o mesmo tamanho | Interface | [ui/app.spec.ts:98](../../tests/ui/app.spec.ts#L98) |
| 2 | um logo escolhido aparece no formulário e na prévia | Interface | [ui/app.spec.ts:120](../../tests/ui/app.spec.ts#L120) |
| 3 | um texto de marca d'água aparece na página de prévia | Interface | [ui/app.spec.ts:129](../../tests/ui/app.spec.ts#L129) |
| 4 | templates são uma lista: um novo, marcado com um projeto, vale só para ele | Interface | [ui/app.spec.ts:134](../../tests/ui/app.spec.ts#L134) |
| 5 | Skills é uma lista como as outras abas: abas de filtro, busca, um detalhe; Adicionar skill tem página própria | Interface | [ui/app.spec.ts:157](../../tests/ui/app.spec.ts#L157) |
| 6 | um agente mostra o que precisa e entrega; a sua cópia edita isso, incluindo MCPs e IA | Interface | [ui/app.spec.ts:178](../../tests/ui/app.spec.ts#L178) |
| 7 | o seu agente: descrição e instruções em campos de texto, skills buscadas e acrescentadas, um Salvar só; as tags dizem a quais projetos ele chega | Interface | [ui/app.spec.ts:204](../../tests/ui/app.spec.ts#L204) |
| 8 | uma operação liga agentes com setas: aprovação, qual saída responde qual entrada, salva na lista | Interface | [ui/app.spec.ts:235](../../tests/ui/app.spec.ts#L235) |

### Tags (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma tag de projeto traz o outro projeto para o contexto da atividade | Interface | [ui/app.spec.ts:373](../../tests/ui/app.spec.ts#L373) |

### Workspaces (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o app abre na escolha de workspace; um workspace novo abre vazio e dá para voltar ao anterior | Interface | [ui/app.spec.ts:408](../../tests/ui/app.spec.ts#L408) |
| 2 | um projeto oculto só é excluído de vez depois de digitar delete | Interface | [ui/app.spec.ts:423](../../tests/ui/app.spec.ts#L423) |
| 3 | uma nota avulsa abre dentro do app; a janela do caderno lista as notas avulsas abertas, como abas | Interface | [ui/app.spec.ts:446](../../tests/ui/app.spec.ts#L446) |

### Árvore do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o clique direito num item da árvore copia o caminho completo dele | Interface | [ui/app.spec.ts:498](../../tests/ui/app.spec.ts#L498) |
| 2 | o menu ⋯ cria um arquivo que abre pronto para escrever, e uma pasta na raiz do projeto | Interface | [ui/app.spec.ts:508](../../tests/ui/app.spec.ts#L508) |
| 3 | digitar / numa nota lista os comandos de formatação; um checklist continua no Enter | Interface | [ui/app.spec.ts:545](../../tests/ui/app.spec.ts#L545) |
| 4 | a estrela transforma uma nota numa favorita dourada, a primeira da pasta de notas | Interface | [ui/app.spec.ts:585](../../tests/ui/app.spec.ts#L585) |
| 5 | uma nota do projeto abre dentro do app, e no caderno dele com cada nota do projeto como uma aba | Interface | [ui/app.spec.ts:617](../../tests/ui/app.spec.ts#L617) |

### Operações num projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma operação é vinculada, iniciada pelo formulário e avança conforme cada agente entrega os arquivos | Interface | [ui/app.spec.ts:690](../../tests/ui/app.spec.ts#L690) |
| 2 | o resultado escolhe a seta: rejected vai para o fixer e volta para a revisão; sem resultado válido, pergunta ao usuário | Interface | [ui/app.spec.ts:785](../../tests/ui/app.spec.ts#L785) |

### Terminais que continuam fora do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | sair do projeto não fecha o terminal dele; abrir o projeto de novo traz a aba de volta | Interface | [ui/app.spec.ts:847](../../tests/ui/app.spec.ts#L847) |

### Lista de servidores MCP (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | um servidor fica global ou é dado a projetos escolhidos a partir da linha dele | Interface | [ui/app.spec.ts:892](../../tests/ui/app.spec.ts#L892) |

### Comentários em PDF (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma seleção é comentada direto na página; o comentário fica ao lado, ligado por uma linha | Interface | [ui/app.spec.ts:973](../../tests/ui/app.spec.ts#L973) |
| 2 | um arquivo .md é comentado do mesmo jeito; o comentário fica dentro do arquivo, invisível em outros visualizadores | Interface | [ui/app.spec.ts:1031](../../tests/ui/app.spec.ts#L1031) |

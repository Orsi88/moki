# Catálogo de testes

Todos os cenários de teste automatizado do Moki, um por linha: 206 cenários. O cenário é o título do teste, que diz o comportamento verificado; os títulos vêm de `docs/pt-BR/test-scenarios.json` (o original, em inglês, está no código). Como as suítes rodam e como os testes são escritos: [Testes automatizados](testing.md).

> Gerado pelo `npm run test-catalog` a partir dos arquivos de teste; não edite à mão. Rode de novo depois de criar ou renomear um teste.

## Totais

| Tipo | Cenários |
|---|---|
| Unidade | 66 |
| Integração | 106 |
| Interface | 34 |

| Área | Unidade | Integração | Interface |
|---|---|---|---|
| [Projetos](#projetos) |  | 3 |  |
| [Arquivos e confinamento](#arquivos-e-confinamento) | 1 | 7 |  |
| [Abrir com](#abrir-com) | 1 | 1 |  |
| [PDF (PdfCraft)](#pdf-pdfcraft) | 4 | 3 |  |
| [Notas](#notas) |  | 5 |  |
| [Renderização](#renderização) | 8 |  |  |
| [Busca](#busca) |  | 1 |  |
| [Workspaces](#workspaces) |  | 1 |  |
| [Tags](#tags) | 3 | 1 |  |
| [Abrir as ferramentas de IA](#abrir-as-ferramentas-de-ia) | 1 | 9 |  |
| [Encontrar as ferramentas de IA](#encontrar-as-ferramentas-de-ia) | 2 | 4 |  |
| [Atividades](#atividades) | 4 | 3 |  |
| [Favoritos](#favoritos) | 2 | 1 |  |
| [Atividades e execuções](#atividades-e-execuções) |  | 1 |  |
| [Agentes](#agentes) |  | 4 |  |
| [Operações multiagente](#operações-multiagente) |  | 7 |  |
| [Skills e configuração](#skills-e-configuração) |  | 8 |  |
| [Pasta vinculada](#pasta-vinculada) |  | 4 |  |
| [Servidores MCP](#servidores-mcp) | 8 | 8 |  |
| [Ponte do app (IPC)](#ponte-do-app-ipc) |  | 1 |  |
| [Instalador](#instalador) |  | 2 |  |
| [Uso na barra de status](#uso-na-barra-de-status) | 4 |  |  |
| [Traduções](#traduções) | 5 |  |  |
| [IDE: API do painel](#ide-api-do-painel) |  | 11 |  |
| [IDE: contexto e servidor MCP](#ide-contexto-e-servidor-mcp) |  | 8 |  |
| [Ícone da IDE](#ícone-da-ide) | 2 |  |  |
| [Framework](#framework) | 15 | 3 |  |
| [Documentação](#documentação) | 3 |  |  |
| [ArtCraft apps download](#artcraft-apps-download) | 3 | 10 |  |
| [Configurações (UI)](#configurações-ui) |  |  | 8 |
| [Tags (UI)](#tags-ui) |  |  | 2 |
| [Workspaces (UI)](#workspaces-ui) |  |  | 4 |
| [Árvore do projeto (UI)](#árvore-do-projeto-ui) |  |  | 7 |
| [Operações num projeto (UI)](#operações-num-projeto-ui) |  |  | 2 |
| [Terminais que continuam fora do projeto (UI)](#terminais-que-continuam-fora-do-projeto-ui) |  |  | 3 |
| [Lista de servidores MCP (UI)](#lista-de-servidores-mcp-ui) |  |  | 1 |
| [Comentários em PDF (UI)](#comentários-em-pdf-ui) |  |  | 2 |
| [Atividades (UI)](#atividades-ui) |  |  | 1 |
| [Configurações sem projeto (UI)](#configurações-sem-projeto-ui) |  |  | 1 |
| [Favoritos (UI)](#favoritos-ui) |  |  | 1 |
| [Minhas IAs e o painel do projeto (UI)](#minhas-ias-e-o-painel-do-projeto-ui) |  |  | 2 |

## Testes de unidade e de integração

Rodam com `npm test`.

### Projetos

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | projetos e criação de projeto | Integração | [desktop.test.ts:85](../../tests/desktop.test.ts#L85) |
| 2 | excluir um projeto exige a palavra "delete" e remove só a pasta dele | Integração | [desktop.test.ts:96](../../tests/desktop.test.ts#L96) |
| 3 | a árvore lista o projeto, esconde arquivos com ponto e anota as atividades | Integração | [desktop.test.ts:113](../../tests/desktop.test.ts#L113) |

### Arquivos e confinamento

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o readFile renderiza cada tipo de arquivo | Integração | [desktop.test.ts:123](../../tests/desktop.test.ts#L123) |
| 2 | o acesso a arquivos nunca sai da pasta do projeto | Integração | [desktop.test.ts:143](../../tests/desktop.test.ts#L143) |
| 3 | a edição é limitada a arquivos Markdown/texto já existentes | Integração | [desktop.test.ts:150](../../tests/desktop.test.ts#L150) |
| 4 | arquivos soltos no workspace são copiados para a entrada e ficam lá | Integração | [desktop.test.ts:234](../../tests/desktop.test.ts#L234) |
| 5 | abrir pasta / abrir com o programa padrão ficam confinados e filtrados | Integração | [desktop.test.ts:252](../../tests/desktop.test.ts#L252) |
| 6 | arquivos e pastas novos: Markdown, texto, planilha e Word vazios, nomes seguros, nunca dentro das atividades | Integração | [desktop.test.ts:261](../../tests/desktop.test.ts#L261) |
| 7 | onde um item está neste computador: mostrado na pasta dele ou pelo caminho completo, só dentro do projeto | Integração | [desktop.test.ts:292](../../tests/desktop.test.ts#L292) |
| 8 | isolamento do fs-guard e regras de tipo de arquivo | Unidade | [desktop.test.ts:2012](../../tests/desktop.test.ts#L2012) |

### Abrir com

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | "abrir com" lista os programas do sistema e só abre com um deles | Integração | [desktop.test.ts:311](../../tests/desktop.test.ts#L311) |
| 2 | saída do gio mime: o programa padrão e depois os recomendados | Unidade | [desktop.test.ts:330](../../tests/desktop.test.ts#L330) |

### PDF (PdfCraft)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | scripts do PdfCraft: abrir, alterar, salvar no lugar ou numa cópia, listar | Integração | [desktop.test.ts:339](../../tests/desktop.test.ts#L339) |
| 2 | pdfcraft-cli fora do PATH: pastas de instalação no Windows, pastas bin de sempre nos outros sistemas | Unidade | [desktop.test.ts:367](../../tests/desktop.test.ts#L367) |
| 3 | as alterações de PDF vindas da interface são conferidas | Integração | [desktop.test.ts:375](../../tests/desktop.test.ts#L375) |
| 4 | os cartões de comentário ao lado de um PDF: cada um no seu lugar, empurrado para baixo quando cobriria o de cima | Unidade | [desktop.test.ts:394](../../tests/desktop.test.ts#L394) |
| 5 | uma seleção nas páginas desenhadas vira quadriláteros em pontos | Unidade | [desktop.test.ts:400](../../tests/desktop.test.ts#L400) |
| 6 | os comentários em PDF passam pelo PdfCraft, dentro do projeto, sem nunca alterar o arquivo da entrada | Integração | [desktop.test.ts:410](../../tests/desktop.test.ts#L410) |
| 7 | sem o PdfCraft, o próprio Moki destaca, comenta, responde, edita e exclui no PDF | Unidade | [pdf-local.test.ts:32](../../tests/pdf-local.test.ts#L32) |

### Notas

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | notas: a seção sempre aparece e as notas novas recebem nomes únicos | Integração | [desktop.test.ts:158](../../tests/desktop.test.ts#L158) |
| 2 | notas: uma é excluída pela tela inicial; nada fora de notes/ é excluído | Integração | [desktop.test.ts:166](../../tests/desktop.test.ts#L166) |
| 3 | notes: a selection of a PDF becomes a note titled by file and page, with its source | Integração | [desktop.test.ts:175](../../tests/desktop.test.ts#L175) |
| 4 | notes: exported as md, txt and pdf to the file the save dialog returns; nothing else is exported | Integração | [desktop.test.ts:183](../../tests/desktop.test.ts#L183) |
| 5 | janelas de nota: só notes/<arquivo>.md de um projeto listado ou o id de uma nota avulsa, uma janela por nota | Integração | [desktop.test.ts:1993](../../tests/desktop.test.ts#L1993) |

### Renderização

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as tabelas de Markdown desenham células mescladas (<< e ^^) como uma célula só | Unidade | [desktop.test.ts:1836](../../tests/desktop.test.ts#L1836) |
| 2 | a renderização de Markdown escapa HTML e injeção de atributos | Unidade | [desktop.test.ts:1842](../../tests/desktop.test.ts#L1842) |
| 3 | imagens relativas do Markdown só são embutidas de dentro do projeto | Unidade | [desktop.test.ts:1850](../../tests/desktop.test.ts#L1850) |
| 4 | a extração de docx mantém títulos, listas e tabelas | Unidade | [desktop.test.ts:1868](../../tests/desktop.test.ts#L1868) |
| 5 | a extração de docx mantém formatação, listas numeradas, links, notas, comentários e imagens | Unidade | [desktop.test.ts:1879](../../tests/desktop.test.ts#L1879) |
| 6 | os formatos de número das planilhas mostram os valores como os programas de planilha mostram | Unidade | [desktop.test.ts:1913](../../tests/desktop.test.ts#L1913) |
| 7 | um comentário marca o trecho dele e vai para o bloco no final; qualquer visualizador de Markdown esconde os dois | Unidade | [md-comments.test.ts:8](../../tests/md-comments.test.ts#L8) |
| 8 | respostas, edições e exclusões mantêm o texto do próprio arquivo | Unidade | [md-comments.test.ts:24](../../tests/md-comments.test.ts#L24) |

### Busca

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | busca: projetos por nome, arquivos por nome e texto, filtros por tag | Integração | [desktop.test.ts:2079](../../tests/desktop.test.ts#L2079) |

### Workspaces

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | workspaces: cada um tem os próprios projetos; os pedidos citam um workspace fora do padrão | Integração | [desktop.test.ts:2032](../../tests/desktop.test.ts#L2032) |

### Tags

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as tags compartilham contexto entre projetos; a abertura lista esse contexto e aplica as exclusões | Integração | [desktop.test.ts:483](../../tests/desktop.test.ts#L483) |
| 2 | uma regra só: sem tag = todos os projetos; a tag do próprio projeto; uma tag compartilhada | Unidade | [tags.test.ts:39](../../tests/tags.test.ts#L39) |
| 3 | agentes: as listas antigas por projeto viram tags, e cada projeto mantém exatamente o que tinha | Unidade | [tags.test.ts:46](../../tests/tags.test.ts#L46) |
| 4 | templates: os estilos antigos viram uma lista; cada projeto usa o padrão dele, senão o que não tem tag | Unidade | [tags.test.ts:67](../../tests/tags.test.ts#L67) |

### Abrir as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a abertura confere cada escolha contra listas fixas | Integração | [desktop.test.ts:459](../../tests/desktop.test.ts#L459) |
| 2 | a abertura monta o pedido; arquivos Word são extraídos | Integração | [desktop.test.ts:471](../../tests/desktop.test.ts#L471) |
| 3 | plugins por projeto: o caveman é salvo no project.json e só chega às aberturas daquele projeto | Integração | [desktop.test.ts:1128](../../tests/desktop.test.ts#L1128) |
| 4 | pedidos com caracteres não ASCII chegam às ferramentas no Windows por um arquivo de pedido em UTF-8 | Integração | [desktop.test.ts:1710](../../tests/desktop.test.ts#L1710) |
| 5 | os plugins do app só carregam nas sessões do app: no Claude por pasta, no Codex como uma linha de instrução *(pulado no Windows)* | Integração | [desktop.test.ts:1721](../../tests/desktop.test.ts#L1721) |
| 6 | o lançador mantém o texto do usuário fora de qualquer linha de comando de shell | Unidade | [desktop.test.ts:1751](../../tests/desktop.test.ts#L1751) |
| 7 | planos de instalação: comandos fixos do fabricante por sistema para toda IA de terminal; editores são baixados, não instalados | Integração | [desktop.test.ts:1759](../../tests/desktop.test.ts#L1759) |
| 8 | a missing installable tool opens run-tool in the tab; the request carries the tool and one prompt argument *(pulado no Windows)* | Integração | [desktop.test.ts:1776](../../tests/desktop.test.ts#L1776) |
| 9 | run-tool: a missing tool shows the instructions and asks; anything but y installs nothing *(pulado no Windows)* | Integração | [desktop.test.ts:1799](../../tests/desktop.test.ts#L1799) |
| 10 | as abas de terminal só iniciam a ferramenta escolhida, na raiz do framework, com o pedido como um único argumento *(pulado no Windows)* | Integração | [desktop.test.ts:1815](../../tests/desktop.test.ts#L1815) |

### Encontrar as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | minhas IAs: caminho e versão das ferramentas instaladas, nada é executado para as que faltam | Integração | [desktop.test.ts:2316](../../tests/desktop.test.ts#L2316) |
| 2 | minhas IAs: a extensão do Moki da versão do app é baixada, conferida, instalada e o editor abre | Integração | [desktop.test.ts:2329](../../tests/desktop.test.ts#L2329) |
| 3 | minhas IAs: só editores instalados que aceitam a extensão, e só um vsix que o GitHub garante | Integração | [desktop.test.ts:2343](../../tests/desktop.test.ts#L2343) |
| 4 | minhas IAs: num checkout, o vsix gerado em release/ é instalado sem download | Integração | [desktop.test.ts:2356](../../tests/desktop.test.ts#L2356) |
| 5 | PATH: o PATH mais recente e as pastas de ferramentas de sempre se juntam ao atual, sem repetições | Unidade | [tool-path.test.ts:5](../../tests/tool-path.test.ts#L5) |
| 6 | PATH: as pastas globais do npm e dos instaladores estão entre as de sempre | Unidade | [tool-path.test.ts:14](../../tests/tool-path.test.ts#L14) |

### Atividades

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as ações do app e as atividades que vêm com o Moki: uma lista só, com os mesmos ids de antes | Unidade | [activities.test.ts:35](../../tests/activities.test.ts#L35) |
| 2 | o texto do pedido: linhas com {files} só com arquivos, linhas com {no-files} só sem, {project}; um texto vazio pede o alvo dela | Unidade | [activities.test.ts:44](../../tests/activities.test.ts#L44) |
| 3 | um arquivo é conferido: o que ele usa, a regra de arquivos, o id e o nome | Unidade | [activities.test.ts:54](../../tests/activities.test.ts#L54) |
| 4 | as suas atividades: salvas na biblioteca, chegam aos projetos por tags, nunca usam um id do Moki; favoritas | Unidade | [activities.test.ts:63](../../tests/activities.test.ts#L63) |
| 5 | serviço: Configurações lista, cria, duplica e exclui; um alvo que não existe é recusado | Integração | [activities.test.ts:79](../../tests/activities.test.ts#L79) |
| 6 | abrir: o texto da sua atividade, a atividade de um agente age como ele, a atividade de uma operação abre o formulário dela | Integração | [activities.test.ts:101](../../tests/activities.test.ts#L101) |
| 7 | abrir: "talk" é uma conversa com um agente, nunca listada onde se escolhe uma atividade | Integração | [activities.test.ts:121](../../tests/activities.test.ts#L121) |

### Favoritos

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma lista por tipo, separadas, na ordem em que foram marcadas; desmarcar tira o item | Unidade | [favorites.test.ts:14](../../tests/favorites.test.ts#L14) |
| 2 | só os tipos conhecidos e ids seguros | Integração | [favorites.test.ts:31](../../tests/favorites.test.ts#L31) |
| 3 | most used: counted per kind, the top 5, ties by id, unsafe ids ignored | Unidade | [favorites.test.ts:41](../../tests/favorites.test.ts#L41) |

### Atividades e execuções

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | detalhes da execução e atividades em aberto | Integração | [desktop.test.ts:452](../../tests/desktop.test.ts#L452) |

### Agentes

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | biblioteca de agentes: os agentes prontos são só leitura, as cópias são editáveis e validadas | Integração | [desktop.test.ts:529](../../tests/desktop.test.ts#L529) |
| 2 | agentes nas operações: entradas, saídas, servidores MCP e IA são lidos, validados e salvos | Integração | [desktop.test.ts:557](../../tests/desktop.test.ts#L557) |
| 3 | agentes por projeto: a lista de habilitados no project.json controla a abertura | Integração | [desktop.test.ts:1108](../../tests/desktop.test.ts#L1108) |
| 4 | agentes criados em Skills e agentes só usam skills instaladas na própria pasta | Integração | [desktop.test.ts:1328](../../tests/desktop.test.ts#L1328) |

### Operações multiagente

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | operações: uma linha de agentes; as setas passam as saídas, o resto vai para o formulário inicial; salvas na biblioteca | Integração | [desktop.test.ts:627](../../tests/desktop.test.ts#L627) |
| 2 | operações num projeto: vinculadas, iniciadas pelo formulário inicial, executadas passo a passo por arquivos | Integração | [desktop.test.ts:685](../../tests/desktop.test.ts#L685) |
| 3 | as operações desviam pelo resultado de um agente, voltam em loop até um limite e perguntam ao usuário quando nada serve | Integração | [desktop.test.ts:793](../../tests/desktop.test.ts#L793) |
| 4 | operações: um passo cujo terminal fecha falha até ser tentado de novo, um passo reprovado volta com os motivos, cancelar fecha o terminal | Integração | [desktop.test.ts:893](../../tests/desktop.test.ts#L893) |
| 5 | operações: a pergunta de um passo é respondida pelo Moki, no terminal dele ou reabrindo o passo quando o terminal não existe mais | Integração | [desktop.test.ts:992](../../tests/desktop.test.ts#L992) |
| 6 | operações: um passo cuja ferramenta de IA não abre falha uma vez (sem loop de tentativas) e é tentado de novo com outra IA | Integração | [desktop.test.ts:1052](../../tests/desktop.test.ts#L1052) |
| 7 | operações: na primeira vez, um exemplo no idioma do app; excluído, ele não volta | Integração | [desktop.test.ts:1092](../../tests/desktop.test.ts#L1092) |

### Skills e configuração

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | registro de skills: busca paginada, instalação verificada por projeto ou global, o pedido cita as skills do projeto | Integração | [desktop.test.ts:1283](../../tests/desktop.test.ts#L1283) |
| 2 | criar skill: a ferramenta de IA redige uma proposta no projeto; instalar copia a proposta revisada | Integração | [desktop.test.ts:1368](../../tests/desktop.test.ts#L1368) |
| 3 | aba global e tela inicial: lista, abre e remove (para a lixeira) só o que está instalado para todos os projetos | Integração | [desktop.test.ts:1399](../../tests/desktop.test.ts#L1399) |
| 4 | configurar: descrição e skills globais vinculadas por referência; os pedidos citam essas skills | Integração | [desktop.test.ts:1446](../../tests/desktop.test.ts#L1446) |
| 5 | configurar: as skills ArtCraft do framework podem ser vinculadas; os pedidos citam essas skills a partir da raiz do framework | Integração | [desktop.test.ts:1471](../../tests/desktop.test.ts#L1471) |
| 6 | projeto em branco: sem arquivos de contexto de QA; o plano da IA é filtrado e aprovado em Configurar | Integração | [desktop.test.ts:1482](../../tests/desktop.test.ts#L1482) |
| 7 | envio de skills e agentes: a prévia não grava nada, bloqueia por item e instala só o que foi confirmado | Integração | [desktop.test.ts:1576](../../tests/desktop.test.ts#L1576) |
| 8 | envio por .zip: formatos aceitos, limites, caminhos inseguros, e uma falha desfaz tudo | Integração | [desktop.test.ts:1673](../../tests/desktop.test.ts#L1673) |

### Pasta vinculada

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | pasta vinculada: vincular registra a pasta e faz backup das configurações de IA dentro dela | Integração | [desktop.test.ts:1139](../../tests/desktop.test.ts#L1139) |
| 2 | abrir pasta: o nome é seu, a pasta aparece ao vivo na árvore como @folder e abre numa IDE | Integração | [desktop.test.ts:1192](../../tests/desktop.test.ts#L1192) |
| 3 | pasta vinculada: dá para criar um projeto a partir de uma pasta existente escolhida na janela | Integração | [desktop.test.ts:1243](../../tests/desktop.test.ts#L1243) |
| 4 | aba do repositório: instalações, agentes e remoções num .claude vinculado exigem confirmação e backup; writeAllowed: false recusa | Integração | [desktop.test.ts:1520](../../tests/desktop.test.ts#L1520) |

### Servidores MCP

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | MCPs: a última seção lista os servidores configurados onde as ferramentas de IA iniciam | Integração | [desktop.test.ts:222](../../tests/desktop.test.ts#L222) |
| 2 | um catálogo: os ids são estáveis e únicos, os nomes podem se repetir | Unidade | [mcp.test.ts:55](../../tests/mcp.test.ts#L55) |
| 3 | credenciais nunca são guardadas: só ${VARIAVEL} | Unidade | [mcp.test.ts:67](../../tests/mcp.test.ts#L67) |
| 4 | onde um servidor vale: global, ou só nos projetos escolhidos; desligado, não chega a nenhum projeto | Unidade | [mcp.test.ts:80](../../tests/mcp.test.ts#L80) |
| 5 | um agente recebe só os servidores que o contrato dele cita e que o projeto tem ligados | Unidade | [mcp.test.ts:95](../../tests/mcp.test.ts#L95) |
| 6 | importação: formatos Claude/Cursor, VS Code e mapas simples; credenciais viram variáveis | Unidade | [mcp.test.ts:101](../../tests/mcp.test.ts#L101) |
| 7 | configurações para o Claude Code e o Cursor; a mesclagem mantém as entradas da pessoa | Unidade | [mcp.test.ts:113](../../tests/mcp.test.ts#L113) |
| 8 | as variáveis só são lidas quando um servidor inicia; quando falta uma, diz qual, nunca um valor | Unidade | [mcp.test.ts:125](../../tests/mcp.test.ts#L125) |
| 9 | o Claude Code aberto pelo Moki recebe --mcp-config com os servidores do projeto e o do próprio Moki | Integração | [mcp.test.ts:133](../../tests/mcp.test.ts#L133) |
| 10 | o Cursor aberto pelo Moki: as entradas moki do <raiz>/.cursor/mcp.json, mantendo as da pessoa | Integração | [mcp.test.ts:147](../../tests/mcp.test.ts#L147) |
| 11 | sincronizar com o Cursor na pasta vinculada: pergunta antes, respeita o writeAllowed, faz backup | Integração | [mcp.test.ts:155](../../tests/mcp.test.ts#L155) |
| 12 | Codex: o Moki grava só a própria região do .codex/config.toml; as tabelas da pessoa ficam; uma variável nunca é gravada como valor | Unidade | [mcp.test.ts:170](../../tests/mcp.test.ts#L170) |
| 13 | serviço: um catálogo com onde cada servidor vale, resultados dos testes guardados sem valores | Integração | [mcp.test.ts:198](../../tests/mcp.test.ts#L198) |
| 14 | uma execução de operação mantém os servidores com que começou | Integração | [mcp.test.ts:217](../../tests/mcp.test.ts#L217) |
| 15 | o IDE Companion lista os servidores ligados, sem comando nem variáveis | Integração | [mcp.test.ts:228](../../tests/mcp.test.ts#L228) |
| 16 | teste de conexão: um servidor stdio real (o do próprio Moki) e um HTTP | Integração | [mcp.test.ts:234](../../tests/mcp.test.ts#L234) |

### Ponte do app (IPC)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | os pedidos da interface só executam métodos do serviço e devolvem os erros como mensagens | Integração | [desktop.test.ts:1982](../../tests/desktop.test.ts#L1982) |

### Instalador

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a sincronização do framework pelo instalador atualiza os arquivos do framework e nunca mexe em workspace/ | Integração | [desktop.test.ts:1935](../../tests/desktop.test.ts#L1935) |
| 2 | as cópias instaladas mantêm o framework no QA_ROOT, na pasta antiga ou em <Documentos>/Moki | Integração | [desktop.test.ts:1966](../../tests/desktop.test.ts#L1966) |

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
| 1 | every text of the app has a ${lang} translation | Unidade | [i18n.test.ts:36](../../tests/i18n.test.ts#L36) |
| 2 | ${lang} translations keep the {placeholders} of the English text | Unidade | [i18n.test.ts:46](../../tests/i18n.test.ts#L46) |
| 3 | ${expected.lang} is selected, persisted and restored with the right conversation default | Unidade | [i18n.test.ts:83](../../tests/i18n.test.ts#L83) |
| 4 | switching between all interface languages replaces the dictionary and preserves an explicit conversation language | Unidade | [i18n.test.ts:100](../../tests/i18n.test.ts#L100) |
| 5 | an absent or unsupported stored language still defaults to English | Unidade | [i18n.test.ts:111](../../tests/i18n.test.ts#L111) |

### IDE: API do painel

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | só existem as chamadas do painel; o serviço inteiro nunca fica acessível | Integração | [companion-api.test.ts:81](../../tests/companion-api.test.ts#L81) |
| 2 | estado: o projeto conectado, a lista para trocar, os servidores MCP ligados | Integração | [companion-api.test.ts:88](../../tests/companion-api.test.ts#L88) |
| 3 | agentes: só os que o projeto usa | Integração | [companion-api.test.ts:96](../../tests/companion-api.test.ts#L96) |
| 4 | contexto: desligar um arquivo deixa ele fora dos pedidos e do que a IA lê | Integração | [companion-api.test.ts:101](../../tests/companion-api.test.ts#L101) |
| 5 | abrir: o Claude Code com o pedido, as exclusões e o --mcp-config, só para o projeto ativo | Integração | [companion-api.test.ts:114](../../tests/companion-api.test.ts#L114) |
| 6 | favorites and most used: stars are shared, a launch counts as a use, resuming does not | Integração | [companion-api.test.ts:127](../../tests/companion-api.test.ts#L127) |
| 7 | copiar para o chat: o mesmo pedido copiado, nada é aberto | Integração | [companion-api.test.ts:138](../../tests/companion-api.test.ts#L138) |
| 8 | conectar ao Claude Code: pergunta antes, grava só as entradas do Moki, faz backup e esconde do Git | Integração | [companion-api.test.ts:147](../../tests/companion-api.test.ts#L147) |
| 9 | conectar ao Cursor e ao Codex pelo mesmo menu: cada um no próprio arquivo da pasta | Integração | [companion-api.test.ts:166](../../tests/companion-api.test.ts#L166) |
| 10 | sem projeto, o painel pede um | Integração | [companion-api.test.ts:178](../../tests/companion-api.test.ts#L178) |
| 11 | operações pelo painel: iniciadas, cada passo no próprio terminal, avançadas pelo loop | Integração | [companion-api.test.ts:186](../../tests/companion-api.test.ts#L186) |

### IDE: contexto e servidor MCP

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a pasta aberta encontra o projeto dela: a pasta vinculada primeiro, subpastas também | Integração | [companion.test.ts:46](../../tests/companion.test.ts#L46) |
| 2 | recursos: contexto e notas do próprio projeto, o contexto compartilhado espera a pessoa, nenhum segredo | Integração | [companion.test.ts:55](../../tests/companion.test.ts#L55) |
| 3 | isolamento: ids de outros projetos ou caminhos fora são recusados | Integração | [companion.test.ts:74](../../tests/companion.test.ts#L74) |
| 4 | recursos manuais ficam escondidos até serem selecionados; os modos são salvos no companion.json | Integração | [companion.test.ts:83](../../tests/companion.test.ts#L83) |
| 5 | pacote de contexto: primeiro o texto selecionado, dentro do limite, depois as referências relacionadas | Integração | [companion.test.ts:100](../../tests/companion.test.ts#L100) |
| 6 | MCP: initialize, tools/list, tools/call, e toda chamada é registrada | Integração | [companion.test.ts:114](../../tests/companion.test.ts#L114) |
| 7 | MCP: a sessão fica presa a um projeto, ou explica por que não | Integração | [companion.test.ts:134](../../tests/companion.test.ts#L134) |
| 8 | servidor MCP por stdio | Integração | [companion.test.ts:146](../../tests/companion.test.ts#L146) |

### Ícone da IDE

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o gato da barra de status: um glifo em U+E000, nas medidas do codicon | Unidade | [icon-font.test.mjs:24](../../tests/icon-font.test.mjs#L24) |
| 2 | conversão dos caminhos: linhas, curvas e arcos terminam onde o SVG termina | Unidade | [icon-font.test.mjs:39](../../tests/icon-font.test.mjs#L39) |

### Framework

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o repositório real passa na validação | Integração | [framework.test.mjs:36](../../tests/framework.test.mjs#L36) |
| 2 | a cópia de teste passa na validação, incluindo os espelhos | Integração | [framework.test.mjs:40](../../tests/framework.test.mjs#L40) |
| 3 | o validador recusa problemas de estrutura | Unidade | [framework.test.mjs:45](../../tests/framework.test.mjs#L45) |
| 4 | o validador confere os workflows | Unidade | [framework.test.mjs:71](../../tests/framework.test.mjs#L71) |
| 5 | a divergência das cópias geradas é detectada | Unidade | [framework.test.mjs:92](../../tests/framework.test.mjs#L92) |
| 6 | leitor de frontmatter | Unidade | [framework.test.mjs:103](../../tests/framework.test.mjs#L103) |
| 7 | agentes só leitura viram subagentes do Claude Code sem as ferramentas de edição | Unidade | [framework.test.mjs:111](../../tests/framework.test.mjs#L111) |
| 8 | framework agents are for developing Moki only: no project can use them | Unidade | [framework.test.mjs:119](../../tests/framework.test.mjs#L119) |
| 9 | verificação de artefatos | Unidade | [framework.test.mjs:126](../../tests/framework.test.mjs#L126) |
| 10 | verificação de segredos | Unidade | [framework.test.mjs:143](../../tests/framework.test.mjs#L143) |
| 11 | schema do estado das execuções | Unidade | [framework.test.mjs:156](../../tests/framework.test.mjs#L156) |
| 12 | ida e volta de xlsx e aviso de planilha ausente | Unidade | [framework.test.mjs:171](../../tests/framework.test.mjs#L171) |
| 13 | o preenchimento de xlsx mantém o modelo, limpa as linhas de exemplo e mapeia os cabeçalhos | Unidade | [framework.test.mjs:183](../../tests/framework.test.mjs#L183) |
| 14 | docx: imagens, links, marcadores e modelos de exemplo | Unidade | [framework.test.mjs:197](../../tests/framework.test.mjs#L197) |
| 15 | verificação das saídas | Unidade | [framework.test.mjs:221](../../tests/framework.test.mjs#L221) |
| 16 | assistente qa: atividades, pedidos, caminhos, cópias para a entrada | Integração | [framework.test.mjs:239](../../tests/framework.test.mjs#L239) |
| 17 | Markdown: listas aninhadas, títulos setext, linhas horizontais e links automáticos | Unidade | [framework.test.mjs:268](../../tests/framework.test.mjs#L268) |
| 18 | Markdown para HTML | Unidade | [framework.test.mjs:282](../../tests/framework.test.mjs#L282) |

### Documentação

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | toda página do docs/wiki.json é gerada, com a Home, a barra lateral e o rodapé | Unidade | [wiki.test.mjs:12](../../tests/wiki.test.mjs#L12) |
| 2 | os links viram páginas da wiki ou links do GitHub; uma página diz onde é editada e aponta para a tradução | Unidade | [wiki.test.mjs:20](../../tests/wiki.test.mjs#L20) |
| 3 | outra branch recebe o aviso de versão em desenvolvimento; um link quebrado para a geração | Unidade | [wiki.test.mjs:36](../../tests/wiki.test.mjs#L36) |

### ArtCraft apps download

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | craft apps: fixed list with unique ids and a storytold repo | Unidade | [desktop.test.ts:2109](../../tests/desktop.test.ts#L2109) |
| 2 | craft apps: Linux package family from os-release | Unidade | [desktop.test.ts:2116](../../tests/desktop.test.ts#L2116) |
| 3 | craft apps: the files for each system, recommended first, and exact names only | Unidade | [desktop.test.ts:2128](../../tests/desktop.test.ts#L2128) |
| 4 | craft download: lists the 16 apps and shows what would be downloaded | Integração | [desktop.test.ts:2183](../../tests/desktop.test.ts#L2183) |
| 5 | craft download: GitHub digest verifies and the folder is revealed | Integração | [desktop.test.ts:2194](../../tests/desktop.test.ts#L2194) |
| 6 | craft download: SHA256SUMS.txt is used when there is no digest | Integração | [desktop.test.ts:2205](../../tests/desktop.test.ts#L2205) |
| 7 | craft download: no digest and no listed checksum is refused before the dialog | Integração | [desktop.test.ts:2211](../../tests/desktop.test.ts#L2211) |
| 8 | craft download: a hash that does not match removes the file | Integração | [desktop.test.ts:2219](../../tests/desktop.test.ts#L2219) |
| 9 | craft download: GitHub errors and no network say what to do | Integração | [desktop.test.ts:2225](../../tests/desktop.test.ts#L2225) |
| 10 | craft download: no file for this system, and unsafe names are ignored | Integração | [desktop.test.ts:2235](../../tests/desktop.test.ts#L2235) |
| 11 | craft download: Fedora is offered rpm first, AppImage second, never deb or unknown names | Integração | [desktop.test.ts:2241](../../tests/desktop.test.ts#L2241) |
| 12 | craft download: a newer release after the review, and a cancelled dialog | Integração | [desktop.test.ts:2260](../../tests/desktop.test.ts#L2260) |
| 13 | craft download: the URL is built by Moki, the extension is added, a failed write leaves nothing | Integração | [desktop.test.ts:2270](../../tests/desktop.test.ts#L2270) |

## Testes de interface

Rodam com `npm run test:ui`. Cada área é um bloco de `tests/ui/app.spec.ts`; os cenários dela rodam em ordem, na mesma janela.

### Configurações (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | Templates rola e os controles dela têm o mesmo tamanho | Interface | [ui/app.spec.ts:99](../../tests/ui/app.spec.ts#L99) |
| 2 | um logo escolhido aparece no formulário e na prévia | Interface | [ui/app.spec.ts:121](../../tests/ui/app.spec.ts#L121) |
| 3 | um texto de marca d'água aparece na página de prévia | Interface | [ui/app.spec.ts:130](../../tests/ui/app.spec.ts#L130) |
| 4 | templates são uma lista: um novo, marcado com um projeto, vale só para ele | Interface | [ui/app.spec.ts:135](../../tests/ui/app.spec.ts#L135) |
| 5 | Skills é uma lista como as outras abas: abas de filtro, busca, um detalhe; Adicionar skill tem página própria | Interface | [ui/app.spec.ts:158](../../tests/ui/app.spec.ts#L158) |
| 6 | um agente mostra o que precisa e entrega; a sua cópia edita isso, incluindo MCPs e IA | Interface | [ui/app.spec.ts:181](../../tests/ui/app.spec.ts#L181) |
| 7 | o seu agente: descrição e instruções em campos de texto, skills buscadas e acrescentadas, um Salvar só; as tags dizem a quais projetos ele chega | Interface | [ui/app.spec.ts:207](../../tests/ui/app.spec.ts#L207) |
| 8 | uma operação liga agentes com setas: aprovação, qual saída responde qual entrada, salva na lista | Interface | [ui/app.spec.ts:238](../../tests/ui/app.spec.ts#L238) |

### Tags (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma tag de projeto traz o outro projeto para o contexto da atividade | Interface | [ui/app.spec.ts:376](../../tests/ui/app.spec.ts#L376) |
| 2 | ES translates the workspace picker and the rest of the app, survives reload, and keeps EN and PT-BR working | Interface | [ui/app.spec.ts:393](../../tests/ui/app.spec.ts#L393) |

### Workspaces (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o app abre na escolha de workspace; um workspace novo abre vazio e dá para voltar ao anterior | Interface | [ui/app.spec.ts:459](../../tests/ui/app.spec.ts#L459) |
| 2 | um projeto oculto só é excluído de vez depois de digitar delete | Interface | [ui/app.spec.ts:474](../../tests/ui/app.spec.ts#L474) |
| 3 | criar um projeto: Enter no nome abre com as pastas padrão; Criar e personalizar abre em Configurar | Interface | [ui/app.spec.ts:497](../../tests/ui/app.spec.ts#L497) |
| 4 | uma nota avulsa abre dentro do app; a janela do caderno lista as notas avulsas abertas, como abas | Interface | [ui/app.spec.ts:522](../../tests/ui/app.spec.ts#L522) |

### Árvore do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o clique direito num item da árvore copia o caminho completo dele | Interface | [ui/app.spec.ts:574](../../tests/ui/app.spec.ts#L574) |
| 2 | o menu ⋯ cria um arquivo que abre pronto para escrever, e uma pasta na raiz do projeto | Interface | [ui/app.spec.ts:584](../../tests/ui/app.spec.ts#L584) |
| 3 | a barra lateral é em blocos: pastas, Acompanhamento e Outros arquivos, depois Configurações do projeto e MCPs; o card de Operações fica no painel do projeto | Interface | [ui/app.spec.ts:625](../../tests/ui/app.spec.ts#L625) |
| 4 | uma pasta vinculada aparece primeiro na árvore, ao vivo, com Abrir na IDE; os arquivos dela abrem no app | Interface | [ui/app.spec.ts:661](../../tests/ui/app.spec.ts#L661) |
| 5 | digitar / numa nota lista os comandos de formatação; um checklist continua no Enter | Interface | [ui/app.spec.ts:689](../../tests/ui/app.spec.ts#L689) |
| 6 | a estrela transforma uma nota numa favorita dourada, a primeira da pasta de notas | Interface | [ui/app.spec.ts:731](../../tests/ui/app.spec.ts#L731) |
| 7 | uma nota do projeto abre dentro do app, e no caderno dele com cada nota do projeto como uma aba | Interface | [ui/app.spec.ts:763](../../tests/ui/app.spec.ts#L763) |

### Operações num projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma operação é iniciada pelo formulário e avança conforme cada agente entrega os arquivos | Interface | [ui/app.spec.ts:836](../../tests/ui/app.spec.ts#L836) |
| 2 | o resultado escolhe a seta: rejected vai para o fixer e volta para a revisão; sem resultado válido, pergunta ao usuário | Interface | [ui/app.spec.ts:935](../../tests/ui/app.spec.ts#L935) |

### Terminais que continuam fora do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | sair do projeto não fecha o terminal dele; abrir o projeto de novo traz a aba de volta | Interface | [ui/app.spec.ts:997](../../tests/ui/app.spec.ts#L997) |
| 2 | o + das abas abre categorias no lugar; Arquivo cria uma planilha vazia na Entrada e a mostra | Interface | [ui/app.spec.ts:1020](../../tests/ui/app.spec.ts#L1020) |
| 3 | the + menu offers the ArtCraft apps: 16 apps, launcher first, and a Download button for each | Interface | [ui/app.spec.ts:1043](../../tests/ui/app.spec.ts#L1043) |

### Lista de servidores MCP (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | um servidor fica global ou é dado a projetos escolhidos a partir da linha dele | Interface | [ui/app.spec.ts:1079](../../tests/ui/app.spec.ts#L1079) |

### Comentários em PDF (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma seleção é comentada direto na página; o comentário fica ao lado, ligado por uma linha | Interface | [ui/app.spec.ts:1160](../../tests/ui/app.spec.ts#L1160) |
| 2 | um arquivo .md é comentado do mesmo jeito; o comentário fica dentro do arquivo, invisível em outros visualizadores | Interface | [ui/app.spec.ts:1219](../../tests/ui/app.spec.ts#L1219) |

### Atividades (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma atividade nova é criada em Configurações, marcada com estrela, e aparece primeiro ao abrir a ferramenta de IA | Interface | [ui/app.spec.ts:1277](../../tests/ui/app.spec.ts#L1277) |

### Configurações sem projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | Skills lista as skills do Moki; sem projeto, só o envio de skills adiciona (para todos os projetos) | Interface | [ui/app.spec.ts:1321](../../tests/ui/app.spec.ts#L1321) |

### Favoritos (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | agentes, operações, templates e skills são marcados com estrela pelo card e aparecem primeiro | Interface | [ui/app.spec.ts:1367](../../tests/ui/app.spec.ts#L1367) |

### Minhas IAs e o painel do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a IA padrão é definida em Minhas IAs e uma atividade que escolhe outra a mantém | Interface | [ui/app.spec.ts:1413](../../tests/ui/app.spec.ts#L1413) |
| 2 | o painel do projeto só age: uma atividade, ou uma conversa com um agente | Interface | [ui/app.spec.ts:1440](../../tests/ui/app.spec.ts#L1440) |

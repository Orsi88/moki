# Catálogo de testes

Todos os cenários de teste automatizado do Moki, um por linha: 357 cenários. O cenário é o título do teste, que diz o comportamento verificado; os títulos vêm de `docs/pt-BR/test-scenarios.json` (o original, em inglês, está no código). Como as suítes rodam e como os testes são escritos: [Testes automatizados](testing.md).

> Gerado pelo `npm run test-catalog` a partir dos arquivos de teste; não edite à mão. Rode de novo depois de criar ou renomear um teste.

## Totais

| Tipo | Cenários |
|---|---|
| Unidade | 191 |
| Integração | 118 |
| Interface | 48 |

| Área | Unidade | Integração | Interface |
|---|---|---|---|
| [Projetos](#projetos) | 2 | 4 |  |
| [Arquivos e confinamento](#arquivos-e-confinamento) | 27 | 9 |  |
| [Abrir com](#abrir-com) | 1 | 1 |  |
| [PDF (PdfCraft)](#pdf-pdfcraft) | 4 | 4 |  |
| [Notas](#notas) | 1 | 5 |  |
| [Renderização](#renderização) | 49 |  |  |
| [Busca](#busca) |  | 6 |  |
| [Workspaces](#workspaces) | 5 | 1 |  |
| [Tags](#tags) | 3 | 1 |  |
| [Abrir as ferramentas de IA](#abrir-as-ferramentas-de-ia) | 29 | 9 |  |
| [Encontrar as ferramentas de IA](#encontrar-as-ferramentas-de-ia) | 6 | 5 |  |
| [Atividades](#atividades) | 5 | 4 |  |
| [Favoritos](#favoritos) | 2 | 1 |  |
| [Atividades e execuções](#atividades-e-execuções) |  | 2 |  |
| [Agentes](#agentes) |  | 4 |  |
| [Operações multiagente](#operações-multiagente) |  | 7 |  |
| [Skills e configuração](#skills-e-configuração) |  | 8 |  |
| [Pasta vinculada](#pasta-vinculada) |  | 4 |  |
| [Servidores MCP](#servidores-mcp) | 8 | 8 |  |
| [Ponte do app (IPC)](#ponte-do-app-ipc) |  | 1 |  |
| [Instalador](#instalador) |  | 2 |  |
| [Uso na barra de status](#uso-na-barra-de-status) | 13 |  |  |
| [Traduções](#traduções) | 5 |  |  |
| [IDE: API do painel](#ide-api-do-painel) |  | 11 |  |
| [IDE: contexto e servidor MCP](#ide-contexto-e-servidor-mcp) |  | 8 |  |
| [Ícone da IDE](#ícone-da-ide) | 2 |  |  |
| [Framework](#framework) | 23 | 3 |  |
| [Documentação](#documentação) | 3 |  |  |
| [ArtCraft apps download](#artcraft-apps-download) | 3 | 10 |  |
| [Configurações (UI)](#configurações-ui) |  |  | 8 |
| [Tags (UI)](#tags-ui) |  |  | 2 |
| [Workspaces (UI)](#workspaces-ui) |  |  | 4 |
| [Árvore do projeto (UI)](#árvore-do-projeto-ui) |  |  | 8 |
| [Operações num projeto (UI)](#operações-num-projeto-ui) |  |  | 3 |
| [Terminais que continuam fora do projeto (UI)](#terminais-que-continuam-fora-do-projeto-ui) |  |  | 3 |
| [Lista de servidores MCP (UI)](#lista-de-servidores-mcp-ui) |  |  | 1 |
| [Comentários em PDF (UI)](#comentários-em-pdf-ui) |  |  | 8 |
| [Atividades (UI)](#atividades-ui) |  |  | 1 |
| [Configurações sem projeto (UI)](#configurações-sem-projeto-ui) |  |  | 1 |
| [Favoritos (UI)](#favoritos-ui) |  |  | 1 |
| [Minhas IAs e o painel do projeto (UI)](#minhas-ias-e-o-painel-do-projeto-ui) |  |  | 6 |
| [Run details panel (UI)](#run-details-panel-ui) |  |  | 2 |

## Testes de unidade e de integração

Rodam com `npm test`.

### Projetos

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | projetos e criação de projeto | Integração | [desktop.test.ts:88](../../tests/desktop.test.ts#L88) |
| 2 | excluir um projeto exige a palavra "delete" e remove só a pasta dele | Integração | [desktop.test.ts:99](../../tests/desktop.test.ts#L99) |
| 3 | a árvore lista o projeto, esconde arquivos com ponto e anota as atividades | Integração | [desktop.test.ts:116](../../tests/desktop.test.ts#L116) |
| 4 | atualizar o nome e a descrição do projeto preserva todas as outras configurações do projeto | Integração | [desktop.test.ts:564](../../tests/desktop.test.ts#L564) |
| 5 | arrastar o divisor dá a altura à seção para a qual ele se move | Unidade | [home-sections.test.ts:5](../../tests/home-sections.test.ts#L5) |
| 6 | uma seção não pode ser arrastada abaixo do mínimo | Unidade | [home-sections.test.ts:12](../../tests/home-sections.test.ts#L12) |

### Arquivos e confinamento

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o readFile renderiza cada tipo de arquivo | Integração | [desktop.test.ts:126](../../tests/desktop.test.ts#L126) |
| 2 | o acesso a arquivos nunca sai da pasta do projeto | Integração | [desktop.test.ts:162](../../tests/desktop.test.ts#L162) |
| 3 | a edição é limitada a arquivos Markdown/texto já existentes | Integração | [desktop.test.ts:169](../../tests/desktop.test.ts#L169) |
| 4 | arquivos soltos no workspace são copiados para a entrada e ficam lá | Integração | [desktop.test.ts:279](../../tests/desktop.test.ts#L279) |
| 5 | um arquivo muda de pasta, e um soltar pode cair numa; os arquivos de execução ficam de fora | Integração | [desktop.test.ts:297](../../tests/desktop.test.ts#L297) |
| 6 | abrir pasta / abrir com o programa padrão ficam confinados e filtrados | Integração | [desktop.test.ts:322](../../tests/desktop.test.ts#L322) |
| 7 | excluir manda um arquivo para a lixeira, esvazia uma pasta fixa e mantém o project.json | Integração | [desktop.test.ts:331](../../tests/desktop.test.ts#L331) |
| 8 | arquivos e pastas novos: Markdown, texto, planilha e Word vazios, nomes seguros, nunca dentro das atividades | Integração | [desktop.test.ts:349](../../tests/desktop.test.ts#L349) |
| 9 | onde um item está neste computador: mostrado na pasta dele ou pelo caminho completo, só dentro do projeto | Integração | [desktop.test.ts:380](../../tests/desktop.test.ts#L380) |
| 10 | isolamento do fs-guard e regras de tipo de arquivo | Unidade | [desktop.test.ts:2149](../../tests/desktop.test.ts#L2149) |
| 11 | ids de projeto: só um nome de pasta simples com um project.json é um projeto | Unidade | [desktop.test.ts:2540](../../tests/desktop.test.ts#L2540) |
| 12 | o moki-file serve o arquivo inteiro com tipo, tamanho e Accept-Ranges, e o HEAD responde o mesmo sem corpo | Unidade | [file-protocol.test.ts:58](../../tests/file-protocol.test.ts#L58) |
| 13 | o moki-file responde um único Range com 206 e exatamente esses bytes | Unidade | [file-protocol.test.ts:78](../../tests/file-protocol.test.ts#L78) |
| 14 | o moki-file responde um Range inválido ou não atendível com 416 e Content-Range */tamanho | Unidade | [file-protocol.test.ts:93](../../tests/file-protocol.test.ts#L93) |
| 15 | o moki-file ignora um Range múltiplo ou outra unidade e envia o arquivo inteiro (uma resposta válida) | Unidade | [file-protocol.test.ts:103](../../tests/file-protocol.test.ts#L103) |
| 16 | o parseRange cobre as formas de um único intervalo e um arquivo vazio | Unidade | [file-protocol.test.ts:112](../../tests/file-protocol.test.ts#L112) |
| 17 | o moki-file serve um arquivo vazio inteiro, sem corpo | Unidade | [file-protocol.test.ts:123](../../tests/file-protocol.test.ts#L123) |
| 18 | o moki-file se recusa a liberar o que está fora do projeto: .., caminhos absolutos, links simbólicos para fora, outros projetos | Unidade | [file-protocol.test.ts:132](../../tests/file-protocol.test.ts#L132) |
| 19 | o moki-file se recusa a liberar o que não é PDF nem imagem, o que não é arquivo, o que não existe ou passa do limite de tamanho | Unidade | [file-protocol.test.ts:144](../../tests/file-protocol.test.ts#L144) |
| 20 | todo pedido que não nomeia um arquivo servível recebe o mesmo 404 | Unidade | [file-protocol.test.ts:150](../../tests/file-protocol.test.ts#L150) |
| 21 | o caminho depois do token é ignorado: ele nunca escolhe um arquivo | Unidade | [file-protocol.test.ts:161](../../tests/file-protocol.test.ts#L161) |
| 22 | só GET e HEAD são atendidos | Unidade | [file-protocol.test.ts:170](../../tests/file-protocol.test.ts#L170) |
| 23 | um link simbólico posto no lugar do arquivo depois da liberação impede que ele seja servido | Unidade | [file-protocol.test.ts:180](../../tests/file-protocol.test.ts#L180) |
| 24 | um arquivo que passou do limite, virou pasta ou sumiu deixa de ser servido | Unidade | [file-protocol.test.ts:191](../../tests/file-protocol.test.ts#L191) |
| 25 | uma liberação morre com a sua janela e não afeta a de outra janela | Unidade | [file-protocol.test.ts:201](../../tests/file-protocol.test.ts#L201) |
| 26 | uma janela que muda de projeto perde o que lhe foi liberado para os outros | Unidade | [file-protocol.test.ts:214](../../tests/file-protocol.test.ts#L214) |
| 27 | um projeto que desaparece, ou outro workspace sendo aberto, encerra todas as liberações | Unidade | [file-protocol.test.ts:226](../../tests/file-protocol.test.ts#L226) |
| 28 | o mesmo arquivo e carimbo mantêm um só token; um arquivo alterado recebe um novo; uma janela guarda um número limitado | Unidade | [file-protocol.test.ts:240](../../tests/file-protocol.test.ts#L240) |
| 29 | os tokens têm 192 bits aleatórios em hexadecimal e nunca se repetem | Unidade | [file-protocol.test.ts:255](../../tests/file-protocol.test.ts#L255) |
| 30 | uma mudança numa pasta aninhada é informada uma vez por rajada, e uma pasta ignorada não é observada | Unidade | [project-watch.test.ts:15](../../tests/project-watch.test.ts#L15) |
| 31 | além do maxDirs, as pastas extras ficam sem observação, em silêncio e sem erro | Unidade | [project-watch.test.ts:33](../../tests/project-watch.test.ts#L33) |
| 32 | só um renomear varre a pasta de novo; uma mudança simples apenas informa | Unidade | [project-watch.test.ts:51](../../tests/project-watch.test.ts#L51) |
| 33 | uma subpasta criada depois do início é observada | Unidade | [project-watch.test.ts:75](../../tests/project-watch.test.ts#L75) |
| 34 | uma pasta criada depois do início continua respeitando o maxDirs | Unidade | [project-watch.test.ts:92](../../tests/project-watch.test.ts#L92) |
| 35 | mudanças contínuas são informadas dentro do maxWaitMs, em vez de adiadas para sempre | Unidade | [project-watch.test.ts:110](../../tests/project-watch.test.ts#L110) |
| 36 | uma pasta que é link simbólico não é seguida | Unidade | [project-watch.test.ts:130](../../tests/project-watch.test.ts#L130) |

### Abrir com

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | "abrir com" lista os programas do sistema e só abre com um deles | Integração | [desktop.test.ts:399](../../tests/desktop.test.ts#L399) |
| 2 | saída do gio mime: o programa padrão e depois os recomendados | Unidade | [desktop.test.ts:418](../../tests/desktop.test.ts#L418) |

### PDF (PdfCraft)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as associações de notas de PDF ficam no projeto, acompanham as páginas e rejeitam caminhos inválidos | Integração | [desktop.test.ts:185](../../tests/desktop.test.ts#L185) |
| 2 | scripts do PdfCraft: abrir, alterar, salvar no lugar ou numa cópia, listar | Integração | [desktop.test.ts:427](../../tests/desktop.test.ts#L427) |
| 3 | pdfcraft-cli fora do PATH: pastas de instalação no Windows, pastas bin de sempre nos outros sistemas | Unidade | [desktop.test.ts:455](../../tests/desktop.test.ts#L455) |
| 4 | as alterações de PDF vindas da interface são conferidas | Integração | [desktop.test.ts:463](../../tests/desktop.test.ts#L463) |
| 5 | os cartões de comentário ao lado de um PDF: cada um no seu lugar, empurrado para baixo quando cobriria o de cima | Unidade | [desktop.test.ts:482](../../tests/desktop.test.ts#L482) |
| 6 | uma seleção nas páginas desenhadas vira quadriláteros em pontos | Unidade | [desktop.test.ts:488](../../tests/desktop.test.ts#L488) |
| 7 | os comentários em PDF passam pelo PdfCraft, dentro do projeto, sem nunca alterar o arquivo da entrada | Integração | [desktop.test.ts:498](../../tests/desktop.test.ts#L498) |
| 8 | sem o PdfCraft, o próprio Moki destaca, comenta, responde, edita e exclui no PDF | Unidade | [pdf-local.test.ts:32](../../tests/pdf-local.test.ts#L32) |

### Notas

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | notas: a seção sempre aparece e as notas novas recebem nomes únicos | Integração | [desktop.test.ts:177](../../tests/desktop.test.ts#L177) |
| 2 | notas: uma é excluída pela tela inicial; nada fora de notes/ é excluído | Integração | [desktop.test.ts:211](../../tests/desktop.test.ts#L211) |
| 3 | notas: uma seleção de PDF vira uma nota com título de arquivo e página, com a sua origem | Integração | [desktop.test.ts:220](../../tests/desktop.test.ts#L220) |
| 4 | notas: exportadas como md, txt e pdf para o arquivo que o diálogo de salvar devolve; nada mais é exportado | Integração | [desktop.test.ts:228](../../tests/desktop.test.ts#L228) |
| 5 | janelas de nota: só notes/<arquivo>.md de um projeto listado ou o id de uma nota avulsa, uma janela por nota | Integração | [desktop.test.ts:2130](../../tests/desktop.test.ts#L2130) |
| 6 | um comando com barra substitui só a barra digitada | Unidade | [slash-apply.test.ts:8](../../tests/slash-apply.test.ts#L8) |

### Renderização

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | destacar uma linha mantém todos os caracteres e marca as palavras | Unidade | [code-highlight.test.ts:5](../../tests/code-highlight.test.ts#L5) |
| 2 | uma string e um comentário Python são marcados e o texto continua juntando | Unidade | [code-highlight.test.ts:12](../../tests/code-highlight.test.ts#L12) |
| 3 | um debouncer roda uma vez, depois da última chamada de uma rajada | Unidade | [debounce.test.ts:5](../../tests/debounce.test.ts#L5) |
| 4 | o flush roda a chamada pendente na hora, uma única vez, e não faz nada quando não há pendência | Unidade | [debounce.test.ts:22](../../tests/debounce.test.ts#L22) |
| 5 | o cancel descarta a chamada pendente, e uma chamada posterior volta a funcionar | Unidade | [debounce.test.ts:38](../../tests/debounce.test.ts#L38) |
| 6 | o flushEdits descarrega todo editor registrado até ele se desregistrar | Unidade | [debounce.test.ts:54](../../tests/debounce.test.ts#L54) |
| 7 | as tabelas de Markdown desenham células mescladas (<< e ^^) como uma célula só | Unidade | [desktop.test.ts:1973](../../tests/desktop.test.ts#L1973) |
| 8 | a renderização de Markdown escapa HTML e injeção de atributos | Unidade | [desktop.test.ts:1979](../../tests/desktop.test.ts#L1979) |
| 9 | imagens relativas do Markdown só são embutidas de dentro do projeto | Unidade | [desktop.test.ts:1987](../../tests/desktop.test.ts#L1987) |
| 10 | a extração de docx mantém títulos, listas e tabelas | Unidade | [desktop.test.ts:2005](../../tests/desktop.test.ts#L2005) |
| 11 | a extração de docx mantém formatação, listas numeradas, links, notas, comentários e imagens | Unidade | [desktop.test.ts:2016](../../tests/desktop.test.ts#L2016) |
| 12 | os formatos de número das planilhas mostram os valores como os programas de planilha mostram | Unidade | [desktop.test.ts:2050](../../tests/desktop.test.ts#L2050) |
| 13 | um diagrama guardado é um acerto, um desconhecido é uma falha | Unidade | [diagram-cache.test.ts:6](../../tests/diagram-cache.test.ts#L6) |
| 14 | idioma, tema e fonte geram chaves diferentes e nunca compartilham um desenho | Unidade | [diagram-cache.test.ts:14](../../tests/diagram-cache.test.ts#L14) |
| 15 | o limite de entradas descarta o diagrama usado há mais tempo | Unidade | [diagram-cache.test.ts:30](../../tests/diagram-cache.test.ts#L30) |
| 16 | o limite de bytes descarta diagramas antigos, e um que não cabe não é guardado | Unidade | [diagram-cache.test.ts:42](../../tests/diagram-cache.test.ts#L42) |
| 17 | um acerto é servido com o id da nova renderização | Unidade | [diagram-cache.test.ts:60](../../tests/diagram-cache.test.ts#L60) |
| 18 | montar os mesmos diagramas de novo não chama o renderizador | Unidade | [diagram-cache.test.ts:82](../../tests/diagram-cache.test.ts#L82) |
| 19 | outro tema, uma fonte editada e uma renderização que falhou são desenhados de novo | Unidade | [diagram-cache.test.ts:99](../../tests/diagram-cache.test.ts#L99) |
| 20 | um desenho ou diagrama fechado sai do texto e volta a se juntar a ele | Unidade | [diagram-source.test.ts:5](../../tests/diagram-source.test.ts#L5) |
| 21 | uma imagem embutida continua sendo imagem e volta ao mesmo markdown | Unidade | [diagram-source.test.ts:12](../../tests/diagram-source.test.ts#L12) |
| 22 | um bloco de diagrama só é tomado a partir do início do texto | Unidade | [diagram-source.test.ts:19](../../tests/diagram-source.test.ts#L19) |
| 23 | um bloco inacabado e qualquer outro bloco de código ficam no texto | Unidade | [diagram-source.test.ts:29](../../tests/diagram-source.test.ts#L29) |
| 24 | substituir um desenho não mexe no outro diagrama | Unidade | [diagrams.test.ts:8](../../tests/diagrams.test.ts#L8) |
| 25 | um desenho é exibido enquanto o diagrama abaixo dele ainda carrega | Unidade | [diagrams.test.ts:21](../../tests/diagrams.test.ts#L21) |
| 26 | um diagrama que falha ao carregar não esconde o desenho | Unidade | [diagrams.test.ts:42](../../tests/diagrams.test.ts#L42) |
| 27 | um diagrama que não pode ser desenhado deixa o desenho | Unidade | [diagrams.test.ts:56](../../tests/diagrams.test.ts#L56) |
| 28 | um desenho que não pode ser exibido não impede o diagrama | Unidade | [diagrams.test.ts:70](../../tests/diagrams.test.ts#L70) |
| 29 | uma nota só com um desenho nunca carrega o Mermaid | Unidade | [diagrams.test.ts:84](../../tests/diagrams.test.ts#L84) |
| 30 | a imagem de um diagrama substitui só o bloco que foi desenhado | Unidade | [diagrams.test.ts:96](../../tests/diagrams.test.ts#L96) |
| 31 | um módulo sob demanda roda o import uma vez e guarda o módulo | Unidade | [lazy-module.test.ts:5](../../tests/lazy-module.test.ts#L5) |
| 32 | cargas simultâneas compartilham o mesmo import | Unidade | [lazy-module.test.ts:16](../../tests/lazy-module.test.ts#L16) |
| 33 | um import que falhou é esquecido, então a próxima carga tenta de novo | Unidade | [lazy-module.test.ts:26](../../tests/lazy-module.test.ts#L26) |
| 34 | warm inicia o import antes, não o roda de novo na carga e engole uma falha | Unidade | [lazy-module.test.ts:35](../../tests/lazy-module.test.ts#L35) |
| 35 | lazyHeavy importa na hora só quando a chave de carga sob demanda está desligada (eager) | Unidade | [lazy-module.test.ts:51](../../tests/lazy-module.test.ts#L51) |
| 36 | um comentário marca o trecho dele e vai para o bloco no final; qualquer visualizador de Markdown esconde os dois | Unidade | [md-comments.test.ts:20](../../tests/md-comments.test.ts#L20) |
| 37 | respostas, edições e exclusões mantêm o texto do próprio arquivo | Unidade | [md-comments.test.ts:36](../../tests/md-comments.test.ts#L36) |
| 38 | as cores dos comentários persistem entre edições e respostas, e os comentários antigos ficam como estavam | Unidade | [md-comments.test.ts:53](../../tests/md-comments.test.ts#L53) |
| 39 | o editor formatado mantém um comentário quando o texto ao redor muda | Unidade | [md-comments.test.ts:64](../../tests/md-comments.test.ts#L64) |
| 40 | ler os comentários de um texto com uma sequência muito longa de linhas em branco leva tempo linear e dá o mesmo corpo de antes | Unidade | [md-comments.test.ts:80](../../tests/md-comments.test.ts#L80) |
| 41 | md-preserve: uma edição reescreve só o seu trecho; as quebras de linha do Windows e o espaçamento original ficam | Unidade | [md-preserve.test.ts:8](../../tests/md-preserve.test.ts#L8) |
| 42 | md-preserve: o arquivo é dividido no texto desenhado, na sua cauda (linhas em branco, bloco de comentários) e na sua quebra de linha | Unidade | [md-preserve.test.ts:16](../../tests/md-preserve.test.ts#L16) |
| 43 | parse worker: o worker lê um arquivo Word e uma planilha exatamente como a leitura direta faz | Unidade | [parse-worker.test.ts:39](../../tests/parse-worker.test.ts#L39) |
| 44 | parse worker: um arquivo corrompido é erro do arquivo, lançado como está e não lido duas vezes | Unidade | [parse-worker.test.ts:52](../../tests/parse-worker.test.ts#L52) |
| 45 | parse worker: um worker que não inicia, cai, responde lixo ou nunca responde volta para a leitura direta | Unidade | [parse-worker.test.ts:62](../../tests/parse-worker.test.ts#L62) |
| 46 | parse worker: sem resposta a tempo, o worker é encerrado e a leitura é direta; depois de falhas repetidas o worker não é mais tentado | Unidade | [parse-worker.test.ts:87](../../tests/parse-worker.test.ts#L87) |
| 47 | parse worker: um worker ocioso é encerrado e o próximo arquivo inicia um novo | Unidade | [parse-worker.test.ts:98](../../tests/parse-worker.test.ts#L98) |
| 48 | parse worker: os arquivos esperam a vez e cada um recebe a sua resposta | Unidade | [parse-worker.test.ts:110](../../tests/parse-worker.test.ts#L110) |
| 49 | parse worker: um arquivo grande não bloqueia o event loop (a leitura direta bloqueia) | Unidade | [parse-worker.test.ts:121](../../tests/parse-worker.test.ts#L121) |

### Busca

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | busca: projetos por nome, arquivos por nome e texto, filtros por tag | Integração | [desktop.test.ts:2216](../../tests/desktop.test.ts#L2216) |
| 2 | busca expandida: os prefixos distinguem projetos, nomes de arquivo e conteúdos | Integração | [desktop.test.ts:2246](../../tests/desktop.test.ts#L2246) |
| 3 | busca expandida: acha por nome e conteúdo, lê um PDF e não segue links simbólicos | Integração | [search.test.ts:11](../../tests/search.test.ts#L11) |
| 4 | busca: o limite de tamanho de arquivo é respeitado (no limite e acima dele) | Integração | [search.test.ts:40](../../tests/search.test.ts#L40) |
| 5 | busca: o event loop não fica preso enquanto muitos arquivos são lidos | Integração | [search.test.ts:62](../../tests/search.test.ts#L62) |
| 6 | busca: o cedente só dá a vez ao event loop depois da sua fatia de trabalho | Integração | [search.test.ts:85](../../tests/search.test.ts#L85) |

### Workspaces

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | workspaces: cada um tem os próprios projetos; os pedidos citam um workspace fora do padrão | Integração | [desktop.test.ts:2169](../../tests/desktop.test.ts#L2169) |
| 2 | uma aba aberta só é lida de novo quando o tamanho ou a data de modificação do arquivo mudou | Unidade | [tab-refresh.test.ts:6](../../tests/tab-refresh.test.ts#L6) |
| 3 | uma aba sem carimbo conhecido, ou um arquivo ausente da árvore, é lida de novo (o lado seguro) | Unidade | [tab-refresh.test.ts:13](../../tests/tab-refresh.test.ts#L13) |
| 4 | uma aba de imagem ou PDF toma o carimbo do conteúdo, qualquer outra aba do carimbo da árvore que guardou | Unidade | [tab-refresh.test.ts:20](../../tests/tab-refresh.test.ts#L20) |
| 5 | uma aba de PDF não guarda bytes: o carimbo é o tamanho e a data do stat tirado antes de a URL ser liberada | Unidade | [tab-refresh.test.ts:30](../../tests/tab-refresh.test.ts#L30) |
| 6 | o throttle chama na hora e depois reduz uma rajada a uma chamada no fim da janela | Unidade | [tab-refresh.test.ts:39](../../tests/tab-refresh.test.ts#L39) |

### Tags

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as tags compartilham contexto entre projetos; a abertura lista esse contexto e aplica as exclusões | Integração | [desktop.test.ts:611](../../tests/desktop.test.ts#L611) |
| 2 | uma regra só: sem tag = todos os projetos; a tag do próprio projeto; uma tag compartilhada | Unidade | [tags.test.ts:39](../../tests/tags.test.ts#L39) |
| 3 | agentes: as listas antigas por projeto viram tags, e cada projeto mantém exatamente o que tinha | Unidade | [tags.test.ts:46](../../tests/tags.test.ts#L46) |
| 4 | templates: os estilos antigos viram uma lista; cada projeto usa o padrão dele, senão o que não tem tag | Unidade | [tags.test.ts:67](../../tests/tags.test.ts#L67) |

### Abrir as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | nenhum switch padrão está ligado nesta versão, e nenhum pode desligar a GPU | Unidade | [chromium-switches.test.ts:8](../../tests/chromium-switches.test.ts#L8) |
| 2 | sem QA_ELECTRON_ARGS nada é aplicado, então a GPU fica ligada | Unidade | [chromium-switches.test.ts:14](../../tests/chromium-switches.test.ts#L14) |
| 3 | o main.ts nunca desliga a GPU por conta própria | Unidade | [chromium-switches.test.ts:19](../../tests/chromium-switches.test.ts#L19) |
| 4 | com os padrões entregues (vazios) nada é aplicado sem o usuário pedir, exatamente como só com QA_ELECTRON_ARGS | Unidade | [chromium-switches.test.ts:24](../../tests/chromium-switches.test.ts#L24) |
| 5 | os padrões são aplicados, e o usuário soma switches com outros nomes | Unidade | [chromium-switches.test.ts:38](../../tests/chromium-switches.test.ts#L38) |
| 6 | o valor do usuário sobrescreve o padrão de mesmo nome, uma entrada por nome | Unidade | [chromium-switches.test.ts:44](../../tests/chromium-switches.test.ts#L44) |
| 7 | QA_NO_DEFAULT_SWITCHES=1, ou um QA_ELECTRON_ARGS que existe mas está em branco, desliga os padrões | Unidade | [chromium-switches.test.ts:49](../../tests/chromium-switches.test.ts#L49) |
| 8 | um padrão não permitido é rejeitado e reportado, nunca aplicado | Unidade | [chromium-switches.test.ts:63](../../tests/chromium-switches.test.ts#L63) |
| 9 | --in-process-gpu é permitido; --disable-gpu-compositing e --no-sandbox não são | Unidade | [chromium-switches.test.ts:71](../../tests/chromium-switches.test.ts#L71) |
| 10 | a linha de QA_PERF lista o que foi aplicado e se os padrões estavam ligados | Unidade | [chromium-switches.test.ts:77](../../tests/chromium-switches.test.ts#L77) |
| 11 | a abertura confere cada escolha contra listas fixas | Integração | [desktop.test.ts:552](../../tests/desktop.test.ts#L552) |
| 12 | a abertura monta o pedido; arquivos Word são extraídos | Integração | [desktop.test.ts:599](../../tests/desktop.test.ts#L599) |
| 13 | plugins por projeto: o caveman é salvo no project.json e só chega às aberturas daquele projeto | Integração | [desktop.test.ts:1257](../../tests/desktop.test.ts#L1257) |
| 14 | pedidos com caracteres não ASCII chegam às ferramentas no Windows por um arquivo de pedido em UTF-8 | Integração | [desktop.test.ts:1844](../../tests/desktop.test.ts#L1844) |
| 15 | os plugins do app só carregam nas sessões do app: no Claude por pasta, no Codex como uma linha de instrução *(pulado no Windows)* | Integração | [desktop.test.ts:1855](../../tests/desktop.test.ts#L1855) |
| 16 | o lançador mantém o texto do usuário fora de qualquer linha de comando de shell | Unidade | [desktop.test.ts:1885](../../tests/desktop.test.ts#L1885) |
| 17 | planos de instalação: comandos fixos do fabricante por sistema para toda IA de terminal; editores são baixados, não instalados | Integração | [desktop.test.ts:1893](../../tests/desktop.test.ts#L1893) |
| 18 | uma ferramenta instalável ausente abre o run-tool na aba; o pedido leva a ferramenta e um argumento de prompt *(pulado no Windows)* | Integração | [desktop.test.ts:1910](../../tests/desktop.test.ts#L1910) |
| 19 | run-tool: uma ferramenta ausente mostra as instruções e pergunta; qualquer resposta diferente de y não instala nada *(pulado no Windows)* | Integração | [desktop.test.ts:1936](../../tests/desktop.test.ts#L1936) |
| 20 | as abas de terminal só iniciam a ferramenta escolhida, na raiz do framework, com o pedido como um único argumento *(pulado no Windows)* | Integração | [desktop.test.ts:1952](../../tests/desktop.test.ts#L1952) |
| 21 | QA_ELECTRON_ARGS: não definido, vazio ou em branco não aplica nada | Unidade | [electron-args.test.ts:5](../../tests/electron-args.test.ts#L5) |
| 22 | QA_ELECTRON_ARGS: as opções permitidas voltam sem os hífens iniciais, ignorando espaços extras | Unidade | [electron-args.test.ts:9](../../tests/electron-args.test.ts#L9) |
| 23 | QA_ELECTRON_ARGS: opções com valor o mantêm, inclusive um valor que tem o próprio = (--js-flags) | Unidade | [electron-args.test.ts:15](../../tests/electron-args.test.ts#L15) |
| 24 | QA_ELECTRON_ARGS: --in-process-gpu é permitido sem valor, e não com valor | Unidade | [electron-args.test.ts:25](../../tests/electron-args.test.ts#L25) |
| 25 | QA_ELECTRON_ARGS: uma opção insegura injetada é descartada e reportada, e a permitida continua | Unidade | [electron-args.test.ts:30](../../tests/electron-args.test.ts#L30) |
| 26 | QA_ELECTRON_ARGS: um item sem -- é rejeitado | Unidade | [electron-args.test.ts:38](../../tests/electron-args.test.ts#L38) |
| 27 | QA_ELECTRON_ARGS: opção sem valor ou com valor fora do esperado, valor vazio e valor inseguro são rejeitados | Unidade | [electron-args.test.ts:42](../../tests/electron-args.test.ts#L42) |
| 28 | QA_ELECTRON_ARGS: um item acima do limite de tamanho e itens além do limite de quantidade são rejeitados | Unidade | [electron-args.test.ts:47](../../tests/electron-args.test.ts#L47) |
| 29 | a cauda da saída do terminal guarda só os últimos caracteres, entre blocos | Unidade | [terminals.test.ts:6](../../tests/terminals.test.ts#L6) |
| 30 | a cauda da saída do terminal mantém a ordem em muitos blocos pequenos e grandes | Unidade | [terminals.test.ts:18](../../tests/terminals.test.ts#L18) |
| 31 | o agrupador da saída do terminal junta blocos num só envio, em ordem | Unidade | [terminals.test.ts:26](../../tests/terminals.test.ts#L26) |
| 32 | no agrupador da saída do terminal, o flush envia na hora e o cancel descarta o que espera | Unidade | [terminals.test.ts:38](../../tests/terminals.test.ts#L38) |
| 33 | o controle de fluxo do terminal pausa acima do limite alto e retoma abaixo do limite baixo | Unidade | [terminals.test.ts:58](../../tests/terminals.test.ts#L58) |
| 34 | o controle de fluxo do terminal nunca conta abaixo de zero e ignora confirmações não confiáveis | Unidade | [terminals.test.ts:75](../../tests/terminals.test.ts#L75) |
| 35 | o controle de fluxo do terminal retoma no reset, no release e no dispose, e depois fica livre | Unidade | [terminals.test.ts:88](../../tests/terminals.test.ts#L88) |
| 36 | o controle de fluxo do terminal retoma uma janela que não confirma nada, e volta a contar depois que ela confirma | Unidade | [terminals.test.ts:104](../../tests/terminals.test.ts#L104) |
| 37 | o controle de fluxo do terminal mantém pausada uma janela lenta mas que confirma, sem o tempo limite de travamento | Unidade | [terminals.test.ts:118](../../tests/terminals.test.ts#L118) |
| 38 | o controle de fluxo do terminal sobrevive a um processo que não consegue pausar nem retomar | Unidade | [terminals.test.ts:126](../../tests/terminals.test.ts#L126) |

### Encontrar as ferramentas de IA

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | minhas IAs: caminho e versão das ferramentas instaladas, nada é executado para as que faltam | Integração | [desktop.test.ts:2486](../../tests/desktop.test.ts#L2486) |
| 2 | minhas IAs: a extensão do Moki da versão do app é baixada, conferida, instalada e o editor abre | Integração | [desktop.test.ts:2499](../../tests/desktop.test.ts#L2499) |
| 3 | minhas IAs: só editores instalados que aceitam a extensão, e só um vsix que o GitHub garante | Integração | [desktop.test.ts:2513](../../tests/desktop.test.ts#L2513) |
| 4 | minhas IAs: num checkout, o vsix gerado em release/ é instalado sem download | Integração | [desktop.test.ts:2526](../../tests/desktop.test.ts#L2526) |
| 5 | minhas IAs: as ferramentas são achadas pelo PATH, mantidas enquanto ele é o mesmo, e o aiTools procura de novo | Integração | [desktop.test.ts:2553](../../tests/desktop.test.ts#L2553) |
| 6 | PATH: o PATH mais recente e as pastas de ferramentas de sempre se juntam ao atual, sem repetições | Unidade | [tool-path.test.ts:17](../../tests/tool-path.test.ts#L17) |
| 7 | PATH: as pastas globais do npm e dos instaladores estão entre as de sempre | Unidade | [tool-path.test.ts:26](../../tests/tool-path.test.ts#L26) |
| 8 | which: o primeiro executável no PATH, resolvido em JS (síncrono e assíncrono concordam) | Unidade | [tool-path.test.ts:34](../../tests/tool-path.test.ts#L34) |
| 9 | which: o Windows acrescenta o PATHEXT a menos que o nome já tenha um (simulado numa pasta POSIX) | Unidade | [tool-path.test.ts:52](../../tests/tool-path.test.ts#L52) |
| 10 | detectTools: o síncrono e o assíncrono acham as mesmas ferramentas de IA pelo PATH, sem iniciar um processo | Unidade | [tool-path.test.ts:66](../../tests/tool-path.test.ts#L66) |
| 11 | PATH: o shell é lido de forma assíncrona e do mesmo jeito que a leitura bloqueante, marcadores e ruído incluídos | Unidade | [tool-path.test.ts:82](../../tests/tool-path.test.ts#L82) |

### Atividades

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as ações do app e as atividades que vêm com o Moki: uma lista só, com os mesmos ids de antes | Unidade | [activities.test.ts:35](../../tests/activities.test.ts#L35) |
| 2 | o texto do pedido: linhas com {files} só com arquivos, linhas com {no-files} só sem, {project}; um texto vazio pede o alvo dela | Unidade | [activities.test.ts:44](../../tests/activities.test.ts#L44) |
| 3 | um arquivo é conferido: o que ele usa, a regra de arquivos, o id e o nome | Unidade | [activities.test.ts:54](../../tests/activities.test.ts#L54) |
| 4 | as suas atividades: salvas na biblioteca, chegam aos projetos por tags, nunca usam um id do Moki; favoritas | Unidade | [activities.test.ts:63](../../tests/activities.test.ts#L63) |
| 5 | serviço: Configurações lista, cria, duplica e exclui; um alvo que não existe é recusado | Integração | [activities.test.ts:79](../../tests/activities.test.ts#L79) |
| 6 | abrir: o texto da sua atividade, a atividade de um agente age como ele, a atividade de uma operação abre o formulário dela | Integração | [activities.test.ts:101](../../tests/activities.test.ts#L101) |
| 7 | abrir: "talk" é uma conversa com um agente, nunca listada onde se escolhe uma atividade | Integração | [activities.test.ts:119](../../tests/activities.test.ts#L119) |
| 8 | abrir: "skill" nomeia uma skill utilizável e fica fora da lista de atividades | Integração | [activities.test.ts:135](../../tests/activities.test.ts#L135) |
| 9 | os pedidos de atividade são restaurados com fidelidade e correlacionados só pelo identificador exato | Unidade | [activity-launches.test.ts:5](../../tests/activity-launches.test.ts#L5) |

### Favoritos

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma lista por tipo, separadas, na ordem em que foram marcadas; desmarcar tira o item | Unidade | [favorites.test.ts:14](../../tests/favorites.test.ts#L14) |
| 2 | só os tipos conhecidos e ids seguros | Integração | [favorites.test.ts:31](../../tests/favorites.test.ts#L31) |
| 3 | mais usados: contados por tipo, os 5 primeiros, empates pelo id, ids inseguros ignorados | Unidade | [favorites.test.ts:41](../../tests/favorites.test.ts#L41) |

### Atividades e execuções

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | detalhes da execução e atividades em aberto | Integração | [desktop.test.ts:545](../../tests/desktop.test.ts#L545) |
| 2 | o rastreamento de atividade é opcional, validado e nunca cria uma execução | Integração | [desktop.test.ts:586](../../tests/desktop.test.ts#L586) |

### Agentes

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | biblioteca de agentes: os agentes prontos são só leitura, as cópias são editáveis e validadas | Integração | [desktop.test.ts:657](../../tests/desktop.test.ts#L657) |
| 2 | agentes nas operações: entradas, saídas, servidores MCP e IA são lidos, validados e salvos | Integração | [desktop.test.ts:685](../../tests/desktop.test.ts#L685) |
| 3 | agentes por projeto: a lista de habilitados no project.json controla a abertura | Integração | [desktop.test.ts:1237](../../tests/desktop.test.ts#L1237) |
| 4 | agentes criados em Skills e agentes só usam skills instaladas na própria pasta | Integração | [desktop.test.ts:1457](../../tests/desktop.test.ts#L1457) |

### Operações multiagente

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | operações: uma linha de agentes; as setas passam as saídas, o resto vai para o formulário inicial; salvas na biblioteca | Integração | [desktop.test.ts:755](../../tests/desktop.test.ts#L755) |
| 2 | operações num projeto: vinculadas, iniciadas pelo formulário inicial, executadas passo a passo por arquivos | Integração | [desktop.test.ts:813](../../tests/desktop.test.ts#L813) |
| 3 | as operações desviam pelo resultado de um agente, voltam em loop até um limite e perguntam ao usuário quando nada serve | Integração | [desktop.test.ts:922](../../tests/desktop.test.ts#L922) |
| 4 | operações: um passo cujo terminal fecha falha até ser tentado de novo, um passo reprovado volta com os motivos, cancelar fecha o terminal | Integração | [desktop.test.ts:1022](../../tests/desktop.test.ts#L1022) |
| 5 | operações: a pergunta de um passo é respondida pelo Moki, no terminal dele ou reabrindo o passo quando o terminal não existe mais | Integração | [desktop.test.ts:1121](../../tests/desktop.test.ts#L1121) |
| 6 | operações: um passo cuja ferramenta de IA não abre falha uma vez (sem loop de tentativas) e é tentado de novo com outra IA | Integração | [desktop.test.ts:1181](../../tests/desktop.test.ts#L1181) |
| 7 | operações: na primeira vez, um exemplo no idioma do app; excluído, ele não volta | Integração | [desktop.test.ts:1221](../../tests/desktop.test.ts#L1221) |

### Skills e configuração

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | registro de skills: busca paginada, instalação verificada por projeto ou global, o pedido cita as skills do projeto | Integração | [desktop.test.ts:1412](../../tests/desktop.test.ts#L1412) |
| 2 | criar skill: a ferramenta de IA redige uma proposta no projeto; instalar copia a proposta revisada | Integração | [desktop.test.ts:1497](../../tests/desktop.test.ts#L1497) |
| 3 | aba global e tela inicial: lista, abre e remove (para a lixeira) só o que está instalado para todos os projetos | Integração | [desktop.test.ts:1528](../../tests/desktop.test.ts#L1528) |
| 4 | configurar: descrição e skills globais vinculadas por referência; os pedidos citam essas skills | Integração | [desktop.test.ts:1575](../../tests/desktop.test.ts#L1575) |
| 5 | configurar: as skills ArtCraft do framework podem ser vinculadas; os pedidos citam essas skills a partir da raiz do framework | Integração | [desktop.test.ts:1600](../../tests/desktop.test.ts#L1600) |
| 6 | projeto em branco: sem arquivos de contexto de QA; o plano da IA é filtrado e aprovado em Configurar | Integração | [desktop.test.ts:1611](../../tests/desktop.test.ts#L1611) |
| 7 | envio de skills e agentes: a prévia não grava nada, bloqueia por item e instala só o que foi confirmado | Integração | [desktop.test.ts:1708](../../tests/desktop.test.ts#L1708) |
| 8 | envio por .zip: formatos aceitos, limites, caminhos inseguros, e uma falha desfaz tudo | Integração | [desktop.test.ts:1807](../../tests/desktop.test.ts#L1807) |

### Pasta vinculada

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | pasta vinculada: vincular registra a pasta e faz backup das configurações de IA dentro dela | Integração | [desktop.test.ts:1268](../../tests/desktop.test.ts#L1268) |
| 2 | abrir pasta: o nome é seu, a pasta aparece ao vivo na árvore como @folder e abre numa IDE | Integração | [desktop.test.ts:1321](../../tests/desktop.test.ts#L1321) |
| 3 | pasta vinculada: dá para criar um projeto a partir de uma pasta existente escolhida na janela | Integração | [desktop.test.ts:1372](../../tests/desktop.test.ts#L1372) |
| 4 | aba do repositório: instalações, agentes e remoções num .claude vinculado exigem confirmação e backup; writeAllowed: false recusa | Integração | [desktop.test.ts:1652](../../tests/desktop.test.ts#L1652) |

### Servidores MCP

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | MCPs: a última seção lista os servidores configurados onde as ferramentas de IA iniciam | Integração | [desktop.test.ts:267](../../tests/desktop.test.ts#L267) |
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
| 1 | os pedidos da interface só executam métodos do serviço e devolvem os erros como mensagens | Integração | [desktop.test.ts:2119](../../tests/desktop.test.ts#L2119) |

### Instalador

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a sincronização do framework pelo instalador atualiza os arquivos do framework e nunca mexe em workspace/ | Integração | [desktop.test.ts:2072](../../tests/desktop.test.ts#L2072) |
| 2 | as cópias instaladas mantêm o framework no QA_ROOT, na pasta antiga ou em <Documentos>/Moki | Integração | [desktop.test.ts:2103](../../tests/desktop.test.ts#L2103) |

### Uso na barra de status

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | as janelas de uso do plano do Claude vêm de limits[], com o modelo de um limite restrito | Unidade | [usage.test.ts:9](../../tests/usage.test.ts#L9) |
| 2 | as janelas de uso do plano do Codex são nomeadas pela duração | Unidade | [usage.test.ts:28](../../tests/usage.test.ts#L28) |
| 3 | um terminal conta a memória de tudo o que ele iniciou, uma vez só | Unidade | [usage.test.ts:35](../../tests/usage.test.ts#L35) |
| 4 | a memória é listada por projeto e, dentro dele, por terminal | Unidade | [usage.test.ts:42](../../tests/usage.test.ts#L42) |
| 5 | a lista de processos é lida uma vez por ttl, não a cada consulta | Unidade | [usage.test.ts:56](../../tests/usage.test.ts#L56) |
| 6 | o PSS vem da linha Pss do smaps_rollup, não de Rss nem de Pss_Anon | Unidade | [usage.test.ts:82](../../tests/usage.test.ts#L82) |
| 7 | o PSS de vários pids é lido em paralelo; um pid que não pode ser lido mantém o RSS | Unidade | [usage.test.ts:88](../../tests/usage.test.ts#L88) |
| 8 | o leitor de PSS é assíncrono: espera um leitor que ainda não respondeu | Unidade | [usage.test.ts:100](../../tests/usage.test.ts#L100) |
| 9 | no Linux a barra mede PSS do Moki e dos terminais, e mantém o RSS ao lado | Unidade | [usage.test.ts:109](../../tests/usage.test.ts#L109) |
| 10 | no macOS e no Windows os números continuam RSS das mesmas fontes, e nenhum smaps_rollup é lido | Unidade | [usage.test.ts:128](../../tests/usage.test.ts#L128) |
| 11 | um número simples de bytes para o Moki continua aceito | Unidade | [usage.test.ts:142](../../tests/usage.test.ts#L142) |
| 12 | a árvore de um terminal lista seus processos uma vez, só os que existem | Unidade | [usage.test.ts:147](../../tests/usage.test.ts#L147) |
| 13 | no Linux o smaps_rollup real deste processo dá um PSS positivo que não passa do RSS | Unidade | [usage.test.ts:153](../../tests/usage.test.ts#L153) |

### Traduções

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | todo texto do app tem uma tradução em ${lang} | Unidade | [i18n.test.ts:36](../../tests/i18n.test.ts#L36) |
| 2 | as traduções em ${lang} mantêm os {placeholders} do texto em inglês | Unidade | [i18n.test.ts:46](../../tests/i18n.test.ts#L46) |
| 3 | ${expected.lang} é selecionado, gravado e restaurado com o idioma de conversa padrão certo | Unidade | [i18n.test.ts:83](../../tests/i18n.test.ts#L83) |
| 4 | trocar entre todos os idiomas da interface substitui o dicionário e preserva um idioma de conversa explícito | Unidade | [i18n.test.ts:100](../../tests/i18n.test.ts#L100) |
| 5 | um idioma guardado ausente ou sem suporte continua voltando ao inglês | Unidade | [i18n.test.ts:111](../../tests/i18n.test.ts#L111) |

### IDE: API do painel

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | só existem as chamadas do painel; o serviço inteiro nunca fica acessível | Integração | [companion-api.test.ts:81](../../tests/companion-api.test.ts#L81) |
| 2 | estado: o projeto conectado, a lista para trocar, os servidores MCP ligados | Integração | [companion-api.test.ts:88](../../tests/companion-api.test.ts#L88) |
| 3 | agentes: só os que o projeto usa | Integração | [companion-api.test.ts:96](../../tests/companion-api.test.ts#L96) |
| 4 | contexto: desligar um arquivo deixa ele fora dos pedidos e do que a IA lê | Integração | [companion-api.test.ts:101](../../tests/companion-api.test.ts#L101) |
| 5 | abrir: o Claude Code com o pedido, as exclusões e o --mcp-config, só para o projeto ativo | Integração | [companion-api.test.ts:114](../../tests/companion-api.test.ts#L114) |
| 6 | favoritos e mais usados: as estrelas são compartilhadas, uma abertura conta como uso, retomar não conta | Integração | [companion-api.test.ts:127](../../tests/companion-api.test.ts#L127) |
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
| 8 | os agentes do framework servem só para desenvolver o Moki: nenhum projeto pode usá-los | Unidade | [framework.test.mjs:119](../../tests/framework.test.mjs#L119) |
| 9 | verificação de artefatos | Unidade | [framework.test.mjs:126](../../tests/framework.test.mjs#L126) |
| 10 | verificação de segredos | Unidade | [framework.test.mjs:143](../../tests/framework.test.mjs#L143) |
| 11 | schema do estado das execuções | Unidade | [framework.test.mjs:156](../../tests/framework.test.mjs#L156) |
| 12 | ida e volta de xlsx e aviso de planilha ausente | Unidade | [framework.test.mjs:171](../../tests/framework.test.mjs#L171) |
| 13 | o preenchimento de xlsx mantém o modelo, limpa as linhas de exemplo e mapeia os cabeçalhos | Unidade | [framework.test.mjs:183](../../tests/framework.test.mjs#L183) |
| 14 | docx: imagens, links, marcadores e modelos de exemplo | Unidade | [framework.test.mjs:197](../../tests/framework.test.mjs#L197) |
| 15 | verificação das saídas | Unidade | [framework.test.mjs:221](../../tests/framework.test.mjs#L221) |
| 16 | assistente qa: atividades, pedidos, caminhos, cópias para a entrada | Integração | [framework.test.mjs:239](../../tests/framework.test.mjs#L239) |
| 17 | Markdown: listas aninhadas, títulos setext, linhas horizontais e links automáticos | Unidade | [framework.test.mjs:268](../../tests/framework.test.mjs#L268) |
| 18 | os diagramas do markdown ficam escapados até o app desenhá-los | Unidade | [framework.test.mjs:284](../../tests/framework.test.mjs#L284) |
| 19 | Markdown para HTML | Unidade | [framework.test.mjs:293](../../tests/framework.test.mjs#L293) |
| 20 | bateria de memória: smaps_rollup dá RSS, PSS e USS (privada limpa + suja) em kB | Unidade | [perf-proc-stats.test.ts:16](../../tests/perf-proc-stats.test.ts#L16) |
| 21 | bateria de memória: um texto sem linha Pss não é uma leitura | Unidade | [perf-proc-stats.test.ts:20](../../tests/perf-proc-stats.test.ts#L20) |
| 22 | bateria de memória: readProc recorre ao RSS do statm (pss e uss desconhecidos) e a zero quando nada é legível | Unidade | [perf-proc-stats.test.ts:25](../../tests/perf-proc-stats.test.ts#L25) |
| 23 | bateria de memória: os tipos de processo do Electron viram os grupos do relatório, o resto é other | Unidade | [perf-proc-stats.test.ts:33](../../tests/perf-proc-stats.test.ts#L33) |
| 24 | bateria de memória: os processos são somados por grupo e no total, um campo que ninguém tinha fica null | Unidade | [perf-proc-stats.test.ts:37](../../tests/perf-proc-stats.test.ts#L37) |
| 25 | bateria de memória: a mediana de várias leituras é tirada por grupo e campo, e vira bt_<grupo>_<campo>_mb | Unidade | [perf-proc-stats.test.ts:49](../../tests/perf-proc-stats.test.ts#L49) |
| 26 | bateria de memória: a quebra do compare lista cada grupo e campo com a variação em MB e % | Unidade | [perf-proc-stats.test.ts:57](../../tests/perf-proc-stats.test.ts#L57) |

### Documentação

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | toda página do docs/wiki.json é gerada, com a Home, a barra lateral e o rodapé | Unidade | [wiki.test.mjs:12](../../tests/wiki.test.mjs#L12) |
| 2 | os links viram páginas da wiki ou links do GitHub; uma página diz onde é editada e aponta para a tradução | Unidade | [wiki.test.mjs:20](../../tests/wiki.test.mjs#L20) |
| 3 | outra branch recebe o aviso de versão em desenvolvimento; um link quebrado para a geração | Unidade | [wiki.test.mjs:36](../../tests/wiki.test.mjs#L36) |

### ArtCraft apps download

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | apps Craft: lista fixa com ids únicos e um repositório storytold | Unidade | [desktop.test.ts:2279](../../tests/desktop.test.ts#L2279) |
| 2 | apps Craft: família de pacotes do Linux lida do os-release | Unidade | [desktop.test.ts:2286](../../tests/desktop.test.ts#L2286) |
| 3 | apps Craft: os arquivos de cada sistema, o recomendado primeiro, e só nomes exatos | Unidade | [desktop.test.ts:2298](../../tests/desktop.test.ts#L2298) |
| 4 | download Craft: lista os 16 apps e mostra o que seria baixado | Integração | [desktop.test.ts:2353](../../tests/desktop.test.ts#L2353) |
| 5 | download Craft: o digest do GitHub confere e a pasta é mostrada | Integração | [desktop.test.ts:2364](../../tests/desktop.test.ts#L2364) |
| 6 | download Craft: o SHA256SUMS.txt é usado quando não há digest | Integração | [desktop.test.ts:2375](../../tests/desktop.test.ts#L2375) |
| 7 | download Craft: sem digest e sem checksum listado, recusa antes do diálogo | Integração | [desktop.test.ts:2381](../../tests/desktop.test.ts#L2381) |
| 8 | download Craft: um hash que não confere remove o arquivo | Integração | [desktop.test.ts:2389](../../tests/desktop.test.ts#L2389) |
| 9 | download Craft: erros do GitHub e falta de rede dizem o que fazer | Integração | [desktop.test.ts:2395](../../tests/desktop.test.ts#L2395) |
| 10 | download Craft: sem arquivo para este sistema, e nomes inseguros são ignorados | Integração | [desktop.test.ts:2405](../../tests/desktop.test.ts#L2405) |
| 11 | download Craft: no Fedora se oferece rpm primeiro, AppImage depois, nunca deb nem nomes desconhecidos | Integração | [desktop.test.ts:2411](../../tests/desktop.test.ts#L2411) |
| 12 | download Craft: uma versão mais nova depois da revisão, e um diálogo cancelado | Integração | [desktop.test.ts:2430](../../tests/desktop.test.ts#L2430) |
| 13 | download Craft: a URL é montada pelo Moki, a extensão é acrescentada, uma gravação que falha não deixa nada | Integração | [desktop.test.ts:2440](../../tests/desktop.test.ts#L2440) |

## Testes de interface

Rodam com `npm run test:ui`. Cada área é um bloco de `tests/ui/app.spec.ts`; os cenários dela rodam em ordem, na mesma janela.

### Configurações (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | Templates rola e os controles dela têm o mesmo tamanho | Interface | [ui/app.spec.ts:89](../../tests/ui/app.spec.ts#L89) |
| 2 | um logo escolhido aparece no formulário e na prévia | Interface | [ui/app.spec.ts:111](../../tests/ui/app.spec.ts#L111) |
| 3 | um texto de marca d'água aparece na página de prévia | Interface | [ui/app.spec.ts:120](../../tests/ui/app.spec.ts#L120) |
| 4 | templates são uma lista: um novo, marcado com um projeto, vale só para ele | Interface | [ui/app.spec.ts:125](../../tests/ui/app.spec.ts#L125) |
| 5 | Skills é uma lista como as outras abas: abas de filtro, busca, um detalhe; Adicionar skill tem página própria | Interface | [ui/app.spec.ts:148](../../tests/ui/app.spec.ts#L148) |
| 6 | um agente mostra o que precisa e entrega; a sua cópia edita isso, incluindo MCPs e IA | Interface | [ui/app.spec.ts:171](../../tests/ui/app.spec.ts#L171) |
| 7 | o seu agente: descrição e instruções em campos de texto, skills buscadas e acrescentadas, um Salvar só; as tags dizem a quais projetos ele chega | Interface | [ui/app.spec.ts:197](../../tests/ui/app.spec.ts#L197) |
| 8 | uma operação liga agentes com setas: aprovação, qual saída responde qual entrada, salva na lista | Interface | [ui/app.spec.ts:228](../../tests/ui/app.spec.ts#L228) |

### Tags (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma tag de projeto traz o outro projeto para o contexto da atividade | Interface | [ui/app.spec.ts:370](../../tests/ui/app.spec.ts#L370) |
| 2 | o ES traduz o seletor de workspace e o resto do app, sobrevive ao recarregar e mantém o EN e o PT-BR funcionando | Interface | [ui/app.spec.ts:387](../../tests/ui/app.spec.ts#L387) |

### Workspaces (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o app abre na escolha de workspace; um workspace novo abre vazio e dá para voltar ao anterior | Interface | [ui/app.spec.ts:453](../../tests/ui/app.spec.ts#L453) |
| 2 | um projeto oculto só é excluído de vez depois de digitar delete | Interface | [ui/app.spec.ts:513](../../tests/ui/app.spec.ts#L513) |
| 3 | criar um projeto abre direto, sem configuração nem planejamento por IA | Interface | [ui/app.spec.ts:536](../../tests/ui/app.spec.ts#L536) |
| 4 | uma nota avulsa abre dentro do app; a janela do caderno lista as notas avulsas abertas, como abas | Interface | [ui/app.spec.ts:551](../../tests/ui/app.spec.ts#L551) |

### Árvore do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o clique direito num item da árvore copia o caminho completo dele | Interface | [ui/app.spec.ts:606](../../tests/ui/app.spec.ts#L606) |
| 2 | o menu ⋯ cria um arquivo que abre pronto para escrever, e uma pasta na raiz do projeto | Interface | [ui/app.spec.ts:616](../../tests/ui/app.spec.ts#L616) |
| 3 | a barra lateral é em blocos: pastas, Acompanhamento e Outros arquivos, depois Configurações do projeto e MCPs; o card de Operações fica no painel do projeto | Interface | [ui/app.spec.ts:663](../../tests/ui/app.spec.ts#L663) |
| 4 | a barra lateral de arquivos redimensiona, recolhe e lembra a largura dela independentemente do painel da direita | Interface | [ui/app.spec.ts:706](../../tests/ui/app.spec.ts#L706) |
| 5 | uma pasta vinculada aparece primeiro na árvore, ao vivo, com Abrir na IDE; os arquivos dela abrem no app | Interface | [ui/app.spec.ts:761](../../tests/ui/app.spec.ts#L761) |
| 6 | digitar / numa nota lista os comandos de formatação; um checklist continua no Enter | Interface | [ui/app.spec.ts:789](../../tests/ui/app.spec.ts#L789) |
| 7 | a estrela transforma uma nota numa favorita dourada, a primeira da pasta de notas | Interface | [ui/app.spec.ts:832](../../tests/ui/app.spec.ts#L832) |
| 8 | uma nota do projeto abre dentro do app, e no caderno dele com cada nota do projeto como uma aba | Interface | [ui/app.spec.ts:864](../../tests/ui/app.spec.ts#L864) |

### Operações num projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma operação é iniciada pelo formulário e avança conforme cada agente entrega os arquivos | Interface | [ui/app.spec.ts:938](../../tests/ui/app.spec.ts#L938) |
| 2 | uma operação começa pelo cartão do assistente: os passos mantêm o agente e cada IA é trocada com a mesma escolha | Interface | [ui/app.spec.ts:1041](../../tests/ui/app.spec.ts#L1041) |
| 3 | o resultado escolhe a seta: rejected vai para o fixer e volta para a revisão; sem resultado válido, pergunta ao usuário | Interface | [ui/app.spec.ts:1066](../../tests/ui/app.spec.ts#L1066) |

### Terminais que continuam fora do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | sair do projeto não fecha o terminal dele; abrir o projeto de novo traz a aba de volta | Interface | [ui/app.spec.ts:1128](../../tests/ui/app.spec.ts#L1128) |
| 2 | o + das abas abre categorias no lugar; Arquivo cria uma planilha vazia na Entrada e a mostra | Interface | [ui/app.spec.ts:1151](../../tests/ui/app.spec.ts#L1151) |
| 3 | o menu + oferece os apps ArtCraft: 16 apps, o lançador primeiro e um botão Baixar para cada um | Interface | [ui/app.spec.ts:1174](../../tests/ui/app.spec.ts#L1174) |

### Lista de servidores MCP (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | um servidor fica global ou é dado a projetos escolhidos a partir da linha dele | Interface | [ui/app.spec.ts:1210](../../tests/ui/app.spec.ts#L1210) |

### Comentários em PDF (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | todo controle da barra de ferramentas do PDF tem a mesma altura | Interface | [ui/app.spec.ts:1295](../../tests/ui/app.spec.ts#L1295) |
| 2 | uma seleção é comentada direto na página; o comentário fica ao lado, ligado por uma linha | Interface | [ui/app.spec.ts:1308](../../tests/ui/app.spec.ts#L1308) |
| 3 | notas podem ser inseridas entre páginas do PDF, editadas e restauradas | Interface | [ui/app.spec.ts:1368](../../tests/ui/app.spec.ts#L1368) |
| 4 | um arquivo .md é comentado do mesmo jeito; o comentário fica dentro do arquivo, invisível em outros visualizadores | Interface | [ui/app.spec.ts:1448](../../tests/ui/app.spec.ts#L1448) |
| 5 | a edição visual de Markdown mantém títulos, negrito, listas e quebras de linha do Windows | Interface | [ui/app.spec.ts:1519](../../tests/ui/app.spec.ts#L1519) |
| 6 | a edição visual preserva o espaçamento original e os comentários quando um título encosta numa lista | Interface | [ui/app.spec.ts:1550](../../tests/ui/app.spec.ts#L1550) |
| 7 | a edição visual preserva títulos e lista adjacentes com quebras de linha do Windows | Interface | [ui/app.spec.ts:1576](../../tests/ui/app.spec.ts#L1576) |
| 8 | o visualizador nativo tem ícone e as propriedades do PDF continuam visíveis e são salvas | Interface | [ui/app.spec.ts:1590](../../tests/ui/app.spec.ts#L1590) |

### Atividades (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | uma atividade nova é criada em Configurações, marcada com estrela, e aparece primeiro ao abrir a ferramenta de IA | Interface | [ui/app.spec.ts:1646](../../tests/ui/app.spec.ts#L1646) |

### Configurações sem projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | Skills lista as skills do Moki; sem projeto, só o envio de skills adiciona (para todos os projetos) | Interface | [ui/app.spec.ts:1690](../../tests/ui/app.spec.ts#L1690) |

### Favoritos (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | agentes, operações, templates e skills são marcados com estrela pelo card e aparecem primeiro | Interface | [ui/app.spec.ts:1736](../../tests/ui/app.spec.ts#L1736) |

### Minhas IAs e o painel do projeto (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | a IA padrão é definida em Minhas IAs e uma atividade que escolhe outra a mantém | Interface | [ui/app.spec.ts:1782](../../tests/ui/app.spec.ts#L1782) |
| 2 | o painel do projeto começa de quatro jeitos sob as abas, sem título: um agente, uma atividade, uma operação, uma skill | Interface | [ui/app.spec.ts:1809](../../tests/ui/app.spec.ts#L1809) |
| 3 | uma atividade é achada pela busca, o agente dela é opcional e a IA dela é a mesma escolha | Interface | [ui/app.spec.ts:1842](../../tests/ui/app.spec.ts#L1842) |
| 4 | o título e a descrição do projeto são editados sem abrir a configuração | Interface | [ui/app.spec.ts:1873](../../tests/ui/app.spec.ts#L1873) |
| 5 | um pedido de atividade aparece nas execuções e acompanha a execução registrada | Interface | [ui/app.spec.ts:1894](../../tests/ui/app.spec.ts#L1894) |
| 6 | uma atividade que precisa de arquivos da entrada pede só por eles, com o agente e a IA já escolhidos no cartão | Interface | [ui/app.spec.ts:1917](../../tests/ui/app.spec.ts#L1917) |

### Run details panel (UI)

| # | Cenário | Tipo | Onde |
|---|---|---|---|
| 1 | o cartão de execuções mostra todas as execuções concluídas de atividades e operações nas abas certas | Interface | [ui/app.spec.ts:1941](../../tests/ui/app.spec.ts#L1941) |
| 2 | mostra só a atividade ou operação selecionada e distingue nomes de arquivo repetidos | Interface | [ui/app.spec.ts:1977](../../tests/ui/app.spec.ts#L1977) |

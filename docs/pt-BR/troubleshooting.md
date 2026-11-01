# Problemas comuns

Problemas comuns, por que acontecem e o que fazer. Os problemas específicos da extensão do VS Code estão em [Moki na IDE](ide.md#exceções-e-solução-de-problemas).

## Instalar e abrir

| O que aparece | Por quê | O que fazer |
|---|---|---|
| O Windows diz que protegeu o computador | O instalador ainda não tem assinatura digital | **Mais informações → Executar assim mesmo** |
| Os entregáveis em Excel, Word ou PDF não são criados | As atividades que vêm com o app precisam do Node.js para esses arquivos (o app em si abre sem ele) | Instale o [Node.js 22.18+](https://nodejs.org) (LTS) |
| Um projeto que você criou não aparece | Os projetos de um workspace nunca enxergam outro; outro workspace está aberto | Troque o workspace no rodapé da lista de projetos, ou em *Gerenciar workspaces…* |

## Abrir a ferramenta de IA

| O que aparece | Por quê | O que fazer |
|---|---|---|
| *… is not installed on this computer (command "…" not found).* | A ferramenta não está instalada, ou o comando dela não está no PATH | Instale, ou escolha outra ferramenta |
| O assistente avisa que a abertura ainda está rodando | A ferramenta leva mais de uns 20 segundos para iniciar | Espere, ou olhe a janela ou o terminal da própria ferramenta |
| Uma ferramenta de chat (ChatGPT, claude.ai, Gemini web) não abre sozinha | Essas ferramentas recebem o pedido como texto para copiar | Copie o pedido que aparece na tela e cole no chat |

## Atividades e execuções

| O que aparece | Por quê | O que fazer |
|---|---|---|
| A IA diz que uma skill não está disponível e para | A skill está planejada ou esperando o material de referência ([Skills de QA](qa-skills.md)) | Esperado; use outra atividade |
| A IA retoma uma execução do ponto errado, ou esquece dela | As ferramentas de IA não compartilham memória; o `state.json` da execução é a memória | Peça para continuar a execução pelo id dela; num chat, envie de novo o `state.json` e o contexto que importa |
| Uma regra que a IA encontrou não é usada como sabida | Só o contexto confirmado é tratado como sabido; regras novas vão para `proposed-updates.md` | Revise o `proposed-updates.md` e confirme o que estiver certo |

## Operações multiagente

| O que aparece | Por quê | O que fazer |
|---|---|---|
| Um passo aparece como **Falhou** e a execução como **Bloqueada** | O terminal dele fechou antes do resumo, ou a IA dele não conseguiu abrir | **Tentar de novo**; escolha outra IA quando a dele não estiver instalada. O que ele entregou fica na pasta dele |
| **Aguardando você** com uma pergunta | O agente do passo perguntou algo no terminal | Responda na tela da execução: a resposta vai para o terminal, ou o passo reabre com ela quando o terminal não existe mais |
| A execução pergunta qual caminho seguir | Nenhuma seta serve para o resultado do passo, ou um passo rodaria mais vezes do que a operação permite | Escolha o próximo passo, rode mais uma vez ou encerre a operação |
| Nada começa depois de um passo | A execução está pausada, espera sua aprovação, ou você está em outro projeto | Retome ou aprove; o próximo passo começa quando você volta ao projeto |
| Um passo espera aprovação mesmo com a seta direta | O agente dele executa por um servidor MCP | Esperado: revise e aprove |

Operações, agentes e os contratos deles: [Agents and operations](../agents.md) (em inglês).

## Terminais

| O que aparece | Por quê | O que fazer |
|---|---|---|
| Um terminal pede confirmação para fechar | Fechar a aba para o que roda nela | Confirme só quando quiser parar; sair do projeto mantém o terminal rodando |
| Os terminais de um projeto voltam quando você o abre | Eles continuaram rodando enquanto você estava em outro lugar | Esperado; feche a aba para parar |
| Todos os terminais pararam | O app foi fechado | Reabra o passo ou a atividade |

## Servidores MCP

O **Testar**, em Configurações › Servidores MCP, diz por que um servidor falha:

| Motivo | O que fazer |
|---|---|
| Comando não encontrado | Instale, ou corrija o comando |
| Uma variável não está definida | Defina a `${VARIAVEL}` neste computador e reinicie o app |
| Credenciais recusadas | Confira o valor da variável |
| Sem resposta em 15 segundos | Confira o servidor, a URL ou a rede |
| Um valor parece um token e é recusado | Escreva `${VARIAVEL}` no lugar e defina a variável no computador |

Como configurar os servidores: [MCP servers](../mcp-servers.md) (em inglês).

## Para quem contribui

| O que aparece | Por quê | O que fazer |
|---|---|---|
| Os testes ou o `npm run check` leem arquivos de `Documentos/Moki`, ou acusam links que existem | O terminal herdou o `QA_ROOT` (a extensão do VS Code e o app instalado definem essa variável) | `unset QA_ROOT QA_MCP_SERVER QA_RUN_TOOL` antes de rodar |
| O `npm run check` acusa diferença em `.agents/skills/` ou `.claude/skills/` | Essas cópias são geradas | `npm run build` |
| Um commit é bloqueado | A verificação de pré-commit encontrou dados de projeto ou algo que parece um segredo | Tire do commit; dados de projeto nunca entram neste repositório |

Mais: [Contributing](../contributing.md) (em inglês).

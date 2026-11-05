# Moki

🇺🇸 [Read in English](README.md)

<p align="center"><img src="app/public/hero.png" alt="Moki" width="280" /></p>

<p align="center">
  <a href="https://github.com/Orsi88/moki/releases/latest"><b>⬇️ Baixar o Moki para Windows</b></a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/moki/releases/download/v0.4.1/Moki.Setup.0.4.1.exe">Moki.Setup.0.4.1.exe</a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/moki/wiki">documentação</a>
</p>

O Moki é um app local para a ferramenta de IA que você já usa. Ele guarda um projeto no seu computador — arquivos, conhecimento confirmado, skills e o registro de cada atividade — e abre o Claude Code, o Cursor, o Codex, o Gemini ou um chat com o pedido pronto.

Quem faz o trabalho é a sua ferramenta de IA. O Moki prepara o pedido e guarda os arquivos. Não há conta nem servidor.

Começou como trabalho de qualidade de software: revisar uma história, projetar testes, olhar uma falha, montar evidências. Isso continua no app. Um projeto também pode ser uma pasta que você já tem, um projeto em branco que a IA planeja com você, ou skills e agentes que você mesmo adiciona.

---

## Instalar

1. Baixe o [Moki.Setup.0.4.1.exe](https://github.com/Orsi88/moki/releases/download/v0.4.1/Moki.Setup.0.4.1.exe) (ou o arquivo mais recente em [Releases](https://github.com/Orsi88/moki/releases)).
2. Se o Windows disser que protegeu o computador, escolha **Mais informações → Executar assim mesmo**. O instalador ainda não tem assinatura digital.
3. Instale também uma ferramenta de IA (Claude Code, Cursor, Codex, Gemini, ou um chat que você já usa).

Para o VS Code, baixe o [moki-0.4.1.vsix](https://github.com/Orsi88/moki/releases/download/v0.4.1/moki-0.4.1.vsix) e rode `code --install-extension moki-0.4.1.vsix`: [Moki na IDE](https://github.com/Orsi88/moki/wiki/Moki-na-IDE).

Os seus projetos ficam em **Documentos\Moki**, e um instalador mais novo nunca mexe neles. macOS, Linux e rodar a partir do código: [Primeiros passos](https://github.com/Orsi88/moki/wiki/Primeiros-passos).

## Primeiros passos

1. Abra o Moki e escolha um **workspace** (uma pasta de projetos, como um cofre do Obsidian).
2. Crie um **projeto** (só com o nome, ou personalizado com tags e configuração) ou abra como projeto uma pasta que você já tem.
3. Solte as histórias, os logs ou os documentos sobre a janela: eles vão para a entrada (inbox) do projeto.
4. Aperte o **play**, escolha a atividade e a sua ferramenta de IA. O pedido abre lá, pronto.
5. Converse com a IA como de costume. Cada atividade registra onde parou, então dá para voltar depois, na mesma ferramenta ou em outra.

## O que ele faz

| Atividade | O que você recebe |
|---|---|
| [Revisar histórias](skills/requirements-review/SKILL.md) | Ambiguidades, lacunas, uma pergunta por vez, uma matriz de revisão (Excel) e um relatório final de definições (PDF) |
| [Projetar testes](skills/test-design/SKILL.md) | Mapa de cenários e, depois do seu OK, casos de teste manuais em Excel |
| [Pré-análise de falha](skills/failure-analysis/SKILL.md) | Uma nota curta para o time de desenvolvimento, a partir da sua descrição e do log |
| [Montar evidências](skills/qa-orchestrator/references/workflows/test-evidence.md) | O item de trabalho e as gravações do Jam, depois uma planilha e um documento Word com os prints |
| [Contexto do projeto](skills/project-context/SKILL.md) | Onboarding, atualizações e o plano de um projeto em branco |

Os agentes encadeiam essas atividades em **operações multiagente**, os servidores MCP dão à IA as suas ferramentas (Playwright, Azure DevOps, Jira…) e a **extensão do VS Code** leva o contexto do projeto para a IA do seu editor.

## Documentação

A documentação completa está na [wiki](https://github.com/Orsi88/moki/wiki):

| Guia | O que tem |
|---|---|
| [Primeiros passos](https://github.com/Orsi88/moki/wiki/Primeiros-passos) | Instalação, workspaces, projetos, rodar a partir do código |
| [Usando o Moki](https://github.com/Orsi88/moki/wiki/Usando-o-Moki) | Dentro de um projeto, abrir a ferramenta de IA, configurações, tags, voltar depois, onde fica cada coisa |
| [Skills de QA e agentes](https://github.com/Orsi88/moki/wiki/Skills-de-QA-e-agentes) | As atividades, o estado de cada uma, as suas próprias skills |
| [Moki na IDE](https://github.com/Orsi88/moki/wiki/Moki-na-IDE) | A extensão do VS Code: instalar, configurar, todos os caminhos de uso |
| [Problemas comuns](https://github.com/Orsi88/moki/wiki/Problemas-comuns) | Problemas comuns e o que fazer |
| [Agents and operations](https://github.com/Orsi88/moki/wiki/Agents-and-operations) (em inglês) | Agentes, contratos e operações multiagente |
| [MCP servers](https://github.com/Orsi88/moki/wiki/MCP-servers) (em inglês) | As ferramentas que a IA recebe, por projeto |

A wiki é publicada a partir de [docs/](docs/), onde a documentação é editada.

## Privacidade

Os projetos ficam no seu computador e nunca fazem parte deste repositório. A IA lê o projeto ativo e, de outros projetos, só os arquivos compartilhados que o pedido lista por causa das tags que você definiu. Senhas e tokens não entram em arquivo nenhum: cite o nome de uma variável de ambiente. Detalhes: [Privacy and isolation](https://github.com/Orsi88/moki/wiki/Privacy-and-isolation) (em inglês).

## Contribuir

```bash
git clone https://github.com/Orsi88/moki.git
cd moki
npm run setup
npm run qa
```

Antes de um commit: `npm run build`, `npm run typecheck`, `npm run check` e `npm test`. Mudanças na documentação vão em `docs/` (a wiki é gerada a partir dela); mantenha `README.md` e `README.pt-BR.md` juntos. Mais: [Contributing](https://github.com/Orsi88/moki/wiki/Contributing) (em inglês).

## Licença

[MIT](LICENSE)

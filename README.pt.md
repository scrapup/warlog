🌐 [English](./README.md) | [日本語](./README.ja.md) | **Português**

# warlog

> Memória e registro de execução em arquivos para agentes de IA de programação.

## O que é o warlog

Agentes de IA de programação perdem a memória de trabalho entre sessões e entre máquinas. O
**warlog** guarda o estado de execução **e** o conhecimento acumulado de um agente como arquivos
legíveis por humanos (Markdown com front matter YAML) em pastas que você controla:

- **Rastreamento de execução** — projetos, épicos, histórias, tarefas, subtarefas, notas,
  comentários, templates e dependências, como substituto direto do tracker `mcp-saga` usado pelos
  workflows do `scrapup`.
- **Memória de batalha** — memórias de conhecimento tipadas (fatos, decisões, guardrails, padrões,
  comandos, problemas conhecidos, runbooks) com ciclo de vida, recuperadas por relevância.
- **Playbook do projeto** — como executar, testar, depurar e ler logs num repositório, com comandos
  que funcionam e que falham por ambiente.
- **Links e rastreabilidade** — use case ↔ história ↔ tarefa ↔ teste ↔ commit ↔ chave do tracker
  externo.
- **Variáveis tipadas e com escopo** — usáveis como feature toggles por agentes, hooks e scripts.
- **Questionários** — incluindo um After-Action Review (AAR) embutido.
- **Registro de documentos** — specs, planos, backlogs e diagramas registrados por caminho e lidos
  por seção.

Toda operação é exposta de forma idêntica para agentes (servidor de ferramentas MCP) e para humanos
e scripts (linha de comando).

## Status

**Pré-lançamento — ainda não publicado.** A especificação, o plano e o backlog estão em
[`docs/specs/warlog/`](./docs/specs/warlog/). Nada abaixo está disponível antes da `v0.1.0`.

## Instalação

> Disponível a partir da `v0.1.0`.

**Via npm** — o pacote `@scrapup/warlog`:

```bash
npm install -g @scrapup/warlog
```

**Como plugin do Claude Code** — registra o servidor `mcp-warlog` e a *skill* `warlog`:

```bash
/plugin marketplace add scrapup/warlog
/plugin install warlog
```

## Início rápido

> Disponível a partir da `v0.1.0`.

```bash
warlog --help                          # help at every level: groups, operations, parameters
warlog var get forge.parallel_executors  # typed variable, most specific scope wins
warlog mcp                             # start the MCP server over stdio
```

Registro manual do MCP:

```json
{ "mcpServers": { "mcp-warlog": { "command": "npx", "args": ["-y", "@scrapup/warlog", "mcp"] } } }
```

## Modelo de armazenamento

| Raiz | Local | Contém | Viaja via |
|---|---|---|---|
| Global | `$WARLOG_DIR` (padrão `~/.warlog`) | Memórias, variáveis, questionários, templates e documentos globais | Um serviço de sincronização à sua escolha |
| Repositório | `.warlog/` na *worktree* principal do repositório | Memórias, variáveis, projetos e documentos do repositório | O próprio repositório (versionado por padrão) |

Todas as *worktrees* de um repositório compartilham o mesmo `.warlog/`. O warlog nunca faz stage,
commit ou push de mudanças em `.warlog/` — versioná-las é decisão sua.

## Segurança

O warlog **não guarda segredos**: valores que casam com padrões conhecidos de segredo (tokens,
chaves privadas) são rejeitados. Ele não faz chamadas de rede e nunca contata trackers externos.
Reporte vulnerabilidades de forma privada conforme descrito em [SECURITY.md](./SECURITY.md).

## Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md). Agentes que trabalham neste código seguem
[CLAUDE.md](./CLAUDE.md).

## Licença

[MIT](./LICENSE) © 2026 scrapup

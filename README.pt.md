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
warlog var set forge.parallel_executors --value false --scope repo   # typed; --value true keeps its type
warlog var get forge.parallel_executors  # scalar printed raw; project > repository > global wins
warlog mcp                             # start the MCP server over stdio
```

Registro manual do MCP:

```json
{ "mcpServers": { "mcp-warlog": { "command": "npx", "args": ["-y", "@scrapup/warlog", "mcp"] } } }
```

## Migrando do `mcp-saga`

O warlog oferece todas as ferramentas do `mcp-saga` com o mesmo nome, parâmetros, enums e defaults;
um *workflow* migra apontando para `mcp-warlog`. As diferenças deliberadas:

- Identificadores são *strings* opacas (ULIDs), não inteiros.
- `note_delete` é *soft delete*; `note_restore` recupera a nota.
- *Stories* ficam entre *epics* e *tasks* (`story_*`); `task_create` aceita `story_id`, e `epic_id`
  passa a ser opcional quando uma *story* é informada.
- O estado existente é trazido sob demanda: `tracker_export` no `mcp-saga` e `tracker_import` no
  warlog (todos os ids são remapeados; um *export* inválido não grava nada).

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

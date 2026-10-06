🌐 [English](./README.md) | **日本語** | [Português](./README.pt.md)

# warlog

> AI コーディングエージェントのための、ファイルベースのメモリと実行台帳。

## warlog とは

AI コーディングエージェントは、セッション間やマシン間で作業記憶を失います。**warlog** は、エージェントの
実行状態 **と** 蓄積された知識を、人間が読めるファイル（YAML front matter 付きの Markdown）として、
あなたが管理するフォルダに保存します。

- **実行トラッキング** — プロジェクト、エピック、ストーリー、タスク、サブタスク、ノート、コメント、
  テンプレート、依存関係。`scrapup` のワークフローが使う `mcp-saga` トラッカーのドロップイン置き換え。
- **バトルメモリ** — 型付きの知識メモリ（事実、決定、ガードレール、パターン、コマンド、既知の問題、
  runbook）。ライフサイクルを持ち、関連度順に想起されます。
- **プロジェクト playbook** — リポジトリでの実行・テスト・デバッグ・ログの読み方。環境ごとに
  成功するコマンドと失敗するコマンドを記録します。
- **リンクとトレーサビリティ** — use case ↔ ストーリー ↔ タスク ↔ テスト ↔ commit ↔ 外部トラッカーのキー。
- **型付き・スコープ付きの変数** — エージェント、hook、スクリプトから feature toggle として利用可能。
- **アンケート** — 組み込みの After-Action Review（AAR）を含みます。
- **ドキュメントレジストリ** — spec、plan、backlog、図をパスで登録し、セクション単位で読み出します。

すべての操作は、エージェント（MCP ツールサーバー）と、人間・スクリプト（コマンドライン）に同一の形で
公開されます。

## ステータス

**プレリリース — 未公開。** 仕様、計画、backlog は [`docs/specs/warlog/`](./docs/specs/warlog/) にあります。
以下の内容は `v0.1.0` まで利用できません。

## インストール

> `v0.1.0` から利用可能。

**npm 経由** — パッケージ `@scrapup/warlog`:

```bash
npm install -g @scrapup/warlog
```

**Claude Code plugin として** — `mcp-warlog` サーバーと `warlog` *skill* を登録します:

```bash
/plugin marketplace add scrapup/warlog
/plugin install warlog
```

## クイックスタート

> `v0.1.0` から利用可能。

```bash
warlog --help                          # help at every level: groups, operations, parameters
warlog var set forge.parallel_executors --value false --scope repo   # typed; --value true keeps its type
warlog var get forge.parallel_executors  # scalar printed raw; project > repository > global wins
warlog mcp                             # start the MCP server over stdio
```

MCP の手動登録:

```json
{ "mcpServers": { "mcp-warlog": { "command": "npx", "args": ["-y", "@scrapup/warlog", "mcp"] } } }
```

## `mcp-saga` からの移行

warlog は `mcp-saga` のすべてのツールを同じ名前・パラメータ・enum・デフォルト値で提供します。*workflow* は
接続先を `mcp-warlog` に変えるだけで移行できます。意図的な違いは次のとおりです。

- 識別子は整数ではなく不透明な文字列（ULID）です。
- `note_delete` はソフトデリートで、`note_restore` でノートを復元できます。
- *story* は *epic* と *task* の間に位置します（`story_*`）。`task_create` は `story_id` を受け付け、*story* を
  指定した場合 `epic_id` は省略可能です。
- 既存の状態は必要なときに移せます。`mcp-saga` で `tracker_export` を実行し、warlog で `tracker_import`
  を実行します（すべての id は再割り当てされ、不正な *export* は何も書き込みません）。

## ストレージモデル

| ルート | 場所 | 内容 | 移動手段 |
|---|---|---|---|
| グローバル | `$WARLOG_DIR`（既定 `~/.warlog`） | グローバルなメモリ、変数、アンケート、テンプレート、ドキュメント | 任意の同期サービス |
| リポジトリ | リポジトリのメイン *worktree* の `.warlog/` | リポジトリのメモリ、変数、プロジェクト、ドキュメント | リポジトリ自体（既定でバージョン管理） |

1 つのリポジトリのすべての *worktree* は同じ `.warlog/` を共有します。warlog は `.warlog/` の変更を
stage、commit、push しません — バージョン管理するかどうかはあなたが決めます。

## セキュリティ

warlog は **シークレットを保存しません**。既知のシークレットパターン（トークン、秘密鍵）に一致する値は
拒否されます。ネットワーク呼び出しは行わず、外部トラッカーにも接続しません。脆弱性は
[SECURITY.md](./SECURITY.md) の手順に従って非公開で報告してください。

## コントリビュート

[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。このコードベースで作業するエージェントは
[CLAUDE.md](./CLAUDE.md) に従います。

## ライセンス

[MIT](./LICENSE) © 2026 scrapup

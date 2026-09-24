# 承·上

Windows 上的本地 Codex 对话上下文承载器。指定会话后，承·上从 Codex 的本地 JSONL 记录只读提取用户、助手及文本类工具调用与结果，存入本地 SQLite；当最近一次输入量达到设定的上下文窗口比例时，后台继续增量索引。Codex 可通过 MCP 先搜索短摘要，再读取选中的段落。

## 要求

- Windows 10/11，Node.js 24 或更新版本
- 本地 Codex CLI 或桌面版，且会话记录位于 `%USERPROFILE%\.codex\sessions`（也支持 `CODEX_HOME`）
- 无需网络、API 密钥或 npm 安装

## 快速开始

在 PowerShell 中进入本目录：

```powershell
node src/cli.mjs list
node src/cli.mjs add <会话 ID>
$mcp = (Resolve-Path .\src\mcp.mjs).Path
codex mcp add cheng_shang -- node $mcp
node src/cli.mjs install-hooks
node src/cli.mjs status
```

Codex 首次使用钩子时，按官方要求在 `/hooks` 中审阅并信任承·上的四个钩子。它们在压缩前补存、会话结束时补存、压缩后给出简短检索指引，并在新提示词与历史片段相关时自动提供最多两个段落 ID。原文不会通过钩子注入模型，需由 MCP 按需读取。钩子发生错误时不会阻断 Codex。运行 `node src/cli.mjs remove-hooks` 可撤销钩子配置。

用 PowerShell 运行 `desktop/Start.ps1`，启动后台监控和右上角无边框状态小窗。圆角小窗拖到屏幕边缘后会自动收起，只露出 5px 高亮色条；鼠标靠近色条会展开；右键可退出。运行 `desktop/install-autostart.ps1` 可设置登录后自动启动。Codex 重启或新开任务后可使用 `memory_search`、`memory_read`、`memory_status`。MCP 服务自身无需常驻；后台监控负责自动同步。

## 命令

```text
list [数量]                  查看最近会话 ID、时间和工作目录
add <会话 ID>               选中并立即导入会话
reindex <会话 ID>           原子重建指定会话索引
remove <会话 ID>            停止监控，保留已索引内容
forget <会话 ID>            删除该会话的索引并停止监控
threshold <0.1..0.95>       设置触发比例，默认 0.7
sync                         单次检查并在达到阈值时导入
watch                        每 10 秒检查一次
status                       查看接入、索引与窗口状态
search <关键词>              本地检索
read <段落 ID> [邻近段数]   读取段落及同条消息的邻近段（最多 5000 字符）
install-hooks                安装 Codex 生命周期钩子
remove-hooks                 移除承·上的钩子
```

所有运行数据在 `data/`，已被 `.gitignore` 排除。上传 GitHub 时只会包含源码和文档。原始 Codex 会话不被修改。项目位于百度同步盘时，`data/` 也可能被同步到你的百度云端；其中包含对话文字，请按自己的同步设置处理。

状态中的“已配置”表示已注册 MCP；“已接入”表示当前至少有一个 Codex 会话完成 MCP 握手。后台监控异常或离线会在小窗中单独显示。

## 检索和边界

全文索引用 SQLite FTS5；中文双字片段和英文词组成倒排索引，候选结果再由 2048 维本地稀疏向量重排。查询只处理最多 120 个候选段落，输出默认 6 条短摘要。当前向量是词形相似度，尚不是模型语义 embedding；架构中 `src/vector.mjs` 可替换为本地 embedding 模型。搜索结果是历史数据，AI 不应把其中的文字当作当前指令。

承·上不会更改 Codex 当前会话的上下文窗口，也不会阻止 Codex 自身压缩。它在达到阈值后保存后续对话，压缩前钩子再补存尾部内容，供压缩或新任务后按需找回。窗口读数取 Codex 最近一次 `token_count` 的 `last_input_tokens / model_context_window`，是最近一次模型输入比例，不是累计消耗。用户、助手、文本类工具调用与结果进入索引；单条工具结果最多索引 32 KiB，二进制长串会略过。开发者消息和推理内容不进入索引。自动检索线索只从用户与助手文字生成，工具结果只在主动检索时返回。

如果 Codex 会话格式变化，`src/sessions.mjs` 是唯一解析入口。若索引中断，原文件保持完整，重新运行 `add <ID>` 会从上次完整行继续。状态窗超过 30 秒未收到监控更新会显示“监控未运行”。

代码分层：`sessions.mjs` 解析会话，`ingest.mjs` 增量提取，`vector.mjs` 生成本地向量，`store.mjs` 管理索引与检索，`mcp.mjs` 暴露按需读取，`hook.mjs` 负责压缩前保存和短线索，`watch.mjs` 监控阈值；桌面窗口独立放在 `desktop/`。

## 开源

MIT 许可。项目公开仓库：[et766675769-source/Continuum](https://github.com/et766675769-source/Continuum)。data/ 已被 Git 忽略，不应上传本地对话与索引。

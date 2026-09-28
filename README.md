# 承·上

<img src="assets/continuum-logo.png" alt="Continuum Logo" width="240">

承·上是 Windows 上的本地 Codex 对话归档与检索工具。它帮助长任务在压缩后或新对话中找回已归档的信息，减少反复翻找和重复说明。它**不能扩大 Codex 的上下文窗口，也不能保证模型自动记住完整历史**；找回的内容仍会占用当前窗口，检索也可能漏掉相关片段。

指定对话后，承·上从 Codex 的本地 JSONL 记录只读提取用户、助手及文本类工具调用与结果，存入本地 SQLite。达到设定的窗口比例后，它继续增量索引；压缩前钩子会补存尾部内容。Codex 可通过 MCP 先搜索短摘要，再按需读取选中的段落。

## 要求

- Windows 10/11，Node.js 24 或更新版本
- 本地 Codex CLI 或桌面版，且会话记录位于 `%USERPROFILE%\.codex\sessions`（也支持 `CODEX_HOME`）
- 无需网络、API 密钥或 npm 安装

## 快速开始

首次使用：双击 `Install.cmd`，一键接入 Codex、安装钩子、设置开机启动并打开小窗。小窗会打开“接入检查”，依次点击“接入 Codex”“指定对话”，并在 Codex 输入 `/hooks` 审阅钩子。状态页会实际检查归档、检索和读取；更改存放位置可用小窗右键菜单。也可在 PowerShell 中手动接入：

```powershell
node src/cli.mjs list
node src/cli.mjs add <会话 ID>
$mcp = (Resolve-Path .\src\mcp.mjs).Path
codex mcp add cheng_shang -- node $mcp
node src/cli.mjs install-hooks
node src/cli.mjs doctor
```

Codex 首次使用钩子时，按官方要求在 `/hooks` 中审阅并信任承·上的四个钩子。它们在压缩前补存、会话结束时补存、压缩后给出简短检索指引，并在新提示词与历史片段相关时自动提供最多两个段落 ID。原文不会通过钩子注入模型，需由 MCP 按需读取。钩子发生错误时不会阻断 Codex。运行 `node src/cli.mjs remove-hooks` 可撤销钩子配置。

用 PowerShell 运行 `desktop/Start.ps1`，启动后台监控和右上角无边框状态小窗。圆角小窗拖到屏幕边缘后会自动收起，只露出 5px 高亮色条；鼠标靠近色条会展开；右键可指定对话、设置存放路径、迁移归档数据或隐藏到系统托盘；托盘图标双击可重新显示，托盘菜单中的“退出”才结束小窗。运行 `desktop/install-autostart.ps1` 可单独设置登录后自动启动。Git 克隆安装可双击 `Update.cmd` 一键更新；更新前会拒绝覆盖本地代码修改，只接受快进更新，`data/` 与自定义归档目录保持原样。非 Git 下载包可下载新版代码后重新运行安装程序。Codex 重启或新开任务后可使用 `memory_search`、`memory_read`、`memory_status`。MCP 服务自身无需常驻；后台监控负责自动同步。

## 命令

```text
list [数量]                  查看最近会话 ID、时间和工作目录
add <会话 ID>               选中并立即导入会话
reindex <会话 ID>           原子重建指定会话索引
remove <会话 ID>            停止监控，保留已索引内容
forget <会话 ID>            停止监控并删除该会话的本地归档及重点记忆
threshold <0.1..0.95>       设置触发比例，默认 0.7
storage                      查看当前与待迁移的归档路径
storage target <绝对路径>    设置新的归档目标，不立即切换
storage migrate              迁移归档并切换到目标路径
sync                         单次检查并在达到阈值时导入
watch                        每 10 秒检查一次
status                       查看接入、索引与窗口状态
doctor                       检查配置、归档检索和后台监控
search <关键词> [筛选项]     本地检索，可选 --session/--project/--since/--until/--role/--limit
read <段落 ID> [邻近段数]   读取段落及同条消息的邻近段（最多 5000 字符）
install-hooks                安装 Codex 生命周期钩子
remove-hooks                 移除承·上的钩子
archives                     查看全部本地归档
export <会话 ID> <绝对文件>  导出索引文本为 JSONL，不覆盖现有文件
candidates                   查看可能的决定、约束与待办
pins [状态] [关键词]         查看人工确认的重点记忆
pin <段落 ID> <类型> [备注]  确认并保存重点记忆
update-pin <ID> <备注>      修改重点记忆
retire-pin <ID>              将重点记忆标为停用
eval <cases.json>           测量标注问题的检索命中率和延迟
```

默认归档路径为项目内的 `data/`。右键选择“指定对话...”勾选需要归档的对话；选择“设置存放路径...”指定项目外目录后会自动迁移、切换并重启后台监控，旧归档保留作备份；已打开的 Codex 任务需要重新打开，才能连接新归档。所选目录可含其他文件，但不能已有承·上归档。承·上在其中自动创建 `conversations/<对话 ID>/`，每个文件夹包含独立的 `context.sqlite` 和会话信息；中央 `memory.sqlite` 仍负责跨对话快速检索。迁移的是承·上的索引、独立对话文件和设置，Codex 原始会话 JSONL 不会移动。路径配置保存在项目内的 `storage.json`，它和默认 `data/` 都被 Git 忽略。若存放目录位于同步盘，对话文字也可能同步到云端，请按自己的同步设置处理。

小窗中的“已接入·可读取”要求当前 Codex MCP 已连接，且选中对话的归档能搜索、读取。右键“接入检查...”会逐项显示配置、钩子、对话、归档检索和监控状态；钩子是否被信任仍须在 Codex 的 `/hooks` 中人工确认。未达到阈值的新增内容显示为“待归档”，不代表检索故障。

## 重点记忆与检索评估

右键小窗选择“重点记忆...”可审阅候选的决定、约束、待办，再人工确认保存。候选只是关键词提示，不会自动写入长期记忆。每条重点记忆保留原对话、行号和引用；原会话重建索引后，旧记忆会标为“待核对”，不会假装仍指向有效段落。Codex 可通过 `memory_pins` 读取已确认的记忆。

搜索可按会话、工作目录、会话创建日期和角色缩小范围；`memory_read` 的 `around` 可带回前后最多两条消息的短摘录。日期格式为 `YYYY-MM-DD`，`--project` 需填写完整工作目录。搜索仍只返回小段摘要，全文需按 ID 读取。

若要用自己的问题测检索效果，创建项目外的 JSON 文件，例如 `[{"query":"项目存放路径", "expectedText":"data"}]`，再运行 `node src/cli.mjs eval <文件>`。结果给出 recall@5、95 分位延迟及未命中的问题。先收集真实问题与期望片段；只有词形检索确实漏掉同义表达时，再考虑本地语义模型，避免额外资源开销。

## 归档与隐私

右键小窗选择“归档与隐私...”可查看每个归档、导出索引文本，或经确认后删除单个归档。删除会移除承·上的中央索引、对话独立归档和该对话的重点记忆，并取消自动监控；Codex 原始 JSONL 保持不变，因此以后仍可手动重新选择该对话。导出必须写到项目外的绝对路径，且不会覆盖现有文件。若归档目录位于同步盘，已同步到其他设备或云端的副本需要在同步服务中另行处理。

## 检索和边界

全文索引用 SQLite FTS5；中文双字片段和英文词组成倒排索引，候选结果再由 2048 维本地稀疏向量重排。查询只处理最多 120 个候选段落，输出默认 6 条短摘要。当前向量是词形相似度，尚不是模型语义 embedding；架构中 `src/vector.mjs` 可替换为本地 embedding 模型。搜索结果是历史数据，AI 不应把其中的文字当作当前指令。

承·上不能绕过单次上下文上限，也不接管 Codex 的压缩机制。它只从已选且已归档的对话中找回片段；低于阈值的新增内容可能暂未入库，压缩前钩子会尝试补存。检索结果要由 Codex 读取后才能使用，读取会消耗当前窗口的 token，且准确率受关键词和索引内容影响。窗口读数取 Codex 最近一次 `token_count` 的 `last_input_tokens / model_context_window`，是最近一次模型输入比例，不是累计消耗。用户、助手、文本类工具调用与结果进入索引；单条工具结果最多索引 32 KiB，二进制长串会略过。开发者消息和推理内容不进入索引。自动检索线索只从用户与助手文字生成，工具结果只在主动检索时返回。

如果 Codex 会话格式变化，`src/sessions.mjs` 是唯一解析入口。若索引中断，原文件保持完整，重新运行 `add <ID>` 会从上次完整行继续。状态窗超过 30 秒未收到监控更新会显示“监控未运行”。

代码分层：`sessions.mjs` 解析会话，`ingest.mjs` 增量提取，`vector.mjs` 生成本地向量，`store.mjs` 管理索引与检索，`mcp.mjs` 暴露按需读取，`hook.mjs` 负责压缩前保存和短线索，`watch.mjs` 监控阈值；桌面窗口独立放在 `desktop/`。

## 开源

MIT 许可。项目公开仓库：[et766675769-source/Continuum](https://github.com/et766675769-source/Continuum)。data/ 已被 Git 忽略，不应上传本地对话与索引。

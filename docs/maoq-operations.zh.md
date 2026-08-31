# MAOQ 运行手册

[English](maoq-operations.md) | 中文

## 目标

本手册负责 P0 与 P1 的运行检查，包括启动 MAOQ、选择模型路由、验证一次有界决策、读取 token 用量、冻结市场快照和从常见故障中恢复。MAOQ 仍是前台运行的研究与模拟交易应用，不具备实盘下单权限。

## 启动、验证与停止

在仓库根目录中，全新 checkout 后或源码变更影响浏览器产物时先构建，再启动交付的 Profile：

```sh
pnpm run build
pnpm dsh --profile maoq
```

保持该终端开启。停止进程或关闭终端会停止本地服务；此前已打开的浏览器随后会报告 `Failed to fetch`，直至重新启动 Profile。按一次 `Ctrl+C` 可干净停止。

启动输出会打印带认证信息的浏览器 URL。直接进行未认证的健康检查应能连接服务器，并通常返回 HTTP 401：

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/
lsof -nP -iTCP:3080 -sTCP:LISTEN
```

连接被拒绝且没有监听进程，表示 MAOQ 进程没有运行。HTTP 401 表示服务器正在运行并保护浏览器会话，不是模型认证失败。

## 选择模型路由

使用本机 Codex 路由时，先确认共享的 ChatGPT 登录：

```sh
codex login status
```

启动 MAOQ，打开**设置 → 模型 → 统帅模型**，选择**本机 Codex 登录**并指定具体模型。随附议事组使用 `gpt-5.6-sol`。配置 Codex 路由后，启动和刷新时都不会出现 DeepSeek API Key 引导。

使用外部 API 路由时，保留现有提供方 Profile 和凭据流程：在模型页面配置提供方，通过凭据字段保存 API Key，再为统帅选择该提供方和模型。绝不能把 Key 写入补丁文件、提示词、日志或提交的 fixture。

保存的模型选择只影响新建任务。现有任务会保留创建时记录的提供方和模型，因此切换路由后需要创建新任务。

## P0 canary

在目标统帅路由上新建任务，要求它调用 `maoq_decide`，只选择 `market_regime` 和 `sector_battlefield`，综合一项模拟决策，并在缺少证据截止点时要求独立审查者否决。只有以下条件同时成立才算通过：只运行这两位专家；综合结果结构化；否决产生 `vetoed`；没有提出实盘行动；每个子 Agent 和总计都报告 token 用量。提供方没有返回用量时必须计入 `unavailableCalls`，绝不能估算。

先使用本机 Codex 登录运行一次 canary。有外部提供方凭据时，再在该路由上新建任务并重复运行。CI 使用本地协议对端验证相同的外部适配器生命周期，因此发布门禁不需要秘密信息；真实外部 canary 用于验证操作者账户、端点、额度和所选模型。

## 故障恢复

| 症状 | 含义 | 恢复方式 |
|---|---|---|
| `llm/listProviders failed: Failed to fetch` | 浏览器无法访问本地 MAOQ 服务 | 检查 3080 监听，重新启动 Profile，再刷新带认证信息的浏览器 URL |
| Codex 登录缺失 | 本机 OAuth 记录不可用 | 运行 `codex login`，确认 `codex login status`，再新建 MAOQ 任务 |
| `UNKNOWN_MODEL` 或模型无效诊断 | 所选路由不提供该模型 | 选择该提供方公开的模型并新建任务 |
| `TRANSPORT`、超时或重复重试耗尽 | 提供方端点无法访问或停滞 | 确认本机连接和代理状态；系统代理变化后重启 Profile，再新建任务重试 |
| 外部凭据缺失 | 所选 API 路由引用的凭据没有值 | 在模型页面保存 Key；不要替换或删除 Codex 路由 |
| 专家或综合结果结构畸形 | 某个结构化子 Agent 未满足 schema | 将本次运行视为失败，不能把不完整叙事当作决策 |
| 风险结果为 `vetoed` | 独立审查者停止了这项模拟决策 | 保留否决及其理由，不得根据本次运行采取行动 |

## P0 验收证据

| P0 性质 | 自动化证据 | 操作者证据 |
|---|---|---|
| 交付的 `maoq` Profile 能通过源码 CLI 解析 | [`source-launch.compat.spec.ts`](../apps/cli/tests/source-launch.compat.spec.ts) | 上方启动命令及 HTTP／监听检查 |
| 本机 Codex 认证仅按明确选择用于 `openai-codex` | [`auth.spec.ts`](../packages/llm/llm-pi-ai/tests/auth.spec.ts) | `codex login status` 加一次本机 Codex canary |
| 外部 API 路由继续可用 | [`adapter.spec.ts`](../packages/llm/llm-pi-ai/tests/adapter.spec.ts) 和 [`dynamic-config.spec.ts`](../packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts) | 操作者凭据可用时运行一次 canary |
| Codex 配置在启动和刷新时都能关闭 API Key 引导 | [`onboarding-dialog.client.spec.tsx`](../packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx) | 刷新空白 MAOQ 首页，确认不出现 DeepSeek Key 弹窗 |
| 统帅只选择被请求的专家 | [`loader-composition.spec.ts`](../packages/workflow/tool-maoq-decision/tests/loader-composition.spec.ts) | 检查 canary 的专家列表 |
| 结构化综合和最终风险否决由宿主强制执行 | [`tool-maoq-decision.spec.ts`](../packages/workflow/tool-maoq-decision/tests/tool-maoq-decision.spec.ts) | 确认被强制设置为不安全的提案最终状态是 `vetoed` |
| 登录缺失、模型无效、传输故障、结构畸形、取消和否决都明确失败 | 上方链接的适配器、Codex subagent 和 MAOQ 决策测试 | 使用恢复表，绝不能把错误重新解释为批准 |
| 提供方 token 用量按原值报告且不估算 | [`tool-maoq-decision.spec.ts`](../packages/workflow/tool-maoq-decision/tests/tool-maoq-decision.spec.ts) | 检查 canary 中逐调用总计和 `unavailableCalls` |

自动化证据全部通过且操作者机器上的本机 Codex canary 成功时，P0 即完成。依赖某个外部账户之前必须完成该账户的真实外部 canary，但缺少外部凭据不会阻塞本机 Codex 运行或无 Key 发布门禁。

## P1 canary

Profile 会延迟挂载生产日线适配器，因为数据库端点和凭据属于部署事实。使用只具备 SELECT 权限的账户，并按需配置 `MAOQ_MYSQL_HOST`、`MAOQ_MYSQL_PORT`、`MAOQ_MYSQL_SOCKET`、`MAOQ_MYSQL_USER`、`MAOQ_MYSQL_DATABASE` 以及密码凭据键 `MAOQ_MYSQL_PASSWORD_CREDENTIAL`。然后可以要求统帅：“以 2026-08-31T16:00:00+08:00 为截止点，生成截至 2026-08-28 的最近 10 个不可变日线快照。”它可以使用 `maoq_snapshot_sources`、`maoq_snapshot_generate`、`maoq_snapshot_list` 和 `maoq_snapshot_inspect`；生成结果会返回精确的 `currentHash` 与 `historyHashes` 供战略分析使用。不要把任何版本标记替换为易读日期。

政策与新闻采集是独立的截止点前步骤。提前使用带版本查询调用 `ctx.marketNews.acquire()`，确保它在 `cutoffTime` 前完成，再通过 `discoverIdentity` 加入其内容哈希。即使文章发布更早，首次在截止点后执行的搜索也不合格。回放调用 `get(hash)`，不执行搜索。

2026-08-31 本机验收使用交易日 2026-08-28 和截止点 `2026-08-31T16:00:00+08:00`。两次完整适配器构建及一次持久化回放对 5,208 只股票、31 个申万一级板块和 6 个主要指数产生相同哈希 `1369f75b3759ecedf4db41e22e812640787bfec16b555fb3966e3df56ea17c7c`。同一来源正确拒绝了 2026-08-28 的较早截止点，因为指数行在 2026-08-31 被重新抓取；也拒绝了质量不完整的 2026-05-11。这证明截止点由事实强制执行，而不是从交易日猜测。

### P1 验收证据

| P1 性质 | 自动化证据 | 真实数据证据 |
|---|---|---|
| 规范不可变构建、精确身份、冲突与冻结回放 | [`market-snapshot.spec.ts`](../packages/market/market-snapshot/tests/market-snapshot.spec.ts) | 重复构建和持久化读取返回上述同一哈希 |
| 质量门控的日线、参考、板块、宽度与情绪事实 | [`market-snapshot-mysql.spec.ts`](../packages/market/market-snapshot-mysql/tests/market-snapshot-mysql.spec.ts) | 5,208 只股票、31 个板块、6 个指数；连接后行数等于质量行 |
| 模型触发的有界取得和精确哈希找回 | [`loader-composition.spec.ts`](../packages/market/tool-maoq-snapshot/tests/loader-composition.spec.ts) | 请求有界窗口，再检查返回的当前哈希 |
| 截止点安全的联网证据与离线回放 | [`market-news-web.spec.ts`](../packages/market/market-news-web/tests/market-news-web.spec.ts) | 随附 Profile 把不可变存储挂载在 `.maoq/news`；依赖某个提供方时间戳前需要该提供方 canary |
| 不使用未来数据且不静默回退质量 | 上述 MySQL 与新闻测试 | 截止点后刷新的指数证据和不完整会话均被拒绝 |
| 供应商无关的审计导入 | [`market-snapshot-json.spec.ts`](../packages/market/market-snapshot-json/tests/market-snapshot-json.spec.ts) | 无数据库凭据时仍可使用按精确身份寻址的导入 |

这些测试、文档门禁、宿主构建、真实日线双构建、早截止点拒绝和不可用质量拒绝全部通过时，P1 即完成。使用某个联网提供方的证据开展研究前，该提供方仍必须通过真实的截止点前 canary；提供方不可用不会削弱或绕过不可变批次约定。

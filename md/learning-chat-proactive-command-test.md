# learning_chat 自动指令测试

## 快速开始

先跑现成单测，确认“提醒消息 + 指令回放”没有回归：

```bash
npm run test:learning-chat-proactive-command
```

这条命令等价于：

```bash
node --test test/learning-chat-proactive-command.test.js
```

## 联调前检查

查看 `learning_chat` 当前测试相关状态：

```bash
node ./bin/xunlu-dev.js learning-chat proactive-test status --group <群号>
```

输出会包含：

- `configPath`：当前 `learning_chat` 配置文件路径
- `configExists`：配置文件是否已生成
- `learningChatDbExists`：`learning_chat.sqlite` 是否存在
- `commandUsageDbExists`：`command_usage.sqlite` 是否存在
- `group.effective.proactive_enabled`：目标群当前是否已允许主动发言

## 一键套用联调配置

为自动指令联调套用推荐配置，并自动备份原配置：

```bash
node ./bin/xunlu-dev.js learning-chat proactive-test prepare --group <群号>
```

默认会应用这组更适合联调的参数：

- `proactive.enable = true`
- `proactive.command_enable = true`
- `proactive.min_messages_today = 0`
- `proactive.command_min_count = 1`
- `proactive.command_recent_manual_sec = 0`
- `proactive.command_cooldown_sec = 0`
- `proactive.command_max_daily_per_user = 5`
- `proactive.command_whitelist = ["^帮助$"]`
- 目标群 `proactive_enabled = true`

可选参数：

```bash
node ./bin/xunlu-dev.js learning-chat proactive-test prepare --group <群号> --whitelist "^指令统计(?:\\s*(今日|今天|1天|3天|7天|30天))?$"
node ./bin/xunlu-dev.js learning-chat proactive-test prepare --group <群号> --json
node ./bin/xunlu-dev.js learning-chat proactive-test prepare --group <群号> --backup temp/proactive-test.backup.json
```

如果备份文件已存在，需要先恢复，或者显式追加 `--force` 覆盖旧备份。

## 手工联调步骤

1. 启动机器人，让 `learning_chat` 和指令记录逻辑进入正常工作状态。
2. 在目标群里，用同一个用户手动发 1 到 2 次白名单命令。
3. 停止发言，等待分钟级定时任务触发。
4. 成功时会先出现一条提醒消息：

```text
@你 自动帮你执行常用指令：xxx
```

5. 随后对应插件指令会被真正执行。

默认白名单更适合快速验证 `帮助`。如果你想验证现网默认规则，也可以改成：

- `帮助`
- `水群统计`
- `词频统计`
- `指令统计`

手工确认指令记录是否入库，最简单的方式是直接在群里发：

```text
指令统计
```

## 恢复原配置

联调完成后恢复备份：

```bash
node ./bin/xunlu-dev.js learning-chat proactive-test restore
```

如果准备阶段用了自定义备份路径，恢复时也要带上同一个路径：

```bash
node ./bin/xunlu-dev.js learning-chat proactive-test restore --backup temp/proactive-test.backup.json
```

默认恢复后会删除备份文件；如果你想保留备份，追加 `--keep-backup`。

## 常见排查

如果一直不触发，优先检查：

- 目标群 `proactive_enabled` 是否为 `true`
- 刚刚是否手动用了同一条命令
- 是否命中了每日次数或冷却限制
- 命令是否在当前白名单里
- 目标群最近是否真的有这名用户的手动指令记录

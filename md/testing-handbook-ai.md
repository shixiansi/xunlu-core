# xunlu-core 测试手册（给 AI / Agent）

用途：把 `xunlu-core` 当前可复用的测试基建收口到一份文档里，方便 AI / Agent 直接按统一入口做离线模拟、协议断言、任务触发和 `node:test` 回归。

适用目录：`c:\Users\fan\Desktop\Miao-Yunzai\plugins\xunlu-core`

---

## TL;DR

1. 统一入口优先用 `src/dev/plugin-test-harness.js` 的 `createPluginTestHarness(...)`
2. CLI 统一用 `xunlu-dev simulate` / `simulate-event` / `simulate-task`
3. `--protocol icqq` 现在是严格 mock，`--protocol icqq-local` 才是本地链路
4. `--protocol both = milky + onebotv11`，`--protocol all = milky + onebotv11 + icqq`
5. 自动化回归固定用 Node 内建 `node:test`，脚本见 `npm test` / `npm run test:unit` / `npm run test:render`

---

## 0) 目标与分层

本期测试基建是四件套：

- 统一 harness：`src/dev/plugin-test-harness.js`
- 严格协议 mock：`src/dev/protocol-mock.js`
- CLI 执行器：`bin/xunlu-dev.js`
- 回归测试：`test/*.test.js`

职责分工建议：

- 写插件时，先跑 CLI smoke，确认命令链路和协议映射没有跑偏
- 写自动化时，优先直接用 harness，断言 `replies / apiCalls / renderCalls / warnings / errors`
- 做协议差异回归时，直接看 `apiCalls`
- 需要真实 Chromium 时，单独放到 `test:render`

---

## 1) 统一 Harness

入口：`src/dev/plugin-test-harness.js`

核心导出：

```js
import { createPluginTestHarness } from "../src/dev/plugin-test-harness.js"

const harness = await createPluginTestHarness({
  plugins: ["example-plugin"],
  protocol: "onebotv11",
  mockMode: "strict",
})
```

### 1.1 构造参数

`createPluginTestHarness({ plugins, protocol, selfId, mockMode, renderMode, schedulerMode })`

- `plugins`
  - 支持插件名字符串、插件对象，或它们的数组
- `protocol`
  - 仅表示底层协议：`milky | onebotv11 | icqq`
- `selfId`
  - 测试用 bot ID，默认 `10000`
- `mockMode`
  - `strict | local`
  - 默认 `strict`
  - CLI 的 `icqq-local` 实际映射为 `{ protocol: "icqq", mockMode: "local" }`
- `renderMode`
  - 默认 `fake`
  - `fake` 会记录渲染调用并返回可继续发送的图片段
- `schedulerMode`
  - 默认 `fake`
  - `fake` 会记录任务注册，允许直接按索引触发

### 1.2 Harness 生命周期

- 单个 harness 生命周期内只创建一个 `BaseBot`
- 插件只加载一次，适合测试上下文状态、多轮对话和任务注册
- `resetCaptures()` 只清空采集结果，不会重置 bot 内部状态
- 用完后请 `await harness.dispose()`，避免配置 watcher、数据库连接、浏览器实例残留

### 1.3 对外方法

- `await harness.emitMessage({ scene, text, rawSegments, group_id, user_id, self_id })`
- `await harness.emitEvent({ event, protocolPayload, group_id, user_id, operator_id, target_id, flag, comment, extra })`
- `await harness.runTask({ index, ctxLike })`
- `await harness.flushTimeouts()`
- `harness.resetCaptures()`

示例：

```js
const run = await harness.emitMessage({
  scene: "group",
  text: "示例",
  group_id: 123,
  user_id: 10001,
})

const notice = await harness.emitEvent({
  event: "notice.group.increase",
  group_id: 123,
  user_id: 10001,
  operator_id: 10002,
})

const task = await harness.runTask({ index: 0 })
const timers = await harness.flushTimeouts()
```

### 1.4 统一返回结构

每次触发统一返回：

```json
{
  "ok": true,
  "event": "message.group.normal",
  "replies": [],
  "apiCalls": [],
  "renderCalls": [],
  "warnings": [],
  "errors": [],
  "result": {}
}
```

字段含义：

- `replies`
  - 从发送类调用里提取出的回复快照，适合做高层断言
- `apiCalls`
  - 协议/API 层的结构化调用记录，适合做精确断言
- `renderCalls`
  - fake renderer 的调用采集
- `warnings`
  - mock 校验警告、模拟器补齐字段时产生的提示
- `errors`
  - mock 校验失败、插件执行异常、任务执行异常、定时器回调异常
- `result`
  - 事件模拟器或任务本身的返回值；`flushTimeouts()` 下为 `{ executed }`

---

## 2) 协议 Mock

入口：`src/dev/protocol-mock.js`

核心导出：

```js
import { createProtocolMock } from "../src/dev/protocol-mock.js"
```

返回结构：

```js
const runtime = createProtocolMock({ protocol: "icqq", selfId: 10000 })
// => { bot, warnings, errors, calls }
```

### 2.1 严格模式

严格模式下，mock 会同时挂到：

- `globalThis.Bot`
- `bot.bindEvent`

这样插件无论走 `Bot.*`、`ctx.*` 还是 `botApi.*`，都会进入同一套可断言 mock。

### 2.2 本地模式

本地模式只保留现有本地事件链路，不把严格 mock 注入到 `bindEvent`。

当前仅建议用于：

- 对照旧链路行为
- 排查严格 mock 与真实本地对象的差异

### 2.3 统一 calls 结构

所有协议调用统一记录为：

```json
{
  "protocol": "icqq",
  "kind": "native",
  "name": "pickGroup.setReaction",
  "params": {
    "message_seq": 456,
    "reaction": 277
  },
  "target": {
    "group_id": 123
  }
}
```

固定字段：

- `protocol`
  - `milky | onebotv11 | icqq`
- `kind`
  - 常见为 `api`、`native`
- `name`
  - action / method / native 调用名
- `params`
  - 归一化后的参数快照
- `target`
  - 群、好友、用户等目标快照

### 2.4 当前严格覆盖重点

- 三端统一的 `sendMessage`
- 三端统一的 `recallMessage`
- 三端统一的 `sendGroupMessageReaction`
- 三端统一的 `accept/rejectGroupRequest`
- 三端统一的 `accept/rejectFriendRequest`
- 三端统一的 `setGroupMemberMute`
- 三端统一的 `sendProfileLike`
- ICQQ native 入口：
  - `pickGroup`
  - `pickUser`
  - `pickFriend`
  - `sendMsg`
  - `recallMsg`
  - `setReaction`
  - `muteMember`
  - `setGroupAddRequest`
  - `setFriendAddRequest`
  - `sendLike`
  - `makeForwardMsg`

---

## 3) CLI 工作流

入口：`bin/xunlu-dev.js`

三条统一命令：

```bash
node ./bin/xunlu-dev.js simulate "示例" --plugin example-plugin --protocol both --scene group --group 123 --user 10001

node ./bin/xunlu-dev.js simulate-event notice.group.increase --plugin group --protocol all --group 123 --user 10001 --operator 10002

node ./bin/xunlu-dev.js simulate-task 0 --plugin other --protocol icqq-local
```

### 3.1 `simulate`

用途：模拟消息事件包装层。

常用参数：

- `<text>`
- `--plugin <name>[,<name2>]`
- `--protocol <milky|onebotv11|icqq|icqq-local|both|all>`
- `--scene <group|private>`
- `--group <id>`
- `--user <id>`
- `--raw-segments <json>`
- `--json`

### 3.2 `simulate-event`

用途：直接模拟 `message / notice / request` 事件。

常用参数：

- `<event>`
- `[text...]`
- `--plugin <name>[,<name2>]`
- `--protocol <milky|onebotv11|icqq|icqq-local|both|all>`
- `--group <id>`
- `--user <id>`
- `--operator <id>`
- `--target <id>`
- `--flag <value>`
- `--comment <text>`
- `--protocol-payload <json>`
- `--extra <json>`
- `--json`

### 3.3 `simulate-task`

用途：直接触发插件注册的定时任务。

常用参数：

- `<index>`
- `--plugin <name>[,<name2>]`
- `--protocol <milky|onebotv11|icqq|icqq-local|both|all>`
- `--group <id>`
- `--user <id>`
- `--ctx <json>`
- `--json`

### 3.4 协议展开规则

- `milky` -> 单跑 `milky` 严格 mock
- `onebotv11` -> 单跑 `onebotv11` 严格 mock
- `icqq` -> 单跑 `icqq` 严格 mock
- `icqq-local` -> 单跑 `icqq` 本地链路
- `both` -> `milky + onebotv11`
- `all` -> `milky + onebotv11 + icqq`

### 3.5 JSON 模式与退出码

- `--json` 时，stdout 保证是纯 JSON，可直接 `JSON.parse`
- 执行过程中的 `console.log` / `logger` 输出会改走 stderr
- 返回结构与 harness 一致：`replies / apiCalls / renderCalls / warnings / errors / result`

退出码约定：

- `0`
  - 成功
- `1`
  - mock 校验失败、插件执行异常、任务执行异常
- `2`
  - 非法协议、非法事件名、非法任务索引、非法 JSON 输入

---

## 4) Node 内建回归测试

脚本定义见 `package.json`：

```bash
npm test
npm run test:unit
npm run test:render
```

当前约定：

- `npm test`
  - 跑全部回归，包含 render smoke 文件；真实 Chromium smoke 默认按环境变量决定是否跳过
- `npm run test:unit`
  - 跑 harness / 协议 / CLI / 代表性真实插件 smoke
- `npm run test:render`
  - 显式打开 `XUNLU_RUN_RENDER_TESTS=1`，只跑真实 Chromium smoke

### 4.1 当前回归文件

- `test/plugin-test-harness.test.js`
- `test/protocol-api.test.js`
- `test/real-plugins-smoke.test.js`
- `test/xunlu-dev.test.js`
- `test/render-smoke.test.js`

### 4.2 覆盖策略

- 真实插件代表集：
  - `example-plugin`
  - `group`
  - `help`
  - `other`
- fixture 插件：
  - `test/fixtures/plugins/harness-fixture`
  - `test/fixtures/plugins/pixiv`

fixture 插件只服务测试，适合覆盖：

- 多轮上下文
- fake timers
- fake scheduler
- API 参数映射
- 与仓库现有 `data/` 状态无关的可重复断言

---

## 5) 推荐测试顺序

开发一个新插件时，推荐按这个顺序走：

1. `node ./bin/xunlu-dev.js simulate ... --protocol both`
2. 如果插件显式依赖 ICQQ native 行为，再补 `--protocol icqq`
3. 如果怀疑严格 mock 与本地链路不同，再对照 `--protocol icqq-local`
4. 需要验证 `notice/request` 时，用 `simulate-event`
5. 需要验证定时任务时，用 `simulate-task`
6. 准备提交前，至少跑一次 `npm run test:unit`
7. 修改真实渲染模板或截图链路时，再额外跑 `npm run test:render`

---

## 6) 进一步阅读

- 项目总入口：`AGENTS.md`
- 插件手册：`md/plugin-handbook-ai.md`
- 通用 API：`md/api.md`
- 协议速查：`md/onebotv11-milky-api-quickref.md`

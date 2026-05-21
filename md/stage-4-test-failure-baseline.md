# 阶段 4 前测试失败基线

记录时间：2026-05-21

## 背景

本基线用于阶段 4 测试平台规范化前的失败面确认，避免后续重构时把既有失败误判为新回归。采集时工作区位于 `plugins/xunlu-core`，上一批本地提交为 `dae720a chore: reuse douyin reset cleanup`。

## 已执行命令

- `git status --short`：采集前为空。
- `npm pkg get scripts`：确认 `test:unit` 覆盖既有 unit 文件，包含完整 `test/douyin-plugin.test.js`。
- `npm run test:unit`：退出码为 1，当前完整 unit 基线失败。
- `node --experimental-test-isolation=none --test test/bilibili-plugin.test.js`：单文件补跑失败细节。
- `node --experimental-test-isolation=none --test test/protocol-api.test.js`：单文件补跑失败细节。
- `node --experimental-test-isolation=none --test test/real-plugins-smoke.test.js`：单文件补跑失败细节。
- `node --experimental-test-isolation=none --test --test-name-pattern "api-only runtime kernel really starts api service with loaded plugins" test/runtime-kernel-smoke.test.js`：聚焦补跑会失败后挂起，已手动停止残留进程。
- `node --input-type=module -e ...`：只读诊断 API-only runtime kernel 与 Douyin duration 实际值。

## 完整 unit 失败面

`npm run test:unit` 当前至少暴露 12 个命名失败点：

| 文件 | 失败点 | 当前现象 |
| --- | --- | --- |
| `test/bilibili-plugin.test.js` | `dynamic image push falls through to native forward builder with normalized nodes` | 断言 `false !== true`，期望命中 native forward builder。 |
| `test/bilibili-plugin.test.js` | `dynamic image push falls back to direct images when all forward builders fail` | 断言 `false !== true`，期望命中直接图片兜底。 |
| `test/douyin-plugin.test.js` | `douyin scan command replies with cookie setup guide` | 完整 unit 中失败；期望 `res.ok === true` 且回复包含 Cookie 登录与 WebUI 配置页提示。 |
| `test/douyin-plugin.test.js` | `douyin scan command falls back to cookie guide when qr start fails` | 完整 unit 中失败；期望扫码失败时仍回复 Cookie 登录指引。 |
| `test/douyin-plugin.test.js` | `douyin cookie login imports cookie and replies with summary` | 完整 unit 中失败；期望登录成功回复并写入 `data/douyin/auth.json`。 |
| `test/douyin-plugin.test.js` | `douyin aweme normalization uses music duration when video and music differ by 900x` | 期望 `video.video.duration === 298`；只读诊断实际为 `268`。 |
| `test/protocol-api.test.js` | 文件导入阶段失败 | `learning_chat/controllers/handlers.js` 不再导出 `patchImageSegmentsWithRkeyValue`。 |
| `test/real-plugins-smoke.test.js` | `group recall notice notifies masters after enabling the switch` | `recallRes.replies.length >= 1` 为 false。 |
| `test/real-plugins-smoke.test.js` | `group recall forward relay fetches forward detail by id and sends private forward to master` | 期望 `forward-relay`，实际为 `undefined`。 |
| `test/real-plugins-smoke.test.js` | `group recall lookup bypasses degraded milky cache and refetches raw forward message from api` | 期望调用计数 `1`，实际为 `3`。 |
| `test/real-plugins-smoke.test.js` | `other plugin smoke covers forward, recall, and scheduled task` | 未观察到 `recall/delete_msg` API 调用。 |
| `test/runtime-kernel-smoke.test.js` | `api-only runtime kernel really starts api service with loaded plugins` | `reloadPlugins` 后 `getPluginApiServer().server.address()` 为 `null`，端口为 `0`；停止时还会出现 `ERR_SERVER_NOT_RUNNING`。 |

## 单文件补跑摘要

### Bilibili

命令：`node --experimental-test-isolation=none --test test/bilibili-plugin.test.js`

结果：11 个测试中 9 个通过、2 个失败。

- `test/bilibili-plugin.test.js:581`：native forward builder 断言失败，实际未命中。
- `test/bilibili-plugin.test.js:681`：direct images fallback 断言失败，实际未命中。

### Protocol API

命令：`node --experimental-test-isolation=none --test test/protocol-api.test.js`

结果：文件导入即失败。

失败原因：`../src/plugins/learning_chat/controllers/handlers.js` 不提供 `patchImageSegmentsWithRkeyValue` 命名导出，但测试仍尝试导入。

### Real Plugins Smoke

命令：`node --experimental-test-isolation=none --test test/real-plugins-smoke.test.js`

结果：10 个测试中 6 个通过、4 个失败。

- `test/real-plugins-smoke.test.js:110`：群撤回通知没有产生 master 通知回复。
- `test/real-plugins-smoke.test.js:271`：转发撤回 relay 没有记录到期望的 `forward-relay`。
- `test/real-plugins-smoke.test.js:327`：降级 milky cache 绕过路径的调用计数从期望 `1` 变为 `3`。
- `test/real-plugins-smoke.test.js:377`：other 插件 smoke 未捕获到撤回 API 调用。

### Runtime Kernel Smoke

命令：`node --experimental-test-isolation=none --test --test-name-pattern "api-only runtime kernel really starts api service with loaded plugins" test/runtime-kernel-smoke.test.js`

结果：目标用例失败后进程未自然退出，已停止残留测试进程。只读诊断显示：

- `kernel.start()` 后 mode、pluginCount、services 均符合预期。
- `kernel.reloadPlugins({ cacheBust: true })` 后插件数量仍为 22。
- `getPluginApiServer().server` 存在，但 `server.address()` 为 `null`，因此端口断言失败。
- `kernel.stop()` 额外抛出 `ERR_SERVER_NOT_RUNNING`。

### Douyin

完整 `test/douyin-plugin.test.js` 单文件详细补跑被安全审查拦截，因为该文件的 `beforeEach/afterEach` 会清理真实工作区 `temp/douyin` 与认证数据。本基线暂以完整 `npm run test:unit` 输出中的失败名称为准，并补充只读源码断言和 duration 诊断。

- 扫码登录相关 2 个用例失败，均围绕 `#抖音扫码` 的 Cookie 指引回复。
- Cookie 导入用例失败，围绕 `#抖音登录 sessionid=...` 的成功回复和 auth 写入。
- duration 用例期望音乐时长 298 秒覆盖异常视频时长；只读诊断实际归一化结果为 `video.video.duration = 268`、`video.music.duration = 298`。

## 下一步建议

1. 先处理导入级失败：`test/protocol-api.test.js` 的缺失导出会阻断该文件所有后续断言，适合作为阶段 4 第一项。
2. 将 `test/douyin-plugin.test.js` 的真实运行缓存清理改为隔离根目录或 fixture runtime，降低完整测试运行风险。
3. 为 `runtime-kernel-smoke` 拆出 API service reload 生命周期测试，明确 reload 后是否应保留 server 或重启 server。
4. 把 Bilibili 与 group/other 的 forward/recall 失败归为协议 mock 行为差异，优先补齐 harness 捕获能力，再判断是否需要改插件业务。

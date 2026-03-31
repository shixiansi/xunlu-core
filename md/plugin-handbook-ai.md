# xunlu-core 插件编写手册（给 AI / Agent）

本手册用于让 AI 在 **尽量少翻代码** 的前提下，能为 `xunlu-core` 编写可运行、可测试、可联调的插件（命令插件 + 可选 REST API）。

> 适用范围：`c:\Users\fan\Desktop\Miao-Yunzai\plugins\xunlu-core`（ESM 项目，Node 版本见 `.nvmrc`）

## TL;DR（最短路径）

1) 复制第 1 节最小模板（`export default { name, register(){} }`）  
2) 命令 handler 里 **return await ctx.reply(...)**（避免继续匹配导致重复回复）  
3) 离线测试用 `xunlu-dev simulate --protocol both`（同输入分别跑 `milky + onebotv11`，并启用协议 mock 校验参数）  
4) 需要 HTTP 时再加 `apiRoutes(router)`（挂载到 `/plugins/<name>/*`）

---

## 0. 项目关键约束（必须遵守）

- **ESM**：`package.json` 为 `"type":"module"`，你的插件必须使用 `import/export`，且 `import` 需要带 `.js` 扩展名。
- **插件目录**：`src/plugins/<pluginName>/index.js`（推荐）或 `src/plugins/<pluginName>.js`（可选）。
- **默认导出**：插件入口必须 `export default { ... }`（或 `export default implementation`）。
- **目录插件必须写 name**：如果插件以目录形式存在（`src/plugins/xxx/index.js`），一定要在默认导出里写 `name:"xxx"`，否则加载器可能把它当成 `index`。

---

## 1) 插件最小模板（复制即可）

创建文件：`src/plugins/hello/index.js`

```js
export default {
  name: "hello",
  register(botApi) {
    if (!botApi?.registerCommand) return

    botApi.registerCommand(["^你好$"], async ctx => {
      return await ctx.reply("world")
    })
  },
}
```

说明：
- `register(botApi)` 在插件加载时执行，用于注册命令、定时任务、初始化等。
- handler **必须 return**（通常 `return await ctx.reply(...)`），否则会继续匹配后续命令，可能产生重复回复。

---

## 2) 插件接口约定（你能实现哪些钩子）

插件默认导出对象支持：

- `name: string`：插件名（用于命令注册与 API 路由挂载名）
- `register(botApi)`：注册命令/任务/初始化（最常用）
- `apiRoutes(router)`（可选）：挂载 REST API，最终会被挂到 `/plugins/<name>/*`
- `onBotEvent(event)`（可选）：配合 API Server 的 `POST /bot/event` 广播事件

参考：
- `src/plugins/example-plugin/index.js`
- `src/lib/pluginLoader.js`（加载规则）

---

## 3) 命令注册：`botApi.registerCommand`

用法：

```js
botApi.registerCommand(
  ["^钓鱼状态$", "message", 5000], // [pattern, event?, priority?]
  async ctx => {
    return await ctx.reply("ok")
  },
)
```

参数约定：
- `pattern`：正则字符串（例如 `^状态$`）
- `event`（可选）：事件过滤（常用 `message`，也可更细分，详见 `md/api.md` 的事件名约定）
- `priority`（可选）：越小越先匹配，默认约 `5000`

### 3.1（推荐）为帮助插件补充“示例/说明”元数据

为了让“帮助插件”能自动展示更友好的指令文案（**不暴露正则 reg**），推荐在 `commandSpec` 数组最后附加一个对象：

```js
botApi.registerCommand(
  ["^钓鱼状态$", "message", 5000, { example: "钓鱼状态", desc: "查看钓鱼状态面板" }],
  async ctx => await ctx.reply("..."),
)

// 也可以省略 event/priority
botApi.registerCommand(
  ["^签到$", { example: ["签到", "签到 今天"], desc: "每日签到领取奖励" }],
  async ctx => await ctx.reply("..."),
)
```

handler 返回值：
- 返回 **truthy**：表示已处理，停止继续匹配
- 返回 `false/undefined/null/0`：继续匹配下一个命令（一般不建议）

---

## 4) ctx 常用字段/方法（写插件时最常用）

你在 handler(ctx) 中常用：

- `ctx.msg: string`：纯文本（已做 `＃ -> #` 等处理），你的正则也基于它匹配
- `ctx.group_id / ctx.user_id`：群号/用户 ID
- `ctx.isGroup / ctx.isPrivate`：群聊/私聊判定
- `await ctx.reply(message, quote=false, { recallMsg?: number, at?: string })`
- `await ctx.renderImg(name, data, options?)`：HTML→截图生成图片（见第 7 节）
- `ctx.listCommands(options?)`：列出当前已注册命令（用于帮助/指令列表插件）

完整字段与通用 API 见：`md/api.md`

---

## 5) 多轮对话（上下文）：`botApi.contextReply`

适合“询问-确认-执行”的流程：

```js
botApi.registerCommand(["^删除数据$"], async ctx => {
  await ctx.reply("确定删除？回复：确认 / 取消")

  return await botApi.contextReply(
    ctx,
    async nextCtx => {
      if (nextCtx.msg === "确认") {
        await nextCtx.reply("已删除")
        return true
      }
      await nextCtx.reply("已取消")
      return true
    },
    "取消", // endMsg，可选；存在时可用该消息结束持久上下文
  )
})
```

要点：
- 上下文回调返回 truthy 才会结束对应上下文。

---

## 6) 插件 REST API（可选）

若需要对外提供 HTTP：

```js
import { createRouter } from "./routes/index.js"
export default {
  name: "hello",
  apiRoutes(router) {
    router.use(createRouter({ name: "hello" }))
  },
}
```

运行 API Server（项目内提供启动方式）：

```bash
node --input-type=module -e "import('./src/lib/server.js').then(m=>m.startServer(process.env.PORT||3000))"
```

挂载路径：
- `GET /plugins/<name>/...`

参考：
- `src/plugins/example-plugin/routes/index.js`
- `src/lib/server.js`

---

## 7) 图片回复（推荐）：HTML 模板 → Chromium 截图

### 7.1 API：`renderImg(name, data, options?)`

在 handler 里调用：

```js
const img = await ctx.renderImg("diaoyu", { title: "标题", lines: ["A", "B"] }, { tpl: "result" })
if (img) return await ctx.reply(img)
return await ctx.reply("渲染失败（降级文本）")
```

- `name`：插件名（同时决定资源目录）
- `options.tpl`：模板名（不含 `.html`），默认等于 `name`
- 模板路径约定：`src/plugins/<name>/resources/html/<name>/<tpl>.html`

> 注意：截图依赖 Chromium / Puppeteer。生产环境正常可用时会发图；开发/沙箱环境若截图失败，你必须做文本降级，保证插件可用。

### 7.2 模板写法（art-template）

文件：`src/plugins/<name>/resources/html/<name>/result.html`

```html
{{extend defaulthtml}}
{{block 'css'}}
<link rel="stylesheet" href="{{_res_path}}/html/<name>/<name>.css" />
{{/block}}
{{block 'main'}}
<div class="container">
  <h1>{{title}}</h1>
</div>
{{/block}}
```

模板可用变量（框架注入）：
- `defaulthtml`：默认外壳模板（`resources/html/common/default.html`）
- `_res_path`：指向插件 `resources/` 的相对路径（用于引用 `img/`、`html/`、`font/` 等）
- `RootPath`、`botname`、`version` 等（见 `BaseBot.renderImg`）

### 7.3 调试模板数据

当启动参数包含 `web-debug` 时，渲染数据会写入 `data/ViewData/<plugin>/*.json`（用于排查缺字段/路径问题）。

---

## 8) 资源与许可（重要）

你可以把图片/背景/字体放到：
- `src/plugins/<name>/resources/img/...`
- `src/plugins/<name>/resources/html/...`

若你从网络下载资源：
- **必须**在资源目录写 `ATTRIBUTION`（来源与许可说明），便于后续分发合规。
- 建议提供脚本（`*.mjs`）可重复生成/下载资源，避免手工操作不可复现。

---

## 9) 本地快速测试（最推荐）

### 9.1 列出插件
```bash
node ./bin/xunlu-dev.js plugins list
```

### 9.2 离线模拟（不依赖真实 bot）
```bash
node ./bin/xunlu-dev.js simulate "你好" --plugin hello --protocol milky --scene private --user 10001
node ./bin/xunlu-dev.js simulate "钓鱼" --plugin diaoyu --protocol milky --scene group --group 123 --user 10001

# 推荐：同一输入分别跑 milky + onebotv11（更贴近真实调用差异）
node ./bin/xunlu-dev.js simulate "示例" --plugin example-plugin --protocol both --scene group --group 123 --user 10001
```

说明：
- `--protocol milky|onebotv11|both` 会启用协议 mock：不真发 QQ，只做“必填+类型”校验并返回成功假数据（便于在离线阶段暴露参数错误）。
- simulate 环境会 stub `ctx.renderImg()`，因此你应该输出“降级文本”而不是硬依赖截图成功。

### 9.3 轻量自检
```bash
node ./bin/xunlu-dev.js dev check
```

---

## 10) 联调（真实截图/真实发送）

1) 启动：
```bash
node index.js
```

2) 发消息（走 Control Server 的 `/send`）：
```bash
node ./bin/xunlu.js send "测试" --group 428596438
```

3) 热重载插件：
```bash
node ./bin/xunlubot.js restart
```

---

## 11) AI 写插件的“交付清单”（写完自检）

AI 生成插件代码后，至少满足：
- [ ] 插件入口存在：`src/plugins/<name>/index.js`
- [ ] 默认导出包含 `name` 且与目录名一致
- [ ] 关键命令都 `return await ctx.reply(...)`（不漏 return）
- [ ] 任何截图/外部依赖都提供 **降级文本**
- [ ] `xunlu-dev simulate` 能跑通，无未捕获异常
- [ ] 建议至少跑一次：`xunlu-dev simulate ... --protocol both`（离线双端校验）
- [ ] 如有网络资源：附 `ATTRIBUTION` + 可复现脚本

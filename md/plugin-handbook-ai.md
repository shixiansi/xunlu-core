# xunlu-core 插件编写手册（给 AI / Agent）

用途：让 AI 在尽量少翻源码的前提下，为 `xunlu-core` 编写可运行、可测试、可联调的插件。

适用目录：`c:\Users\fan\Desktop\Miao-Yunzai\plugins\xunlu-core`

---

## TL;DR

1. 先复制最小模板：`export default { name, register() {} }`
2. 命令 handler 里优先 `return await ctx.reply(...)`
3. 离线测试优先用 `xunlu-dev simulate --protocol both`
4. 只有需要 HTTP 时再实现 `apiRoutes(router)`
5. 涉及管理员 / 群主判断时，优先用 `ctx.isGroupAdmin()` / `ctx.isBotGroupOwner()` 这类通用 helper

---

## 0) 项目约束

- 项目是 ESM：必须使用 `import / export`
- 插件入口推荐：`src/plugins/<pluginName>/index.js`
- 默认导出必须包含 `name`
- 目录插件一定要写 `name`，避免被加载器误认成 `index`

---

## 1) 最小模板

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
- `register(botApi)` 在插件加载时执行
- handler 尽量 `return await ctx.reply(...)`
- 如果 handler 不 `return`，后续命令仍可能继续匹配

---

## 2) 插件接口约定

默认导出对象支持：
- `name: string`
- `register(botApi)`：注册命令 / 定时任务 / 初始化
- `apiRoutes(router)`：可选，挂载 REST API 到 `/plugins/<name>/*`
- `onBotEvent(event)`：可选，接收 API Server 广播事件

参考：
- `src/plugins/example-plugin/index.js`
- `src/lib/pluginLoader.js`

---

## 3) 命令注册：`botApi.registerCommand`

```js
botApi.registerCommand(
  ["^钓鱼状态$", "message", 5000],
  async ctx => {
    return await ctx.reply("ok")
  },
)
```

参数：
- `pattern`：正则字符串
- `event`：可选，事件过滤，常用 `message`
- `priority`：可选，越小越先匹配，默认约 `5000`

推荐补充帮助元数据：

```js
botApi.registerCommand(
  ["^签到$", "message", 5000, { example: "签到", desc: "每日签到" }],
  async ctx => {
    return await ctx.reply("签到成功")
  },
)
```

handler 返回约定：
- truthy：表示已处理，停止继续匹配
- `false / undefined / null`：继续匹配下一个命令

---

## 4) ctx 常用字段 / 方法

你在 handler(ctx) 里最常用：

- `ctx.msg: string`：纯文本，命令正则基于它匹配
- `ctx.group_id / ctx.user_id`：群号 / 用户 ID
- `ctx.isGroup / ctx.isPrivate`：群聊 / 私聊判定
- `ctx.isOwner / ctx.isAdmin`：当前发起者在本群的角色标记（best-effort）
- `ctx.botRole / ctx.botIsOwner / ctx.botIsAdmin`：bot 在当前群里的角色信息（best-effort）
- `await ctx.reply(message, quote=false, { recallMsg?: number, at?: string })`
- `await ctx.isGroupOwner(group_id?, user_id?)`
- `await ctx.isGroupAdmin(group_id?, user_id?)`
- `await ctx.isBotGroupOwner(group_id?)`
- `await ctx.isBotGroupAdmin(group_id?)`
- `await ctx.renderImg(name, data, options?)`
- `ctx.listCommands(options?)`

完整字段与通用 API 见：`md/api.md`

权限判断建议：
- 判断“用户是不是管理员 / 群主”优先用 `await ctx.isGroupAdmin()` / `await ctx.isGroupOwner()`
- 判断“bot 自己是不是管理员 / 群主”优先用 `await ctx.isBotGroupAdmin()` / `await ctx.isBotGroupOwner()`
- 不要在插件里重复手写 `self_id + getGroupMemberInfo()`，通用 API 已经帮你做了 fallback

---

## 5) 多轮对话：`botApi.contextReply`

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
    "取消",
  )
})
```

要点：
- 回调返回 truthy 才会结束对应上下文
- 适合“确认 / 取消”“下一步输入参数”这类流程

---

## 6) 插件 REST API（可选）

```js
import { createRouter } from "./routes/index.js"

export default {
  name: "hello",
  apiRoutes(router) {
    router.use(createRouter({ name: "hello" }))
  },
}
```

启动 API Server：

```bash
node --input-type=module -e "import('./src/lib/server.js').then(m=>m.startServer(process.env.PORT||3000))"
```

最终挂载路径：
- `GET /plugins/<name>/...`

---

## 7) 图片回复：`renderImg()`

```js
const img = await ctx.renderImg(
  "diaoyu",
  { title: "标题", lines: ["A", "B"] },
  { tpl: "result" },
)

if (img) return await ctx.reply(img)
return await ctx.reply("渲染失败（降级文本）")
```

说明：
- 模板路径约定：`src/plugins/<name>/resources/html/<name>/<tpl>.html`
- 沙箱或离线环境里 `renderImg()` 可能失败，必须准备文本降级

---

## 8) 资源与版权

可放资源的位置：
- `src/plugins/<name>/resources/img/...`
- `src/plugins/<name>/resources/html/...`

如果从网络下载资源：
- 建议在资源目录补 `ATTRIBUTION`
- 最好附带可重复执行的下载 / 生成脚本

---

## 9) 本地测试（推荐）

### 9.1 列出插件

```bash
node ./bin/xunlu-dev.js plugins list
```

### 9.2 离线模拟

```bash
node ./bin/xunlu-dev.js simulate "你好" --plugin hello --protocol milky --scene private --user 10001
node ./bin/xunlu-dev.js simulate "钓鱼" --plugin diaoyu --protocol both --scene group --group 123 --user 10001
```

说明：
- `--protocol both` 会分别跑 `milky + onebotv11`
- simulate 环境会 stub 一部分能力，重点用于检查命令链路与参数格式
- 涉及截图时，要保证失败后仍有文本输出

### 9.3 轻量自检

```bash
node ./bin/xunlu-dev.js dev check
```

---

## 10) 联调

启动：

```bash
node index.js
```

发送测试消息：

```bash
node ./bin/xunlu.js send "测试" --group 428596438
```

热重载插件：

```bash
node ./bin/xunlubot.js restart
```

---

## 11) AI 交付清单

- [ ] 插件入口存在：`src/plugins/<name>/index.js`
- [ ] 默认导出包含 `name`
- [ ] 关键命令都 `return await ctx.reply(...)`
- [ ] 截图 / 网络依赖都提供文本降级
- [ ] 至少跑一次 `xunlu-dev simulate ... --protocol both`
- [ ] 如有外部资源，补 `ATTRIBUTION` 或生成脚本

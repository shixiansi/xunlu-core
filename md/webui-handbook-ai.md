# 共享 WebUI 接入手册（AI / 插件作者）

目标：让所有插件都挂到统一 WebUI 下，由共享宿主负责登录、插件列表、表单渲染和保存；单个插件只声明自己的配置协议与可选扩展页面。

## 1. 共享 WebUI 入口

- 页面
  - `GET /webui`：统一后台
  - `GET /webui/login`：统一登录页
- API
  - `GET /webui/api/auth/session`
  - `POST /webui/api/auth/login`
  - `POST /webui/api/auth/logout`
  - `POST /webui/api/auth/update`
  - `GET /webui/api/plugins`
  - `GET /webui/api/plugins/:name/definition`
  - `GET /webui/api/plugins/:name/scopes?scope=group`
  - `GET /webui/api/plugins/:name/config?scope=global|group&scope_id=...`
  - `POST /webui/api/plugins/:name/config`

认证配置默认写在：`data/webui/config.yaml`

## 2. 插件如何接入

在插件目录下新增：

```text
src/plugins/<plugin-name>/webui/index.js
```

默认导出一个对象，最小结构如下：

```js
export default {
  meta: {
    title: "插件标题",
    description: "插件说明",
    order: 100,
    tags: ["tag-a", "tag-b"],
  },

  definition: {
    sections: [
      {
        id: "global",
        scope: "global",
        title: "全局配置",
        fields: [{ path: "settings.enabled", label: "启用", type: "boolean" }],
      },
      {
        id: "group",
        scope: "group",
        title: "群级配置",
        emptyText: "没有可选群号时显示的文案",
        fields: [{ path: "config.enabled", label: "群级开关", type: "select", options: [] }],
      },
    ],
    pages: [{ id: "advanced", title: "高级页面", url: "/plugins/<plugin-name>/admin" }],
  },

  async listScopes({ scope }) {
    if (scope !== "group") return []
    return [{ id: "123", label: "123", description: "可选说明" }]
  },

  async getValues({ scope, scopeId }) {
    return {
      values: {},
      meta: {
        summary: "显示在作用域头部的摘要文本",
      },
    }
  },

  async updateValues({ scope, scopeId, values, user, req }) {
    return {
      values,
      meta: {},
      message: "保存成功后的提示文本",
    }
  },
}
```

## 3. 字段类型

当前共享表单支持：

- `boolean`
- `number`
- `text`
- `textarea`
- `array`
  - 前端按“每行一项”编辑，提交时转成字符串数组
- `json`
  - 前端按 JSON 文本编辑，提交时做 `JSON.parse`
- `select`
  - `options: [{ label, value }]`
  - `value` 可以是字符串、布尔、数字或 `null`

通用字段属性：

- `path`
- `label`
- `description`
- `placeholder`
- `min / max / step`
- `rows`
- `allowEmpty`
  - 对 `number / text` 有效，前端会把空值提交为 `null`

## 4. 作用域约定

- `scope: "global"`
  - 统一读取全局配置
- `scope: "group"`
  - 共享宿主会先调用 `listScopes("group")` 拿到可选群号，再调用 `getValues({ scope: "group", scopeId })`

如果插件还有别的作用域，也可以自定义，例如 `user`、`bot`、`channel`，共享壳会按相同模式处理。

实战范例：

- `group` 插件：`global + bot + group`
- `other` 插件：`user`
- `scheduler` / `chuo` 插件：只用 `global`

通常 `listScopes(scope)` 不仅可以返回“已经落盘的 ID”，也可以合并运行时拿得到的候选范围，例如当前 Bot 的群列表、主人账号等。

## 5. 可选扩展页面

如果插件需要更复杂的页面，不想完全交给共享表单：

1. 继续保留自己的 `apiRoutes(router)` 或额外页面
2. 在 `definition.pages` 里声明跳转链接
3. 共享 WebUI 会把它展示成“扩展页面”入口

如果插件存在：

```text
src/plugins/<plugin-name>/resources/webui/
```

共享宿主会自动挂载到：

```text
/webui/plugins/<plugin-name>/static
```

## 6. 已接入示例

- `src/plugins/learning_chat/webui/index.js`
- `src/plugins/fudu-ban/webui/index.js`
- `src/plugins/group/webui/index.js`
- `src/plugins/scheduler/webui/index.js`
- `src/plugins/other/webui/index.js`
- `src/plugins/chuo/webui/index.js`

这些文件分别演示了：

- 复杂全局配置 + 群级覆盖
- 简单全局开关 + 三态继承
- 多作用域（global / bot / group / user）的共享管理
- JSON 配置编辑（`scheduler.tasks`）

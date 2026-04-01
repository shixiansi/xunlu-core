import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import {
  getRuntimeBotGroupMessageStreakMap,
  getRuntimeLastGroupMessageMap,
  rememberRuntimeLastGroupMessage,
} from "../src/Bot/runtime-last-message.js"
import { __test as fuduBanTestApi } from "../src/plugins/fudu-ban/controllers/handlers.js"
import {
  getDbPath,
  getOrCreateGroup,
  loadDb,
  saveDb,
  setGlobalRepeatMuteEnabled,
  setGroupRepeatMuteEnabled,
} from "../src/plugins/fudu-ban/model/store.js"

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    mark() {},
  }
}

async function withFreshFuduDb(run) {
  const dbPath = getDbPath()
  const existed = fs.existsSync(dbPath)
  const backup = existed ? fs.readFileSync(dbPath, "utf8") : null

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.rmSync(dbPath, { force: true })

  const originalLogger = globalThis.logger
  globalThis.logger = createLoggerStub()

  try {
    await run(dbPath)
  } finally {
    globalThis.logger = originalLogger
    fs.rmSync(dbPath, { force: true })
    if (existed) {
      fs.writeFileSync(dbPath, backup, "utf8")
    }
  }
}

function resetRuntimeState() {
  getRuntimeLastGroupMessageMap().clear()
  getRuntimeBotGroupMessageStreakMap().clear()
  fuduBanTestApi.resetState()
}

function createCtx({
  text,
  groupId,
  userId,
  selfId = "10000",
  isMaster = false,
  getGroupMemberInfo = async () => null,
  setGroupMemberMute = async () => ({ ok: true }),
} = {}) {
  const replies = []
  return {
    replies,
    ctx: {
      isGroup: true,
      group_id: String(groupId),
      user_id: String(userId),
      sender_id: String(userId),
      self_id: String(selfId),
      isMaster,
      msg: String(text || ""),
      message: [{ type: "text", data: { content: String(text || "") } }],
      async reply(message, _quote, options = {}) {
        replies.push({
          message: typeof message === "string" ? message : JSON.stringify(message),
          options,
        })
        return true
      },
      async getGroupMemberInfo(...args) {
        return await getGroupMemberInfo(...args)
      },
      async setGroupMemberMute(payload) {
        return await setGroupMemberMute(payload)
      },
    },
  }
}

test("fudu-ban stays silent when bot has no mute permission and user repeats another user", async () => {
  await withFreshFuduDb(async () => {
    resetRuntimeState()

    const first = createCtx({
      text: "hello-repeat",
      groupId: "30001",
      userId: "20001",
      getGroupMemberInfo: async () => ({ role: "member" }),
    })
    const second = createCtx({
      text: "hello-repeat",
      groupId: "30001",
      userId: "20002",
      getGroupMemberInfo: async () => ({ role: "member" }),
    })

    await fuduBanTestApi.handleRepeat(first.ctx)
    await fuduBanTestApi.handleRepeat(second.ctx)

    assert.equal(second.replies.length, 0)

    const db = loadDb()
    const group = db.groups["30001"]
    assert.equal(Object.keys(group?.muted || {}).length, 0)
    assert.equal(group?.users?.["20002"]?.strikesToday, 1)
  })
})

test("fudu-ban replies with cute anger only when bot message is repeated without mute permission", async () => {
  await withFreshFuduDb(async () => {
    resetRuntimeState()

    rememberRuntimeLastGroupMessage({
      group_id: "30002",
      user_id: "10000",
      sender_id: "10000",
      self_id: "10000",
      isBot: true,
      message: [{ type: "text", data: { content: "bot-line" } }],
    })

    const first = createCtx({
      text: "bot-line",
      groupId: "30002",
      userId: "20003",
      getGroupMemberInfo: async () => ({ role: "member" }),
    })
    const second = createCtx({
      text: "bot-line",
      groupId: "30002",
      userId: "20003",
      getGroupMemberInfo: async () => ({ role: "member" }),
    })

    await fuduBanTestApi.handleRepeat(first.ctx)
    await fuduBanTestApi.handleRepeat(second.ctx)

    assert.equal(second.replies.length, 1)
    assert.match(second.replies[0].message, /生气|不可以|记仇|鼓/i)
    assert.doesNotMatch(second.replies[0].message, /失败|权限|禁言失败/)

    const db = loadDb()
    const group = db.groups["30002"]
    assert.equal(Object.keys(group?.muted || {}).length, 0)
    assert.equal(group?.users?.["20003"]?.botRepeatToday, 2)
  })
})

test("fudu-ban global switch disables repeat mute handling", async () => {
  await withFreshFuduDb(async () => {
    resetRuntimeState()

    const db = loadDb()
    setGlobalRepeatMuteEnabled(db, false)
    saveDb(db)

    const first = createCtx({
      text: "global-off",
      groupId: "30003",
      userId: "20004",
    })
    const second = createCtx({
      text: "global-off",
      groupId: "30003",
      userId: "20005",
    })

    await fuduBanTestApi.handleRepeat(first.ctx)
    await fuduBanTestApi.handleRepeat(second.ctx)

    assert.equal(second.replies.length, 0)

    const nextDb = loadDb()
    assert.equal(nextDb.groups["30003"], undefined)
  })
})

test("fudu-ban group override disables only the target group", async () => {
  await withFreshFuduDb(async () => {
    resetRuntimeState()

    const db = loadDb()
    const group = getOrCreateGroup(db, "30004")
    setGroupRepeatMuteEnabled(group, false)
    saveDb(db)

    const offFirst = createCtx({
      text: "group-off",
      groupId: "30004",
      userId: "20006",
      getGroupMemberInfo: async () => ({ role: "owner" }),
    })
    const offSecond = createCtx({
      text: "group-off",
      groupId: "30004",
      userId: "20007",
      getGroupMemberInfo: async () => ({ role: "owner" }),
    })
    const onFirst = createCtx({
      text: "group-on",
      groupId: "30005",
      userId: "20008",
      getGroupMemberInfo: async () => ({ role: "owner" }),
    })
    const onSecond = createCtx({
      text: "group-on",
      groupId: "30005",
      userId: "20009",
      getGroupMemberInfo: async () => ({ role: "owner" }),
    })

    await fuduBanTestApi.handleRepeat(offFirst.ctx)
    await fuduBanTestApi.handleRepeat(offSecond.ctx)
    await fuduBanTestApi.handleRepeat(onFirst.ctx)
    await fuduBanTestApi.handleRepeat(onSecond.ctx)

    assert.equal(offSecond.replies.length, 0)
    assert.equal(onSecond.replies.length, 1)

    const nextDb = loadDb()
    assert.equal(Object.keys(nextDb.groups["30004"]?.muted || {}).length, 0)
    assert.equal(Object.keys(nextDb.groups["30005"]?.muted || {}).length, 1)
  })
})

test("fudu-ban does not keep muted records when mute API fails", async () => {
  await withFreshFuduDb(async () => {
    resetRuntimeState()

    const first = createCtx({
      text: "mute-fail",
      groupId: "30006",
      userId: "20010",
      getGroupMemberInfo: async () => ({ role: "owner" }),
      setGroupMemberMute: async () => ({ ok: false, error: "server down" }),
    })
    const second = createCtx({
      text: "mute-fail",
      groupId: "30006",
      userId: "20011",
      getGroupMemberInfo: async () => ({ role: "owner" }),
      setGroupMemberMute: async () => ({ ok: false, error: "server down" }),
    })

    await fuduBanTestApi.handleRepeat(first.ctx)
    await fuduBanTestApi.handleRepeat(second.ctx)

    assert.equal(second.replies.length, 1)
    assert.match(second.replies[0].message, /失败/)

    const db = loadDb()
    assert.equal(Object.keys(db.groups["30006"]?.muted || {}).length, 0)
  })
})

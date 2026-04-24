/**
 * ForwardService 负责整理和发送转发节点。
 *
 * 这部分逻辑协议差异很大，而且还夹着 takeover fallback，
 * 单独抽出来后，BaseBot 可以不再承受转发细节的复杂度。
 */
export class ForwardService {
  constructor(baseBot) {
    this.baseBot = baseBot
  }

  async makeForwardMsg(e, msg = [], dec = "", msgsscr = false) {
    if (!Array.isArray(msg)) {
      msg = [msg]
    }
    const runtimeBot = (() => {
      try {
        return Bot || globalThis.Bot || null
      } catch {
        return globalThis.Bot || null
      }
    })()
    const defaultId = e?.user_id ?? Bot?.uin
    let name = msgsscr ? e?.sender?.card || e?.sender?.nickname || e?.user_id : Bot.nickname
    let id = defaultId

    if (e.isGroup) {
      try {
        if (id !== undefined && id !== null && id !== "") {
          let info = await e.getGroupMemberInfo(e.group_id, id || Bot.uin)
          name = info.card || info.nickname || name
        }
      } catch (err) {
        logger.error(err)
      }
    }

    let userInfo = {
      user_id: id,
      nickname: name,
    }

    let forwardMsg = []
    for (let message of msg) {
      if (!message) continue
      const itemUserId = message?.user_id ?? message?.uin ?? message?.id ?? userInfo.user_id
      const explicitName = message?.nickname ?? message?.sender_name ?? message?.name
      const messageContent =
        message?.content ?? message?.message ?? message?.segments ?? message
      const itemName = explicitName ?? userInfo.nickname
      const m = {
        ...userInfo,
      }
      if (itemUserId !== undefined && itemUserId !== null && itemUserId !== "") {
        m.user_id = itemUserId
        m.uin = itemUserId
      }
      if (itemName !== undefined && itemName !== null && itemName !== "") {
        m.nickname = itemName
        m.sender_name = itemName
        m.name = itemName
      }
      m.message = messageContent
      message?.time ? (m.time = message.time) : ""
      forwardMsg.push(m)
    }

    logForwardDebug("makeForwardMsg:start", {
      scene: e?.isGroup ? "group" : "private",
      group_id: e?.group_id ?? null,
      user_id: e?.user_id ?? null,
      desc: dec || "",
      msgsscr: Boolean(msgsscr),
      prepared: summarizeForwardSegments(forwardMsg),
    })

    try {
      const takeoverState = runtimeBot?.__xunlu_takeover_state
      const hasConnectedForwardApi =
        Boolean(
          runtimeBot &&
            (typeof runtimeBot?.sendApi === "function" || typeof runtimeBot?.callApi === "function"),
        )
      const takeoverForwardTarget = (() => {
        if (!takeoverState || typeof takeoverState !== "object") return null

        if (e?.isGroup && typeof takeoverState.getGroup === "function") {
          return takeoverState.getGroup(e.group_id)
        }

        if (!e?.isGroup && typeof takeoverState.getUser === "function") {
          return takeoverState.getUser(e.user_id)
        }

        return null
      })()

      let route = ""
      if (typeof takeoverForwardTarget?.makeForwardMsg === "function") {
        route = "takeoverForwardTarget.makeForwardMsg"
        logForwardDebug("makeForwardMsg:route", { route, target: e?.group_id ?? e?.user_id ?? null })
        forwardMsg = await takeoverForwardTarget.makeForwardMsg(forwardMsg)
      } else if (
        e?.isGroup &&
        hasConnectedForwardApi &&
        typeof runtimeBot?.makeGroupForwardMsg === "function"
      ) {
        route = "runtimeBot.makeGroupForwardMsg(connected-api)"
        logForwardDebug("makeForwardMsg:route", { route, target: e?.group_id ?? null })
        forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
      } else if (
        !e?.isGroup &&
        hasConnectedForwardApi &&
        typeof runtimeBot?.makePrivateForwardMsg === "function"
      ) {
        route = "runtimeBot.makePrivateForwardMsg(connected-api)"
        logForwardDebug("makeForwardMsg:route", { route, target: e?.user_id ?? null })
        forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
      } else if (e?.group?.makeForwardMsg) {
        route = "event.group.makeForwardMsg"
        logForwardDebug("makeForwardMsg:route", { route, target: e?.group_id ?? null })
        forwardMsg = await e.group.makeForwardMsg(forwardMsg)
      } else if (e?.friend?.makeForwardMsg) {
        route = "event.friend.makeForwardMsg"
        logForwardDebug("makeForwardMsg:route", { route, target: e?.user_id ?? null })
        forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
      } else if (e?.isGroup && typeof runtimeBot?.pickGroup === "function") {
        const group = runtimeBot.pickGroup(e.group_id)
        if (typeof group?.makeForwardMsg === "function") {
          route = "runtimeBot.pickGroup(...).makeForwardMsg"
          logForwardDebug("makeForwardMsg:route", { route, target: e?.group_id ?? null })
          forwardMsg = await group.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
          route = "runtimeBot.makeGroupForwardMsg"
          logForwardDebug("makeForwardMsg:native-builder", {
            route,
            target: e?.group_id ?? null,
            prepared: summarizeForwardSegments(forwardMsg),
          })
          forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
        } else {
          throw new Error("[makeForwardMsg] group forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickFriend === "function") {
        const friend = runtimeBot.pickFriend(e.user_id)
        if (typeof friend?.makeForwardMsg === "function") {
          route = "runtimeBot.pickFriend(...).makeForwardMsg"
          logForwardDebug("makeForwardMsg:route", { route, target: e?.user_id ?? null })
          forwardMsg = await friend.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          route = "runtimeBot.makePrivateForwardMsg"
          logForwardDebug("makeForwardMsg:native-builder", {
            route,
            target: e?.user_id ?? null,
            prepared: summarizeForwardSegments(forwardMsg),
          })
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickUser === "function") {
        const user = runtimeBot.pickUser(e.user_id)
        if (typeof user?.makeForwardMsg === "function") {
          route = "runtimeBot.pickUser(...).makeForwardMsg"
          logForwardDebug("makeForwardMsg:route", { route, target: e?.user_id ?? null })
          forwardMsg = await user.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          route = "runtimeBot.makePrivateForwardMsg(fallback)"
          logForwardDebug("makeForwardMsg:native-builder", {
            route,
            target: e?.user_id ?? null,
            prepared: summarizeForwardSegments(forwardMsg),
          })
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
        route = "runtimeBot.makeGroupForwardMsg(fallback)"
        logForwardDebug("makeForwardMsg:native-builder", {
          route,
          target: e?.group_id ?? null,
          prepared: summarizeForwardSegments(forwardMsg),
        })
        forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
      } else {
        throw new Error("[makeForwardMsg] makeForwardMsg not available")
      }

      logForwardDebug("makeForwardMsg:result", {
        scene: e?.isGroup ? "group" : "private",
        group_id: e?.group_id ?? null,
        user_id: e?.user_id ?? null,
        output: summarizeForwardPayload(forwardMsg),
      })

      if (dec) {
        if (typeof forwardMsg.data === "object") {
          let detail = forwardMsg.data?.meta?.detail
          if (detail) {
            detail.news = [{ text: dec }]
          }
        } else {
          forwardMsg.data = forwardMsg.data
            ?.replace(/\n/g, "")
            ?.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, "___")
            ?.replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
        }
      }
    } catch (err) {
      logger.error(err)
      throw err
    }

    return forwardMsg
  }
}

export default ForwardService
function getForwardDebugLogger() {
  const l = globalThis.logger
  if (l && typeof l.info === "function") return l
  return console
}

function summarizeForwardSegments(message) {
  const list = Array.isArray(message) ? message : message ? [message] : []
  return list.slice(0, 3).map(item => {
    if (item === undefined || item === null) return { kind: "empty" }
    if (typeof item === "string") return { kind: "string", preview: item.slice(0, 60) }
    if (Array.isArray(item)) {
      return {
        kind: "array",
        length: item.length,
        types: item
          .slice(0, 5)
          .map(seg => (seg && typeof seg === "object" ? seg.type || typeof seg : typeof seg)),
      }
    }
    if (typeof item === "object") {
      const content = item.message ?? item.content ?? null
      const contentList = Array.isArray(content) ? content : content ? [content] : []
      return {
        kind: "object",
        type: item.type || "",
        user_id: item.user_id ?? item.uin ?? item.id ?? null,
        nickname: item.nickname ?? item.sender_name ?? item.name ?? null,
        contentTypes: contentList
          .slice(0, 5)
          .map(seg => (seg && typeof seg === "object" ? seg.type || typeof seg : typeof seg)),
      }
    }
    return { kind: typeof item }
  })
}

function summarizeForwardPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      shape: "array",
      length: payload.length,
      itemTypes: payload
        .slice(0, 5)
        .map(item => (item && typeof item === "object" ? item.type || typeof item : typeof item)),
    }
  }

  if (payload && typeof payload === "object") {
    return {
      shape: "object",
      type: payload.type || "",
      keys: Object.keys(payload).slice(0, 8),
      dataShape: Array.isArray(payload.data) ? "array" : typeof payload.data,
      dataKeys:
        payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
          ? Object.keys(payload.data).slice(0, 8)
          : [],
    }
  }

  return { shape: typeof payload, preview: String(payload || "") }
}

function logForwardDebug(stage, detail = {}) {
  getForwardDebugLogger().info?.(`[xunlu-core][forward-debug] ${stage}`, detail)
}

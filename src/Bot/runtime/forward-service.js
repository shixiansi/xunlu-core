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
      message?.content ? (m.message = message.content) : (m.message = message)
      message?.time ? (m.time = message.time) : ""
      forwardMsg.push(m)
    }

    try {
      const takeoverState = runtimeBot?.__xunlu_takeover_state
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

      if (typeof takeoverForwardTarget?.makeForwardMsg === "function") {
        forwardMsg = await takeoverForwardTarget.makeForwardMsg(forwardMsg)
      } else if (e?.group?.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(forwardMsg)
      } else if (e?.friend?.makeForwardMsg) {
        forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
      } else if (e?.isGroup && typeof runtimeBot?.pickGroup === "function") {
        const group = runtimeBot.pickGroup(e.group_id)
        if (typeof group?.makeForwardMsg === "function") {
          forwardMsg = await group.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
          forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
        } else {
          throw new Error("[makeForwardMsg] group forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickFriend === "function") {
        const friend = runtimeBot.pickFriend(e.user_id)
        if (typeof friend?.makeForwardMsg === "function") {
          forwardMsg = await friend.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (!e?.isGroup && typeof runtimeBot?.pickUser === "function") {
        const user = runtimeBot.pickUser(e.user_id)
        if (typeof user?.makeForwardMsg === "function") {
          forwardMsg = await user.makeForwardMsg(forwardMsg)
        } else if (typeof runtimeBot?.makePrivateForwardMsg === "function") {
          forwardMsg = await runtimeBot.makePrivateForwardMsg(forwardMsg, e.user_id)
        } else {
          throw new Error("[makeForwardMsg] private forward API not available")
        }
      } else if (typeof runtimeBot?.makeGroupForwardMsg === "function") {
        forwardMsg = await runtimeBot.makeGroupForwardMsg(forwardMsg, e.group_id)
      } else {
        throw new Error("[makeForwardMsg] makeForwardMsg not available")
      }

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

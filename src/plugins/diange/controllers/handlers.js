import { segment } from "../../../Bot/message/legacy-segment.js"
import musicService from "../services/music-service.js"

function normalizeSelectionText(value = "") {
  return String(value || "")
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim()
}

function formatSongLine(song = {}, index = 0) {
  const sourceLabel = String(song?.sourceLabel || "").trim()
  const title = sourceLabel
    ? `${index}. [${sourceLabel}] ${song?.name || "未知歌曲"}`
    : `${index}. ${song?.name || "未知歌曲"}`
  const lines = [title]
  if (song?.artists) lines.push(`歌手：${song.artists}`)
  if (song?.album) lines.push(`专辑：${song.album}`)
  if (song?.id) lines.push(`ID：${song.id}`)
  return lines.join("\n")
}

function buildCardFallback(song = {}) {
  const lines = [
    `点歌 ${song?.id || ""}`.trim(),
    `歌名：${song?.name || "未知歌曲"}`,
  ]
  if (song?.sourceLabel) lines.push(`音源：${song.sourceLabel}`)
  if (song?.artists) lines.push(`歌手：${song.artists}`)
  if (song?.album) lines.push(`专辑：${song.album}`)

  const message = []
  if (song?.cover) message.push(segment.image(song.cover))
  message.push(lines.join("\n"))
  return message
}

function buildSongLinkFallback(song = {}) {
  const lines = [`已为你定位到歌曲：${song?.name || "未知歌曲"}`]
  if (song?.sourceLabel) lines.push(`音源：${song.sourceLabel}`)
  if (song?.artists) lines.push(`歌手：${song.artists}`)
  if (song?.album) lines.push(`专辑：${song.album}`)
  const songPageUrl = musicService.getSongPageUrl(song)
  if (songPageUrl) lines.push(`歌曲页：${songPageUrl}`)

  return lines.join("\n")
}

function buildSelectionPrompt(total = 0) {
  return `请回复 1-${total} 的序号选择歌曲，例如“1”或“选1”，回复“取消”结束点歌`
}

function buildSelectionError(total = 0) {
  return `请输入 1-${total} 的序号，例如“1”或“选1”，回复“取消”结束点歌`
}

function parseSongSelection(text = "", total = 0) {
  const normalized = normalizeSelectionText(text).replace(/[.。．、，,]+$/g, "").trim()

  if (/^(取消|取消点歌|算了|不用了|结束|结束点歌|不点了)$/i.test(normalized)) {
    return { type: "cancel" }
  }

  const match = normalized.match(/^(?:选|选择|第)?\s*(\d+)\s*(?:首|个|号)?(?:歌)?$/i)
  if (!match) return { type: "invalid" }

  const index = Number(match[1])
  if (!Number.isInteger(index) || index < 1 || index > total) {
    return { type: "out_of_range" }
  }

  return { type: "select", index }
}

function buildListFallback(keyword = "", songs = [], prompt = "") {
  const lines = [`点歌搜索：${keyword}`, `共找到 ${songs.length} 首候选：`]
  for (const [index, song] of songs.entries()) {
    lines.push(formatSongLine(song, index + 1))
  }
  if (prompt) lines.push(prompt)
  return lines.join("\n\n")
}

async function renderSongImage(ctx, song = {}) {
  try {
    if (typeof ctx?.renderImg === "function") {
      const rendered = await ctx.renderImg(
        "diange",
        {
          songId: String(song?.id || ""),
          songName: String(song?.name || "未知歌曲"),
          sourceLabel: String(song?.sourceLabel || ""),
          artists: String(song?.artists || ""),
          album: String(song?.album || ""),
          cover: String(song?.cover || ""),
        },
        { tpl: "card" },
      )
      if (rendered) return rendered
    }
  } catch (err) {
    logger.warn?.(`[Diange] 点歌卡片渲染失败，改用文本降级：${err?.message || err}`)
  }

  return buildCardFallback(song)
}

async function renderSongListImage(ctx, keyword = "", songs = [], prompt = "") {
  try {
    if (typeof ctx?.renderImg === "function") {
      const rendered = await ctx.renderImg(
        "diange",
        {
          keyword: String(keyword || ""),
          total: Array.isArray(songs) ? songs.length : 0,
          prompt: String(prompt || ""),
          songs: (Array.isArray(songs) ? songs : []).map((song, index) => ({
            index: index + 1,
            name: String(song?.name || "未知歌曲"),
            sourceLabel: String(song?.sourceLabel || ""),
            artists: String(song?.artists || ""),
            album: String(song?.album || ""),
            songId: String(song?.id || ""),
          })),
        },
        { tpl: "list" },
      )
      if (rendered) return rendered
    }
  } catch (err) {
    logger.warn?.(`[Diange] 候选列表渲染失败，改用文本降级：${err?.message || err}`)
  }

  return buildListFallback(keyword, songs, prompt)
}

async function sendMusicCard(ctx, song = {}) {
  if (String(ctx?.protocol || "").toLowerCase() === "milky") {
    return false
  }

  const payload = musicService.buildMusicCard(song)
  if (!payload) return false
  try {
    if (ctx?.protocol === "milky") {
      const action = ctx?.isGroup ? "send_group_message" : "send_private_message"
      const params = ctx?.isGroup
        ? { group_id: ctx.group_id, message: payload }
        : { user_id: ctx.user_id, message: payload }
      const res = await ctx.sendApi(action, params)
      return Boolean(res !== false)
    }

    if (ctx?.protocol === "onebotv11") {
      const action = ctx?.isGroup ? "send_group_msg" : "send_private_msg"
      const params = ctx?.isGroup
        ? { group_id: ctx.group_id, message: payload }
        : { user_id: ctx.user_id, message: payload }
      const res = await ctx.sendApi(action, params)
      return Boolean(res !== false)
    }

    if (ctx?.protocol === "icqq") {
      if (ctx?.isGroup && typeof globalThis.Bot?.pickGroup === "function") {
        const peer = globalThis.Bot.pickGroup(Number(ctx.group_id))
        if (peer?.sendMsg) {
          const res = await peer.sendMsg(payload)
          return Boolean(res !== false)
        }
      }
      if (typeof globalThis.Bot?.pickFriend === "function") {
        const peer = globalThis.Bot.pickFriend(Number(ctx.user_id))
        if (peer?.sendMsg) {
          const res = await peer.sendMsg(payload)
          return Boolean(res !== false)
        }
      }
      if (typeof globalThis.Bot?.pickUser === "function") {
        const peer = globalThis.Bot.pickUser(Number(ctx.user_id))
        if (peer?.sendMsg) {
          const res = await peer.sendMsg(payload)
          return Boolean(res !== false)
        }
      }
    }

    return false
  } catch (err) {
    logger.warn?.(`[Diange] 音乐卡片发送失败，改走语音：${err?.message || err}`)
    return false
  }
}

async function sendSongVoice(ctx, song = {}) {
  const protocol = String(ctx?.protocol || "").toLowerCase()
  if (protocol === "milky") {
    const audioUrl = await musicService.getSongAudioUrl(song)
    if (!audioUrl) throw new Error("当前歌曲没有可用的官方 MP3 资源")
    const sent = await ctx.reply(segment.record(audioUrl))
    if (!sent) throw new Error("Milky 发送录音失败")
    return sent
  }

  const cleanupPaths = []
  try {
    const filePath = await musicService.downloadSongAudio(song)
    cleanupPaths.push(filePath)
    const sent = await ctx.reply(segment.record(`file://${filePath}`))
    if (!sent) throw new Error("发送语音失败")
    return sent
  } finally {
    musicService.cleanupFiles(cleanupPaths)
  }
}

async function sendSelectedSong(ctx, song = {}) {
  await ctx.reply(await renderSongImage(ctx, song))

  const sentCard = await sendMusicCard(ctx, song)
  if (sentCard) return true

  try {
    await sendSongVoice(ctx, song)
    return true
  } catch (err) {
    logger.error?.(`[Diange] 语音发送失败：${err?.message || err}`)
    return await ctx.reply(buildSongLinkFallback(song))
  }
}

async function handleSongRequest(ctx, bot) {
  const keyword = String(ctx?.msg || "").replace(/^(?:#|＃)?点歌\s*/i, "").trim()
  if (!keyword) return await ctx.reply("请输入要点的歌名")

  let songs = []
  try {
    songs = await musicService.searchSongs(keyword, 10)
  } catch (err) {
    logger.error?.(`[Diange] 搜索歌曲失败：${err?.message || err}`)
    return await ctx.reply(`点歌失败：${err?.message || "歌曲搜索失败"}`)
  }

  if (!songs.length) {
    return await ctx.reply(`没有找到和“${keyword}”相关的歌曲`)
  }

  if (songs.length === 1) {
    return await sendSelectedSong(ctx, songs[0])
  }

  const selectionPrompt = buildSelectionPrompt(songs.length)

  await ctx.reply(await renderSongListImage(ctx, keyword, songs, selectionPrompt))
  await ctx.reply(selectionPrompt)

  bot.contextReply(
    ctx,
    async nextCtx => {
      const selection = parseSongSelection(nextCtx?.msg, songs.length)
      if (selection.type === "cancel") {
        await nextCtx.reply("已取消点歌")
        return true
      }

      if (selection.type !== "select") {
        await nextCtx.reply(buildSelectionError(songs.length))
        return false
      }

      return await sendSelectedSong(nextCtx, songs[selection.index - 1])
    },
  )

  return true
}

export function register(bot) {
  if (!bot?.registerCommand) return

  bot.registerCommand(
    [
      "^(?:#|＃)?点歌\\s+(.+)$",
      "message",
      1200,
      { example: "点歌 稻香", desc: "搜索歌曲并通过上下文选择后发送卡片或语音" },
    ],
    async ctx => await handleSongRequest(ctx, bot),
  )
}

export function onBotEvent() {}

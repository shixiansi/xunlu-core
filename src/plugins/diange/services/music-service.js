import fs from "node:fs"
import path from "node:path"

import fetch from "node-fetch"

import Download from "../../../utils/download.js"
import env from "../../../lib/env.js"

const NETEASE_SEARCH_API = "https://music.163.com/api/search/get/web"
const NETEASE_PLAYER_API = "https://interface3.music.163.com/api/song/enhance/player/url/v1"
const QQ_SEARCH_API = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp"
const QQ_SONG_URL = "https://y.qq.com/n/ryqq/songDetail/{songmid}"
const QQ_AUDIO_URL = "https://ws.stream.qqmusic.qq.com/C100{songmid}.m4a"
const QQ_COVER_URL = "https://y.gtimg.cn/music/photo_new/T002R300x300M000{albummid}.jpg"

function sanitizeFileName(value = "") {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
}

function buildNeteaseHeaders() {
  return {
    Referer: "https://music.163.com/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  }
}

function buildQqHeaders() {
  return {
    Referer: "https://y.qq.com/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  }
}

function getTempDir() {
  return path.join(env.RootPath, "temp", "diange")
}

function formatArtists(song = {}) {
  const artists = Array.isArray(song?.artists) ? song.artists : Array.isArray(song?.ar) ? song.ar : []
  return artists.map(item => String(item?.name || "").trim()).filter(Boolean).join(" / ")
}

function normalizeKeyword(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim()
}

function levenshteinDistance(a = "", b = "") {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const rows = Array.from({ length: a.length + 1 }, (_, index) => index)
  for (let col = 1; col <= b.length; col += 1) {
    let previous = rows[0]
    rows[0] = col
    for (let row = 1; row <= a.length; row += 1) {
      const next = rows[row]
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + cost)
      previous = next
    }
  }
  return rows[a.length]
}

function similarityRatio(a = "", b = "") {
  if (!a || !b) return 0
  const maxLength = Math.max(a.length, b.length)
  if (!maxLength) return 1
  return 1 - levenshteinDistance(a, b) / maxLength
}

function normalizeNeteaseSong(song = {}) {
  const id = Number(song?.id || 0)
  if (!id) return null

  return {
    id,
    name: String(song?.name || "").trim() || "未知歌曲",
    artists: formatArtists(song),
    album: String(song?.album?.name || song?.al?.name || "").trim(),
    cover: String(song?.album?.picUrl || song?.al?.picUrl || "").trim(),
    durationMs: Number(song?.duration || song?.dt || 0),
    source: "163",
    sourceLabel: "网易云",
  }
}

function normalizeQqSong(song = {}) {
  const id = Number(song?.songid || 0)
  const songmid = String(song?.songmid || "").trim()
  const name = String(song?.songname || "").trim()
  if (!id || !songmid || !name) return null

  const artists = Array.isArray(song?.singer)
    ? song.singer.map(item => String(item?.name || "").trim()).filter(Boolean).join(" / ")
    : ""
  const album = String(song?.albumname || song?.album?.name || "").trim()
  const albumMid = String(song?.albummid || song?.album?.mid || "").trim()

  return {
    id,
    name,
    artists,
    album,
    cover: albumMid ? QQ_COVER_URL.replace("{albummid}", albumMid) : "",
    durationMs: Number(song?.interval || song?.duration || 0) * 1000,
    songmid,
    source: "qq",
    sourceLabel: "QQ音乐",
  }
}

class MusicService {
  constructor() {
    this.downloader = new Download()
  }

  scoreSong(keyword = "", song = {}) {
    const query = normalizeKeyword(keyword)
    const name = normalizeKeyword(song?.name)
    const artists = normalizeKeyword(song?.artists)
    const album = normalizeKeyword(song?.album)
    const combined = `${name}${artists}`

    if (!query || !name) return 0

    let score = similarityRatio(query, name)
    score = Math.max(score, similarityRatio(query, combined) * 0.95, similarityRatio(query, artists) * 0.9)

    if (name === query) score += 1.2
    if (name.includes(query) || query.includes(name)) score += 0.45
    if (artists && (artists.includes(query) || query.includes(artists))) score += 0.35
    if (album && album.includes(query)) score += 0.1
    if (song?.source === "163") score += 0.05

    return Number(score.toFixed(6))
  }

  rankSongs(keyword = "", songs = []) {
    return (Array.isArray(songs) ? songs : [])
      .map((song, index) => ({
        ...song,
        matchScore: this.scoreSong(keyword, song),
        originalIndex: index,
      }))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
        if (a.source !== b.source) return a.source === "163" ? -1 : 1
        return a.originalIndex - b.originalIndex
      })
  }

  async searchSong(keyword = "") {
    const songs = await this.searchSongs(keyword, 1)
    return songs[0] || null
  }

  async searchNeteaseSongs(keyword = "", limit = 10) {
    const query = String(keyword || "").trim()
    if (!query) return []

    const params = new URLSearchParams({
      s: query,
      type: "1",
      offset: "0",
      limit: String(Math.max(1, Math.min(20, Number(limit) || 10))),
      total: "true",
    })

    const response = await fetch(`${NETEASE_SEARCH_API}?${params.toString()}`, {
      headers: buildNeteaseHeaders(),
    })
    if (!response.ok) {
      throw new Error(`搜索网易云歌曲失败：${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    const songs = Array.isArray(json?.result?.songs) ? json.result.songs : []
    return songs.map(item => normalizeNeteaseSong(item)).filter(Boolean)
  }

  async searchQqSongs(keyword = "", limit = 10) {
    const query = String(keyword || "").trim()
    if (!query) return []

    const params = new URLSearchParams({
      w: query,
      p: "1",
      n: String(Math.max(1, Math.min(20, Number(limit) || 10))),
      format: "json",
      t: "0",
    })

    const response = await fetch(`${QQ_SEARCH_API}?${params.toString()}`, {
      headers: buildQqHeaders(),
    })
    if (!response.ok) {
      throw new Error(`搜索 QQ 音乐失败：${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    const songs = Array.isArray(json?.data?.song?.list) ? json.data.song.list : []
    return songs.map(item => normalizeQqSong(item)).filter(Boolean)
  }

  async searchSongs(keyword = "", limit = 10) {
    const query = String(keyword || "").trim()
    if (!query) return []

    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10))
    const [neteaseResult, qqResult] = await Promise.allSettled([
      this.searchNeteaseSongs(query, safeLimit),
      this.searchQqSongs(query, safeLimit),
    ])

    const merged = []
    if (neteaseResult.status === "fulfilled") merged.push(...neteaseResult.value)
    if (qqResult.status === "fulfilled") merged.push(...qqResult.value)

    const deduped = []
    const seen = new Set()
    for (const song of merged) {
      const key = `${song?.source || ""}:${song?.id || ""}:${song?.songmid || ""}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(song)
    }

    return this.rankSongs(query, deduped).slice(0, safeLimit)
  }

  buildMusicCard(song = {}) {
    if (!song?.id) return null

    if (song?.source === "qq") {
      const songmid = String(song?.songmid || "").trim()
      if (!songmid) return null
      return [
        {
          type: "music",
          data: {
            type: "custom",
            url: this.getSongPageUrl(song),
            audio: QQ_AUDIO_URL.replace("{songmid}", songmid),
            title: String(song?.name || "未知歌曲"),
            content: String(song?.artists || ""),
            image: String(song?.cover || ""),
          },
        },
      ]
    }

    return [{ type: "music", data: { type: "163", id: String(song.id) } }]
  }

  async getSongAudioUrl(song = {}) {
    if (song?.source === "qq") {
      const songmid = String(song?.songmid || "").trim()
      if (!songmid) return ""
      return QQ_AUDIO_URL.replace("{songmid}", songmid)
    }

    const songId = Number(song?.id || 0)
    if (!songId) return ""

    const params = new URLSearchParams({
      ids: `[${songId}]`,
      level: "standard",
      encodeType: "mp3",
    })

    const response = await fetch(`${NETEASE_PLAYER_API}?${params.toString()}`, {
      headers: buildNeteaseHeaders(),
    })
    if (!response.ok) {
      throw new Error(`获取歌曲音频地址失败：${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    const player = Array.isArray(json?.data) ? json.data[0] : null
    const audioUrl = String(player?.url || "").trim()
    if (!audioUrl) return ""
    return audioUrl
  }

  getSongPageUrl(song = {}) {
    if (song?.source === "qq") {
      const songmid = String(song?.songmid || "").trim()
      if (!songmid) return ""
      return QQ_SONG_URL.replace("{songmid}", songmid)
    }

    if (!song?.id) return ""
    return `https://y.music.163.com/m/song?id=${song.id}`
  }

  async downloadSongAudio(song = {}) {
    const audioUrl = await this.getSongAudioUrl(song)
    if (!audioUrl) throw new Error("未找到歌曲音频地址")

    fs.mkdirSync(getTempDir(), { recursive: true })
    const safeName = sanitizeFileName(`${song.id}_${song.name}`) || `song_${song.id}`
    const relativePath = path.posix.join("temp", "diange", `${safeName}.mp3`)
    await this.downloader.downloadFile(audioUrl, relativePath, {
      headers: buildNeteaseHeaders(),
    })
    return path.join(env.RootPath, relativePath)
  }

  cleanupFiles(paths = []) {
    for (const filePath of Array.isArray(paths) ? paths : [paths]) {
      if (!filePath) continue
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch {}
    }
  }
}

export default new MusicService()

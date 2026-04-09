import { Jieba } from "@node-rs/jieba"
import { dict } from "@node-rs/jieba/dict.js"

const URL_REGEXP =
  /(?:(?:https?|ftp|file):\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|cc|tv|top|xyz|io|co|me|app))(?:[^\s]|[\u3000])*/gi
const URL_LIKE_FRAGMENT_REGEXP =
  /\b(?:[a-z0-9-]+\.)+(?:com|cn|net|org|cc|tv|top|xyz|io|co|me|app)\b(?:\/[^\s]*)?/gi
const SYMBOL_REGEXP = /^[\s~`!@#$%^&*()_+\-=[\]{};:'",.<>/?|\\，。！？、；：“”‘’（）【】《》…—]+$/
const LATIN_TOKEN_REGEXP = /[a-zA-Z][a-zA-Z0-9_-]*|\d+/g
const CUSTOM_DICT = Buffer.from(
  [
    "表情包 100000",
    "词频统计 100000",
    "水群统计 100000",
    "高频词 100000",
    "潜水帝 100000",
    "表情帝 100000",
    "水天帝 100000",
  ].join("\n"),
  "utf8",
)
const jieba = Jieba.withDict(Buffer.concat([dict, Buffer.from("\n"), CUSTOM_DICT]))

const STOP_WORDS = new Set([
  "",
  "今天",
  "今日",
  "一个",
  "这个",
  "那个",
  "一下",
  "就是",
  "不是",
  "然后",
  "感觉",
  "真的",
  "可以",
  "什么",
  "怎么",
  "为什么",
  "哈哈",
  "哈哈哈",
  "嘿嘿",
  "呜呜",
  "啊啊",
  "哦哦",
  "嗯嗯",
  "来了",
  "走了",
  "好的",
  "收到",
  "我们",
  "你们",
  "他们",
  "自己",
  "这里",
  "那里",
  "因为",
  "所以",
  "如果",
  "但是",
  "而且",
  "还是",
  "已经",
  "没有",
  "还有",
  "水群统计",
  "词频统计",
  "qun",
  "daily",
  "群友",
  "大家",
  "group",
  "message",
  "img",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "json",
  "appid",
  "app",
  "meta",
  "config",
  "desc",
  "desc1",
  "desc2",
  "detail",
  "detail_1",
  "jumpurl",
  "jump_url",
  "qqdocurl",
  "prompt",
  "preview",
  "news",
  "tag",
  "extra",
  "view",
])

function stripUrlLikeText(text) {
  return String(text || "")
    .replace(URL_REGEXP, " ")
    .replace(URL_LIKE_FRAGMENT_REGEXP, " ")
}

function normalizeText(text) {
  return stripJsonLikeFragments(stripUrlLikeText(text))
    .replace(/\s+/g, " ")
    .trim()
}

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isJsonLikeText(text) {
  const raw = String(text || "").trim()
  if (!raw) return false

  const looksLikeJson =
    (raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))
  if (!looksLikeJson) return false

  const parsed = tryParseJson(raw)
  return Boolean(parsed && typeof parsed === "object")
}

function findJsonFragmentEnd(text, startIndex) {
  const startChar = text[startIndex]
  const expectedEnd = startChar === "{" ? "}" : startChar === "[" ? "]" : ""
  if (!expectedEnd) return -1

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === startChar) {
      depth += 1
      continue
    }
    if (char === expectedEnd) {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function stripJsonLikeFragments(text) {
  const raw = String(text || "")
  if (!raw) return ""

  let output = ""
  let index = 0
  while (index < raw.length) {
    const char = raw[index]
    if (char !== "{" && char !== "[") {
      output += char
      index += 1
      continue
    }

    const endIndex = findJsonFragmentEnd(raw, index)
    if (endIndex < 0) {
      output += char
      index += 1
      continue
    }

    const fragment = raw.slice(index, endIndex + 1)
    if (isJsonLikeText(fragment)) {
      output += " "
      index = endIndex + 1
      continue
    }

    output += char
    index += 1
  }

  return output
}

function isNoiseToken(token) {
  const text = String(token || "").trim().toLowerCase()
  if (!text) return true
  if (STOP_WORDS.has(text)) return true
  if (text.length <= 1) return true
  if (SYMBOL_REGEXP.test(text)) return true
  if (/^\d+$/.test(text)) return true
  if (/^(.)\1+$/.test(text)) return true
  return false
}

export function extractPlainTextFromSegments(segments) {
  if (!Array.isArray(segments)) return ""
  return segments
    .filter(seg => seg && seg.type === "text")
    .map(seg => seg?.data?.text ?? seg?.data?.content ?? seg?.text ?? seg?.content ?? "")
    .join(" ")
    .trim()
}

export function tokenizeText(text) {
  const cleaned = normalizeText(text)
  if (!cleaned) return []

  const jiebaTokens = jieba.cut(cleaned, true).map(token => String(token || "").trim())
  const latinTokens = cleaned.match(LATIN_TOKEN_REGEXP) || []
  const tokens = [...jiebaTokens, ...latinTokens.map(token => String(token).toLowerCase())]

  return tokens.filter(token => !isNoiseToken(token))
}

export function buildWordStatsFromMessages(messages = []) {
  const wordCounts = Object.create(null)
  let textSampleCount = 0

  for (const item of Array.isArray(messages) ? messages : []) {
    const plainText = extractPlainTextFromSegments(item?.message)
    if (!plainText || isJsonLikeText(plainText)) continue

    const text = normalizeText(plainText)
    if (!text) continue
    textSampleCount += 1

    for (const token of tokenizeText(text)) {
      wordCounts[token] = Number(wordCounts[token] || 0) + 1
    }
  }

  return {
    textSampleCount,
    wordCounts,
    topWords: rankWordCounts(wordCounts),
  }
}

export function rankWordCounts(wordCounts, limit = 20) {
  return Object.entries(wordCounts || {})
    .map(([word, count]) => ({ word, count: Number(count || 0) }))
    .filter(item => item.word && item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return String(a.word).localeCompare(String(b.word), "zh-Hans-CN")
    })
    .slice(0, limit)
}

export function buildWordCloudList(topWords = []) {
  const list = Array.isArray(topWords) ? topWords : []
  const maxCount = Math.max(...list.map(item => Number(item?.count || 0)), 1)

  return list.slice(0, 60).map(item => {
    const count = Number(item?.count || 0)
    const size = Math.max(18, Math.round((count / maxCount) * 58) + 14)
    return [String(item?.word || ""), size, count]
  })
}

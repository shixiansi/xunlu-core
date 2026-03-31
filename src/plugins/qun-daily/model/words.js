import { Jieba } from "@node-rs/jieba"
import { dict } from "@node-rs/jieba/dict.js"

const URL_REGEXP = /(https?|ftp|file):\/\/[^\s]+/gi
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
])

function cleanText(text) {
  return String(text || "")
    .replace(URL_REGEXP, " ")
    .replace(/\s+/g, " ")
    .trim()
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
  const cleaned = cleanText(text)
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
    const text = extractPlainTextFromSegments(item?.message)
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

const UniversalSegmentType = Object.freeze({
  TEXT: "text",
  MENTION: "at",
  MENTION_ALL: "atAll",
  EMOJI: "face",
  REPLY: "reply",
  IMAGE: "image",
  VOICE: "record",
  VIDEO: "video",
  FORWARD: "forward",
  FILE: "file",
})

const UNIVERSAL_TYPE_ALIASES = Object.freeze({
  text: UniversalSegmentType.TEXT,
  mention: UniversalSegmentType.MENTION,
  at: UniversalSegmentType.MENTION,
  mention_all: UniversalSegmentType.MENTION_ALL,
  mentionAll: UniversalSegmentType.MENTION_ALL,
  atAll: UniversalSegmentType.MENTION_ALL,
  emoji: UniversalSegmentType.EMOJI,
  face: UniversalSegmentType.EMOJI,
  quote: UniversalSegmentType.REPLY,
  reply: UniversalSegmentType.REPLY,
  image: UniversalSegmentType.IMAGE,
  audio: UniversalSegmentType.VOICE,
  voice: UniversalSegmentType.VOICE,
  record: UniversalSegmentType.VOICE,
  video: UniversalSegmentType.VIDEO,
  file: UniversalSegmentType.FILE,
  forward: UniversalSegmentType.FORWARD,
})

function normalizeUniversalSegmentType(type) {
  const key = String(type || "").trim()
  const normalized = UNIVERSAL_TYPE_ALIASES[key]
  if (!normalized) {
    throw new Error(
      `invalid universal segment type: ${type}; supported: ${Object.values(UniversalSegmentType).join(", ")}`,
    )
  }
  return normalized
}

function isUniversalSegmentType(type) {
  try {
    normalizeUniversalSegmentType(type)
    return true
  } catch {
    return false
  }
}

export {
  UNIVERSAL_TYPE_ALIASES,
  UniversalSegmentType,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
}

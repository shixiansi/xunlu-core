import {
  UniversalMessage as CoreUniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
  getSegmentMediaFile,
  getSegmentMediaId,
  getSegmentMentionTarget,
  getSegmentReplyRef,
  getSegmentText,
  isUniversalSegment,
  isUniversalSegmentArray,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
} from "./core/universal-segment.js"
import { ICQQConverter, MilkyConverter, OnebotV11Converter } from "./protocol/encoders.js"
import {
  fromICQQSegment,
  fromMilkySegment,
  fromOnebotV11Segment,
  getProtocolParser,
  normalizeProtocol,
} from "./protocol/parsers.js"

const UniversalMessage = CoreUniversalMessage

UniversalMessageSegment.fromOnebotV11 = fromOnebotV11Segment
UniversalMessageSegment.fromMilky = fromMilkySegment
UniversalMessageSegment.fromICQQ = fromICQQSegment

UniversalMessage.prototype.convertTo = function convertTo(protocol) {
  const normalized = normalizeProtocol(protocol)
  switch (normalized) {
    case "onebotv11":
      return new OnebotV11Converter().convert(this.segments)
    case "milky":
      return new MilkyConverter().convert(this.segments)
    case "icqq":
      return new ICQQConverter().convert(this.segments)
    default:
      throw new Error(`unsupported protocol: ${protocol}`)
  }
}

UniversalMessage.from = function from(protocol, segments) {
  const parser = getProtocolParser(protocol)
  const list = Array.isArray(segments)
    ? segments
    : segments === undefined || segments === null
      ? []
      : [segments]
  return new UniversalMessage(list.map(item => parser(item)))
}

UniversalMessage.fromOnebotV11 = function fromOnebotV11(segments) {
  return UniversalMessage.from("onebotv11", segments)
}

UniversalMessage.fromMilky = function fromMilky(segments) {
  return UniversalMessage.from("milky", segments)
}

UniversalMessage.fromICQQ = function fromICQQ(segments) {
  return UniversalMessage.from("icqq", segments)
}

export {
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
  getSegmentMediaFile,
  getSegmentMediaId,
  getSegmentMentionTarget,
  getSegmentReplyRef,
  getSegmentText,
  isUniversalSegment,
  isUniversalSegmentArray,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
}

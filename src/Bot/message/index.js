export {
  attachStandardMessageApis,
  applyDerivedFieldsFromUniversalSegments,
  classifyMediaReference,
  coerceToUniversalMessage,
  getMessageRefFromCtx,
  getReplyRefFromSegments,
  parseTextWithFaces,
  resolveMediaReferenceFields,
  toUniversalMessage,
} from "./context.js"
export { segment } from "./legacy-segment.js"
export {
  pickPrimaryMediaReference,
} from "./media-reference.js"
export {
  BaseConverter,
  ICQQConverter,
  MilkyConverter,
  OnebotV11Converter,
} from "./message-converters.js"
export {
  getSegmentMediaFile,
  getSegmentMediaId,
  getSegmentMentionTarget,
  getSegmentReplyRef,
  getSegmentText,
  isUniversalSegment,
  isUniversalSegmentArray,
  isUniversalSegmentType,
  normalizeUniversalSegmentType,
  UniversalMessage,
  UniversalMessageSegment,
  UniversalSegmentType,
} from "./universal-message.js"
export {
  renderUniversalSegments,
  simulateIncomingEvent,
  simulateIncomingMessage,
} from "./cli-simulator.js"

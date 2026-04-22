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
export { segment } from "./compat/legacy-segment.js"
export { pickPrimaryMediaReference } from "./core/media-reference.js"
export {
  BaseConverter,
  ICQQConverter,
  MilkyConverter,
  OnebotV11Converter,
} from "./protocol/encoders.js"
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
} from "./testing/cli-simulator.js"

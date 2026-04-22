export { classifyMediaReference, resolveMediaReferenceFields } from "./core/media-reference.js"
export {
  applyDerivedFieldsFromUniversalSegments,
  getMessageRefFromCtx,
  getReplyRefFromSegments,
} from "./context/derived-fields.js"
export {
  coerceToUniversalMessage,
  parseTextWithFaces,
  toUniversalMessage,
} from "./context/message-coerce.js"
export { attachStandardMessageApis } from "./context/message-apis.js"

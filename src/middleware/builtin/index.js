import takeoverProxyMiddleware from "./takeover-proxy.js"
import normalizeSelfMiddleware from "./normalize-self.js"
import normalizeSegmentsMiddleware from "./normalize-segments.js"
import inferProtocolMiddleware from "./infer-protocol.js"
import extractJsonMiddleware from "./extract-json.js"
import createUniversalMiddleware from "./create-universal.js"
import deriveFieldsMiddleware from "./derive-fields.js"
import classifySceneMiddleware from "./classify-scene.js"
import resolveMasterMiddleware from "./resolve-master.js"
import prefixCompatMiddleware from "./prefix-compat.js"
import normalizeTargetMiddleware from "./normalize-target.js"
import attachApisMiddleware from "./attach-apis.js"
import injectServicesMiddleware from "./inject-services.js"
import enrichRolesMiddleware from "./enrich-roles.js"

export const builtinMiddlewares = [
  takeoverProxyMiddleware,
  normalizeSelfMiddleware,
  normalizeSegmentsMiddleware,
  inferProtocolMiddleware,
  extractJsonMiddleware,
  createUniversalMiddleware,
  deriveFieldsMiddleware,
  classifySceneMiddleware,
  resolveMasterMiddleware,
  prefixCompatMiddleware,
  normalizeTargetMiddleware,
  attachApisMiddleware,
  injectServicesMiddleware,
  enrichRolesMiddleware,
]

export function registerBuiltinMiddlewares(mm, options = {}) {
  for (const mw of builtinMiddlewares) {
    mm.use(mw)
  }
  return mm
}

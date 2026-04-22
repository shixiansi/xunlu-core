function normalizeMemberId(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function getRuntimeBotOrNull() {
  try {
    // eslint-disable-next-line no-undef
    return Bot || globalThis.Bot || null
  } catch {
    return globalThis.Bot || null
  }
}

function unwrapMemberRoleInfo(info) {
  if (!info || typeof info !== "object") return null
  return info?.member ?? info?.data?.member ?? info?.data ?? info
}

function getNormalizedMemberRole(info) {
  const member = unwrapMemberRoleInfo(info)
  if (!member || typeof member !== "object") return ""

  return String(
    member?.role ??
      member?.permission ??
      member?.member_role ??
      member?.memberRole ??
      member?._info?.role ??
      (member?.is_owner || member?.isOwner || member?.owner
        ? "owner"
        : member?.is_admin || member?.isAdmin || member?.admin
          ? "admin"
          : ""),
  )
    .trim()
    .toLowerCase()
}

function extractMemberRoleFlags(info) {
  const member = unwrapMemberRoleInfo(info)
  if (!member || typeof member !== "object") return null

  const role = getNormalizedMemberRole(member)
  const isOwnerFlag = [member?.is_owner, member?.isOwner, member?.owner].find(v => v !== undefined)
  const isAdminFlag = [member?.is_admin, member?.isAdmin, member?.admin].find(v => v !== undefined)

  const isOwner = role === "owner" ? true : isOwnerFlag !== undefined ? Boolean(isOwnerFlag) : null
  const isAdmin =
    role === "owner" || role === "admin"
      ? true
      : isAdminFlag !== undefined
        ? Boolean(isAdminFlag)
        : null

  const resolvedRole =
    role ||
    (isOwner === true
      ? "owner"
      : isAdmin === true
        ? "admin"
        : isOwner === false || isAdmin === false
          ? "member"
          : "")

  if (!resolvedRole && isOwner === null && isAdmin === null) return null
  return {
    role: resolvedRole,
    isOwner,
    isAdmin,
    raw: member,
  }
}

function isPlaceholderMemberInfo(info, { expectedUserId } = {}) {
  const member = unwrapMemberRoleInfo(info)
  if (!member || typeof member !== "object") return false

  const uid = normalizeMemberId(member?.user_id ?? member?.userId ?? member?.uin ?? member?.id)
  if (!uid) return false
  if (expectedUserId !== undefined && uid !== normalizeMemberId(expectedUserId)) return false

  if (getNormalizedMemberRole(member) !== "member") return false

  const ownerFlag = [member?.is_owner, member?.isOwner, member?.owner].find(v => v !== undefined)
  const adminFlag = [member?.is_admin, member?.isAdmin, member?.admin].find(v => v !== undefined)
  if (ownerFlag === true || adminFlag === true) return false

  const nickname = String(member?.nickname ?? member?.name ?? "").trim()
  const card = String(
    member?.card ?? member?.remark ?? member?.member_card ?? member?.memberCard ?? "",
  ).trim()
  if (!nickname || nickname !== uid || card) return false

  const authoritativeFields = [
    member?.group_id,
    member?.groupId,
    member?.update_time,
    member?.updateTime,
    member?.join_time,
    member?.joinTime,
    member?.last_sent_time,
    member?.lastSentTime,
    member?.level,
    member?.title,
    member?.special_title,
    member?.specialTitle,
    member?.sex,
    member?.area,
  ]
  if (authoritativeFields.some(v => v !== undefined && v !== null && String(v).trim() !== "")) {
    return false
  }

  const allowedKeys = new Set([
    "user_id",
    "userId",
    "uin",
    "id",
    "nickname",
    "name",
    "card",
    "remark",
    "role",
    "permission",
    "member_role",
    "memberRole",
    "is_owner",
    "isOwner",
    "owner",
    "is_admin",
    "isAdmin",
    "admin",
    "_info",
  ])
  return Object.keys(member).every(key => allowedKeys.has(key))
}

function isAmbiguousMemberRoleInfo(info, { expectedUserId } = {}) {
  const member = unwrapMemberRoleInfo(info)
  if (!member || typeof member !== "object") return true
  if (isPlaceholderMemberInfo(member, { expectedUserId })) return true

  const role = getNormalizedMemberRole(member)
  const hasFlags = [
    member?.is_owner,
    member?.isOwner,
    member?.owner,
    member?.is_admin,
    member?.isAdmin,
    member?.admin,
  ].some(v => v !== undefined)

  return !role && !hasFlags
}

function isUsableMemberRoleInfo(info, { expectedUserId } = {}) {
  const member = unwrapMemberRoleInfo(info)
  if (!member || typeof member !== "object") return false
  return !isAmbiguousMemberRoleInfo(member, { expectedUserId })
}

function pickGroupMemberRoleInfo(group, userId, { ignorePlaceholder = false } = {}) {
  try {
    const picked = group?.pickMember?.(userId)
    const info = unwrapMemberRoleInfo(picked?.info ?? picked?._info ?? picked ?? null)
    if (!info) return null
    if (ignorePlaceholder && isPlaceholderMemberInfo(info, { expectedUserId: userId })) return null
    return info
  } catch {
    return null
  }
}

function normalizeMemberList(list) {
  if (list instanceof Map) return Array.from(list.values())
  if (Array.isArray(list)) return list
  if (Array.isArray(list?.members)) return list.members
  if (Array.isArray(list?.data?.members)) return list.data.members
  if (Array.isArray(list?.data)) return list.data
  return []
}

function findMemberInfoInGroupMemberList(list, userId) {
  const uid = normalizeMemberId(userId)
  if (!uid) return null

  for (const item of normalizeMemberList(list)) {
    const itemId = normalizeMemberId(item?.user_id ?? item?.userId ?? item?.uin ?? item?.id)
    if (!itemId || itemId !== uid) continue
    return unwrapMemberRoleInfo(item)
  }

  return null
}

async function callCtxGroupMemberInfo(ctx, groupId, userId) {
  if (!ctx || typeof ctx.getGroupMemberInfo !== "function") return null

  try {
    const info = await ctx.getGroupMemberInfo(groupId, userId)
    if (info) return unwrapMemberRoleInfo(info)
  } catch {}

  try {
    const info = await ctx.getGroupMemberInfo({ group_id: groupId, user_id: userId })
    if (info) return unwrapMemberRoleInfo(info)
  } catch {}

  return null
}

async function callCtxGroupMemberList(ctx, groupId, userId) {
  if (!ctx || typeof ctx.getGroupMemberList !== "function") return null

  try {
    const list = await ctx.getGroupMemberList(groupId)
    const info = findMemberInfoInGroupMemberList(list, userId)
    if (info) return info
  } catch {}

  try {
    const list = await ctx.getGroupMemberList({ group_id: groupId })
    const info = findMemberInfoInGroupMemberList(list, userId)
    if (info) return info
  } catch {}

  return null
}

async function callRuntimeBotGroupMemberInfo(groupId, userId) {
  const runtimeBot = getRuntimeBotOrNull()
  if (!runtimeBot || typeof runtimeBot.getGroupMemberInfo !== "function") return null

  try {
    const info = await runtimeBot.getGroupMemberInfo(groupId, userId)
    if (info) return unwrapMemberRoleInfo(info)
  } catch {}

  try {
    const info = await runtimeBot.getGroupMemberInfo({ group_id: groupId, user_id: userId })
    if (info) return unwrapMemberRoleInfo(info)
  } catch {}

  return null
}

async function callRuntimeBotGroupMemberList(groupId, userId) {
  const runtimeBot = getRuntimeBotOrNull()
  if (!runtimeBot || typeof runtimeBot.getGroupMemberList !== "function") return null

  try {
    const list = await runtimeBot.getGroupMemberList(groupId)
    const info = findMemberInfoInGroupMemberList(list, userId)
    if (info) return info
  } catch {}

  try {
    const list = await runtimeBot.getGroupMemberList({ group_id: groupId })
    const info = findMemberInfoInGroupMemberList(list, userId)
    if (info) return info
  } catch {}

  return null
}

async function callNativeOnebotGroupMemberInfo(ctx, groupId, userId) {
  if (!ctx || String(ctx?.protocol || "").toLowerCase() !== "onebotv11") return null

  const apiCall =
    typeof ctx.callApi === "function"
      ? ctx.callApi.bind(ctx)
      : typeof ctx.sendApi === "function"
        ? ctx.sendApi.bind(ctx)
        : null
  if (!apiCall) return null

  try {
    const info = await apiCall("get_group_member_info", {
      group_id: groupId,
      user_id: userId,
      no_cache: true,
    })
    return unwrapMemberRoleInfo(info)
  } catch {
    return null
  }
}

async function getMemberInfoWithFallback(
  ctx,
  groupId,
  userId,
  { allowLocalFallback = true, allowNativeOnebotFallback = true } = {},
) {
  let fallbackInfo = null
  const remember = info => {
    const member = unwrapMemberRoleInfo(info)
    if (!fallbackInfo && member) fallbackInfo = member
    return member
  }

  const upstreamInfo = remember(await callCtxGroupMemberInfo(ctx, groupId, userId))
  if (isUsableMemberRoleInfo(upstreamInfo, { expectedUserId: userId })) {
    return upstreamInfo
  }

  if (allowLocalFallback) {
    const localInfo = remember(
      pickGroupMemberRoleInfo(ctx?.group, userId, { ignorePlaceholder: true }),
    )
    if (isUsableMemberRoleInfo(localInfo, { expectedUserId: userId })) {
      return localInfo
    }
  }

  const candidateLoaders = []
  if (allowNativeOnebotFallback) {
    candidateLoaders.push(() => callNativeOnebotGroupMemberInfo(ctx, groupId, userId))
  }
  candidateLoaders.push(() => callCtxGroupMemberList(ctx, groupId, userId))
  candidateLoaders.push(() => callRuntimeBotGroupMemberInfo(groupId, userId))
  candidateLoaders.push(() => callRuntimeBotGroupMemberList(groupId, userId))

  for (const load of candidateLoaders) {
    const info = remember(await load())
    if (isUsableMemberRoleInfo(info, { expectedUserId: userId })) {
      return info
    }
  }

  return fallbackInfo
}

async function getMemberRoleFlagsWithFallback(ctx, groupId, userId, options = {}) {
  const info = await getMemberInfoWithFallback(ctx, groupId, userId, options)
  return extractMemberRoleFlags(info)
}

function isOwnerRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase() === "owner"
}

function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase()
  return normalized === "owner" || normalized === "admin"
}

function hasOwnerRole(info) {
  const flags = extractMemberRoleFlags(info)
  return Boolean(flags?.isOwner || isOwnerRole(flags?.role))
}

function hasAdminRole(info) {
  const flags = extractMemberRoleFlags(info)
  return Boolean(flags?.isOwner || flags?.isAdmin || isAdminRole(flags?.role))
}

function selectPreferredRoleFlags({
  directInfo = null,
  localInfo = null,
  cachedFlags = null,
  upstreamInfo = null,
  expectedUserId,
} = {}) {
  const directFlags =
    directInfo && !isPlaceholderMemberInfo(directInfo, { expectedUserId })
      ? extractMemberRoleFlags(directInfo)
      : null
  if (directFlags) {
    return { flags: directFlags, source: "event", placeholderDetected: false }
  }

  const placeholderDetected = isPlaceholderMemberInfo(localInfo, { expectedUserId })
  const localFlags = placeholderDetected ? null : extractMemberRoleFlags(localInfo)
  if (localFlags) {
    return { flags: localFlags, source: "local", placeholderDetected }
  }

  if (cachedFlags) {
    return { flags: cachedFlags, source: "cache", placeholderDetected }
  }

  const upstreamFlags =
    upstreamInfo && !isPlaceholderMemberInfo(upstreamInfo, { expectedUserId })
      ? extractMemberRoleFlags(upstreamInfo)
      : null
  if (upstreamFlags) {
    return { flags: upstreamFlags, source: "upstream", placeholderDetected }
  }

  return {
    flags: null,
    source: placeholderDetected ? "placeholder" : "none",
    placeholderDetected,
  }
}

export {
  callCtxGroupMemberInfo,
  callCtxGroupMemberList,
  callNativeOnebotGroupMemberInfo,
  callRuntimeBotGroupMemberInfo,
  callRuntimeBotGroupMemberList,
  extractMemberRoleFlags,
  findMemberInfoInGroupMemberList,
  getMemberInfoWithFallback,
  getMemberRoleFlagsWithFallback,
  getNormalizedMemberRole,
  hasAdminRole,
  hasOwnerRole,
  isAdminRole,
  isAmbiguousMemberRoleInfo,
  isOwnerRole,
  isPlaceholderMemberInfo,
  pickGroupMemberRoleInfo,
  selectPreferredRoleFlags,
  unwrapMemberRoleInfo,
}

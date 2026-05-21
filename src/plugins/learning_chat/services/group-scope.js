export function normalizeGroupId(value) {
  return String(value || "").trim()
}

export function normalizeGroupIdSet(value) {
  const out = new Set()

  if (value instanceof Map) {
    for (const [groupId] of value.entries()) {
      const gid = normalizeGroupId(groupId)
      if (gid) out.add(gid)
    }
    return out
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const gid = normalizeGroupId(item.group_id ?? item.groupId ?? item.id ?? item.uin)
        if (gid) out.add(gid)
        continue
      }
      const gid = normalizeGroupId(item)
      if (gid) out.add(gid)
    }
    return out
  }

  if (value && typeof value === "object") {
    for (const [groupId] of Object.entries(value)) {
      const gid = normalizeGroupId(groupId)
      if (gid) out.add(gid)
    }
  }

  return out
}

export function collectProactiveGroupIds({
  configGroups = {},
  heatGroupIds = [],
  extraGroupIds = [],
  discoveredIds = [],
} = {}) {
  return normalizeGroupIdSet([
    ...Object.keys(configGroups || {}),
    ...(Array.isArray(heatGroupIds) ? heatGroupIds : []),
    ...(Array.isArray(extraGroupIds) ? extraGroupIds : []),
    ...(Array.isArray(discoveredIds) ? discoveredIds : []),
  ])
}

export function buildEnabledProactiveGroupItems(
  groupIds,
  { config = {}, getEffectiveGroupConfig } = {},
) {
  const items = []
  const ids = groupIds instanceof Set ? Array.from(groupIds) : Array.from(normalizeGroupIdSet(groupIds))

  for (const gid of ids) {
    const effective =
      typeof getEffectiveGroupConfig === "function" ? getEffectiveGroupConfig(gid) : null
    if (!effective?.proactive_enabled) continue

    const override =
      config?.groups &&
      typeof config.groups === "object" &&
      config.groups[gid] &&
      typeof config.groups[gid] === "object"
        ? config.groups[gid]
        : {}

    items.push({
      group_id: gid,
      effective,
      override,
      global_proactive_enabled: Boolean(config?.proactive?.enable),
      global_proactive_command_enabled: Boolean(config?.proactive?.command_enable),
    })
  }

  items.sort((a, b) => String(a.group_id).localeCompare(String(b.group_id)))
  return items
}

export function collectTrackedGroupIds({
  configGroups = {},
  heatGroupIds = [],
  learningGroupIds = [],
} = {}) {
  return normalizeGroupIdSet([
    ...Object.keys(configGroups || {}),
    ...(Array.isArray(heatGroupIds) ? heatGroupIds : []),
    ...(Array.isArray(learningGroupIds) ? learningGroupIds : []),
  ])
}

export function findMissingGroupIds(trackedGroupIds, activeGroupIds) {
  const tracked = normalizeGroupIdSet(
    trackedGroupIds instanceof Set ? Array.from(trackedGroupIds) : trackedGroupIds,
  )
  const active = activeGroupIds instanceof Set ? activeGroupIds : normalizeGroupIdSet(activeGroupIds)

  return Array.from(tracked)
    .filter(id => id && !active.has(id))
    .sort((a, b) => a.localeCompare(b))
}

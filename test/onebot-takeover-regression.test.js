import test from "node:test"
import assert from "node:assert/strict"

import {
  getMemberInfoWithFallback,
  getNormalizedMemberRole,
  isPlaceholderMemberInfo,
  selectPreferredRoleFlags,
} from "../src/Bot/member-role-utils.js"
import { classifyMediaReference, resolveMediaReferenceFields } from "../src/Bot/message/context.js"
import OneBotV11Adapter, { resolveOnebotMediaTarget } from "../src/Bot/onebotV11/onebot.js"

test("takeover placeholder member info is detected and ignored", () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }
  const upstreamOwner = {
    user_id: 3239716086,
    nickname: "bot",
    card: "bot",
    role: "owner",
    group_id: 428596438,
    update_time: 1,
  }

  assert.equal(isPlaceholderMemberInfo(placeholder, { expectedUserId: 3239716086 }), true)

  const selected = selectPreferredRoleFlags({
    localInfo: placeholder,
    cachedFlags: null,
    upstreamInfo: upstreamOwner,
    expectedUserId: 3239716086,
  })

  assert.equal(selected.source, "upstream")
  assert.equal(selected.placeholderDetected, true)
  assert.equal(selected.flags?.role, "owner")
  assert.equal(selected.flags?.isOwner, true)
})

test("onebot fallback uses native get_group_member_info when ctx data is ambiguous", async () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }

  let nativeCalls = 0
  const ctx = {
    protocol: "onebotv11",
    async getGroupMemberInfo() {
      return placeholder
    },
    group: {
      pickMember() {
        return { info: placeholder }
      },
    },
    async callApi(action, params) {
      nativeCalls += 1
      assert.equal(action, "get_group_member_info")
      assert.deepEqual(params, {
        group_id: 428596438,
        user_id: 3239716086,
        no_cache: true,
      })
      return {
        user_id: 3239716086,
        nickname: "bot",
        card: "bot",
        role: "owner",
        group_id: 428596438,
        update_time: 1,
      }
    },
  }

  const info = await getMemberInfoWithFallback(ctx, 428596438, 3239716086)
  assert.equal(nativeCalls, 1)
  assert.equal(getNormalizedMemberRole(info), "owner")
})

test("media reference classification keeps basename out of url", () => {
  assert.equal(classifyMediaReference("https://example.com/a.png").kind, "url")
  assert.equal(classifyMediaReference("file:///C:/tmp/a.png").kind, "fileUri")
  assert.equal(classifyMediaReference("base64://abcd").kind, "base64")
  assert.equal(classifyMediaReference("C:\\tmp\\a.png").kind, "absolutePath")
  assert.equal(classifyMediaReference("D6686247521615AFB6063BBDF65C1C4E.jpg").kind, "basename")

  const refs = resolveMediaReferenceFields([
    { value: "https://example.com/a.png", preferred: "url" },
    { value: "images/avatar.png", preferred: "path" },
    { value: "opaque-file-id", preferred: "fileId" },
  ])

  assert.deepEqual(refs, {
    url: "https://example.com/a.png",
    path: "images/avatar.png",
    fileId: "opaque-file-id",
  })
})

test("basename media references resolve against cwd or project root", () => {
  const resolved = resolveOnebotMediaTarget("avatar.png", {
    cwd: "C:/repo",
    projectRoot: "C:/repo/plugins/xunlu-core",
    exists: target => target === "C:\\repo\\plugins\\xunlu-core\\avatar.png",
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.value, "C:\\repo\\plugins\\xunlu-core\\avatar.png")

  const missing = resolveOnebotMediaTarget("D6686247521615AFB6063BBDF65C1C4E.jpg", {
    cwd: "C:/repo",
    projectRoot: "C:/repo/plugins/xunlu-core",
    exists: () => false,
  })
  assert.equal(missing.ok, false)
  assert.match(missing.message, /unresolved local media reference/i)
})

test("invalid basename media fails locally before any OneBot API retries", async () => {
  const adapter = new OneBotV11Adapter()
  let callCount = 0
  adapter.callApi = async () => {
    callCount += 1
    return {}
  }

  await assert.rejects(
    () =>
      adapter.sendGroupMessage({
        group_id: 428596438,
        message: [{ type: "image", data: { file: "D6686247521615AFB6063BBDF65C1C4E.jpg" } }],
      }),
    /unresolved local media reference/i,
  )

  assert.equal(callCount, 0)
})

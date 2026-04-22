import assert from "node:assert/strict"
import test from "node:test"

import RoleResolver from "../src/Bot/runtime/role-resolver.js"
import { installTestRuntime } from "./helpers/test-runtime.js"

installTestRuntime(test)

test("RoleResolver avoids accessor-only member/group getters and shadows writable role fields", async () => {
  const resolver = new RoleResolver({})
  const accessLog = []
  const event = {
    group_id: 123456,
    user_id: 234567,
    self_id: 345678,
    sender: {
      nickname: "测试成员",
      card: "测试成员",
    },
    async getGroupMemberInfo() {
      return {
        user_id: 234567,
        nickname: "测试成员",
        card: "测试成员",
        role: "admin",
      }
    },
  }

  Object.defineProperty(event, "member", {
    configurable: true,
    enumerable: true,
    get() {
      accessLog.push("member-getter")
      throw new Error("member getter should not be touched")
    },
  })
  Object.defineProperty(event, "group", {
    configurable: true,
    enumerable: true,
    get() {
      accessLog.push("group-getter")
      throw new Error("group getter should not be touched")
    },
  })

  const previousBot = globalThis.Bot
  const previousRuntimeBot = globalThis.__xunlu_runtime_bot
  try {
    globalThis.__xunlu_runtime_bot = {
      pickGroup(gid) {
        assert.equal(gid, 123456)
        return {
          pickMember(uid) {
            assert.equal(uid, 345678)
            return {
              info: {
                user_id: 345678,
                role: "owner",
              },
            }
          },
        }
      },
    }
    globalThis.Bot = new Proxy(
      {},
      {
        get() {
          throw new Error("global Bot proxy should not be touched")
        },
      },
    )

    await resolver.enrichGroupRoleFlags(event)

    assert.deepEqual(accessLog, [])
    assert.equal(event.isAdmin, true)
    assert.equal(event.isOwner, false)
    assert.equal(event.member.role, "admin")
    assert.equal(event.group_member.role, "admin")
    assert.equal(event.botRole, "owner")
    assert.equal(event.botIsOwner, true)
    assert.equal(event.botMember.role, "owner")
  } finally {
    globalThis.__xunlu_runtime_bot = previousRuntimeBot
    globalThis.Bot = previousBot
  }
})

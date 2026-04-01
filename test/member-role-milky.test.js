import test from "node:test"
import assert from "node:assert/strict"

import { getMemberInfoWithFallback, getNormalizedMemberRole } from "../src/Bot/member-role-utils.js"

test("milky fallback resolves role from group member list when member info is ambiguous", async () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }

  const ctx = {
    protocol: "milky",
    async getGroupMemberInfo() {
      return placeholder
    },
    async getGroupMemberList(groupId) {
      assert.equal(groupId, 428596438)
      return {
        members: [
          {
            user_id: 3239716086,
            nickname: "bot-self",
            card: "",
            role: "owner",
            group_id: 428596438,
            update_time: 1,
          },
        ],
      }
    },
    group: {
      pickMember() {
        return { info: placeholder }
      },
    },
  }

  const info = await getMemberInfoWithFallback(ctx, 428596438, 3239716086)
  assert.equal(getNormalizedMemberRole(info), "owner")
})

test("milky fallback can use global Bot group member list when ctx lacks usable APIs", async () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }

  globalThis.Bot = {
    async getGroupMemberList(groupId) {
      assert.equal(groupId, 428596438)
      return {
        members: [
          {
            user_id: 3239716086,
            nickname: "bot-self",
            card: "",
            role: "owner",
            group_id: 428596438,
            update_time: 1,
          },
        ],
      }
    },
  }

  const ctx = {
    protocol: "milky",
    async getGroupMemberInfo() {
      return placeholder
    },
    group: {
      pickMember() {
        return { info: placeholder }
      },
    },
  }

  const info = await getMemberInfoWithFallback(ctx, 428596438, 3239716086)
  assert.equal(getNormalizedMemberRole(info), "owner")

  delete globalThis.Bot
})

test("milky fallback continues past ambiguous runtime member info to authoritative member list", async () => {
  const placeholder = {
    user_id: 3239716086,
    nickname: "3239716086",
    card: "",
    role: "member",
  }

  globalThis.Bot = {
    async getGroupMemberInfo(groupId, userId) {
      assert.equal(groupId, 428596438)
      assert.equal(userId, 3239716086)
      return placeholder
    },
    async getGroupMemberList(groupId) {
      assert.equal(groupId, 428596438)
      return {
        members: [
          {
            user_id: 3239716086,
            nickname: "bot-self",
            card: "",
            role: "owner",
            group_id: 428596438,
            update_time: 1,
          },
        ],
      }
    },
  }

  const ctx = {
    protocol: "milky",
    async getGroupMemberInfo() {
      return placeholder
    },
    group: {
      pickMember() {
        return { info: placeholder }
      },
    },
  }

  const info = await getMemberInfoWithFallback(ctx, 428596438, 3239716086)
  assert.equal(getNormalizedMemberRole(info), "owner")

  delete globalThis.Bot
})

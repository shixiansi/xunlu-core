import {
  clearDouyinAuth,
  readDouyinAuth,
} from "../model/auth-store.js"
import DouyinService from "../services/douyin-service.js"

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

function getSummary(auth = null) {
  if (!auth?.cookieHeader) return "未配置 Cookie"
  const nickname = normalizeString(auth?.userInfo?.nickname)
  const uid = normalizeString(auth?.userInfo?.uid)
  const parts = ["已配置 Cookie"]
  if (nickname) parts.push(`账号 ${nickname}`)
  if (uid) parts.push(`UID ${uid}`)
  if (auth?.updatedAt) parts.push(`更新时间 ${auth.updatedAt}`)
  return parts.join(" | ")
}

function getViewValues() {
  const auth = readDouyinAuth()
  return {
    auth: {
      cookieHeader: normalizeString(auth?.cookieHeader),
      clear: false,
      status: auth?.cookieHeader ? "configured" : "missing",
      nickname: normalizeString(auth?.userInfo?.nickname),
      uid: normalizeString(auth?.userInfo?.uid),
      updatedAt: normalizeString(auth?.updatedAt),
    },
  }
}

export default {
  meta: {
    title: "抖音",
    description: "手动设置抖音 Cookie，用于解析抖音作品和热门评论。",
    order: 140,
    tags: ["douyin", "cookie"],
  },

  definition: {
    sections: [
      {
        id: "auth",
        scope: "global",
        title: "登录配置",
        description:
          "请粘贴 www.douyin.com 当前登录态的完整 Cookie。留空不会覆盖现有配置；勾选清除后会删除已保存 Cookie。",
        fields: [
          {
            path: "auth.cookieHeader",
            label: "Cookie",
            type: "textarea",
            rows: 8,
            allowEmpty: true,
          },
          {
            path: "auth.clear",
            label: "清除已保存 Cookie",
            type: "boolean",
          },
          {
            path: "auth.status",
            label: "当前状态",
            type: "text",
            readonly: true,
          },
          {
            path: "auth.nickname",
            label: "当前账号",
            type: "text",
            readonly: true,
          },
          {
            path: "auth.uid",
            label: "当前 UID",
            type: "text",
            readonly: true,
          },
          {
            path: "auth.updatedAt",
            label: "最近更新时间",
            type: "text",
            readonly: true,
          },
        ],
      },
    ],
  },

  async getValues() {
    const auth = readDouyinAuth()
    return {
      values: getViewValues(),
      meta: {
        summary: getSummary(auth),
      },
    }
  },

  async updateValues({ values = {} } = {}) {
    const authValues = values?.auth || {}
    const shouldClear = normalizeBoolean(authValues.clear, false)
    const cookieHeader = normalizeString(authValues.cookieHeader).trim()

    if (shouldClear) {
      clearDouyinAuth()
      return {
        values: getViewValues(),
        meta: {
          summary: getSummary(null),
        },
        message: "抖音 Cookie 已清除",
      }
    }

    if (cookieHeader) {
      const saved = await DouyinService.importCookieHeader(cookieHeader)
      return {
        values: getViewValues(),
        meta: {
          summary: getSummary(saved),
        },
        message: "抖音 Cookie 已保存并校验成功",
      }
    }

    const current = readDouyinAuth()
    return {
      values: getViewValues(),
      meta: {
        summary: getSummary(current),
      },
      message: "未检测到新的 Cookie，现有配置保持不变",
    }
  },
}

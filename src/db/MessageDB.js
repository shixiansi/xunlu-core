import { BaseModel, Types } from "./base/BaseModel.js"
import { Op } from "sequelize"
import moment from "moment"

const MESSAGE_COLUMNS = {
  //消息id
  message_id: {
    type: Types.STRING,
    primaryKey: true,
  },
  //用户id
  user_id: {
    type: Types.INTEGER,
    allowNull: false,
  },
  //消息数据
  message: {
    type: Types.JSONB,
  },
  //消息时间戳（10位，秒级）
  time: {
    type: Types.BIGINT,
  },
  sender: {
    type: Types.JSONB,
  },
}

// 群聊消息数据库管理类
class GroupMessageDB {
  constructor() {
    this.groupTables = new Map() // 用于缓存已创建的群表模型
  }

  // 获取指定群的数据表模型
  async getGroupTable(groupId) {
    if (this.groupTables.has(groupId)) {
      return this.groupTables.get(groupId)
    }

    // 创建新的群表
    const tableModel = await BaseModel.createGroupTable(groupId, MESSAGE_COLUMNS)
    this.groupTables.set(groupId, tableModel)
    return tableModel
  }

  // 保存消息到指定群的表
  async saveMessage(groupId, messageData) {
    const table = await this.getGroupTable(groupId)
    try {
      return await table.create(messageData)
    } catch (err) {
      // idempotent: ignore duplicate inserts for the same message_id
      if (err?.name === "SequelizeUniqueConstraintError") {
        try {
          const message_id = messageData?.message_id
          if (message_id !== undefined && message_id !== null && String(message_id).trim()) {
            return await table.findByPk(String(message_id))
          }
        } catch {}
        return null
      }
      throw err
    }
  }

  // 查询指定群的消息
  async queryMessages(groupId, conditions = {}) {
    const table = await this.getGroupTable(groupId)
    return BaseModel.getObjectData(
      await table.findOne({
        where: conditions,
        order: [["time", "DESC"]],
      }),
    )
  }

  // 【基础方法】按时间戳范围查询指定群某天的消息（内部调用）
  async getGroupMsgByTimeRange(groupId, startTime, endTime) {
    const table = await this.getGroupTable(groupId)
    return BaseModel.getObjectData(
      await table.findAll({
        where: {
          time: {
            [Op.lte]: endTime, // 小于等于结束时间
            [Op.gte]: startTime, // 大于等于开始时间
          },
        },
        order: [["time", "DESC"]],
      }),
    )
  }

  // 【核心新增】按日期字符串/Date对象查询指定群某天的所有消息（对外易用版）
  // date参数示例：'2026-02-28'、new Date()、moment对象，不传则默认当天
  async getGroupMsgByDay(groupId, date) {
    let startTime, endTime
    const now = moment() // 基准时间：当前时间

    // 1. 不传参数：默认获取当天的消息
    if (!date) {
      startTime = Math.floor(now.startOf("day").valueOf() / 1000) // 当天00:00:00（秒级）
      endTime = Math.floor(now.endOf("day").valueOf() / 1000) // 当天23:59:59（秒级）
    }
    // 2. 传入数字：获取「当天 - date天」到「当天」的消息（如date=7则获取近7天）
    else if (typeof date === "number") {
      // 校验数字合法性：不能为负数
      if (date < 0) {
        throw new Error("天数不能为负数，请传入非负整数")
      }
      // 计算起始时间：date天前的00:00:00
      const startDate = now.clone().subtract(date, "day")
      startTime = Math.floor(startDate.startOf("day").valueOf() / 1000)
      // 结束时间：当天的23:59:59
      endTime = Math.floor(now.endOf("day").valueOf() / 1000)
    }
    // 3. 传入日期（字符串/Date/moment）：获取指定日期当天的消息（原有逻辑）
    else {
      const targetDate = moment(date)
      // 校验日期合法性
      if (!targetDate.isValid()) {
        throw new Error("传入的日期格式不合法，请传入如'2026-02-28'的字符串、Date对象或moment对象")
      }
      startTime = Math.floor(targetDate.startOf("day").valueOf() / 1000)
      endTime = Math.floor(targetDate.endOf("day").valueOf() / 1000)
    }

    // 调用基础时间范围查询方法
    return this.getGroupMsgByTimeRange(groupId, startTime, endTime)
  }

  // 按消息ID分页查询
  async queryMessagesbyNum(groupId, message_id, pageSize) {
    const table = await this.getGroupTable(groupId)
    return BaseModel.getObjectData(
      await table.findAll({
        where: {
          message_id: {
            [Op.lt]: message_id,
          },
        },
        order: [["message_id", "DESC"]],
        limit: pageSize,
      }),
    )
  }

  // 根据消息ID查询指定群的消息
  async getMessageById(groupId, messageId) {
    const table = await this.getGroupTable(groupId)
    return BaseModel.getObjectData(
      await table.findOne({
        where: { message_id: messageId },
      }),
    )
  }

  // 删除指定天数前的消息
  async deleteMessageByTime(groupId, day = 7) {
    // 计算7天前此刻的秒级时间戳（10位）
    const time = Math.floor(moment().subtract(day, "day").valueOf() / 1000)
    const table = await this.getGroupTable(groupId)

    const result = await table.destroy({
      where: {
        time: {
          [Op.lte]: time,
        },
      },
    })
    console.log(`删除了${result}条过期消息`)
    return result
  }
  async close() {
    this.groupTables.clear()
    if (typeof BaseModel?.close === "function") {
      await BaseModel.close()
    }
  }
}

export default new GroupMessageDB()

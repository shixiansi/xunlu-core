import { BaseModel, Types } from "./base/BaseModel.js";
import { Op } from "sequelize";
import moment from "moment";
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
  //消息时间戳
  time: {
    type: Types.BIGINT,
  },
  sender: {
    type: Types.JSONB,
  },
};

// 群聊消息数据库管理类
class GroupMessageDB {
  constructor() {
    this.groupTables = new Map(); // 用于缓存已创建的群表模型
  }

  // 获取指定群的数据表模型
  async getGroupTable(groupId) {
    if (this.groupTables.has(groupId)) {
      return this.groupTables.get(groupId);
    }

    // 创建新的群表
    const tableModel = await BaseModel.createGroupTable(
      groupId,
      MESSAGE_COLUMNS
    );
    this.groupTables.set(groupId, tableModel);
    return tableModel;
  }

  // 保存消息到指定群的表
  async saveMessage(groupId, messageData) {
    const table = await this.getGroupTable(groupId);
    return await table.create(messageData);
  }

  // 查询指定群的消息
  async queryMessages(groupId, conditions = {}) {
    const table = await this.getGroupTable(groupId);
    return BaseModel.getObjectData(
      await table.findOne({
        where: conditions,
        order: [["time", "DESC"]],
      })
    );
  }

  async getGroupMsgByDay(groupId, startTime, endTime) {
    const table = await this.getGroupTable(groupId);
    return BaseModel.getObjectData(
      await table.findAll({
        where: {
          time: {
            [Op.lte]: endTime,
            [Op.gte]: startTime,
          },
        },
        order: [["time", "DESC"]],
      })
    );
  }

  async queryMessagesbyNum(groupId, message_id, pageSize) {
    const table = await this.getGroupTable(groupId);
    return BaseModel.getObjectData(
      await table.findAll({
        where: {
          message_id: {
            [Op.lt]: message_id,
          },
        },
        order: [["message_id", "DESC"]],
        limit: pageSize,
      })
    );
  }

  // 根据消息ID查询指定群的消息
  async getMessageById(groupId, messageId) {
    const table = await this.getGroupTable(groupId);
    return BaseModel.getObjectData(
      await table.findOne({
        where: { message_id: messageId },
      })
    );
  }

  async deleteMessageByTime(groupId, day = 7) {
    let time = Math.floor(moment().subtract(day, "day").valueOf() / 1000);
    const table = await this.getGroupTable(groupId);
    console.log(table);

    let result = await table.destroy({
      where: {
        time: {
          [Op.lte]: time,
        },
      },
    });
    console.log(result);
  }
}

export default new GroupMessageDB();

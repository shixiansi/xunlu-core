import { BaseDB, Types } from "../../component/sqlite/sqlite.js";
let BaseModel = new BaseDB("messageDB");
await BaseModel.getSequelize();

// 添加创建群聊数据表的方法
BaseModel.createGroupTable = async function (groupId, columns) {
  // 表名使用前缀 group_ 加上群号
  const tableName = `group_${groupId}`;
  return await this.initDB(tableName, columns, {
    createdAt: false,
    updatedAt: false,
  });
};

export { BaseModel, Types };

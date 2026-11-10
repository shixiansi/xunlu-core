import { Sequelize, DataTypes, Model } from "sequelize";
import path from "node:path";
import fs from "node:fs";
import env from "../../lib/env.js";

class BaseDB {
  static Types = DataTypes;

  constructor(name) {
    this.DBName = name;
  }

  get DBPath() {
    // 统一使用 env.RootPath（runtime context 解析），不再依赖 process.cwd()：
    // 插件形态下 cwd 是 Miao-Yunzai 根目录，库文件会被写错位置（历史遗留 0 字节 messageDB.sqlite 的根因）
    const dbpath = path.join(env.RootPath, "data") + path.sep;
    fs.mkdirSync(dbpath, { recursive: true });
    return dbpath;
  }

  async getSequelize() {
    if (this.app) return this.app;
    const sequelize = new Sequelize({
      dialect: "sqlite",
      storage: `${this.DBPath}${this.DBName}.sqlite`,
      logging: false,
    });
    await sequelize.authenticate();
    // 与 CommandUsageDB 一致：WAL + busy_timeout，避免消息写入与查询互相锁库
    for (const sql of ["PRAGMA journal_mode=WAL", "PRAGMA synchronous=NORMAL", "PRAGMA busy_timeout=3000"]) {
      await sequelize.query(sql).catch(() => {});
    }
    this.app = sequelize;
    return sequelize;
  }

  getObjectData(result) {
    if (Array.isArray(result)) {
      return result.map((r) => r.dataValues);
    }
    return result?.dataValues || null;
  }

  async initDB(name, columns, cfg) {
    let sequelize = await this.getSequelize();
    class BaseModel extends Model {}
    BaseModel.init(columns, { sequelize, tableName: name, ...cfg });
    BaseModel.COLUMNS = columns;
    await BaseModel.sync();
    return BaseModel;
  }

  async close() {
    const app = this.app;
    this.app = null;
    if (!app || typeof app.close !== "function") return;
    await app.close().catch(() => {});
  }
}

const { Types } = BaseDB;

export { BaseDB, Types };

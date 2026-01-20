import { Sequelize, DataTypes, Model } from "sequelize";
class BaseDB {
  static Types = DataTypes;

  constructor(name) {
    this.DBName = name;
  }

  get DBPath() {
    const dbpath = process.cwd() + "/data/";
    return dbpath;
  }

  async getSequelize() {
    if (this.app) return this.app;
    const sequelize = new Sequelize({
      dialect: "sqlite",
      storage: `${this.DBPath}/${this.DBName}.sqlite`,
      logging: false,
    });
    await sequelize.authenticate();
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
}

const { Types } = BaseDB;

export { BaseDB, Types };

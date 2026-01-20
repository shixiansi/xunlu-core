import MilkyAdapter from "./milky-adapter.js";

/**
 * 适配器工厂
 * 根据配置选择不同的适配器实现
 */
class AdapterFactory {
  /**
   * 创建适配器实例
   * @param {Object} config 配置对象
   * @returns {Object} 适配器实例
   */
  static createAdapter(config = {}) {
    const adapterType = config.type; // 默认使用icqq适配器

    switch (adapterType) {
      case "milky":
        return this.createMilkyAdapter(config);
      case "icqq":
      default:
        return this.createIcqqAdapter(config);
    }
  }

  /**
   * 创建Milky适配器
   * @param {Object} config Milky配置
   * @returns {MilkyAdapter} Milky适配器实例
   */
  static createMilkyAdapter(config) {
    const milkyConfig = {
      authority: config.authority || "localhost:8080",
      basePath: config.basePath || "/",
      accessToken: config.accessToken,
      useTLS: config.useTLS || false,
      useSSE: config.useSSE || false,
      ...config.milky,
    };

    return new MilkyAdapter(milkyConfig);
  }

  /**
   * 检测可用的适配器类型
   * @returns {Array} 可用的适配器类型列表
   */
  static getAvailableAdapters() {
    const adapters = ["icqq"]; // icqq适配器总是可用

    try {
      // 检查milky-node-sdk是否可用
      require.resolve("@saltify/milky-node-sdk");
      adapters.push("milky");
    } catch (error) {
      console.log("Milky适配器不可用，请安装@saltify/milky-node-sdk");
    }

    return adapters;
  }

  /**
   * 获取默认配置
   * @param {string} adapterType 适配器类型
   * @returns {Object} 默认配置
   */
  static getDefaultConfig(adapterType = "icqq") {
    const configs = {
      icqq: {
        type: "icqq",
        // icqq适配器使用现有的配置文件
      },
      milky: {
        type: "milky",
        authority: "localhost:8080",
        basePath: "/",
        useTLS: false,
        useSSE: false,
      },
    };

    return configs[adapterType] || configs.icqq;
  }
}

export default AdapterFactory;

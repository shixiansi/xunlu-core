import Filemage from "../utils/Filemage.js";
import YamlReader from "../utils/YamlReader.js";
import chokidar from "chokidar";
import _ from "lodash";

const PLUGIN_NAME = "xulu-plugin";
const CONFIG_BASE_PATH = "/config";
const DEFAULT_CONFIG_DIR = "default_config";
const USER_CONFIG_DIR = "config";
const Path = {
  qianyuPath: process.cwd(),
};

class ConfigManager {
  constructor(isWatcher = false) {
    this.configCache = new Map();
    this.fileWatchers = new Map();
    this.isWatcherEnabled = isWatcher;
    this.fileManager = new Filemage(Path.qianyuPath);

    this.defaultConfigPath = `${CONFIG_BASE_PATH}/${DEFAULT_CONFIG_DIR}`;
    this.userConfigPath = `${CONFIG_BASE_PATH}/${USER_CONFIG_DIR}`;

    this.initialize();
  }

  /**
   * 初始化配置系统
   */
  initialize() {
    try {
      this.ensureConfigDirectoryExists();
      this.syncConfigFiles();
      this.syncConfigurationKeys();
    } catch (error) {
      console.error(`[${PLUGIN_NAME}] 配置初始化失败:`, error.message);
      throw error;
    }
  }

  /**
   * 确保配置目录结构正确
   */
  ensureConfigDirectoryExists() {
    if (!this.fileManager.ExistsFile(this.userConfigPath)) {
      this.fileManager.CreatDir(this.userConfigPath);
      this.fileManager.CopyDir(this.defaultConfigPath, this.userConfigPath);
      return;
    }
  }

  /**
   * 同步配置文件结构
   */
  syncConfigFiles() {
    const copyMissingFiles = (sourcePath, targetPath) => {
      const sourceFiles = this.getFileStructure(sourcePath);
      const targetFiles = this.getFileStructure(targetPath);

      const missingItems = this.findMissingFiles(sourceFiles, targetFiles);

      for (const item of missingItems) {
        const sourceItemPath = `${sourcePath}/${item.path}`;
        const targetItemPath = `${targetPath}/${item.path}`;

        if (item.isDirectory) {
          this.fileManager.CopyDir(sourceItemPath, targetItemPath);
        } else {
          this.fileManager.CopyFile(sourceItemPath, targetItemPath);
        }
      }
    };

    copyMissingFiles(this.defaultConfigPath, this.userConfigPath);
  }

  /**
   * 获取文件结构树
   */
  getFileStructure(basePath) {
    const structure = [];

    const scanDirectory = (path, relativePath = "") => {
      const files = this.fileManager.GetfileList(path);

      for (const file of files) {
        const currentRelativePath = relativePath
          ? `${relativePath}/${file}`
          : file;
        const fullPath = `${path}/${file}`;

        if (this.fileManager.isDirectory(fullPath)) {
          structure.push({
            path: currentRelativePath,
            isDirectory: true,
          });
          scanDirectory(fullPath, currentRelativePath);
        } else {
          structure.push({
            path: currentRelativePath,
            isDirectory: false,
          });
        }
      }
    };

    scanDirectory(basePath);
    return structure;
  }

  /**
   * 查找缺失的文件
   */
  findMissingFiles(sourceStructure, targetStructure) {
    const targetPaths = new Set(targetStructure.map((item) => item.path));
    return sourceStructure.filter((item) => !targetPaths.has(item.path));
  }

  /**
   * 同步配置键值
   */
  syncConfigurationKeys() {
    for (const configName of this.defaultConfigList) {
      try {
        const defaultConfig = this.loadConfigData(
          configName,
          this.defaultConfigPath
        );
        const userConfig = this.loadConfigData(configName, this.userConfigPath);

        const missingKeys = this.findMissingKeys(defaultConfig, userConfig);

        for (const key of missingKeys) {
          if (defaultConfig && defaultConfig[key] !== undefined) {
            this.setConfigValue(configName, key, defaultConfig[key]);
          }
        }
      } catch (error) {
        console.warn(
          `[${PLUGIN_NAME}] 同步配置 ${configName} 失败:`,
          error.message
        );
      }
    }
  }

  /**
   * 加载配置数据
   */
  loadConfigData(configName, basePath) {
    const filePath = this.getConfigFilePath(configName, basePath);
    try {
      return new YamlReader(filePath).jsonData;
    } catch (error) {
      console.warn(
        `[${PLUGIN_NAME}] 加载配置文件失败: ${filePath}`,
        error.message
      );
      return null;
    }
  }

  /**
   * 获取配置文件路径
   */
  getConfigFilePath(configName, basePath) {
    const path = configName.includes(".")
      ? configName.replace(".", "/")
      : configName;
    return `${Path.qianyuPath}${basePath}/${path}.config.yaml`;
  }

  /**
   * 查找缺失的配置键
   */
  findMissingKeys(sourceObj = {}, targetObj = {}) {
    if (!sourceObj) return Object.keys(targetObj);
    if (!targetObj) return Object.keys(sourceObj);

    return _.difference(_.keys(sourceObj), _.keys(targetObj));
  }

  // 属性访问器
  get packageInfo() {
    return this.fileManager.getFileDataToJson("package.json");
  }

  get defaultConfigList() {
    return this.getConfigurationList(this.defaultConfigPath);
  }

  get userConfigList() {
    return this.getConfigurationList(this.userConfigPath);
  }

  /**
   * 获取配置列表
   */
  getConfigurationList(configPath) {
    const configList = [];

    const processDirectory = (item) => {
      if (item.isDirectory()) {
        this.fileManager
          .GetfileList(`${configPath}/${item.name}`)
          .filter((file) => file.endsWith(".yaml"))
          .forEach((file) => {
            configList.push(`${item.name}.${file.replace(".config.yaml", "")}`);
          });
      } else if (item.name.endsWith(".yaml")) {
        configList.push(item.name.replace(".config.yaml", ""));
      }
    };

    this.fileManager.GetfileList(configPath, true).forEach(processDirectory);
    return configList;
  }

  /**
   * 获取配置值
   */
  getConfig(configName = "", configType = "user") {
    const basePath =
      configType === "user" ? this.userConfigPath : this.defaultConfigPath;

    // 使用缓存
    if (this.configCache.has(configName)) {
      return this.configCache.get(configName).jsonData;
    }

    const filePath = this.getConfigFilePath(configName, basePath);
    const configReader = new YamlReader(filePath);

    this.configCache.set(configName, configReader);

    // 启用文件监听
    if (this.isWatcherEnabled && !this.fileWatchers.has(configName)) {
      this.setupFileWatcher(configName);
    }

    return configReader.jsonData;
  }

  /**
   * 设置配置值
   */
  setConfigValue(configName, key, value) {
    const config = this.getConfigReader(configName);
    config.set(key, value);
  }

  /**
   * 向数组配置添加值
   */
  addToConfigArray(configName, key, value) {
    const config = this.getConfigReader(configName);
    config.addIn(key, value);
  }

  /**
   * 获取配置读取器
   */
  getConfigReader(configName) {
    if (!this.configCache.has(configName)) {
      this.getConfig(configName);
    }
    return this.configCache.get(configName);
  }

  /**
   * 设置文件监听
   */
  setupFileWatcher(configName) {
    const configFile = `./${this.userConfigPath}/${configName}.config.yaml`;

    const watcher = chokidar.watch(configFile).on("change", () => {
      this.handleConfigChange(configName);
    });

    this.fileWatchers.set(configName, watcher);
  }

  /**
   * 处理配置文件变更
   */
  handleConfigChange(configName) {
    this.configCache.delete(configName);
    console.log(`[${PLUGIN_NAME}] 配置文件已更新: ${configName}`);

    // 重新加载配置
    this.getConfig(configName);
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 关闭所有文件监听器
    for (const [name, watcher] of this.fileWatchers) {
      watcher.close();
    }
    this.fileWatchers.clear();
    this.configCache.clear();
  }
}

// 导出单例实例
export default new ConfigManager(true);

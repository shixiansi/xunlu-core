import { loadPlugins } from "../lib/pluginLoader.js";
import Render from "../utils/render.js";
import path from "path";
import env from "../lib/env.js";
import lodash from "lodash";
import schedule from "node-schedule";
export default class Bot {
  constructor(config) {
    this.adapter = config.adapter;
    this.plugins = {};
    this.groupReply = {};
    this.privateReply = {};
  }

  async loadBotPlugins() {
    try {
      const plugins = await loadPlugins(
        path.join(process.cwd(), "./src/plugins"),
      );

      for (const plugin of plugins) {
        await this.registerPlugin(plugin);
      }

      console.log("插件加载完成，注册命令:", Object.keys(this.plugins));
    } catch (error) {
      console.error("加载插件时出错:", error);
    }
  }

  async renderImg(name, data) {
    return await Render.render(
      name,
      `/html/${name}/${name}.html`,
      {
        ...data,
      },
      {
        retType: "base64",
        beforeRender({ data }) {
          let resPath = data.pluResPath;
          return {
            defaulthtml:
              env.RootPath + "/resources/html/common/" + "default.html",
            ...data,
            _res_path: resPath,
            version: "0.0.1",
            botname: process.env.xunLuEnv,
            imgType: "png",
          };
        },
      },
    );
  }

  async registerPlugin(plugin) {
    if (!plugin.implementation?.register) return;
    let idx = 1;
    const pluginAPI = {
      registerCommand: this.createCommandRegistrar(plugin.name, idx),
      contextReply: this.createContextReplyHandler(),
      setTask: this.collectTimerTasks(),
      callFnc: this.callPluginFnc(),
    };

    plugin.implementation.register(pluginAPI);
  }

  callPluginFnc() {
    return async (name, ctx) => {
      if (!ctx?.sendMsg) {
        ctx = {
          ...ctx,
          ...this.bindEvent,
        };
        delete ctx.reply;
        this.bindEvent.reply(ctx);
      }
      let p = Object.values(this.plugins).find((i) => i.id == name);
      await p.fnc.call(ctx, ctx);
    };
  }

  collectTimerTasks() {
    return (interval, task) => {
      const job = schedule.scheduleJob(interval, () => {
        task();
      });
      return job;
    };
  }

  createCommandRegistrar(pname, idx) {
    return (command, handler) => {
      if (!command || !handler) return;
      console.log(command, handler);
      const commands = Array.isArray(command) ? command : [command];
      this.plugins[`${pname}-${commands[0] == "" ? idx : commands[0]}`] = {
        id: `${pname}-${idx}`,
        reg: commands[0],
        event: lodash.isString(commands[1]) ? commands[1] : "message",
        priority: lodash.isNumber(commands[1])
          ? commands[1]
          : lodash.isNumber(commands[2])
            ? commands[2]
            : 5000,
        fnc: handler,
      };
      idx++;
    };
  }

  createContextReplyHandler() {
    return async (ctx, callback, endMsg) => {
      console.log("上下文回复的ctx", ctx);

      const isPrivate = ctx.isPrivate;
      const contextKey = isPrivate ? ctx.user_id : ctx.group_id;
      const userId = ctx.sender_id;

      if (!contextKey || !userId) {
        console.warn("缺少上下文Key或用户ID");
        return;
      }

      // 初始化数据结构
      this.initContextStorage(isPrivate, contextKey, userId);

      // 处理现有上下文
      if (this.hasExistingContext(isPrivate, contextKey, userId, endMsg)) {
        this.addToContextQueue(isPrivate, contextKey, userId, callback, endMsg);
        return;
      }

      // 创建新上下文
      this.createNewContext(
        isPrivate,
        contextKey,
        userId,
        callback,
        endMsg,
        ctx,
      );
    };
  }

  initContextStorage(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    if (!storage[contextKey]) {
      storage[contextKey] = {};
    }
    if (!storage[contextKey][userId]) {
      storage[contextKey][userId] = [];
    }
  }

  hasExistingContext(isPrivate, contextKey, userId, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply;
    const userContexts = storage[contextKey]?.[userId];

    return (
      userContexts &&
      userContexts.length > 0 &&
      userContexts[0]?.endMsg &&
      endMsg
    );
  }

  addToContextQueue(isPrivate, contextKey, userId, callback, endMsg) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: null,
    };

    storage[contextKey][userId].unshift(newContext);
  }

  createNewContext(isPrivate, contextKey, userId, callback, endMsg, ctx) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    const newContext = {
      cfnc: callback,
      endMsg,
      timer: this.setupTimeout(isPrivate, contextKey, userId, endMsg, ctx),
    };

    storage[contextKey][userId].push(newContext);
  }

  setupTimeout(isPrivate, contextKey, userId, endMsg, ctx) {
    if (endMsg) return null;

    return setTimeout(() => {
      this.clearContext(isPrivate, contextKey, userId);
      if (ctx) {
        ctx.reply("时间超时，已取消。", true).catch(console.error);
      }
    }, 30000);
  }

  clearContext(isPrivate, contextKey, userId) {
    const storage = isPrivate ? this.privateReply : this.groupReply;

    if (storage[contextKey]?.[userId]) {
      delete storage[contextKey][userId];
    }
  }
  async initBot() {
    await this.loadBotPlugins();
  }

  //获取群历史消息（统一通过数据库获取，如果数据库不存在记录，再通过方法获取）
  static async getGroupHistoryMsg(groupId, count, before) {
    return await milkyAdapter.getGroupHistoryMsg({
      groupId,
      count,
      before,
    });
  }
  //制作消息转发
  static async forwardMsg(msgId, groupId, targetGroupId) {}
}

import IcqqMessageEvent from "./icqq/Event/message.js"
import IcqqNoticeEvent from "./icqq/Event/notice.js"
import IcqqRequestEvent from "./icqq/Event/request.js"
import IcqqEventListener, { ListenerLoader as IcqqListenerLoader } from "./icqq/EventListener.js"
import {
  IcqqPluginLoader,
  createIcqqPluginLoader,
  getActiveIcqqPluginLoader,
  resetActiveIcqqPluginLoader,
  setActiveIcqqPluginLoader,
} from "./icqq/pluginLoader.js"
import { createIcqqRuntimeListener } from "./icqq/runtime.js"
import MilkyBotCore from "./milky/index.js"
import MilkyAdapter from "./milky/milky-adapter.js"
import MilkyEventListener from "./milky/event/index.js"
import { createMilkyRuntimeListener } from "./milky/runtime.js"
import OneBotV11BotCore from "./onebotV11/index.js"
import OneBotV11Adapter from "./onebotV11/onebot.js"
import OneBotV11EventListener from "./onebotV11/event/index.js"
import { createOneBotV11RuntimeListener } from "./onebotV11/runtime.js"

export {
  IcqqEventListener,
  IcqqListenerLoader,
  IcqqMessageEvent,
  IcqqNoticeEvent,
  IcqqPluginLoader,
  IcqqRequestEvent,
  MilkyAdapter,
  MilkyBotCore,
  MilkyEventListener,
  OneBotV11Adapter,
  OneBotV11BotCore,
  OneBotV11EventListener,
  createIcqqPluginLoader,
  createIcqqRuntimeListener,
  createMilkyRuntimeListener,
  createOneBotV11RuntimeListener,
  getActiveIcqqPluginLoader,
  resetActiveIcqqPluginLoader,
  setActiveIcqqPluginLoader,
}

export const adapterProtocols = {
  icqq: {
    EventListener: IcqqEventListener,
    ListenerLoader: IcqqListenerLoader,
    MessageEvent: IcqqMessageEvent,
    NoticeEvent: IcqqNoticeEvent,
    PluginLoader: IcqqPluginLoader,
    RequestEvent: IcqqRequestEvent,
    createPluginLoader: createIcqqPluginLoader,
    createRuntimeListener: createIcqqRuntimeListener,
    getActivePluginLoader: getActiveIcqqPluginLoader,
    resetActivePluginLoader: resetActiveIcqqPluginLoader,
    setActivePluginLoader: setActiveIcqqPluginLoader,
  },
  milky: {
    Adapter: MilkyAdapter,
    BotCore: MilkyBotCore,
    EventListener: MilkyEventListener,
    createRuntimeListener: createMilkyRuntimeListener,
  },
  onebotV11: {
    Adapter: OneBotV11Adapter,
    BotCore: OneBotV11BotCore,
    EventListener: OneBotV11EventListener,
    createRuntimeListener: createOneBotV11RuntimeListener,
  },
}

export default adapterProtocols

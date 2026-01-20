/**
 * Milky适配器使用示例
 * 展示如何使用milky标准的QQ机器人适配器
 */

import MilkyAdapter from "./milky-adapter.js";

// 创建Milky适配器实例
const milkyAdapter = new MilkyAdapter({
  authority: "localhost", // Milky服务器地址
  basePath: ":3010", // 基础路径
  accessToken: "", // 访问令牌（可选）
  useTLS: false, // 是否使用TLS
  useSSE: false, // 是否使用SSE
});
const testUserId = 1765629830;
const testGroupId = 428596438;
/**
 * 系统API示例
 */
const msgMap = {};

async function systemApiExamples() {
  try {
    // 获取登录信息
    const loginInfo = await milkyAdapter.getLoginInfo();
    console.log("登录信息:", loginInfo);

    // 获取协议端信息
    const implInfo = await milkyAdapter.getImplInfo();
    console.log("协议端信息:", implInfo);

    // 获取用户个人信息
    const userProfile = await milkyAdapter.getUserProfile({
      user_id: testUserId,
    });
    console.log("用户信息:", userProfile);
  } catch (error) {
    console.error("系统API调用失败:", error);
  }
}

/**
 * 消息API示例
 */
async function messageApiExamples() {
  try {
    // 发送私聊消息
    const privateMsgResult = await milkyAdapter.sendPrivateMessage({
      user_id: testUserId,
      message: [{ type: "text", data: { text: "Hello from Milky适配器!" } }],
    });
    console.log("私聊消息发送结果:", privateMsgResult);

    // 发送群聊消息
    const groupMsgResult = await milkyAdapter.sendGroupMessage({
      group_id: testGroupId,
      message: [
        { type: "text", data: { text: "这是幸运莉莉娅bot作为服务端的bot" } },
      ],
    });
    console.log("群聊消息发送结果:", groupMsgResult);
  } catch (error) {
    console.error("消息API调用失败:", error);
  }
}

/**
 * 好友API示例
 */
async function friendApiExamples() {
  try {
    // 获取好友列表
    const friendList = await milkyAdapter.getFriendList({});
    // console.log("好友列表:", friendList);

    // 获取好友信息
    const friendInfo = await milkyAdapter.getFriendInfo({
      user_id: testUserId,
    });
    // console.log("好友信息:", friendInfo);
  } catch (error) {
    console.error("好友API调用失败:", error);
  }
}

/**
 * 群聊API示例
 */
async function groupApiExamples() {
  try {
    // 获取群列表
    const groupList = await milkyAdapter.getGroupList({});
    console.log("群列表:", groupList);

    // 获取群信息
    const groupInfo = await milkyAdapter.getGroupInfo({
      group_id: testGroupId,
    });
    //  console.log("群信息:", groupInfo);

    // 获取群成员列表
    const memberList = await milkyAdapter.getGroupMemberList({
      group_id: testGroupId,
    });
    // console.log("群成员列表:", memberList);
  } catch (error) {
    console.error("群聊API调用失败:", error);
  }
}

/**
 * 事件监听示例
 */
function eventListenerExamples() {
  // 监听消息事件
  milkyAdapter.on("message_receive", (event) => {
    console.log("收到消息事件:", event);
    msgMap[event.data.message_seq] = event.data;
    // 根据消息类型处理
    if (event.data.message_scene === "friend") {
      console.log("私聊消息:", event);
    } else if (event.data.message_scene === "group") {
      console.log(event.data.segments);

      console.log("群聊消息:", event);
    }
  });

  milkyAdapter.on("message_recall", (event) => {
    console.log("消息撤回事件:", event);
    console.log(msgMap[event.data.message_seq].segments);
    if (msgMap[event.data.message_seq].segments[0].type === "image") {
      msgMap[event.data.message_seq].segments[0].data = {
        uri: msgMap[event.data.message_seq].segments[0].data.temp_url,
        summary: "看什么看你",
        sub_type: "normal",
      };
    }
    milkyAdapter.sendGroupMessage({
      group_id: event.data?.peer_id || event.data?.group?.group_id,
      message: msgMap[event.data.message_seq].segments,
    });
  });

  milkyAdapter.on("group_nudge", (event) => {
    console.log("群戳一戳事件:", event);
    if (Number(event.data.receiver_id) == event.self_id) {
      milkyAdapter.sendGroupNudge({
        group_id: event.data.user_id,
        user_id: Number(event.data.sender_id),
      });
    }
  });

  // 监听好友请求事件
  milkyAdapter.on("friend_request", async (event) => {
    console.log("收到好友请求:", event);
    // 可以在这里自动处理好友请求
  });

  // 监听群请求事件
  milkyAdapter.on("group_request", (event) => {
    console.log("收到群请求:", event);
    // 可以在这里自动处理群请求
  });

  // 监听群成员增加事件
  milkyAdapter.on("group_increase", (event) => {
    console.log("群成员增加:", event);
    // 可以在这里发送欢迎消息
  });

  // 监听群成员减少事件
  milkyAdapter.on("group_decrease", (event) => {
    console.log("群成员减少:", event);
    // 可以在这里发送告别消息
  });

  console.log("事件监听器已设置");
}

/**
 * 工具方法示例
 */
async function utilityExamples() {
  try {
    // 获取Cookies
    const cookies = await milkyAdapter.getCookies({ domain: "qq.com" });
    console.log("Cookies:", cookies);

    // 获取CSRF Token
    const csrfToken = await milkyAdapter.getCSRFToken();
    console.log("CSRF Token:", csrfToken);
  } catch (error) {
    console.error("工具方法调用失败:", error);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log("=== Milky适配器使用示例 ===");

  // 设置事件监听器
  eventListenerExamples();

  // 执行API示例
  await systemApiExamples();
  await messageApiExamples();
  await friendApiExamples();
  await groupApiExamples();
  await utilityExamples();

  console.log("=== 示例执行完成 ===");

  // 保持程序运行以接收事件
  console.log("程序运行中，按 Ctrl+C 退出...");
}

// 错误处理
process.on("unhandledRejection", (error) => {
  console.error("未处理的Promise拒绝:", error);
});

process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("正在退出...");
  milkyAdapter.dispose();
  process.exit(0);
});

// 运行示例

main().catch(console.error);

export default milkyAdapter;

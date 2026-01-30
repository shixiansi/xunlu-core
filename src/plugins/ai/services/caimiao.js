import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import config from "../../../lib/config.js";
class CaimiaoAI {
  constructor() {
    this.proxyAgent = this.proxy ? new HttpsProxyAgent(this.proxy) : null;
  }

  get xToken() {
    return config.getConfig("ai").caimiao["x-token"];
  }

  get proxy() {
    return config.getConfig("ai").caimiao["proxy"];
  }

  get headers() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
      "x-client_type": 4,
      "x-device_id": "ee4eba82-7c0a-4933-87aa-5f425e2be2c5",
      "x-screen_resolution": "1920x1080",
      "x-timezone": 8,
      "x-token": this.xToken,
      referer: "https://anuneko.ai/",
    };
  }

  async getChatList() {
    let rep = await fetch(
      "https://anuneko.ai/api/v1/chat/list?cursor=&size=30",
      {
        method: "GET",
        headers: this.headers,
        agent: this.proxyAgent,
      },
    );
    return await rep.json();
  }

  async getNewChat() {
    let rep = await fetch("https://anuneko.ai/api/v1/chat", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ is_chose_persona: false, model: "Orange Cat" }),
      agent: this.proxyAgent,
    });

    return await rep.json();
  }

  async chat(chat_id, text, options = {}) {
    let rep2 = await fetch(`https://anuneko.ai/api/v1/msg/${chat_id}/stream`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        contents: this.splitStringByLength(text, 2000),
      }),
      agent: this.proxyAgent,
    });

    if (!rep2.ok) {
      throw new Error(`HTTP error! status: ${rep2.status}`);
    }

    return new Promise((resolve, reject) => {
      let buffer = "";
      const choices = {}; // 存储不同候选的回答
      let selectedChoiceIndex = 0; // 默认选择第一个候选
      let fullText = "";
      let msg_id = null;

      rep2.body.on("data", (chunk) => {
        buffer += chunk.toString();
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        events.forEach((eventStr) => {
          if (eventStr.trim() === "") return;

          const lines = eventStr.split("\n");
          let eventType = "message"; // 默认事件类型
          let eventData = null;

          // 解析事件类型和数据
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (dataStr === "") continue;

              try {
                eventData = JSON.parse(dataStr);
                console.log("eventData:数据", eventData);
              } catch (e) {
                console.warn(
                  "解析JSON数据失败:",
                  e.message,
                  "原始数据:",
                  dataStr,
                );
                return;
              }
            }
          }

          if (!eventData) return;

          // 根据不同事件类型处理数据
          switch (eventType) {
            case "usermsg":
              console.log("用户消息事件:", eventData);
              break;

            case "start":
              console.log("流开始，候选数量:", eventData.choice_num);
              break;

            case "delta":
              // 处理多候选响应数据
              if (eventData.c && Array.isArray(eventData.c)) {
                eventData.c.forEach((choice, index) => {
                  if (!choices[index]) {
                    choices[index] = "";
                  }
                  if (choice.v !== undefined) {
                    choices[index] += choice.v;

                    // 实时回调处理
                    if (options.onProgress) {
                      options.onProgress(choice.v, choices[index], index);
                    }

                    // 如果是被选中的候选，也累积到fullText中
                    if (index === selectedChoiceIndex) {
                      fullText += choice.v;
                    }
                  }
                });
              } else {
                fullText += eventData.v;
              }
              break;

            case "stop":
              // 处理停止事件，记录被选中的候选
              if (eventData.choice_idx !== undefined) {
                selectedChoiceIndex = eventData.choice_idx;
                console.log(
                  `流结束，选择候选 ${selectedChoiceIndex}，原因:`,
                  eventData.finish_reason,
                );

                // 使用被选中的候选内容
                if (choices[selectedChoiceIndex] !== undefined) {
                  fullText = choices[selectedChoiceIndex];
                }
              } else {
                console.log("流结束，原因:", eventData.finish_reason);
              }
              break;

            case "assistmsg":
              msg_id = eventData.msg_id;
              console.log("助手消息事件:", eventData);
              break;

            case "error":
              let { code, detail } = eventData;
              if (code == "chat_choice_shown") {
                detail = "有尚未选择的选项，请选择！";
              }
              resolve({ code, detail });

            default:
              console.log("未知事件类型:", eventType, eventData);
          }
        });
      });

      rep2.body.on("end", () => {
        // 处理缓冲区剩余数据
        if (buffer.trim() !== "") {
          const lines = buffer.split("\n");
          let eventType = "message";
          let eventData = null;

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (dataStr === "") continue;

              try {
                eventData = JSON.parse(dataStr);
              } catch (e) {
                console.warn("解析最后数据失败:", e.message);
              }
            }
          }

          if (eventData && eventData.c && Array.isArray(eventData.c)) {
            eventData.c.forEach((choice, index) => {
              if (choice.v !== undefined && index === selectedChoiceIndex) {
                fullText += choice.v;
              }
            });
          }
        }

        resolve({ text: fullText, msg_id });
      });

      rep2.body.on("error", reject);
    });
  }

  splitStringByLength(str, length) {
    if (length <= 0 || typeof length !== "number") {
      throw new Error("长度必须是大于0的数字");
    }

    const result = [];
    for (let i = 0; i < str.length; i += length) {
      result.push(str.substring(i, i + length));
    }
    return result;
  }

  async choice(choice_idx, msg_id) {
    let rep = await fetch(`https://anuneko.ai/api/v1/msg/select-choice`, {
      method: "POST",
      body: JSON.stringify({
        choice_idx,
        msg_id,
      }),
      headers: { ...this.headers, "Content-Type": "text/plain;charset=UTF-8" },
      agent: this.proxyAgent,
    });
    if (rep.ok) return true;
  }

  async getmessageslist(chat_id, size = 20) {
    let rep = await fetch(
      `https://anuneko.ai/api/v1/chat/${chat_id}/messages?cursor=&chat_id=${chat_id}&size=${size}`,
      {
        method: "GET",
        headers: this.headers,

        agent: this.proxyAgent,
      },
    );
    return await rep.json();
  }
}
// let cai = new CaimiaoAI();
// console.log(cai.xToken);

// let { list } = await cai.getChatList();
// console.log(list);

// let res = await cai.chat(list[0].chat_id, "结果呢？");
// console.log(res);

export default CaimiaoAI;

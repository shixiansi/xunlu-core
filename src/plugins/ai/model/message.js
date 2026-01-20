import MessageDB from "../../../db/MessageDB.js";
import moment from "moment";
function getTimeRange(days) {
  if (!days || days < 1) {
    throw new Error("天数必须大于等于1");
  }

  // 获取当前时间作为结束时间[2,6](@ref)
  const endTime = moment();

  let startTime;

  if (days === 1) {
    // 如果天数为1，获取今天0点0分0秒[5,8](@ref)
    startTime = moment().startOf("day");
  } else {
    // 如果天数大于1，获取days天前的0点0分0秒[5,6](@ref)
    startTime = moment()
      .subtract(days - 1, "days")
      .startOf("day");
  }

  // 返回时间戳数组（毫秒）[8,9](@ref)
  return [
    Math.floor(startTime.valueOf() / 1000), // 开始时间戳
    Math.floor(endTime.valueOf() / 1000), // 结束时间戳（当前时间）
  ];
}

async function getGroupMsgByType(groupId, day, type = "text") {
  let [startTime, endTime] = getTimeRange(day);
  let msglist = await MessageDB.getGroupMsgByDay(groupId, startTime, endTime);
  msglist = msglist.map((m) => {
    return {
      nickname: m.sender.nickname,
      user_id: m.user_id,
      time: m.time,
      message: m.message,
    };
  });
  msglist = msglist.filter((u) => {
    let msg = u.message.filter((i) => i.type == type);
    switch (type) {
      case "text":
        u.message = msg.map((i) => i.data.text).join("");
        return msg.length > 0;
    }
  });
  return msglist;
}

console.log(await getGroupMsgByType(428596438, 2));

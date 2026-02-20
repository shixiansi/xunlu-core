# 消息体

## 群消息

```json
{
  post_type: 'message',
  message_type: 'group',
  sub_type: 'normal',  
  message_id: 'GYvc1mk9X4YAAVWpQeMoCml+4xUB', //icqq独有
  nt: true, //喵仔独有
  user_id: 1765629830, 
  time: 1769923349,
  seq: 87465,
  rand: 1105405962,
  msg_id: 72057595143333898n,
  group_id: 428596438,
  group_name: '今天你做梦了吗？',
  font: '宋体',
  message: [ { type: 'text', text: '来张色图' } ], // 固定为message
  raw_message: '来张色图',   //预览消息
  sender: {
    user_id: 1765629830,
    user_uid: 'u_WbeLJK4S7JwYcSg7qmrD3w',
    nickname: '戒色第一天',
    sub_id: 537335433,
    card: '戒色第一天',
    sex: 'unknown',
    age: 0,
    area: '',
    level: 76,
    role: 'admin',
    title: ''
  },//发送者信息
  atme: false, //at机器人
  atall: false, //at全体
  group: Group {},
  member: Member {},
  reply: [AsyncFunction (anonymous)], 
  recall: [Function (anonymous)],
  self_id: 2890250590, //本身id
  msg: '来张色图',  //格式化的消息
  logText: '[今天你做梦了吗？(戒色第一天)]',
  isGroup: true,  //是否群聊
  isMaster: true,  //是否主人
  replyNew: [Function (anonymous)],  //云崽定义
  sendGroupMessageReaction: [Function (anonymous)], //自定义的群表情回应
  recallMessage: [Function: recallMessage], //自定义的撤回消息
  sendMessage: [AsyncFunction (anonymous)], //自定义的发送消息
  getMsg: [AsyncFunction (anonymous)], //自定义的获取消息
  renderImg: [AsyncFunction: renderImg] //自定义的截图方法
}
```


// test-with-text-file.js
import { UniversalMessage, UniversalMessageSegment } from "./universal-message.js"

// 1. 创建通用消息实例
const msg = new UniversalMessage()

// 2. 新增：添加文本消息段（两种方式）
msg.addText("你好，这是测试文本！") // 便捷方法
msg.addSegment(UniversalMessageSegment.text("这是第二个文本段")) // 手动创建

// 3. 新增：添加文件消息段（两种方式）
msg.addFile({
  path: "./test.pdf",
  name: "测试文件.pdf",
  size: 1024 * 1024, // 1MB
}) // 便捷方法
msg.addSegment(
  UniversalMessageSegment.file({
    url: "https://example.com/test.zip",
    name: "远程文件.zip",
    size: 2048 * 1024, // 2MB
  }),
) // 手动创建

// 4. 保留原有类型（验证兼容性）
msg.addMention("123456", "张三")
msg.addMentionAll()
// 5. 转换为各协议格式
console.log("=== OnebotV11 格式 ===")
console.log(JSON.stringify(msg.convertTo("onebotv11"), null, 2))

console.log("\n=== Milky 格式 ===")
console.log(JSON.stringify(msg.convertTo("milky"), null, 2))

console.log("\n=== ICQQ 格式 ===")
console.log(JSON.stringify(msg.convertTo("icqq"), null, 2))

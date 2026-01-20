/**
 * @Author: 时先思
 * @Date: 2025-12-13 13:57:24
 * @LastEditTime: 2026-01-13 00:41:33
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\utils\logger.js
 * @版权声明
 **/
export function info(...args) {
  console.log("[info]", ...args);
}
export function error(...args) {
  console.error("[error]", ...args);
}
export function warn(...args) {
  console.error("[warn]", ...args);
}
export function debug(...args) {
  console.error("[debug]", ...args);
}
export function mark(...args) {
  console.error("[mark]", ...args);
}

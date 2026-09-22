/**
 * 集成测试专用配置：只跑 *.integration.test.ts，真实访问外网。
 *
 * 两个关键点（都踩过坑）：
 *
 * 1) 必须用 Node 环境。jest-expo 预设默认是 React Native 环境，全局 fetch 是
 *    whatwg-fetch polyfill，底层 XMLHttpRequest 在 jest 下不存在 —— 请求根本发不出去，
 *    却“成功返回”一个 status=undefined 的假响应，集成测试会变成假通过。
 *
 * 2) 不能靠 `preset: 'jest-expo' + setupFiles: []` 来清掉 RN setup。
 *    jest 合并 preset 时对 setupFiles 这类数组字段是**拼接**，空数组覆盖不掉，
 *    RN 的 setup 仍会装入伪造的 FetchResponse。
 *    所以这里手动展开预设，再显式覆盖 setupFiles。
 */

const preset = require('jest-expo/jest-preset.js');

module.exports = {
  ...preset,
  testEnvironment: 'node',
  setupFiles: [],
  testMatch: ['**/*.integration.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};

// 用与浏览器完全相同的拼接顺序求值源码。
// 测试因此跑的正是浏览器看到的那份代码，而不是另一套加载路径；
// 加载器拼错顺序时，五套测试会一起红，不会有人只在浏览器里踩到。
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sources = JSON.parse(readFileSync(new URL("sources.json", root), "utf8"));
const source = sources.map(file => readFileSync(new URL(file, root), "utf8")).join("\n");

// 为什么用 new Function 而不是 node:vm：
// vm.createContext 会开一个新 realm，里面的 [] 和 {} 拿到的是那个 realm 的
// Array/Object 原型。assert.deepStrictEqual 连原型一起比，于是 ['envoy','scout']
// 和 ['envoy','scout'] 会判不相等 —— 四套测试会以「内容完全一样却不等」的形式集体报错。
// 把源码包进一个函数在本 realm 求值，内建对象就是同一套；这也正好等价于
// build_single.py 打出的那个「所有源码在同一个 <script> 里」的单文件版。
const module = { exports: {} };
new Function("module", `${source}\n`)(module);

export default module.exports;
export const bundledSource = source;
export const sourceFiles = sources;

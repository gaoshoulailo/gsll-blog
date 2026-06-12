---
title: 雷池 WAF 人机验证逆向分析
tags: [技术分享]
categories: [技术分享]
cover: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/14.jpg
top_img: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/14.jpg
date: 2026-06-12 19:43:00
---
# 雷池 WAF 人机验证逆向分析

> 目标：绕过 SafeLine（雷池）WAF 的人机验证，获取 `sl-challenge-jwt` Cookie 参数。  
> 网站链接:aHR0cDovL3d3dy5senl5LmNuOjYwMDQvdXNyd2ViL2x6eXkvaHRkb2NzL3NyY25ldzJfb2xkL2xvZ2luLnBocA==
---

## 一、页面入口与控制台反调试

打开目标网站，浏览器控制台被检测到不完整，页面功能异常。

![打开网站](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_1.png)

![控制台被检测到](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_2.png)

**绕过方法**：定位到检测函数，将其替换为空函数即可跳过。

![发现检测函数并替换](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_3.png)

---

## 二、Cookie 参数分析

绕过控制台检测后，发现页面请求的 Cookie 中包含 **3 个关键参数**：

![Cookie 中的 3 个参数](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_4.png)

| 参数 | 来源 | 特点 |
|------|------|------|
| `sl-session` | 第一个返回 **468** 状态码的响应 `Set-Cookie` | 每次会话生成 |
| `sl-challenge-server` | 固定值（`local` 或 `cloud`） | 不变 |
| `sl-challenge-jwt` | `/challenge/v2/api/verify` 响应 | **核心目标** |

因此，只需逆向出 `sl-challenge-jwt` 的生成逻辑即可。

---

## 三、WASM 计算模块逆向

### 3.1 定位 verify 请求

搜索 `result` 关键字，定位到 verify 请求的构造位置：

![搜索 result 定位](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_5.png)

### 3.2 跟栈定位 WASM

断点跟栈，发现此处调用了 `WebAssembly.instantiate` 来编译和执行 WASM 模块。`WebAssembly.instantiate` 的作用是将二进制的 `.wasm` 代码编译成可调用的模块。先把 `calc.wasm` 文件下载下来。

![断点查看 WASM 调用](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_6.png)

### 3.3 还原调用逻辑

依据网页的调用方式，提取核心计算函数：

```typescript
function createCalcFn(wasmInstance) {
    const exports = wasmInstance.instance.exports;
    return function(e) {
        exports.reset();                          // 1. 重置状态
        e.map(function(e) {
            return exports.arg(e);                // 2. 逐个喂入参数
        });
        return Array(exports.calc())              // 3. calc() 返回结果数量
            .fill(-1)
            .map(function() {
                return exports.ret();             // 4. 逐个取出结果
            });
    };
}
```

这是一个典型的 **WASM 栈式计算模式**：`reset → arg×N → calc → ret×N`。

### 3.4 查看入参

断点查看传入 `arg()` 的数组值：

![查看入参](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_7.png)

### 3.5 本地验证

在本地 Node.js 环境加载 `calc.wasm` 并执行，将计算结果与网页结果对比：

![本地测试](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_8.png)

![网页结果](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_9.png)

**结论：两者完全一致，WASM 计算模块成功还原。**

---

## 四、issue_id 与 data 参数溯源

### 4.1 来源分析

搜索发现，`data` 列表（即 WASM 入参）由 `/challenge/v2/api/issue` 接口返回：

![issue 请求](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_10.png)

同时，`issue_id` 也包含在该请求的响应中。

### 4.2 请求参数来源

继续搜索，找到 issue 请求的参数同样来自 **第一个 468 响应的页面**：

![468 响应中的参数](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_11.png)

---

## 五、serials 参数逆向（鼠标轨迹）

### 5.1 问题现状

至此，已知参数的来源总结：

| 参数 | 状态 |
|------|------|
| `sl-session` | 468 响应 `Set-Cookie` 直接获取 |
| `client_id` | 468 响应页面中提取 |
| `data` + `issue_id` | POST `/api/issue` 接口返回 |
| `result` | WASM 对 `data` 的计算结果 |
| `serials`（即 `r`） | **待逆向** |
| `visitorId` | 浏览器指纹，每次刷新不变，暂可忽略 |

### 5.2 逆向过程

查看 `r` 参数的值，发现是一个 **二维数组**：

![r 参数内容](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_12.png)

往上跟栈追溯：

![跟栈](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_13.png)

发现变量 `s` 就是这串二维数组。继续跟栈，找到 `s` 的定义位置：

![s 的定义](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_14.png)

定位到 `addEventListener` 事件监听函数，跟进 `x` 函数，找到 `s` 赋值的位置。

**断点验证**：鼠标点击时，代码进入断点，确认 `serials` 的值就是**鼠标滑动轨迹**。

![断点验证鼠标轨迹](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E9%9B%B7%E6%B1%A0level2_15.png)

### 5.3 轨迹格式

每个轨迹点格式为：`[相对时间偏移(ms), ceil(clientX), ceil(clientY)]`

Python 自动生成方法参见 `generate_serials.py`。

---

## 六、总结

### 完整请求流程

```
浏览器访问目标页面
  │
  ├─ [468 响应] 获取 sl-session + client_id
  │
  ├─ POST /challenge/v2/api/issue
  │     body: { client_id, level }
  │  → 返回 { issue_id, data }
  │
  ├─ GET /challenge/v2/calc.wasm
  │
  ├─ WASM 计算: reset() → arg(data[i]) → calc() → ret()
  │  → 得到 result 数组
  │
  ├─ 采集滑块轨迹 serials (Level 2)
  │  → 格式: [[Δt, ceil(x), ceil(y)], ...]
  │
  ├─ POST /challenge/v2/api/verify
  │     body: { issue_id, result, serials, client: { ... } }
  │  → 返回 { jwt }
  │
  └─ Set-Cookie: sl-challenge-jwt={jwt}
     → 携带此 Cookie 即可正常访问
```

[//]: # (### 文件清单)

[//]: # ()
[//]: # (| 文件 | 说明 |)

[//]: # (|------|------|)

[//]: # (| `demo.py` | 初始页面请求示例 |)

[//]: # (| `demo.js` | WASM 本地调用示例 |)

[//]: # (| `wasm.js` | Parcel 打包的 Web Worker 脚本 |)

[//]: # (| `challenge.js` | 人机验证前端完整脚本 |)

[//]: # (| `calc.wasm` | WASM 计算模块 |)

[//]: # (| `generate_serials.py` | 鼠标轨迹自动生成器 |)

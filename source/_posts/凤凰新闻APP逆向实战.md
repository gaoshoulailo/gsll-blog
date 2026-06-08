# X凰新闻 APP 逆向实战 — 绕过 libmsaoaidsec.so 反调试与签名定位

> **App 版本：** 8.00.5  
> **包名：** `com.ifeng.news2`  
> **环境：** Pixel 6 (Android 15) / Frida 17.6.1  
> **工具：** jadx-gui、IDA Pro、Frida

---

## 目录

- [一、反调试初探：定位检测 SO](#一反调试初探定位检测-so)
- [二、深入 SO 加载流程](#二深入-so-加载流程)
- [三、绕过 libmsaoaidsec.so 反调试](#三绕过-libmsaoaidsecso-反调试)
  - [3.1 快速查壳与脱壳](#31-快速查壳与脱壳)
  - [3.2 IDA 静态分析获取关键偏移](#32-ida-静态分析获取关键偏移)
  - [3.3 动态查找 linker64 的 call_constructors](#33-动态查找-linker64-的-call_constructors)
  - [3.4 核心绕过原理与完整脚本](#34-核心绕过原理与完整脚本)
- [四、Java 层 Hook 的时机问题与解决](#四java-层-hook-的时机问题与解决)
  - [4.1 Java.perform 执行时机过早导致 ClassNotFoundException](#41-javaperform-执行时机过早导致-classnotfoundexception)
  - [4.2 用 HashMap Hook 验证反编译完整性并发现目标 URL](#42-用-hashmap-hook-验证反编译完整性并发现目标-url)
- [五、定位签名生成逻辑](#五定位签名生成逻辑)
  - [5.1 jadx 静态分析找到签名入口](#51-jadx-静态分析找到签名入口)
  - [5.2 st 参数的生成逻辑](#52-st-参数的生成逻辑)
  - [5.3 多层级 Frida Hook 分析签名链路](#53-多层级-frida-hook-分析签名链路)
- [六、总结](#六总结)

---

## 一、反调试初探：定位检测 SO

使用 Frida spawn 方式启动 App 后，进程在几秒内就被杀死：

```bash
frida -U -f com.ifeng.news2 -l hook.js
# 输出 hello 后进程闪退，Frida 会话断开
```

首先需要确定是哪个 SO 在执行反调试检测。Hook `android_dlopen_ext` 监控所有 SO 的加载顺序：

```typescript
function hookDlopen() {
    const addr = Module.findGlobalExportByName("android_dlopen_ext");
    Interceptor.attach(addr, {
        onEnter(args) {
            const path = args[0].readCString();
            if (path !== null && path.includes(".so")) {
                console.log(`[dlopen] ${path}`);
            }
        }
    });
}
setImmediate(hookDlopen);
```

**关键发现：** `libmsaoaidsec.so` 被加载之后，进程立即被杀。反调试检测代码就在这个 SO 中。

---

## 二、深入 SO 加载流程

在编写绕过脚本之前，必须理解 Android 系统加载 SO 的完整顺序：

```
Java 层:     System.loadLibrary("xxx")
               │
               ▼
ART Runtime: Runtime.nativeLoad(filename, ClassLoader, searchPath)
               │
               ▼
libc:         dlopen() → do_dlopen()
               │
               ▼
linker64:     ┌─ find_library — 检查 SO 是否已加载
              ├─ mmap — 将 ELF 文件按 PT_LOAD 段映射到内存
              ├─ 符号解析 — 处理 .dynsym 和重定位表 (.rel.dyn / .rel.plt)
              │
              ├─ ★ 执行 .init_proc (DT_INIT 段)    ← 反调试最早触发点！
              │
              ├─ 执行 .init_array (DT_INIT_ARRAY)   ← C++ 全局对象构造函数
              │
              └─ 执行 JNI_OnLoad                    ← 最后调用，注册 Native 方法
```

> **关键认知：** 反调试通常在 `.init_proc` 阶段就已创建检测线程。等 `JNI_OnLoad` 执行时，Hook 时机早已错过。

**验证：** 尝试 Hook `JNI_OnLoad`，日志没有任何输出 → 确认检测代码在 `.init_proc` 中。

---

## 三、绕过 libmsaoaidsec.so 反调试

### 3.1 快速查壳与脱壳

![壳检测](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/ifeng%E5%A3%B3%E6%A3%80%E6%B5%8B.png)

APK 带加固壳，先用脱壳工具（如 FART / Youpk / Frida-dexdump）对 Dex 进行整体脱壳。脱壳后的 Dex 才是真正可以静态分析的代码。

### 3.2 IDA 静态分析获取关键偏移

用 IDA Pro 打开从 APK `lib/arm64-v8a/` 中提取的 `libmsaoaidsec.so`，在 Exports 窗口获取两个关键偏移：

| 导出函数 | 偏移 |
|---------|------|
| `.init_proc` | `0x12F18` |
| `JNI_OnLoad` | `0x13328` |

### 3.3 动态查找 linker64 的 call_constructors

网上文章通常给一个硬编码偏移（如 `0x52838`），但这个值**随 Android 版本变化**。更稳健的做法是通过符号表动态查找。Pixel 6 上 linker64 的符号未被 strip：

```typescript
function findCallConstructors(): NativePointer | null {
    const linker = Process.findModuleByName("linker64");
    if (!linker) return null;

    for (const sym of linker.enumerateSymbols()) {
        if (sym.name.includes("call_constructor")) {
            console.log(`[+] 符号名: ${sym.name}`);
            console.log(`    偏移:   ${sym.address.sub(linker.base)}`);
            return sym.address;
        }
    }
    return null;
}
```

**本机运行结果：**

```
符号名: __dl__ZN6soinfo17call_constructorsEv
偏移:   0x662b0
```

### 3.4 核心绕过原理与完整脚本

#### 原理

`call_constructors` 是 linker64 内部函数，负责调用 SO 的 `.init_proc` 和 `.init_array`。在它的 `onEnter` 回调中：

- SO 已映射到内存（`Process.findModuleByName` 可以找到）
- `.init_proc` **还没有被执行**
- 这是一个"时间静止"的安全窗口

在此窗口内，用 `Interceptor.replace` 将 `init_proc` 和 `JNI_OnLoad` 替换为空函数。**不修改 SO 的 .text 段**，因此不会触发 CRC 完整性校验（这是很多新版加固的防御手段）。

```
正常流程:   init_proc 执行 → 3 个检测线程创建 → 反调试生效 → 进程被杀

绕过流程:   call_constructors.onEnter
              ├── Interceptor.replace(init_proc, 空函数)
              ├── Interceptor.replace(JNI_OnLoad, 假函数 → 返回 0x10006)
              └── linker 随后调用的 init_proc 实际上是个空函数
                   → 检测线程从未创建 ✅
```

#### 完整绕过脚本

```typescript
// agent.ts — 编译: frida-compile agent.ts -o _agent.js -S -c

const TARGET_SO   = "libmsaoaidsec.so";
const INIT_PROC   = 0x12F18;   // .init_proc
const JNI_ONLOAD  = 0x13328;   // JNI_OnLoad

function findCallConstructors(): NativePointer | null {
    const linker = Process.findModuleByName("linker64");
    if (!linker) return null;
    console.log(`[+] linker64 基址: ${linker.base}`);

    for (const sym of linker.enumerateSymbols()) {
        if (sym.name.includes("call_constructor")) {
            const offset = sym.address.sub(linker.base);
            console.log(`[+] 符号名: ${sym.name}, 偏移: ${offset}`);
            return sym.address;
        }
    }
    console.log("[!] 符号被 strip，需要手动用 IDA 分析 linker64");
    return null;
}

function installConstructorHook(addr: NativePointer): void {
    let done = false;

    Interceptor.attach(addr, {
        onEnter(_args) {
            if (done) return;
            const mod = Process.findModuleByName(TARGET_SO);
            if (mod === null) return;
            done = true;

            console.log("[+] 命中 call_constructors，开始替换...");

            // 替换 init_proc 为空函数 → 反调试线程永远不会创建
            Interceptor.replace(
                mod.base.add(INIT_PROC),
                new NativeCallback(() => {}, "void", [])
            );

            // 替换 JNI_OnLoad → 在回调中执行自定义 Hook
            Interceptor.replace(
                mod.base.add(JNI_ONLOAD),
                new NativeCallback(
                    (_vm: NativePointer, _reserved: NativePointer): number => {
                        console.log("[√] JNI_OnLoad 已被替换，反调试绕过成功");
                        runCustomHooks();   // ★ 在这里执行所有自定义 Hook
                        return 0x10006;     // JNI 1.6
                    },
                    "int", ["pointer", "pointer"]
                )
            );
        }
    });
}

const callCtorAddr = findCallConstructors();
if (callCtorAddr !== null) {
    installConstructorHook(callCtorAddr);
}
console.log("[*] Agent 已就绪，等待目标 SO 加载...\n");
```

#### 执行时间线

```
脚本加载 → findCallConstructors() → 找到 0x662b0
        → Interceptor.attach(call_constructors)   // 埋 Hook

进程恢复 → 加载各种 SO
        → 加载 libmsaoaidsec.so
        → linker64 准备调用 init_proc
          → call_constructors.onEnter 触发！
            ├── Interceptor.replace(init_proc, 空函数)
            └── Interceptor.replace(JNI_OnLoad, 假函数)
        → linker 调用 "假 init_proc" → 空函数直接返回
        → linker 调用 "假 JNI_OnLoad" → runCustomHooks() 执行
```

---

## 四、Java 层 Hook 的时机问题与解决

### 4.1 Java.perform 执行时机过早导致 ClassNotFoundException

最初把 `Java.perform` 放在脚本底部立即注册，ART 就绪后立即触发，但此时 App 的业务类还没被 ClassLoader 加载：

```
[+] Java 环境就绪，开始注入 Java 层 Hook ...
Error: java.lang.ClassNotFoundException: Didn't find class "com.igexin.push.core.a.b.b"
```

**根本原因：** `Java.perform` 只等 ART VM 就绪，不等待具体类加载。

**解决方案：** 将 `Java.perform` 延迟到 `JNI_OnLoad` 替换回调中执行。此时反调试已被绕过，App 已充分初始化，大部分业务类已加载：

```typescript
// 在 JNI_OnLoad 替换回调中调用，而非脚本底部
(_vm, _reserved) => {
    runCustomHooks();   // 在此处执行 Java.perform
    return 0x10006;
}
```

### 4.2 用 HashMap Hook 验证反编译完整性并发现目标 URL

由于直接搜索 `"sn"` 关键字未在脱壳后的 Dex 中定位到目标代码，怀疑签名逻辑可能不在已脱壳的 Dex 中（或者类名被混淆）。先用 `HashMap.put` Hook 做一次"广撒网"，验证目标代码是否在已脱壳的 Dex 中运行：

```typescript
Java.perform(() => {
    const HashMap = Java.use("java.util.HashMap");
    let count = 0;

    HashMap.put.implementation = function (key: Java.Wrapper<any>, value: Java.Wrapper<any>) {
        count++;
        const keyStr = key !== null ? String(key) : "";

        if (keyStr.includes("nine.ifeng.com") || keyStr.includes("ifeng.com")) {
            console.log(`[HashMap #${count}] key=${keyStr.substring(0, 200)}`);
        }
        return this.put(key, value);
    };
});
```

**成功命中目标 URL：**

```
https://nine.ifeng.com/channelList?id=JS83&ch=mil&action=down&...
```

这说明：**请求构造和参数拼接的代码确实在已脱壳的 Dex 中**。URL 中的关键参数包括：

| 参数 | 值示例 | 推测含义 |
|------|--------|---------|
| `st` | `17808298599791` | 14 位毫秒时间戳 |
| `sn` | `552c203bebf3dbafa...` | 32 位十六进制 MD5 签名 |
| `sessionStartTime` | `1780829733132` | Session 开始时间戳 |
| `grayv` | `296834e3c4` | 灰度版本/实验标识 |
| `uid` / `deviceid` / `uid2` / `vuid` | 多个 ID | 设备指纹相关 |

接下来用 jadx 精确定位 `sn` 的生成逻辑。

---

## 五、定位签名生成逻辑

### 5.1 jadx 静态分析找到签名入口

在 jadx 中搜索 `com.ifeng.news2.util` 包，找到签名生成的核心方法 `b()`：

```java
// com.ifeng.news2.util.XXX.b()
public String b(String str, boolean z) {
    String str2;
    String str3 = z ? this.m : "";
    try {
        str2 = this.a + this.e + this.j + this.c + this.l
             + str3 + str + NativeSecureparam.readMD5Key();
    } catch (Throwable unused) {
        str2 = this.a + this.e + this.j + this.c + this.l + str3 + str;
    }
    return com.qad.util.j.b(str2).toLowerCase();
}
```

**算法公式：**

```
sn = md5(
    this.a + this.e + this.j + this.c + this.l
    + (z ? this.m : "")
    + str
    + NativeSecureparam.readMD5Key()
).toLowerCase()
```

| 组成部分 | 来源 | 说明 |
|---------|------|------|
| `this.a / e / j / c / l` | 实例字段 | URL 片段、设备信息、版本号等 |
| `this.m` | 实例字段 | 条件字段（仅当参数 `z=true` 时参与） |
| `str` | 方法入参 | 经 Hook 验证，传入的是 URL 中的 `st` 参数值 |
| `readMD5Key()` | Native 方法 | 从 SO 中读取的 secret key |
| `j.b()` | 工具方法 | MD5 哈希（`com.qad.util.j`） |

![关键分析](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/ifeng%E5%AF%B9%E6%AF%94%E7%94%9F%E6%88%90%E5%8F%82%E6%95%B0.png)

**Hook 验证：** 对 `b()` 方法进行 Hook 后，与网络请求中的参数对比，确认传入的 `str` 参数正是 URL 中的 `st`。

### 5.2 st 参数的生成逻辑

![st的生成逻辑](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/ifeng_st%E7%9A%84%E7%94%9F%E6%88%90%E9%80%BB%E8%BE%91.png)

`st` 不是简单的 `System.currentTimeMillis()`。在 jadx 中进一步分析 `st` 的赋值处，发现它有自己的生成规则（可能包含服务端下发的时间校准偏移量），需要进一步分析对应的类和方法。

### 5.3 多层级 Frida Hook 分析签名链路

验证完 `b()` 方法和 `st` 参数的关系后，用三层 Hook 联动，完整还原从"拼接原文"到"最终签名"的全过程。

#### 第一层：Hook b() 方法获取实例字段

![sn位置](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/ifeng_st%E7%9A%84%E7%94%9F%E6%88%90%E9%80%BB%E8%BE%91.png)

```typescript
Java.perform(() => {
    const Cls = Java.use("com.ifeng.news2.util.XXX");  // jadx 确认完整类名

    Cls.b.implementation = function (str: string, z: boolean): string {
        console.log(`\n[签名入口 b()]`);
        console.log(`  str (传入参数) = ${str}`);
        console.log(`  z              = ${z}`);
        console.log(`  this.a         = ${this.a.value}`);
        console.log(`  this.e         = ${this.e.value}`);
        console.log(`  this.j         = ${this.j.value}`);
        console.log(`  this.c         = ${this.c.value}`);
        console.log(`  this.l         = ${this.l.value}`);
        console.log(`  this.m         = ${this.m.value}`);

        const result = this.b(str, z);
        console.log(`  sn (签名结果)   = ${result}`);
        return result;
    };
});
```

#### 第二层：Hook readMD5Key() 获取 Native 层 secret key

```typescript
Java.perform(() => {
    const NativeSecureparam = Java.use("com.ifeng.news2.util.NativeSecureparam");
    NativeSecureparam.readMD5Key.implementation = function (): string {
        const key = this.readMD5Key();
        console.log(`[readMD5Key] Native secret = ${key}`);
        return key;
    };
});
```

#### 第三层：Hook j.b() 获取 MD5 前的完整拼接原文

```typescript
Java.perform(() => {
    const JUtil = Java.use("com.qad.util.j");
    JUtil.b.implementation = function (input: string): string {
        console.log(`[MD5 输入] 完整拼接原文 = ${input}`);
        const hash = this.b(input);
        console.log(`[MD5 输出] 签名结果     = ${hash}`);
        return hash;
    };
});
```

#### 三层联动预期输出

```
[readMD5Key] Native secret = abc123def456789

[签名入口 b()]
  str (传入参数) = 17808298599791    ← st 值
  this.a         = 参数片段_A
  this.e         = 参数片段_B
  this.j         = 参数片段_C
  this.c         = 参数片段_D
  this.l         = 参数片段_E
  this.m         = 参数片段_F

[MD5 输入] 完整拼接原文 = 参数片段_A参数片段_B...参数片段_F17808298599791abc123def456789
[MD5 输出] 签名结果     = 552c203bebf3dbafa7e96f4cd7adc9c7

  sn (签名结果)   = 552c203bebf3dbafa7e96f4cd7adc9c7   ← 与网络请求中的 sn 一致 ✅
```

---

## 六、总结

### 完整方法论

```
① 反调试定位    → Hook dlopen 监控 SO 加载 → 定位到 libmsaoaidsec.so
② 脱壳          → 加固检测 → 脱壳工具脱出完整 Dex
③ 确定检测时机  → Hook JNI_OnLoad 无输出 → 确认检测在 .init_proc
④ IDA 静态分析  → 获取 .init_proc (0x12F18) 和 JNI_OnLoad (0x13328) 偏移
⑤ 动态找窗口    → enumerateSymbols 找到 call_constructors (偏移 0x662b0)
⑥ 核心绕过      → Interceptor.replace 在 call_constructors.onEnter 中替换 init_proc
⑦ Java Hook     → 延迟到 JNI_OnLoad 替换回调中执行，避免时机过早
⑧ 广撒网        → HashMap.put Hook 确认目标代码在已脱壳 Dex 中 + 发现 target URL
⑨ jadx 定位     → 根据 URL 搜索找到签名入口 b() + st 生成逻辑
⑩ 多层验证      → 同时 Hook b() + readMD5Key() + j.b() 还原完整签名链路
```

### 关键踩坑与解决

| 问题 | 解决方案 |
|------|---------|
| SO 加载后进程被杀 | Hook linker64 `call_constructors` 在 `init_proc` 执行前拦截 |
| 硬编码 linker64 偏移不可靠 | 用 `enumerateSymbols()` 动态查找 `call_constructor` 符号 |
| `Java.perform` 过早执行 → ClassNotFoundException | 延迟到 `JNI_OnLoad` 替换回调中调用 |
| 直接搜索 `"sn"` 关键字未果 | 先用 HashMap.put Hook "广撒网" 确认代码在已脱壳 Dex 中 |
| 签名使用 Native secret key | 额外 Hook `readMD5Key()` 获取 key 值 |
| 签名拼接触发异常时有 fallback 路径 | 注意 `try/catch` 中的两组拼接逻辑 |

### 工具组合

```
Frida (动态 Hook)  +  jadx (Java 静态分析)  +  IDA Pro (Native 静态分析)
       ↓                     ↓                        ↓
  运行时数据抓取          类/方法定位              偏移/符号/SO 算法
```

---

> **免责声明：** 本文仅供安全研究和学习目的使用。请勿将文中技术用于非法用途，否则后果自负。
> 参考文章:https://www.52pojie.cn/thread-2079166-1-1.html

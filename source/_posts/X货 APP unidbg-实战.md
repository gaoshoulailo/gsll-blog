---
title: X货 APP — Unidbg 补环境解密实践
tags: [技术分享, Android Reverse]
categories: [技术分享, Android Reverse]
cover: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/19.jpg
top_img: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/19.jpg
date: 2026-07-07 16:19:00
---
# X货 APP — Unidbg 补环境调用解密实践

## 目录

- [一、背景](#一背景)
- [二、定位解密函数](#二定位解密函数)
- [三、确定目标 SO](#三确定目标-so)
- [四、搭建 Unidbg 框架](#四搭建-unidbg-框架)
- [五、根据日志补环境](#五根据日志补环境)
  - [5.1 日志解读技巧](#51-日志解读技巧)
  - [5.2 第一轮：补基础类](#52-第一轮补基础类)
  - [5.3 关键洞察：直接补终点值](#53-关键洞察直接补终点值)
- [六、i11 参数之谜](#六i11-参数之谜)
  - [6.1 现象](#61-现象)
  - [6.2 排查](#62-排查)
  - [6.3 根因分析(猜测)](#63-根因分析(猜测))
- [七、函数调用代码](#七函数调用代码)
- [八、总结](#八总结)

---

## 一、背景

抓包发现X货 APP 返回的数据是加密的密文：

![密文数据](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A71.jpg)

APP 版本为 **8.81.1**：

![版本](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A72.jpg)

> **目标**：使用 Unidbg 模拟执行 SO 中的 Native 解密函数，实现脱离真机的数据解密。

---

## 二、定位解密函数

使用 Frida 注入 APP，发现存在反调试检测：

![反调试](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A73.jpg)

参考文章:{% post_link 凤凰新闻APP逆向实战 "X凰新闻 APP 逆向实战 — 绕过 libmsaoaidsec.so 反调试与签名定位" %},绕过反调试后，通过 hook以及关键字符串交叉引用，定位到解密函数在 `.so` 中：

![定位](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A74.jpg)

Hook 拿到密文字节数组：

![hook bytes](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A75.jpg)

转换为 JSON 后确认解密结果正确：

![转 JSON](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A76.jpg)

---

## 三、确定目标 SO

跟栈回溯，找到加载 SO 的位置。四个 Native 方法都注册在 `com/shizhuang/dusanwa/main/SwSdk` 类中：

| 方法 | 签名 |
|------|------|
| `heracles` | `([BIII)[B` |
| `achilles` | `([BLjava/lang/String;IJ[B)[B` |
| `gnr` | `([B)[B` |
| `pan` | `([B)Ljava/lang/String;` |

目标函数是 **`heracles`**，对应 SO文件名：

![注册信息](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A78.jpg)

用 IDA Pro 打开 `lib/arm64-v8a/libdusanwa.so` 发现是控制平坦流,使用unidbg可以更快解决：

![IDA](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A79.jpg)

---

## 四、搭建 Unidbg 框架

```java
public class ShiHuo extends AbstractJni {

    public ShiHuo() {
        emulator = AndroidEmulatorBuilder
                .for64Bit()
                .setProcessName("com.hupu.shihuo")
                .build();

        Memory memory = emulator.getMemory();
        memory.setLibraryResolver(new AndroidResolver(23));

        vm = emulator.createDalvikVM(new File("apk/X货_8.81.1.apk"));
        vm.setJni(this);
        vm.setVerbose(true);  // 关键！打开详细日志

        DalvikModule dm = vm.loadLibrary(new File("lib/arm64-v8a/libdusanwa.so"), false);
        module = dm.getModule();
        dm.callJNI_OnLoad(emulator);
    }
}
```

将 Frida hook 到的密文数据填入调用：

```java
ByteArray obj = swSdk.callStaticJniMethodObject(
        emulator,
        "heracles([BIII)[B",
        new ByteArray(vm, barry),
        -1, 0, 1   // i10, i11, i12
);
```

---

## 五、根据日志补环境

### 5.1 日志解读技巧

`vm.setVerbose(true)` 是补环境的核心工具。

> **口诀**：每条 `GetMethodID methodName=xxx` + 紧跟的 `CallObjectMethod` = 一次 JNI 回调。结合 `dvmObject=xxx` 的类名，拼出完整调用链。

```
GetMethodID ... methodName=getApplication
CallObjectMethod                      → application.getApplication()

GetMethodID ... methodName=getPackageManager
CallObjectMethod                      → application.getPackageManager()

GetMethodID ... methodName=getPackageName
CallObjectMethod                      → application.getPackageName()

GetMethodID ... methodName=getPackageInfo
CallObjectMethod                      → pm.getPackageInfo(包名, flags)

GetFieldID  ... fieldName=signatures
GetObjectField                        → packageInfo.signatures

GetObjectArrayElement index=0         → signatures[0]

GetMethodID ... methodName=toCharsString
CallObjectMethod                      → signature.toCharsString()
```

### 5.2 第一轮：补基础类

```java
@Override
public DvmObject<?> callStaticObjectMethod(BaseVM vm, DvmClass dvmClass,
        String signature, VarArg varArg) {
    // ActivityThread.currentActivityThread()
    if (signature.equals("android/app/ActivityThread->currentActivityThread()Landroid/app/ActivityThread;")) {
        return vm.resolveClass("android/app/ActivityThread").newObject("");
    }
    return super.callStaticObjectMethod(vm, dvmClass, signature, varArg);
}

@Override
public DvmObject<?> callObjectMethod(BaseVM vm, DvmObject<?> dvmObject,
        String signature, VarArg varArg) {
    // ActivityThread.getApplication()
    if (signature.equals("android/app/ActivityThread->getApplication()Landroid/app/Application;")) {
        return vm.resolveClass("android/app/Application").newObject("");
    }
    // Application.getPackageManager()
    if (signature.equals("android/app/Application->getPackageManager()Landroid/content/pm/PackageManager;")) {
        return vm.resolveClass("android/content/pm/PackageManager").newObject("");
    }
    // Application.getPackageName()
    if (signature.equals("android/app/Application->getPackageName()Ljava/lang/String;")) {
        return new StringObject(vm, "com.hupu.shihuo");
    }
    return super.callObjectMethod(vm, dvmObject, signature, varArg);
}
```

补完 `PackageManager` 后运行，报错：

![初始报错](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A710.jpg)

```text
NewByteArray size=0
NullPointerException: "buf" is null
```

### 5.3 关键洞察：直接补终点值

补完 `getPackageName` 后发现还是同样的错。观察日志，SO 的完整调用链是：

```
getPackageManager() → getPackageName() → getPackageInfo() → signatures[0] → toCharsString() → getBytes("utf-8")
    ✅ 已补              ✅ 已补           ❌ 返回值太复杂     ❌ 返回值太复杂   ⭐ 字符串对象
```

> **核心思路**：`getPackageInfo()` 返回的 `PackageInfo` 对象和 `signatures` 数组都极其复杂，逐层补不可行。但 SO 绕这么一大圈，**最终只想要 `toCharsString()` 返回的那个字符串**。前面的调用全是铺垫。

直接 Frida hook 终点值：

```javascript
Java.perform(function() {
    var Signature = Java.use("android.content.pm.Signature");
    Signature.toCharsString.implementation = function() {
        var result = this.toCharsString();
        console.log("[*] Signature.toCharsString() = " + result);
        return result;
    };
});
```

真机运行拿到签名字符串，直接覆盖：

```java
if (signature.equals("android/content/pm/Signature->toCharsString()Ljava/lang/String;")) {
    return new StringObject(vm, "308202bf308201a7a00302010202047a2f681f...");
}
```

> **一行代码顶三层补环境**：跳过 `getPackageInfo()` → `signatures` → `Signature` 的复杂构造。

将最新 Frida hook 到的数据复制到 Unidbg 中运行：

![正常运行](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A712.jpg)

![解密结果](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A711.jpg)

---

## 六、i11 参数之谜

### 6.1 现象

解密跑通后，测试不同类型的数据，发现一个奇怪的现象：

```
用户信息数据：  heracles(data, -1, 0, 1)     → ✅ 解密正常
商品列表数据：  heracles(data, -1, 0, 1)     → ✅ 解密正常
未登录数据：    heracles(data, -1, 0, 1)     → ✅ 解密正常
电商详情数据：  heracles(data, -1, 0, 1)     → ❌ 乱码！
```

**同样的参数，电商数据不行**。但 Frida hook 真机时，所有调用参数都是 `-1, 0, 1`，全部正常。

### 6.2 排查

往前翻 Frida 日志，发现有一次传了 `65982`：

```text
第一个参数: [密文字节]
第二个参数: -1
第三个参数: 65982
第四个参数: 1
```

这个值 `65982` 正是X货的 `versionCode`。

在 Unidbg 里把 `i11` 改成 `65982`：

```
电商详情数据：  heracles(data, -1, 65982, 1)  → ✅ 解密正常！
```

### 6.3 根因分析(猜测)

SO 内部解密时，**不同场景走了不同的密钥派生路径**：

```java
// SO 内部逻辑（推测）
int versionCode;
if (i11 != 0) {
    versionCode = i11;                              // 直接用人传的
} else {
    versionCode = getPackageInfo().versionCode;      // 自己去环境查
}

byte[] key;
if (isSensitiveDataType(data)) {                    // 电商等敏感数据
    key = KDF(signature, versionCode);               // 密钥 = 签名 + 版本号
} else {
    key = KDF(signature);                            // 密钥 = 签名
}
return decrypt(data, key);
```

| 数据类型 | 密钥依赖 | Unidbg `i11=0` 时 | 结果 |
|---------|---------|-------------------|------|
| 普通接口 | `signature` | 签名已补 ✅ | 正常 |
| 电商敏感 | `signature` + `versionCode` | versionCode = `0` ❌ | 乱码 |

> `65982` 是X货的 `versionCode`。`i11=0` 时 SO 去环境中查 → Unidbg 返回默认 `0` → 密钥算错 → 乱码。

普通数据 vs 电商数据解密对比：

![电商对比](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A713.jpg)

![参数说明](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E8%AF%86%E8%B4%A714.jpg)

## 七、函数调用代码

```java
public void run() {
    DvmClass swSdk = vm.resolveClass("com/shizhuang/dusanwa/main/SwSdk");

    byte[] barry = Base64.getUrlDecoder().decode(info);

    ByteArray obj = swSdk.callStaticJniMethodObject(
            emulator,
            "heracles([BIII)[B",
            new ByteArray(vm, barry),
            -1, 0, 1          // i11=0，依赖环境补全的 versionCode
    );

    byte[] dataBytes = obj.getValue();
    System.out.println(new String(dataBytes));
}
```

---

## 八、总结

### 补环境方法论

| 步骤 | 要点 |
|------|------|
| 1. 开日志 | `vm.setVerbose(true)` — 一切补环境的前提 |
| 2. 读调用链 | `GetMethodID` + `CallObjectMethod` = 一次 JNI 回调 |
| 3. 找终点 | 逐层补太累，Frida hook 到终点值直接返回 |
### 关键发现

| 发现 | 说明 |
|------|------|
| `toCharsString()` 一行顶三层 | 跳过 `getPackageInfo()` → `signatures` → `Signature` 的复杂构造 |
| 电商数据额外绑定 versionCode | 密钥 = `KDF(signature, versionCode)`，缺 versionCode 则乱码 |
| `i11` 的双重语义 | 需 hook 对照真实调用，不可盲猜参数值 |

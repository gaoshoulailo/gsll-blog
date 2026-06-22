---
title: XX航空 App hnairSign签名分析 —— Unidbg 简单使用
tags: [技术分享]
categories: [技术分享]
cover: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/15.jpg
top_img: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/15.jpg
date: 2026-06-22 16:19:00
---
# XX航空 App hnairSign签名分析 —— Unidbg 简单使用

## 概述
*分析时间：2026-06  | 分析环境：Android 15 / Pixel 6 / unidbg 0.9.8 / Frida / IDA Pro / JDK 21*

本文以 **XX航空 App（v10.15.0）** 为目标app，简单应用Unidbg完成so文件的函数调用。

---

## 一、抓包定位关键参数

通过抓包对比请求，发现以下核心参数：

| 参数 | 说明 |
|------|------|
| `hnairSign` | 请求签名值（需逆向生成） |
| `appstamp` | 时间戳相关 |
| `stime` | 请求时间戳 |
| `departureDate` | 出发日期 |

其中 `hnairSign` 是每次请求必须携带的签名，直接搜索该参数定位生成逻辑。

![1.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA1.png)
*搜索 hnairSign 定位签名函数*

---

## 二、Frida Hook —— 定位签名函数

### 2.1 编写 Hook 脚本

使用 Frida Hook `HNASignature.getHNASignature`，打印输入输出参数：
![2.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA2.png)
![3.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA3.png)
```typescript
import Java from "frida-java-bridge";

//XX航空            com.rytong.hnair

function hookgetHNASignature(): void {
    // 此时 Java 对象已确保存在
    Java.perform(() => {
        console.log("[+] frida-java-bridge 显式引入成功！");
        var HNASignature = Java.use("com.rytong.hnair.HNASignature");
        HNASignature["getHNASignature"].implementation = function (str, str2, str3, str4, str5) {
            console.log(`HNASignature.getHNASignature is called: str=${str}, str2=${str2}, str3=${str3}, str4=${str4}, str5=${str5}`);
            let result = this["getHNASignature"](str, str2, str3, str4, str5);
            console.log("参数1:", str);
            console.log("参数2:", str2);
            console.log("参数3:", str3);
            console.log("参数4:", str4);
            console.log("参数5:", str5);
            console.log(`HNASignature.getHNASignature result=${result}`);
            console.log("===========================================");

            return result;
        };
    });
}

function hookDlopen() {
    const addr = Module.findGlobalExportByName("android_dlopen_ext");
    Interceptor.attach(addr, {
        onEnter(args) {
            this.path = args[0].readCString();
            this.isSo = this.path != null && this.path.includes(".so");
            if (this.isSo) {
                console.log("加载so:", this.path);
            }
        },
        onLeave(retval) {
            if (!this.isSo || retval.isNull()) return;
            const path = this.path;
            const name = path.split("/").pop();
            setTimeout(() => {
    const mod = Process.findModuleByName(name);

    if (!mod) {
        console.error("[-] 未找到模块: " + name);
        return;
    }

    // console.log("[+] so 加载成功: " + path);
    // console.log("[+] 基址: " + mod.base + ", 大小: " + mod.size);
    try {
        const exports = mod.enumerateExports();
        exports.forEach(function (exp) {
            if (exp.type === 'function') {
                console.log("[" + name + "] Export: " + exp.name + " @ " + exp.address);
            }
        });
        console.log("[*] [" + name + "] 导出函数总数: " + exports.length);
    } catch (e) {
        console.error("[-] [" + name + "] 枚举导出表失败: " + e.message);
    }
}, 10000);

        }

    })
}


setImmediate(hookDlopen);
```


*跟栈追踪到 HNASignature.getHNASignature*

### 2.2 Hook 结果

成功获取签名函数的输入参数与返回值：

```
HNASignature.getHNASignature is called:
  str  (参数1) = {"app":"APP","channel":"AD"}
  str2 (参数2) = {}
  str3 (参数3) = {"akey":"184C5F04D8BE43DCBD2EE3ABC928F616",
                   "aname":"com.rytong.hnair",
                   "atarget":"standard",
                   "aver":"10.15.0",
                   "did":"C5FDABFA87691AF1294C945424A7F6FB",
                   "dname":"Google_Pixel 6",
                   "stime":"1781675946355",
                   "blackBox":"1781675921131GPHkkscMNsXa9",
                   "hver":"build-10.15.0.48702.0d92d5989.standard",
                   "originDestinations":[{"destination":"HAK","destinationType":"1",
                                         "origin":"NKG","departureDate":"2026-06-18",
                                         "originType":"1"}],
                   "passenger":"ADT:1,CNN:1,INF:1",
                   ...}
  str4 (参数4) = 21047C596EAD45209346AE29F0350491
  str5 (参数5) = F6B15ABD66F91951036C955CB25B069F

result = 7B6FBA9A49791DA953FE1CB15D26644B1C413646>>APPAD670721...
         ...178167594635515AD+0800>>F6B15ABD66F91951036C955CB25B069F
```


将 Hook 获取的 `hnairSign` 与抓包结果对比，**完全一致**，确认就是这个函数。

---

## 三、定位 Native 库

通过 `android_dlopen_ext` 的 Hook 日志，发现签名相关的 so 库：

```
加载so: /data/app/.../lib/arm64/libsignature.so
```

在日志中搜索 `getHNASignature` 相关导出函数，确认该函数由 **`libsignature.so`** 实现。

![4.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA4.png)
*在 hook 日志中搜索函数名定位 so 文件*

用 **IDA Pro** 打开 `libsignature.so`，确认其为 **静态方法**，JNI 函数签名如下：
![5.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA5.png)
---

## 四、创建 Unidbg 项目

有了函数签名和 so 文件，就可以使用 Unidbg 补环境直接调用，无需每次 Hook 真机。

### 4.1 项目结构

```
UnidbgSoEnv/                     # Maven 根目录
├── apk/                         # 存放原始 APK 文件
│   └── xx航空_10.15.0.apk
├── lib/                         # 存放 SO 文件（按架构分目录）
│   ├── arm64-v8a/
│   │   ├── .gitkeep
│   │   └── libsignature.so      # 从 APK 提取的 64 位 SO
│   ├── armeabi-v7a/
│   │   └── .gitkeep
│   ├── x86/
│   │   └── .gitkeep
│   └── x86_64/
│       └── .gitkeep
├── include/                     # 额外头文件（可选）
│   └── .gitkeep
├── logs/                        # 运行时日志输出
│   └── unidbg.log
├── src/main/java/org/example/   # Java 源码
│   ├── HainanAirlines.java      # xx航空专用调用代码
│   └── Main.java                # 通用 Unidbg 模板（可复用于其他 App）
├── src/main/resources/
│   └── log4j2.xml               # 日志配置
├── pom.xml                      # Maven 构建配置
├── mvnw / mvnw.cmd              # Maven Wrapper（免安装 Maven）
└── .gitignore
```

### 4.2 从零创建项目

#### 1️⃣ IDEA 创建 Maven 项目

打开 IntelliJ IDEA，按以下步骤操作：

1. **File → New → Project**
2. 左侧选择 **Maven**（不要选 Archetype）
3. 填写项目信息：

   | 字段 | 值 |
   |------|-----|
   | Name | `UnidbgSoEnv` |
   | Location | `D:\JavaProject\UnidbgSoEnv` |
   | GroupId | `org.example` |
   | ArtifactId | `UnidbgSoEnv` |

4. **JDK** 选择 **21**（Unidbg 0.9.8 推荐 JDK 21）
5. 点击 **Create**

IDEA 会自动生成基础目录结构和 `pom.xml`。

#### 2️⃣ 替换 pom.xml

用以下完整配置覆盖自动生成的 `pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>org.example</groupId>
    <artifactId>UnidbgSoEnv</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <unidbg.version>0.9.8</unidbg.version>
        <log4j.version>2.25.4</log4j.version>
        <slf4j.version>2.0.9</slf4j.version>
        <gson.version>2.11.0</gson.version>
    </properties>

    <repositories>
        <repository>
            <id>aliyun</id>
            <url>https://maven.aliyun.com/repository/public</url>
            <releases><enabled>true</enabled></releases>
            <snapshots><enabled>false</enabled></snapshots>
        </repository>
    </repositories>

    <dependencies>
        <dependency>
            <groupId>com.github.zhkl0228</groupId>
            <artifactId>unidbg-android</artifactId>
            <version>${unidbg.version}</version>
            <exclusions>
                <exclusion>
                    <groupId>org.apache.logging.log4j</groupId>
                    <artifactId>log4j-slf4j-impl</artifactId>
                </exclusion>
            </exclusions>
        </dependency>
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
            <version>${slf4j.version}</version>
        </dependency>
        <dependency>
            <groupId>org.apache.logging.log4j</groupId>
            <artifactId>log4j-slf4j2-impl</artifactId>
            <version>${log4j.version}</version>
        </dependency>
        <dependency>
            <groupId>org.apache.logging.log4j</groupId>
            <artifactId>log4j-core</artifactId>
            <version>${log4j.version}</version>
        </dependency>
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>${gson.version}</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
                <configuration>
                    <source>${maven.compiler.source}</source>
                    <target>${maven.compiler.target}</target>
                    <encoding>${project.build.sourceEncoding}</encoding>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.6.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                        <configuration>
                            <transformers>
                                <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                    <mainClass>org.example.HainanAirlines</mainClass>
                                </transformer>
                            </transformers>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

> 注意 `mainClass` 已设为 `org.example.HainanAirlines`，这样打包后可 `java -jar` 直接运行。

替换后，点击 IDEA 右上角提示的 **Load Maven Changes**（或右键 `pom.xml` → Maven → Reload project），等待依赖下载完成。

#### 3️⃣ 创建目录和资源文件

在项目根目录下手动创建以下文件夹：

```
UnidbgSoEnv/
├── apk/                         # 放入 xx航空_10.15.0.apk
├── lib/arm64-v8a/               # 放入 libsignature.so
├── src/main/resources/
│   └── log4j2.xml               # 日志配置
```

在 `src/main/resources/` 下新建 `log4j2.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </Console>
        <RollingFile name="FileLog" fileName="logs/unidbg.log"
                     filePattern="logs/unidbg-%d{yyyy-MM-dd}-%i.log.gz">
            <PatternLayout pattern="%d{yyyy-MM-dd HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
            <Policies>
                <TimeBasedTriggeringPolicy/>
                <SizeBasedTriggeringPolicy size="10 MB"/>
            </Policies>
            <DefaultRolloverStrategy max="5"/>
        </RollingFile>
    </Appenders>
    <Loggers>
        <Logger name="com.github.unidbg" level="DEBUG" additivity="false">
            <AppenderRef ref="Console"/>
            <AppenderRef ref="FileLog"/>
        </Logger>
        <Logger name="org.example" level="DEBUG" additivity="false">
            <AppenderRef ref="Console"/>
            <AppenderRef ref="FileLog"/>
        </Logger>
        <Root level="INFO">
            <AppenderRef ref="Console"/>
            <AppenderRef ref="FileLog"/>
        </Root>
    </Loggers>
</Configuration>
```

#### 4️⃣ 提取 APK 和 SO

从 APK 中提取 SO 文件：

```bash
# 从 APK 中找到 lib/arm64-v8a/libsignature.so
# 复制到项目目录下
copy lib\arm64-v8a\libsignature.so D:\JavaProject\UnidbgSoEnv\lib\arm64-v8a\

# 将 APK 也复制到 apk/ 目录（Unidbg 需要加载 APK 来解析 DEX 类）
copy xx航空_10.15.0.apk D:\JavaProject\UnidbgSoEnv\apk\
```

#### 5️⃣ 创建 Java 源文件

在 `src/main/java/org/example/` 下新建 `HainanAirlines.java`，代码见下文 [5.1 节](#51-专属调用代码hainanairlinesjava)。

完成后在 IDEA 的项目面板中应该能看到完整的目录结构：

```
UnidbgSoEnv
├── apk/
│   └── xx航空_10.15.0.apk
├── lib/
│   └── arm64-v8a/
│       └── libsignature.so
├── src/
│   ├── main/
│   │   ├── java/org/example/
│   │   │   └── HainanAirlines.java
│   │   └── resources/
│   │       └── log4j2.xml
│   └── test/
├── pom.xml
└── UnidbgSoEnv.iml
```
## 五、Unidbg 调用签名函数

### 5.1 关键代码片段

```java
public class HainanAirlines extends AbstractJni {
    private final Gson gson = new Gson();
    private final AndroidEmulator emulator;  
    private final VM vm;                   
    private final Module module;

    public HainanAirlines() {
        // 1. 创建64位模拟器（匹配 arm64-v8a）
        emulator = AndroidEmulatorBuilder
                .for64Bit()
                .setProcessName("com.rytong.hnair")
                .build();

        // 2. 获取内存操作接口
        Memory memory = emulator.getMemory();

        // 3. 设置 Android SDK 版本（64位建议用23或更高）
        memory.setLibraryResolver(new AndroidResolver(23));

        // 4. 创建 Dalvik 虚拟机
        vm = emulator.createDalvikVM(new File("apk/海南航空_10.15.0.apk"));
        vm.setJni(this);
        vm.setVerbose(true);

        // 5. 加载64位SO文件
        DalvikModule dm = vm.loadLibrary(new File("lib/arm64-v8a/libsignature.so"), false);
        module = dm.getModule();

        // 6. 调用 JNI_OnLoad
        dm.callJNI_OnLoad(emulator);
    }

    public static void main(String[] args) {
        HainanAirlines hainanAirlines = new HainanAirlines();
        System.out.println("初始化完成");
        hainanAirlines.run();
    }

    public void run() {
        // 调用目标 Native 方法
        DvmClass hnaSignature = vm.resolveClass("com/rytong/hnair/HNASignature");
//        jstring __fastcall Java_com_rytong_hnair_HNASignature_getHNASignature(
//                JNIEnv *env,
//                jclass object,
//                jstring headJson,
//                jstring queryJson,
//                jstring bodyJson,
//                jstring salt,
//                jstring appSignature)
        // headJson
        Map<String, Object> headJson = new HashMap<>();
        headJson.put("app", "APP");
        headJson.put("channel", "AD");
        // queryJson
        Map<String, Object> queryJson = new HashMap<>();
        // bodyJson
        Map<String, Object> bodyJson = new HashMap<>();
        bodyJson.put("akey", "184C5F04D8BE43DCBD2EE3ABC928F616");
        bodyJson.put("aname", "com.rytong.hnair");
        bodyJson.put("atarget", "standard");
        bodyJson.put("aver", "10.15.0");
        bodyJson.put("did", "C5FDABFA87691AF1294C945424A7F6FB");
        bodyJson.put("dname", "Google_Pixel 6");
        bodyJson.put("mchannel", "official");
        bodyJson.put("schannel", "AD");
        bodyJson.put("slang", "zh-CN");
        bodyJson.put("sname", "google/oriole/oriole:15/BP1A.250505.005/13277524:user/release-keys");
        bodyJson.put("stime", "1781675946355");
        bodyJson.put("sver", "15");
        bodyJson.put("system", "AD");
        bodyJson.put("szone", "+0800");
        bodyJson.put("abuild", "67072");
        bodyJson.put("riskToken", "6a3237a27ku0M9mIXSeRG1seHBRXAEczbsdRN3z3");
        bodyJson.put("blackBox", "1781675921131GPHkkscMNsXa9");
        bodyJson.put("hver", "build-10.15.0.48702.0d92d5989.standard");
        List<Map<String, Object>> originDestinations = new ArrayList<>();
        Map<String, Object> flight = new HashMap<>();
        flight.put("destination", "HAK");
        flight.put("destinationType", "1");
        flight.put("origin", "NKG");
        flight.put("departureDate", "2026-06-18");
        flight.put("originType", "1");
        originDestinations.add(flight);
        bodyJson.put("originDestinations", originDestinations);
        bodyJson.put("passenger", "ADT:1,CNN:1,INF:1");

        StringObject result = hnaSignature.callStaticJniMethodObject(
                emulator,
                "getHNASignature(...)Ljava/lang/String;",
                new StringObject(vm, gson.toJson(headJson)),
                new StringObject(vm, gson.toJson(queryJson)),
                new StringObject(vm, gson.toJson(bodyJson)),
                new StringObject(vm, "21047C596EAD45209346AE29F0350491"),
                new StringObject(vm, "F6B15ABD66F91951036C955CB25B069F")
        );
        System.out.println("结果: " + result.getValue());
    }

    public Module getModule() {
        return module;
    }
}
```

### 5.2 运行结果
![6.png](https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/%E6%B5%B7%E5%8D%97%E8%88%AA%E7%A9%BA6.png)
能直接出结果，不需要补充别的环境，且结果与 Frida Hook 得到的签名值 **完全一致**，说明 Unidbg 调用成功。

---

## 七、完整流程总结

```
┌──────────────────────────────────────────────────────────┐
│  1. 抓包                    找出 hnairSign 等关键参数     │  
├──────────────────────────────────────────────────────────┤
│  2. Frida Hook             定位 Java 层签名函数           │
│                            HNASignature.getHNASignature   │
├──────────────────────────────────────────────────────────┤
│  3. 日志分析                确认5个参数和返回值格式        │
│                             发现固定 salt + appSignature  │
├──────────────────────────────────────────────────────────┤
│  4. Hook dlopen            定位 so 文件 libsignature.so   │
├──────────────────────────────────────────────────────────┤
│  5. IDA Pro 分析           确认 JNI 函数签名（静态方法）   │
│                             获取 5 个 jstring 参数        │
├──────────────────────────────────────────────────────────┤
│  6. 创建 Unidbg 项目         Maven + pom.xml 配置依赖     │
│                             提取 APK + SO 到对应目录       │
├──────────────────────────────────────────────────────────┤
│  7. 编写调用代码             继承 AbstractJni             │
│                             构造 JSON 参数，callStatic     │
├──────────────────────────────────────────────────────────┤
│  8. 编译运行验证             mvn package → java -jar      │
│                             结果与 Frida 一致 → 成功      │
└──────────────────────────────────────────────────────────┘
```

---

## 八、关键点速查表

| 项目 | 内容                                                        |
|------|-----------------------------------------------------------|
| App 包名 | `com.rytong.hnair`                                        |
| App 版本 | `10.15.0`                                                 |
| 签名库 | `libsignature.so`（arm64-v8a）                              |
| 签名类 | `com.rytong.hnair.HNASignature`                           |
| 签名方法 | `getHNASignature(String, String, String, String, String)` |
| Unidbg 架构 | `for64Bit()` + SDK 23                                     |
| SO 路径 | `lib/arm64-v8a/libsignature.so`                           |
| APK 路径 | `apk/XX航空_10.15.0.apk`                                    |

> **免责声明：** 本文仅供安全研究和学习目的使用。请勿将文中技术用于非法用途，否则后果自负。  

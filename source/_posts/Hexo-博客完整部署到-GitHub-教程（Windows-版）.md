---
title: Hexo 博客完整部署到 GitHub 教程（Windows 版）
tags: [技术分享]
categories: [技术分享]
cover: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/7.webp
top_img: https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/7.webp
date: 2026-05-18 10:30:00
---
# Hexo 博客完整部署到 GitHub 教程（Windows 版）

> **作者**：gaoshoulailo
> **博客地址**：`https://gaoshoulailo.github.io/gsll-blog`  
> **适用系统**：Windows  
> **创建时间**：2026-05-18


## 目录

- [一、前置准备](#一前置准备)
- [二、创建 GitHub 仓库](#二创建-github-仓库)
- [三、配置 SSH 连接 GitHub](#三配置-ssh-连接-github)
- [四、初始化 Hexo 博客](#四初始化-hexo-博客)
- [五、下载主题并处理 .git 文件夹](#五下载主题并处理-git-文件夹)
- [六、配置 Hexo 部署](#六配置-hexo-部署)
- [七、首次部署到 GitHub](#七首次部署到-github)
- [八、设置 GitHub Pages](#八设置-github-pages)
- [九、备份源码到 GitHub](#九备份源码到-github)
- [十、日常写作与更新流程](#十日常写作与更新流程)
- [十一、常见问题与补充事项](#十一常见问题与补充事项)
- [十二、在其他电脑上克隆运行](#十二在其他电脑上克隆运行)
- [十三、双分支结构总结](#十三双分支结构总结)

---

## 一、前置准备

### 1.1 安装 Node.js

1. 访问 [nodejs.org](https://nodejs.org)
2. 下载 **LTS（长期支持）版本**
3. 安装时全部默认，一直点 Next
4. 验证安装：

```bash
node -v
npm -v
```

### 1.2 安装 Git

1. 访问 [git-scm.com](https://git-scm.com)
2. 下载 Windows 版，默认安装
3. 验证安装：

```bash
git --version
```

### 1.3 配置 Git 全局信息

```bash
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的GitHub注册邮箱"
```

---

## 二、创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)，点击右上角 **New repository**
2. **Repository name**：`仓库名`
3. 设为 **Public（公开）**
4. 勾选 **Add a README file**
5. 点击 **Create repository**
   - [ ] **注意**：请勿创建 README.md 文件

> 你的博客访问地址将是：`https://用户名.github.io/仓库名`

---

## 三、配置 SSH 连接 GitHub(可选)
本节为可选步骤，但强烈建议国内开发者完成，能显著提升 Git 操作的稳定性与体验。

### 3.1 检查现有 SSH 密钥

打开 **PowerShell** 或 **Git Bash**：

```bash
ls ~/.ssh
```

如果看到 `id_rsa` 和 `id_rsa.pub`（或 `id_ed25519` 和 `id_ed25519.pub`），说明已有密钥，可以跳过生成步骤。

### 3.2 生成新的 SSH 密钥

```bash
ssh-keygen -t ed25519 -C "你的GitHub邮箱"
```

- 按 **Enter** 使用默认保存路径
- 提示输入密码时，直接按 **Enter**（不设置密码，方便后续自动部署）

> 如果你的系统不支持 `ed25519`，使用 RSA：
> ```bash
> ssh-keygen -t rsa -b 4096 -C "你的GitHub邮箱"
> ```

### 3.3 添加公钥到 GitHub

1. 查看公钥内容：

```bash
cat ~/.ssh/id_ed25519.pub
```

（如果是 RSA，文件名为 `id_rsa.pub`）

2. 复制输出的全部内容
3. 登录 GitHub → 右上角头像 → **Settings** → 左侧 **SSH and GPG keys** → **New SSH key**
4. **Title** 填写：Hexo 部署密钥
5. **Key** 粘贴刚才复制的公钥内容
6. 点击 **Add SSH key**

### 3.4 测试 SSH 连接

```bash
ssh -T git@github.com
```

第一次连接会提示：

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

输入 `yes` 并回车。

成功后会显示：

```
Hi gaoshoulailo! You've successfully authenticated...
```

### 3.5 国内网络 SSH 22 端口被封的解决方案

如果 `ssh -T git@github.com` 超时，改用 443 端口：

1. 创建/编辑 `~/.ssh/config` 文件：

```bash
notepad ~/.ssh/config
```

2. 添加以下内容：

```
Host github.com
    HostName ssh.github.com
    Port 443
```

3. 同时修改 Hexo 部署地址为：

```yaml
repo: ssh://git@ssh.github.com:443/用户名/仓库名.git
```

---

## 四、初始化 Hexo 博客

### 4.1 安装 Hexo CLI

```bash
npm install -g hexo-cli
```

### 4.2 创建博客目录

```bash
# 建议在 D 盘或 F 盘，避免 C 盘权限问题 文件名可随意，本文使用blog示例
cd F:\
mkdir blog
cd blog
```

### 4.3 初始化 Hexo

```bash
hexo init .
npm install
```

初始化后的目录结构：

```
blog/
├── _config.yml              # 博客全局配置文件
├── _config.landscape.yml    # 默认主题配置
├── package.json             # 项目依赖
├── scaffolds/               # 文章模板
├── source/                  # 你的文章、页面、图片
│   ├── _drafts/             # 草稿
│   └── _posts/             # 已发布文章
├── themes/                  # 主题文件夹
└── node_modules/            # 依赖包
```

### 4.4 本地预览

```bash
hexo server
```

浏览器访问 `http://localhost:4000`，看到默认页面说明成功。

---

## 五、下载主题并处理 .git 文件夹
   - [ ] **注意**：具体下载操作可参考主题GitHub页面下的README.md
### 5.1 下载主题（以 Butterfly 为例）

进入 `themes` 目录，使用 `git clone` 下载主题：

```bash
cd F:\blog\themes
git clone https://github.com/jerryc127/hexo-theme-butterfly.git
```

### 5.2 删除主题内的 .git 文件夹（关键步骤）

**问题原因**：主题文件夹内包含 `.git` 隐藏文件夹，这会导致 Git 嵌套问题：
- Git 不允许仓库内嵌套另一个 Git 仓库
- 父仓库无法追踪主题文件夹内的文件
- 推送到 GitHub 时主题文件夹显示为灰色不可点击
- 无法备份和更新主题文件

**解决方案**：删除 `.git` 文件夹

```bash
cd F:\blog\themes\hexo-theme-butterfly
rm -rf .git
```

> 删除后，主题文件夹就成为普通文件夹，可以被父仓库正常追踪。缺点是**无法通过 `git pull` 更新主题**，如需更新需重新下载。

### 5.3 重命名主题文件夹（可选）

将 `hexo-theme-butterfly` 重命名为更短的名字：

```bash
cd F:\blog\themes
mv hexo-theme-butterfly butterfly
```

### 5.4 启用主题

编辑博客根目录的 `_config.yml`，找到 `theme:` 行，修改为：

```yaml
theme: butterfly
```

---

## 六、配置 Hexo 部署

### 6.1 安装部署插件

```bash
cd F:\blog
npm install hexo-deployer-git --save
```

### 6.2 安装 Pug 渲染器（关键！易遗漏）

Hexo 默认只支持 EJS 模板，Pug 主题需要额外安装渲染器：

```bash
npm install hexo-renderer-pug --save
```

> 如果不安装此插件，`hexo generate` 生成的 `public/index.html` 将仍然是 Pug 源码，导致网站无法正确显示。

### 6.3 编辑 _config.yml

打开 `F:\blog\_config.yml`，修改以下两处：

**① URL 配置**（找到 `url` 和 `root`）：

```yaml
url: https://用户名.github.io/仓库名
root: /仓库名/
```

**② 部署配置**（在文件最底部添加）：

```yaml
deploy:
  type: git
  repo: git@github.com:用户名/仓库名.git
  branch: gh-pages
```

> - 必须使用 **SSH 地址**（`git@github.com:` 开头），这样无需每次输入密码
> - `branch: gh-pages` 是 Hexo 部署插件的默认值，用于存放生成的静态网页
> - YAML 语法严格：冒号后必须有空格，缩进用空格不要用 Tab

---

## 七、首次部署到 GitHub

### 7.1 执行部署命令

```bash
hexo clean && hexo generate && hexo deploy
```

或简写：

```bash
hexo cl && hexo g && hexo d
```

命令说明：
- `hexo clean`：清理缓存和旧的生成文件
- `hexo generate`（`hexo g`）：生成静态网页文件到 `public/` 目录
- `hexo deploy`（`hexo d`）：将 `public/` 内容推送到 GitHub 仓库的 `gh-pages` 分支

### 7.2 验证生成结果

部署前检查 `public/index.html` 是否正常：

```bash
type public\index.html
```

输出应该是正常的 HTML 标签（如 `<html>`、`<div>` 等），**不应该是 Pug 源码**。

看到 `Deploy done: git` 说明部署成功。

---

## 八、设置 GitHub Pages

### 8.1 确认 gh-pages 分支已创建

Hexo 首次部署后会自动创建 `gh-pages` 分支。

1. 打开仓库页面 `github.com/用户名/仓库名`
2. 点击分支下拉菜单，确认能看到 `gh-pages`

### 8.2 配置 Pages 源分支

1. 进入仓库 **Settings** → **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `gh-pages` / `(root)`
4. 点击 **Save**

> 如果首次部署后看不到 `gh-pages` 选项，等待 1-2 分钟刷新页面，或手动在 GitHub 上基于 `main` 创建 `gh-pages` 分支。

### 8.3 访问博客

等待 1-3 分钟后，访问：

```
https://用户名.github.io/仓库名
```

---

## 九、备份源码到 GitHub（重要）

`hexo deploy` 只推送了**生成的静态网页**，你的**源码**（文章 Markdown、配置文件、主题设置）需要单独备份到 `main` 分支。

### 9.1 创建 .gitignore

在 `F:\gsll-blog` 下创建 `.gitignore` 文件：

```
.DS_Store
Thumbs.db
db.json
*.log
node_modules/
public/
.deploy*/
```

> `public/` 和 `.deploy*/` 是 Hexo 生成的文件，不需要备份。

### 9.2 初始化并推送源码

```bash
cd F:\blog
git init
git add .
git commit -m "init: hexo blog source"
git branch -M main
git remote add origin git@github.com:用户名/仓库名.git
```

如果推送失败（因为仓库已有 README）：

```bash
git pull origin main --rebase --allow-unrelated-histories
git push -u origin main
```

---

## 十、日常写作与更新流程

### 10.1 新建文章

```bash
hexo new "文章标题"
```

文章会创建在 `source/_posts/文章标题.md`，用 Markdown 编辑。

### 10.2 本地预览

```bash
hexo server
```

### 10.3 部署博客（更新网站）

```bash
hexo clean && hexo g && hexo d
```

### 10.4 备份源码

```bash
git add .
git commit -m "update: 新增文章"
git push origin main
```

---

## 十一、常见问题与补充事项

| 问题 | 解决方案 |
|------|---------|
| **GitHub Pages 只有 main 选项** | 首次 `hexo d` 后，Hexo 会自动创建 `gh-pages` 分支。等待 1-2 分钟刷新页面即可看到。 |
| **SSH 连接失败/超时** | 国内网络可能封 22 端口。在 `~/.ssh/config` 添加 443 端口配置（见 3.5 节）。 |
| **YAML 语法错误** | `_config.yml` 中冒号后必须有空格，缩进用两个空格，不能用 Tab。 |
| **主题样式不生效** | 确认 `_config.yml` 中 `theme:` 名字和 `themes/` 下的文件夹名完全一致。 |
| **页面显示 Pug 源码** | 未安装 `hexo-renderer-pug`，执行 `npm install hexo-renderer-pug --save`。 |
| **图片路径** | 图片放 `source/images/`，文章中引用：`![](/gsll-blog/images/pic.jpg)`。 |
| **自定义域名** | 在 `source/` 下创建 `CNAME` 文件（无后缀），内容写你的域名。 |
| **Node.js 版本** | Hexo 5.x+ 需要 Node.js 14+，建议用 LTS 版本。 |
| **Windows 权限问题** | 项目放在 D 盘或 F 盘，避免 C 盘 Program Files 等目录。 |
| **hexo d 提示权限错误** | 确认 SSH 密钥已添加到 GitHub，且使用 `git@github.com` 开头的地址。 |
| **缓存清理** | 修改主题或配置后如果页面没变化，务必执行 `hexo clean`。 |
| **主题无法更新** | 因为删除了 `.git`，如需更新主题需重新下载覆盖。 |

---
> **更新补充说明**（2026-05-19） 
## 十二、在其他电脑上克隆运行

### 12.1 克隆源码

```bash
# 创建项目目录
mkdir F:\projects
cd F:\projects

# 克隆源码（main 分支）
git clone git@github.com:用户名/仓库名.git

# 进入目录
cd gsll-blog
```

> 如果新电脑没有配置 SSH，先用 HTTPS 克隆：
> ```bash
> git clone https://github.com/用户名/仓库名.git
> ```

### 12.2 安装环境

确保已安装 Node.js 和 Git（见第一节）。

### 12.3 安装依赖

```bash
cd F:\projects\blog
npm install
```

这会读取 `package.json`，自动安装所有依赖（包括 `hexo`、`hexo-deployer-git`、`hexo-renderer-pug` 等）。

### 12.4 本地运行

```bash
hexo server
```

浏览器访问 `http://localhost:4000`。

### 12.5 新电脑上的工作流程

```bash
# 写作
hexo new "文章标题"

# 预览
hexo server

# 部署到网站
hexo clean && hexo g && hexo d

# 备份源码
git add .
git commit -m "update: 新增文章"
git push origin main
```

### 12.6 重要提醒

| 注意 | 说明 |
|------|------|
| **不要克隆 gh-pages 分支** | 那是生成的静态网页，不是源码，无法编辑。 |
| **主题文件会一起克隆** | 你之前删除了 `.git`，所以主题作为普通文件夹随源码备份。 |
| **node_modules 不推送到 GitHub** | 靠 `package.json` 在新电脑上重新安装。 |

---
> **更新补充说明**（2026-05-19） 
## 十三、双分支结构总结

| 分支 | 内容 | 谁推送 | 用途 |
|------|------|--------|------|
| `main` | Hexo 源码（文章、配置、主题） | `git push` | 备份源码，多电脑同步 |
| `gh-pages` | 生成的静态网页（HTML/CSS/JS） | `hexo d` | GitHub Pages 展示 |

---

## 快捷命令别名（PowerShell）

在 PowerShell 配置文件（`notepad $PROFILE`）中添加：

```powershell
function hexo-deploy { hexo clean; hexo generate; hexo deploy }
Set-Alias -Name hd -Value hexo-deploy
```

以后只需输入 `hd` 即可一键部署。

---

> 本教程基于 Hexo + GitHub Pages + Butterfly 主题，Windows 系统实践+AI编写。


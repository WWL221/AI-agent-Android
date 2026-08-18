# 灰风

灰风是来自《群星》L 星团的纳米机械生命，现在作为运行在安卓手机上的 AI Agent。默认“手机独立模式”下，对话、搜索、文件、任务全部在手机内运行，不依赖电脑；也可以切换到“电脑服务模式”，让电脑端的 Node Agent 服务执行 shell 和电脑文件操作。

## 它能做什么

- 对话式下达任务，Agent 自动判断是否调用工具
- 网络搜索、网页抓取
- 读取、列出、写入电脑上的 Agent 工作区文件
- 创建、更新任务列表
- 在电脑上执行 shell 命令，执行前必须由手机端批准
- 流式回复、工具调用时间线、审批弹窗
- 多对话记录、任务页、连接与模型设置
- PWA 可安装；`android/` 目录是 Capacitor 原生壳，可用 Android Studio 打包 APK

## 快速开始

需要 Node.js 20+。

```powershell
cd D:\ai\pocket-agent
npm run install:all
npm run build
npm run server
```

服务启动后会打印本机地址和局域网地址，例如：

```text
本机: http://localhost:8787
手机访问: http://192.168.1.5:8787
```

在安卓手机 Chrome 里打开该地址，即可使用。手机和电脑需要在同一局域网，并确保 Windows 防火墙放行 `8787` 端口。

## 使用真实模型

手机独立模式下，只需要在手机“设置 → 模型”里填写 API Key、选择服务商和模型，然后直接在对话页使用即可。Agent 引擎、工具循环、搜索和任务都运行在手机 App 内。

复制 `.env.example` 为 `.env`，填写：

```env
OPENAI_API_KEY=sk-...
AGENT_BASE_URL=https://api.openai.com/v1
AGENT_MODEL=gpt-4o-mini
AGENT_MOCK=false
```

也可以不配置服务端 Key，直接在手机“设置”页填写 API Key、API 地址和模型名，请求会从手机发到本地服务再转发给模型。

当前仓库里的 `.env` 默认开启了 `AGENT_MOCK=true`，无需 API Key 也能体验完整的“搜索 → 建任务 → 写文件审批”流程。

## 多模型与多 API Key

手机端“设置 → 模型”支持保存多套 API Key 配置，每套配置可以独立填写：

- 服务商名称
- API Key
- API 基础地址
- 模型名称

点选服务商卡片会自动填入官方地址和模型示例，也可以手动改成任意 OpenAI 兼容地址。配置列表里可以随时切换当前使用的 Key，支持“测试模型”验证连接。

填写 API Key 后，点击“读取模型列表”会从该 API 地址实时拉取可用模型，并以下拉列表方式选择，不需要手输模型名。

常用官方 API 地址：

| 服务商 | API 基础地址 | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini`, `gpt-4o` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat`, `deepseek-reasoner` |
| Kimi 开放平台 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k`, `kimi-k2-0711-preview` |
| 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash`, `glm-4-plus` |
| 通义千问 / 百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo`, `qwen-max` |
| 火山方舟 / 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1-6-250615`, `doubao-seed-code` |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3`, `Qwen/Qwen2.5-72B-Instruct` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-pro`, `gemini-2.5-flash` |
| xAI / Grok | `https://api.x.ai/v1` | `grok-3`, `grok-3-mini` |

## 手机端能力

Agent 可以直接读取手机信息：

- 手机型号、系统版本、制造商
- 电量与充电状态
- 语言、在线状态、可用内存和存储

也可以读取手机文件：Agent 会请求你选择一个文件，Android 系统文件选择器打开后，由你手动选择。文件内容只会发送给你配置的大模型 API，用于总结、改写、提取信息或生成新文件。

手机独立模式还会在手机 App 私有 Documents 目录里维护一个工作区，Agent 可以列出、读取、写入这些文件，不依赖电脑。

手机文件读取不会静默扫描整个手机；这是 Android 系统的安全限制，也是刻意保留的隐私边界。

## 在安卓上安装

最简单的方式是把页面添加到主屏幕：

1. 用 Chrome 打开 `http://<电脑IP>:8787`
2. 在设置页确认“服务器地址”是电脑的局域网地址
3. Chrome 菜单 → “添加到主屏幕”

浏览器对 PWA 完整安装要求安全上下文。局域网 HTTP 下 Chrome 可能只保存为快捷方式；想要真正的独立 APK，用 Capacitor 打包：

```powershell
npm run android:sync
```

然后用 Android Studio 打开 `android/` 目录，连接安卓手机后直接 Run。项目已经允许明文 HTTP，因此 App 可以访问局域网里的 `http://<电脑IP>:8787`。

更省事的调试安装方式：手机开启 USB 调试并用数据线连接电脑，然后执行：

```powershell
adb reverse tcp:8787 tcp:8787
```

此时手机访问 `http://localhost:8787`，Chrome 会把它当作安全上下文，可以完整安装 PWA。

## 目录结构

```text
web/                  React + Vite 手机端 PWA
server/               Node Agent 服务端
server/workspace/     Agent 可读写的文件工作区
server/data/          任务数据 tasks.json
android/              Capacitor 安卓原生壳
scripts/make_icons.py 生成 PWA 图标
```

## 安全设计

- `write_file` 和 `run_shell` 始终需要手机端批准
- 文件工具只能访问 `AGENT_WORKSPACE` 指定的工作区
- 设置 `AGENT_ALLOW_SHELL=false` 可以完全关闭 shell 工具
- 设置 `AGENT_AUTH_TOKEN=...` 后，所有 `/api/*` 请求都需要在手机设置里填写相同令牌
- 对话记录存在手机浏览器 localStorage，任务存在电脑端 `server/data/tasks.json`

## 常用命令

```powershell
npm run dev          # 同时启动服务端和 Vite 开发服务器
npm run build        # 构建前端到 server/public
npm run server       # 只启动服务端
npm run android:sync # 构建前端并同步到 Capacitor 安卓工程
npm run icons        # 重新生成 PWA 图标
```

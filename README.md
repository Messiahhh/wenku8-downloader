# wenku8

一个可恢复、图片完整性优先的轻小说 EPUB 下载器。

## 特性

- 下载详情、目录、章节、封面和插图后再生成 EPUB
- 章节与图片均支持断点恢复
- 图片经过格式、尺寸和解码校验
- WebP、AVIF 等格式自动转为兼容性更好的 JPEG
- 默认拒绝生成缺章或缺图的电子书
- 输出 EPUB 3，并支持调用官方 EPUBCheck 校验
- 原始 HTML、结构化书稿和资源 manifest 均保留在工作区

## 环境

推荐使用 Node.js 24 LTS 和 pnpm 9。

```bash
pnpm install
pnpm build
pnpm link --global
```

## 使用

```bash
# 交互模式
wenku8

# 搜索
wenku8 search "小说名"
wenku8 search "作者名" --author

# 查看详情
wenku8 info 1973

# 下载并生成 EPUB
wenku8 download 1973
wenku8 download https://www.wenku8.net/book/1973.htm

# 中断后继续
wenku8 resume 1973

# 查看工作区状态
wenku8 status 1973

# 使用官方 EPUBCheck 校验
wenku8 validate downloads/小说名.epub

# 检查运行环境
wenku8 doctor
```

常用下载选项：

```text
-o, --output <directory>      EPUB 输出目录
-w, --work-dir <directory>    可恢复工作区目录
-c, --concurrency <number>    网络并发数
-r, --rate-limit <number>     每秒最多请求数，默认 1
--chapter-retry-rounds <n>    章节失败后的整轮自动重试次数，默认 2
--chapter-retry-delay <ms>    章节自动重试轮次之间的等待时间，默认 15000
--cookie <value>              可选站点 Cookie
--cookie-file <file>          本地 Cookie 文件，默认读取 .wenku8-cookie
--allow-missing-images        明确允许生成缺图版本
--http-stats                  打印 Node/curl、429 和自动重试统计
```

Cookie 读取优先级为：`--cookie` 参数 > `WENKU8_COOKIE` 环境变量 > 本地 Cookie 文件。默认本地文件是项目根目录的 `.wenku8-cookie`，已被 `.gitignore` 忽略。

推荐做法是在浏览器登录后，复制 `wenku8.net` 的完整 Cookie，写入 `.wenku8-cookie`：

```text
PHPSESSID=...; jieqiUserInfo=...; jieqiVisitInfo=...
```

也可以使用 `.env` 风格：

```text
WENKU8_COOKIE="PHPSESSID=...; jieqiUserInfo=...; jieqiVisitInfo=..."
```

如果站点返回 Cloudflare challenge，CLI 会明确报错。请先在浏览器中完成验证，然后复制当前 `wenku8.net` Cookie 写入 `.wenku8-cookie`，或使用 `--cookie` / `WENKU8_COOKIE` 传入；本工具不会尝试绕过站点防护。

## 数据与恢复

默认工作区为 `downloads/<book-id>/`：

```text
manifest.json          每个网络资源的状态、尝试次数、大小和 SHA-256
book.json              规范化后的完整书稿
raw/                   原始详情、目录和章节 HTML
chapters/              可复用的结构化章节
assets/                已解码并校验的封面和插图
epub/package/          EPUB 构建前的可检查目录
```

所有文件先写入临时文件，再原子替换目标文件。重新执行 `download` 或 `resume` 时，已完成资源不会重复下载。

## 图片完整性

正文中的每个图片引用必须对应一个已下载、可解码且登记在 EPUB manifest 中的本地文件。源站仅提供 `【图片】` 占位符却没有图片地址时，默认构建失败并报告具体卷章。

`--allow-missing-images` 仅用于用户明确接受不完整产物的情况。

## 开发

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
```

解析器使用离线 HTML fixture/样例测试；EPUB 测试会检查 ZIP 中第一个条目是未压缩的 `mimetype`。发布前建议安装 EPUBCheck 5.3 或更高版本并验证真实产物。

## 架构

```text
CLI -> Downloader -> Wenku8Client -> HttpClient
                  -> ImageStore
                  -> BookWorkspace
                  -> EpubBuilder
```

站点解析、网络调度、可恢复存储、图片处理和 EPUB 构建相互独立。站点页面结构变化时，应只调整 `src/site` 及其解析测试。

## Docker

```bash
docker build -t wenku8 .
docker run --rm -it -v "$PWD/downloads:/books" wenku8 download 1973 -w /books -o /books
```

## 版权

本工具仅提供技术上的内容下载与格式转换能力。请遵守来源站点条款及当地法律，并仅下载和使用你有权访问的内容。

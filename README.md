# Ringo 的个人博客

首页以独立卡片收录技术心得、学习笔记、学术分享和生活随笔。文章用 Markdown 编写，每篇都有可单独分享的链接。仓库初始包含 6 篇公开示例和 2 篇密码保护示例。

## 本地预览

使用 Node.js 20.19 或更新版本。

```bash
npm ci
npm run dev
```

打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。修改文章或页面后，重启预览即可看到更新。两篇保护示例的演示密码是 `ringo-demo`。

## 发布到免费的 github.io 网址

1. 在自己的 GitHub 账户下使用名为 `ringosys.github.io` 的仓库。GitHub Free 的 Pages 站点使用公开仓库。
2. 首次把本地文件提交并推送到该仓库的 `main` 分支。
3. 打开仓库的 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 到 **Actions → Publish blog to GitHub Pages → Run workflow**，选 `main` 运行。部署成功后打开 [https://ringosys.github.io/](https://ringosys.github.io/)。

以后每次推送到 `main`，工作流都会重新构建并发布。站点使用 GitHub 自带的域名。 [GitHub Pages 发布设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

如果本地已经有提交，在仓库目录运行 `git push -u origin main` 即可推送。已经在 GitHub 登录并具备仓库写入权限的账户可以执行这一步。

## 写公开文章

在 `src/content/posts/` 新建小写英文文件名，例如 `my-first-post.md`。文件名前缀会成为文章地址的一部分。

```markdown
---
title: 我的第一篇文章
description: 一句话介绍这篇文章。
category: tech
date: 2026-11-23
tags: [笔记, Markdown]
visibility: public
readTime: 3
---

在这里写 Markdown 正文。
```

| `category` | 首页分类 |
| --- | --- |
| `tech` | 技术心得 |
| `learning` | 学习笔记 |
| `research` | 学术分享 |
| `life` | 生活随笔 |

## 写密码保护文章

1. 在 `content/private/` 下写文章，沿用上面的格式，把 `visibility` 改为 `private`。Git 默认忽略这个目录。标题、摘要、日期和标签会出现在公开站点上。
2. 本地预览前，在 Bash 中输入阅读密码并传给构建。

   ```bash
   read -rsp '文章阅读密码: ' BLOG_PRIVATE_PASSWORD
   printf '\n'
   BLOG_PRIVATE_PASSWORD="$BLOG_PRIVATE_PASSWORD" npm run dev
   unset BLOG_PRIVATE_PASSWORD
   ```

3. 要发布，把 Markdown 源文件加密后提交到 `src/content/protected/`。这一层使用单独的源文件口令。

   ```bash
   mkdir -p src/content/protected
   gpg --symmetric --cipher-algo AES256 \
     --output src/content/protected/my-notes.md.gpg \
     content/private/my-notes.md
   ```

4. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中设置仓库 Secrets。

   | Secret | 值 |
   | --- | --- |
   | `BLOG_PRIVATE_SOURCE_PASSPHRASE` | 上一步 GPG 使用的源文件口令 |
   | `BLOG_PRIVATE_PASSWORD` | 默认的文章阅读密码 |
   | `BLOG_PRIVATE_PASSWORDS` | 可选，按文件名前缀覆盖密码的 JSON 对象，例如 `{"my-notes":"该篇的阅读密码"}` |

访客下载的是加密正文，输入阅读密码后由浏览器解锁。站点采用共享密码，持有密码的人都可以阅读。请为实际文章使用强密码，并将原文及私密附件放在公开仓库和静态资源目录之外。已经公开过的内容可能留在 Git 历史、旧部署和第三方缓存中。

## 封面素材

首页封面由内置 imagegen 生成，保存于 `src/site/assets/mountain-journal.webp`。生成提示词如下。

> Photorealistic editorial landscape photograph for the masthead of a Chinese independent personal blog. Wide horizontal landscape, layered evergreen mountain ridges and deep forest in the foreground, a limpid winding teal mountain lake in the valley, soft bands of mist between ridges, cloudy pale warm early morning light above distant mountains. Natural fine film grain and realistic irregular pine trees. Restrained palette of fir green, sage, blue-gray and pale sandstone light. Distinct dark forest silhouettes in the foreground add depth. The right half holds the most distinct mountains, water and opening in the sky, with continuity toward dark forest at left. Calm, timeless, sophisticated outdoor magazine photograph, no artificial saturation. No people, structures, logos, text, borders, or watermarks.

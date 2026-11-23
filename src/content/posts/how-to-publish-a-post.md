---
title: 如何发布博客文章
description: 从创建 Markdown 到 GitHub Pages 上线，记录公开文章和密码保护文章的发布流程。
category: tech
date: 2026-11-23
tags: [博客, Markdown, GitHub Pages]
visibility: public
---

## 创建 Markdown 文件

公开文章放在 `src/content/posts/`。可以在编辑器里新建文件，也可以打开 [GitHub 上的文章目录](https://github.com/RingoSys/RingoSys.github.io/tree/main/src/content/posts)，点击 **Add file → Create new file**。

用小写英文字母、数字和连字符命名，例如 `my-first-post.md`。文件名决定文章的访问路径，这个例子发布后的路径是 `/posts/my-first-post/`。

## 写文章信息和正文

把下面的模板复制到文件里。两个 `---` 之间填写文章信息，后面写 Markdown 正文。页面会用 `title` 生成文章标题，正文小节可以从 `##` 开始。

```markdown
---
title: 我的第一篇文章
description: 用一句话概括文章内容。
category: tech
date: 2026-11-23
tags: [笔记, Markdown]
visibility: public
---

## 这篇文章的第一节

在这里写正文。
```

把 `date` 换成文章的发布日期。每篇文章选一个大类，可以用多个标签细分主题。比如算法竞赛的图论文章可以填 `category: algorithm` 和 `tags: [图论, 最短路]`。

| 分类值 | 博客上显示的名称 |
| --- | --- |
| `tech` | 技术心得 |
| `learning` | 学习笔记 |
| `algorithm` | 算法竞赛 |
| `research` | 学术分享 |
| `life` | 生活随笔 |

## 提交并查看发布结果

在 GitHub 网页写完后，点击 **Commit changes**，提交到 `main`。如果在本地编辑，可以先运行 `npm run dev` 预览，再在仓库目录运行下面的命令。

```bash
git add src/content/posts/my-first-post.md
git commit -m "发布我的第一篇文章"
git push origin main
```

提交进入 `main` 后，GitHub Actions 会自动部署。等最新一条记录出现绿色对勾，再刷新博客首页并点开新文章。 [查看发布进度](https://github.com/RingoSys/RingoSys.github.io/actions/workflows/pages.yml)

## 发布密码保护文章

在本地的 `content/private/` 写原稿，把文章信息中的 `visibility` 改为 `private`。用 GPG 加密 Markdown 源文件，将加密后的 `.md.gpg` 放进 `src/content/protected/`，再提交到仓库。

首次发布需要在 GitHub Actions Secrets 中设置源文件口令和访客阅读密码。文章标题、摘要、日期和标签会公开显示，访客用阅读密码解锁正文。 [加密命令和 Secrets 设置](https://github.com/RingoSys/RingoSys.github.io#写密码保护文章)

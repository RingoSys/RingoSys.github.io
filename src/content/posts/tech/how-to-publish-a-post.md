---
title: 如何发布博客文章
description: 从创建 Markdown 到 GitHub Pages 上线，记录公开文章和密码保护文章的发布流程。
date: 2026-11-23
visibility: public
---

## 创建 Markdown 文件

公开文章放在 `src/content/posts/` 下的大类目录里，可以继续建子目录。可以在编辑器里新建文件，或打开 GitHub 的文章目录，点击 **Add file → Create new file**，输入包含目录的文件名。 [GitHub 上的文章目录](https://github.com/RingoSys/RingoSys.github.io/tree/main/src/content/posts)

- `tech/my-first-post.md` 归入「Tech」。
- `algorithm/work/pdd/2026-10-26.md` 归入「Algorithms → work → pdd」，并从路径自动生成 `algorithm`、`work` 和 `pdd` 三个标签。文章详情会显示这些标签，首页搜索公开文章时也会匹配它们。

侧栏按完整目录层级展示文章分类。点击目录旁的按钮展开或收起，点击目录名可查看该目录及其子目录的文章。

目录名用英文。Markdown 文件名用小写英文字母、数字和连字符，并在整个博客内保持唯一。上面的 `2026-10-26.md` 发布后的路径是 `/posts/2026-10-26/`。

## 写文章信息和正文

把下面的模板复制到文件里。两个 `---` 之间填写文章信息，后面写 Markdown 正文。页面会用 `title` 生成文章标题，正文小节可以从 `##` 开始。

```markdown
---
title: 我的第一篇文章
description: 用一句话概括文章内容。
date: 2026-11-23
visibility: public
---

## 这篇文章的第一节

在这里写正文。
```

把 `date` 换成文章的发布日期。按目录组织时，分类和标签由路径自动生成。直接放在 `src/content/posts/` 的文章用 `category` 指定大类。

代码块会尝试自动识别语言。也可以在代码块开头标注 `cpp`、`cuda`、`python` 或 `bash` 来指定高亮，输出和日志可标注 `text`。

正文里用一对反引号标出的内容会显示为黑色粗体，英语部分优先使用 Times New Roman。例如 `` `Grid` `` 和 `` `float**` `` 会显示成 `Grid` 和 `float**`。

| 大类目录 | 博客上显示的名称 |
| --- | --- |
| `tech` | Tech |
| `learning` | Learning |
| `algorithm` | Algorithms |
| `research` | Research |
| `life` | Life |

## 提交并查看发布结果

在 GitHub 网页写完后，点击 **Commit changes**，提交到 `main`。如果在本地编辑，可以先运行 `npm run dev` 预览，再在仓库目录运行下面的命令。

```bash
git add src/content/posts/tech/my-first-post.md
git commit -m "发布我的第一篇文章"
git push origin main
```

提交进入 `main` 后，GitHub Actions 会自动部署。等最新一条记录出现绿色对勾，再刷新博客首页并点开新文章。 [查看发布进度](https://github.com/RingoSys/RingoSys.github.io/actions/workflows/pages.yml)

## 发布密码保护文章

在本地的 `content/private/` 写原稿，沿用公开文章的目录规则，并把 `visibility` 设为 `private`。用 GPG 加密 Markdown 源文件，将加密后的 `.md.gpg` 放进 `src/content/protected/` 下对应的目录，再提交到仓库。

首次发布需要在 GitHub Actions Secrets 中设置源文件口令和访客阅读密码。文章标题、摘要、日期、分类和标签会公开显示，访客用阅读密码解锁正文。 [加密命令和 Secrets 设置](https://github.com/RingoSys/RingoSys.github.io#写密码保护文章)

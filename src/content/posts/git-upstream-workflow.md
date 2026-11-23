---
title: 给 Fork 仓库留一份同步手册
description: 记下更新上游、确认分支差异和提交前检查的顺序，换到另一个仓库时也能照着走。
category: tech
date: 2026-11-08
tags: [Git, 工程实践]
visibility: public
readTime: 4
---

维护 Fork 时，经常需要把原仓库的更新带回自己的副本。以下命令假设 Fork 使用 `origin`，原仓库使用 `upstream`，两个远端都以 `main` 为主分支。仓库的分支名以自己的实际结果为准。

## 更新前先看看状态

```bash
git status --short --branch
git remote -v
git fetch upstream
git log --left-right --oneline main...upstream/main
```

前三条确认工作区情况、两个远端的地址和本地能看见的上游分支。最后一条列出只有一边存在的提交，带 `<` 的条目来自本地 `main`，带 `>` 的条目来自 `upstream/main`。

## 让日常同步保持简单

如果本地主分支只用来跟踪上游，可以用快速前进更新。

```bash
git switch main
git merge --ff-only upstream/main
```

遇到分叉时，这条合并命令会停止。先读分支差异，再根据团队的约定处理。同步完成后检查 `git status` 和最近提交，确认更新到了预期的位置。自己的改动留在功能分支上，下一次同步就更容易判断。

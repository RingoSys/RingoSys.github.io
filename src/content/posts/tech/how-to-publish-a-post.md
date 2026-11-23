---
title: How to Publish a Post
description: Write Markdown and publish public or password-protected posts on GitHub Pages.
date: 2026-11-23
visibility: public
---

## Create a Markdown file

Put a public post in a category folder under `src/content/posts/`. Create the file in an editor, or select **Add file → Create new file** in GitHub and enter the folder path along with the filename. [Open the posts folder](https://github.com/RingoSys/RingoSys.github.io/tree/main/src/content/posts)

- `tech/my-first-post.md` appears under **Tech**.
- `algorithm/work/pdd/2026-10-26.md` appears under **Algorithms → work → pdd**. Use the arrow beside any folder to expand or collapse it. Select a folder to see its posts and the posts in its subfolders.

Subfolders appear in the sidebar with the names you give them. Every folder in the path also becomes a tag. The second example generates `algorithm`, `work`, and `pdd` as tags, which appear on the article page and can be used to search for public posts.

Use lowercase letters, digits, and hyphens for the Markdown filename. Give each file a unique name across the blog. The file `2026-10-26.md` will be published at `/posts/2026-10-26/`.

## Write the post

Copy this template into your file. Fill in the fields between the `---` lines, then write the post in Markdown. The page uses `title` as the article heading, so body headings can start with `##`.

```markdown
---
title: My First Post
description: Sum up the post in one sentence.
date: 2026-11-23
visibility: public
---

## First section

Write the post here.
```

Use the publication date for `date`. Posts organized in folders get their category and tags from the path. For a post placed directly in `src/content/posts/`, use the `category` field to set its category.

The blog can detect the language of a code block. Add a language such as `cpp`, `cuda`, `python`, or `bash` to the opening fence to choose the highlighting, or use `text` for logs and plain output.

A single pair of backticks marks text in bold black, with Times New Roman preferred for Latin characters. For example, write `` `Grid` `` or `` `float**` `` to render `Grid` or `float**`.

| Top-level folder | Sidebar label |
| --- | --- |
| `tech` | Tech |
| `learning` | Learning |
| `algorithm` | Algorithms |
| `research` | Research |
| `life` | Life |

## Commit and publish

When editing on GitHub, select **Commit changes** and commit to `main`. When editing locally, run `npm run dev` to preview the post, then run these commands in the repository directory.

```bash
git add src/content/posts/tech/my-first-post.md
git commit -m "Publish my first post"
git push origin main
```

GitHub Actions deploys the site whenever a commit reaches `main`. Once the latest run shows a green check, open the blog and find the new post. [Check the deployment](https://github.com/RingoSys/RingoSys.github.io/actions/workflows/pages.yml)

## Publish a password-protected post

Write the source under `content/private/` using the same folder structure and set `visibility` to `private`. Encrypt the Markdown file with GPG, put the resulting `.md.gpg` file under `src/content/protected/` with the same folder structure, then commit it.

Before the first protected deployment, set the source passphrase and reader password in GitHub Actions Secrets. The title, summary, date, category, and tags appear on the public site. Readers enter the password to unlock the body. [GPG commands and secret settings](https://github.com/RingoSys/RingoSys.github.io#写密码保护文章)

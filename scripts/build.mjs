import { createCipheriv, createHash, pbkdf2, randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import MarkdownIt from 'markdown-it';
import { parse as parseYaml } from 'yaml';
import { highlightCode } from './highlight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = resolve(root, 'src/site');
const distribution = resolve(root, 'dist');
const homeTemplate = resolve(site, 'index.html');
const articleTemplate = resolve(site, 'article.html');
const markdown = new MarkdownIt({ html: false, linkify: true, highlight: highlightCode });
markdown.renderer.rules.code_block = (tokens, index, _options, _env, renderer) => {
  const token = tokens[index];
  const content = highlightCode(token.content) || markdown.utils.escapeHtml(token.content);
  return `<pre${renderer.renderAttrs(token)}><code>${content}</code></pre>\n`;
};
const renderImage = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('loading', 'lazy');
  tokens[index].attrSet('decoding', 'async');
  return renderImage(tokens, index, options, env, renderer);
};
const versionedAssets = {
  SITE_CSS_VERSION: 'css/style.css',
  ARTICLE_CSS_VERSION: 'css/article.css',
  SITE_JS_VERSION: 'js/site.js',
  ARTICLE_JS_VERSION: 'js/article.js',
};
const deriveKey = promisify(pbkdf2);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const demoPassword = 'ringo-demo';
const categoryLabels = {
  tech: '技术心得',
  algorithm: '算法竞赛',
  learning: '学习笔记',
  research: '学术分享',
  life: '生活随笔',
};
const mediaTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const demoMarkdown = `## 这是一篇受保护的示例文章

输入示例口令后，浏览器会在本地解锁这段正文。它用于体验阅读流程。

### 记录提纲

- 写清楚这次观察想回答的问题。
- 补充复现条件、得到的结论和后续验证方向。`;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readPosts(sourcePath, privateSource) {
  const directory = resolve(root, sourcePath);
  try {
    if ((await lstat(directory)).isSymbolicLink()) return [];
  } catch (error) {
    if (privateSource && error.code === 'ENOENT') return [];
    throw error;
  }
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  const posts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = resolve(entry.parentPath, entry.name);
    const parts = relative(directory, filePath).split(sep);
    const source = `${sourcePath}/${parts.join('/')}`;
    const folders = parts.slice(0, -1);
    const [folderCategory, subcategory] = folders;
    if (folderCategory && !Object.hasOwn(categoryLabels, folderCategory)) {
      throw new Error(`${source} 的分类目录应为以下值之一：${Object.keys(categoryLabels).join('、')}。`);
    }
    if (folders.slice(1).some((folder) => /[^A-Za-z0-9 _-]/.test(folder))) {
      throw new Error(`${source} 的子分类目录名只能包含英文字母、数字、空格、连字符和下划线。`);
    }

    const slug = entry.name.slice(0, -3);
    if (!slugPattern.test(slug)) throw new Error(`${source} 的文件名需使用小写字母、数字和连字符。`);

    const file = await readFile(filePath, 'utf8');
    const frontMatter = file.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (!frontMatter) throw new Error(`${source} 缺少 YAML 文章信息。`);

    let fields;
    try {
      fields = parseYaml(frontMatter[1], { logLevel: 'silent' });
    } catch {
      throw new Error(`${source} 的 YAML 文章信息格式有误。`);
    }

    if (!isRecord(fields)) throw new Error(`${source} 的文章信息需为 YAML 映射。`);
    const { title, description, date, tags: legacyTags, visibility, demo } = fields;
    const category = folderCategory ?? fields.category;
    if (!nonemptyString(title) || !nonemptyString(description)) {
      throw new Error(`${source} 需要填写标题和摘要。`);
    }
    if (typeof category !== 'string' || !Object.hasOwn(categoryLabels, category)) {
      throw new Error(`${source} 的类别应为以下值之一：${Object.keys(categoryLabels).join('、')}。`);
    }
    if (!isCalendarDate(date)) throw new Error(`${source} 的日期应为有效的 YYYY-MM-DD。`);
    if (!folderCategory && legacyTags !== undefined && (!Array.isArray(legacyTags) || !legacyTags.every(nonemptyString))) {
      throw new Error(`${source} 的标签应为字符串列表。`);
    }
    if (!['public', 'private'].includes(visibility)) {
      throw new Error(`${source} 的可见性应为 public 或 private。`);
    }
    if (demo !== undefined && typeof demo !== 'boolean') throw new Error(`${source} 的 demo 应为布尔值。`);

    const body = file.slice(frontMatter[0].length).trim();
    if (privateSource && (visibility !== 'private' || demo || !body)) {
      throw new Error(`${source} 需要设置为 private 并填写正文。`);
    }
    if (!privateSource && visibility === 'private' && (!demo || body)) {
      throw new Error(`${source} 的受保护正文应写在 content/private/。`);
    }
    if (visibility === 'public' && (demo || !body)) {
      throw new Error(`${source} 是公开文章，需要填写正文并关闭 demo。`);
    }

    const tags = folderCategory
      ? [...new Set(folders)]
      : (legacyTags?.map((tag) => tag.trim()) ?? [category]);
    const metadata = {
      slug,
      title: title.trim(),
      description: description.trim(),
      category,
      date,
      tags,
      visibility,
      url: `./posts/${slug}/`,
    };
    if (subcategory !== undefined) metadata.subcategory = subcategory;
    if (demo) metadata.demo = true;
    posts.push({ metadata, body });
  }
  return posts;
}

function readPasswords() {
  const setting = process.env.BLOG_PRIVATE_PASSWORDS;
  if (!nonemptyString(setting)) return {};
  let passwords;
  try {
    passwords = JSON.parse(setting);
  } catch {
    throw new Error('BLOG_PRIVATE_PASSWORDS 应为以文章文件名为键的 JSON 对象。');
  }
  if (!isRecord(passwords) || !Object.entries(passwords).every(([slug, password]) => (
    slugPattern.test(slug) && nonemptyString(password)
  ))) {
    throw new Error('BLOG_PRIVATE_PASSWORDS 应为以文章文件名为键、非空口令为值的 JSON 对象。');
  }
  return passwords;
}

async function encryptArticle(html, password) {
  const iterations = 600_000;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, iterations, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(html, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    iterations,
  };
}

function escapeHtml(value) {
  return markdown.utils.escapeHtml(value).replaceAll("'", '&#39;');
}

function scriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, token) => {
    if (!Object.hasOwn(values, token)) throw new Error(`页面模板使用了未知字段 ${token}。`);
    return values[token];
  });
}

async function assetVersions() {
  const versions = await Promise.all(Object.entries(versionedAssets).map(async ([token, path]) => {
    const contents = await readFile(resolve(site, path));
    const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12);
    return [token, digest];
  }));
  return Object.fromEntries(versions);
}

async function renderPost(template, post, passwords, versions) {
  const { metadata, body } = post;
  const { slug, title, description, category, subcategory, date, tags, visibility, demo } = metadata;
  const data = { ...metadata };
  const isPrivate = visibility === 'private';
  const html = markdown.render(demo ? demoMarkdown : body);

  if (isPrivate) {
    const privatePassword = Object.hasOwn(passwords, slug) ? passwords[slug] : process.env.BLOG_PRIVATE_PASSWORD;
    const password = demo ? demoPassword : privatePassword;
    if (!nonemptyString(password)) throw new Error(`受保护文章 ${slug} 缺少构建口令。`);
    data.encrypted = await encryptArticle(html, password);
  }

  const subcategoryCrumb = subcategory === undefined ? '' : (
    `<li><a href="../../?${escapeHtml(new URLSearchParams({ category, subcategory }).toString())}#articles">${escapeHtml(subcategory)}</a></li>`
  );

  return renderTemplate(template, {
    ...versions,
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    CATEGORY: category,
    CATEGORY_LABEL: categoryLabels[category],
    SUBCATEGORY_CRUMB: subcategoryCrumb,
    DATE: date,
    TAGS_HTML: tags.map((tag) => `<li># ${escapeHtml(tag)}</li>`).join(''),
    PUBLIC_HIDDEN: isPrivate ? 'hidden' : '',
    PRIVATE_HIDDEN: isPrivate ? '' : 'hidden',
    DEMO_HIDDEN: demo ? '' : 'hidden',
    DEMO_PASSWORD: demo ? demoPassword : '',
    ARTICLE_DATA: scriptJson(data),
    ARTICLE_BODY: isPrivate ? '' : html,
  });
}

async function build() {
  const [home, article, publicPosts, privatePosts, versions] = await Promise.all([
    readFile(homeTemplate, 'utf8'),
    readFile(articleTemplate, 'utf8'),
    readPosts('src/content/posts', false),
    readPosts('content/private', true),
    assetVersions(),
  ]);
  const posts = [...publicPosts, ...privatePosts];
  const uniqueSlugs = new Set();
  for (const { metadata } of posts) {
    if (uniqueSlugs.has(metadata.slug)) throw new Error(`文章文件名重复：${metadata.slug}。`);
    uniqueSlugs.add(metadata.slug);
  }
  posts.sort((first, second) => (
    second.metadata.date.localeCompare(first.metadata.date) || first.metadata.slug.localeCompare(second.metadata.slug)
  ));

  const passwords = readPasswords();
  const postIndex = posts.map(({ metadata }) => metadata);
  const staging = await mkdtemp(resolve(root, '.dist-'));
  try {
    await cp(site, staging, {
      recursive: true,
      filter: async (source) => (
        source !== homeTemplate && source !== articleTemplate && extname(source) !== '.md'
        && !(await lstat(source)).isSymbolicLink()
      ),
    });
    await writeFile(resolve(staging, 'index.html'), renderTemplate(home, { ...versions, POST_INDEX: scriptJson(postIndex) }));
    const postsDirectory = resolve(staging, 'posts');
    await mkdir(postsDirectory, { recursive: true });
    await writeFile(resolve(postsDirectory, 'index.json'), `${JSON.stringify(postIndex, null, 2)}\n`);
    await writeFile(resolve(staging, '.nojekyll'), '');
    for (const post of posts) {
      const html = await renderPost(article, post, passwords, versions);
      const directory = resolve(postsDirectory, post.metadata.slug);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'index.html'), html);
    }
    await rm(distribution, { recursive: true, force: true });
    await rename(staging, distribution);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`已构建 ${posts.length} 篇文章，站点文件位于 dist/。`);
}

async function serve() {
  await stat(resolve(distribution, 'index.html'));
  const port = Number(process.env.PORT ?? 4173);
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    try {
      const target = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(target.pathname);
      let file = resolve(distribution, `.${pathname}`);
      const fromRoot = relative(distribution, file);
      if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        response.writeHead(404).end();
        return;
      }

      if ((await stat(file)).isDirectory()) {
        if (!target.pathname.endsWith('/')) {
          response.writeHead(308, { Location: `${target.pathname}/${target.search}` }).end();
          return;
        }
        file = resolve(file, 'index.html');
      }

      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mediaTypes[extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`本地预览运行在 http://127.0.0.1:${server.address().port}/`);
  });
}

try {
  const mode = process.argv[2];
  if (mode !== '--preview') await build();
  if (mode === '--serve' || mode === '--preview') await serve();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

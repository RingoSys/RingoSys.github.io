const categories = {
  all: "全部文章",
  tech: "技术心得",
  learning: "学习笔记",
  algorithm: "算法竞赛",
  research: "学术分享",
  life: "生活随笔",
};

const pageSize = 6;
const search = document.querySelector("#article-search");
const sort = document.querySelector("#article-sort");
const filters = document.querySelector("#category-filters");
const filterButtons = filters.querySelectorAll("button");
const links = document.querySelectorAll("[data-nav-category]");
const grid = document.querySelector("#article-grid");
const count = document.querySelector("#article-count");
const message = document.querySelector("#archive-message");
const pagination = document.querySelector("#pagination");
const archiveTitle = document.querySelector("#archive-title");

let posts = [];
let state = readState();

function readState() {
  const parameters = new URLSearchParams(location.search);
  const category = parameters.get("category");
  const page = Number(parameters.get("page"));

  return {
    category: Object.hasOwn(categories, category) ? category : "all",
    query: parameters.get("q") ?? "",
    sort: parameters.get("sort") === "oldest" ? "oldest" : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

function stateUrl(nextState, hash = location.hash) {
  const url = new URL(location.pathname, location.origin);

  if (nextState.category !== "all") url.searchParams.set("category", nextState.category);
  if (nextState.query.trim()) url.searchParams.set("q", nextState.query.trim());
  if (nextState.sort !== "newest") url.searchParams.set("sort", nextState.sort);
  if (nextState.page > 1) url.searchParams.set("page", String(nextState.page));

  url.hash = hash;
  return url;
}

function updateState(changes, { replace = false, scroll = false } = {}) {
  state = { ...state, page: 1, ...changes };
  const url = stateUrl(state, scroll ? "#articles" : location.hash);

  if (url.href !== location.href) {
    if (replace) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }
  }

  render();

  if (scroll) {
    archiveTitle.focus({ preventScroll: true });
    document.querySelector("#articles").scrollIntoView();
  }
}

function node(tag, className, label) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label) element.textContent = label;
  return element;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `./assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

function buildCard(post) {
  const locked = post.visibility === "private";
  const card = node("article", locked ? "article-card article-card-private" : "article-card");

  const meta = node("div", "card-meta");
  const category = node("span", `category-label category-${post.category}`, categories[post.category]);
  const date = node("time", "card-date", post.date.replaceAll("-", "."));
  date.dateTime = post.date;
  meta.append(category, date);

  const title = node("h3", "card-title");
  const titleLink = node("a", "", post.title);
  titleLink.href = post.url;
  title.append(titleLink);

  const description = node("p", "card-description", locked ? "这篇文章已加密，输入密码后可阅读。" : post.description);

  const footer = node("div", "card-footer");
  const status = node("span", locked ? "card-status card-status-private" : "card-status");
  status.append(icon(locked ? "lock" : "clock"), locked ? "密码保护" : `${post.readTime} 分钟阅读`);

  const action = node("a", "card-action", locked ? "解锁文章" : "阅读全文");
  action.href = post.url;
  action.setAttribute("aria-label", `${action.textContent} · ${post.title}`);
  footer.append(status, action);

  card.append(meta, title, description, footer);
  return card;
}

function renderPagination(page, total) {
  pagination.hidden = total <= 1;
  pagination.replaceChildren();
  if (total <= 1) return;

  const previous = node("button", "pagination-step", "上一页");
  previous.type = "button";
  previous.dataset.page = String(page - 1);
  previous.disabled = page === 1;

  const position = node("span", "pagination-position", `第 ${page} / ${total} 页`);

  const next = node("button", "pagination-step", "下一页");
  next.type = "button";
  next.dataset.page = String(page + 1);
  next.disabled = page === total;

  pagination.append(previous, position, next);
}

function matchingPosts() {
  const terms = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return posts.filter((post) => {
    if (state.category !== "all" && state.category !== post.category) return false;

    const searchable = post.visibility === "private"
      ? [post.title, categories[post.category], "密码保护", "私密"]
      : [post.title, post.description, categories[post.category], ...post.tags];
    const text = searchable.join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((first, second) => {
    const direction = state.sort === "oldest" ? 1 : -1;
    return direction * first.date.localeCompare(second.date) || first.slug.localeCompare(second.slug);
  });
}

function render() {
  search.value = state.query;
  sort.value = state.sort;
  for (const button of filterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
  }
  for (const link of links) {
    if (link.dataset.navCategory === state.category) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  const matches = matchingPosts();
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(state.page, pages);
  if (page !== state.page) {
    state.page = page;
    history.replaceState(null, "", stateUrl(state));
  }

  const first = (page - 1) * pageSize;
  grid.replaceChildren(...matches.slice(first, first + pageSize).map(buildCard));
  count.textContent = `共 ${matches.length} 篇文章`;
  message.hidden = matches.length > 0;
  message.textContent = state.query.trim() ? "没有找到符合条件的文章。" : "暂无文章。";
  renderPagination(page, pages);
}

archiveTitle.tabIndex = -1;

try {
  const response = await fetch(new URL("../posts/index.json", import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  posts = await response.json();
  for (const button of filterButtons) {
    const category = button.dataset.category;
    const total = category === "all" ? posts.length : posts.filter((post) => post.category === category).length;
    button.querySelector(".category-count").textContent = total;
  }
  render();

  search.addEventListener("input", () => updateState({ query: search.value }, { replace: true }));
  sort.addEventListener("change", () => updateState({ sort: sort.value }));
  filters.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-category]");
    if (filter) updateState({ category: filter.dataset.category });
  });
  pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (button) updateState({ page: Number(button.dataset.page) }, { scroll: true });
  });
  for (const link of links) {
    if (link.dataset.navCategory === "all") continue;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      updateState({ category: link.dataset.navCategory, query: "" }, { scroll: true });
    });
  }
  window.addEventListener("popstate", () => {
    state = readState();
    render();
  });
} catch (error) {
  console.error("Could not load the article index.", error);
  message.textContent = "文章目录加载失败，请刷新页面重试。";
}

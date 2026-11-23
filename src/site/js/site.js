const categories = {
  all: "All posts",
  tech: "Tech",
  learning: "Learning",
  algorithm: "Algorithms",
  research: "Research",
  life: "Life",
};

const pageSize = 6;
const search = document.querySelector("#article-search");
const sort = document.querySelector("#article-sort");
const filters = document.querySelector("#category-filters");
const categoryButtons = filters.querySelectorAll("button[data-category]");
const links = document.querySelectorAll("[data-nav-category]");
const grid = document.querySelector("#article-grid");
const count = document.querySelector("#article-count");
const message = document.querySelector("#archive-message");
const pagination = document.querySelector("#pagination");
const archiveTitle = document.querySelector("#archive-title");

let posts = [];
let state = readState();
const categoryTrees = new Map();
let folderListId = 0;

function readState() {
  const parameters = new URLSearchParams(location.search);
  const category = parameters.get("category");
  const page = Number(parameters.get("page"));

  return {
    category: Object.hasOwn(categories, category) ? category : "all",
    subcategory: parameters.get("subcategory"),
    query: parameters.get("q") ?? "",
    sort: parameters.get("sort") === "oldest" ? "oldest" : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

function stateUrl(nextState, hash = location.hash) {
  const url = new URL(location.pathname, location.origin);

  if (nextState.category !== "all") url.searchParams.set("category", nextState.category);
  if (nextState.subcategory) url.searchParams.set("subcategory", nextState.subcategory);
  if (nextState.query.trim()) url.searchParams.set("q", nextState.query.trim());
  if (nextState.sort !== "newest") url.searchParams.set("sort", nextState.sort);
  if (nextState.page > 1) url.searchParams.set("page", String(nextState.page));

  url.hash = hash;
  return url;
}

function updateState(changes, { replace = false, scroll = false } = {}) {
  state = { ...state, page: 1, ...changes };
  const url = stateUrl(state, scroll || state.subcategory ? "#articles" : location.hash);

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

function postFolders(post) {
  if (Array.isArray(post.folderPath) && post.folderPath[0] === post.category) {
    return post.folderPath.slice(1);
  }
  return post.subcategory ? [post.subcategory] : [];
}

function makeFolder() {
  return { count: 0, children: new Map() };
}

function addPostToCategory(post) {
  let folder = categoryTrees.get(post.category);
  if (!folder) return;

  folder.count += 1;
  for (const name of postFolders(post)) {
    if (!folder.children.has(name)) folder.children.set(name, makeFolder());
    folder = folder.children.get(name);
    folder.count += 1;
  }
}

function setFolderExpanded(folder, expanded) {
  folder.toggle.setAttribute("aria-expanded", String(expanded));
  folder.list.hidden = !expanded;
}

function buildFolderBranch(button, category, folder, path) {
  const branch = node("div", "category-branch");
  const row = node("div", "category-filter-row");
  const toggle = node("button", "category-toggle");
  const list = node("ul", "subcategory-filters");
  const label = `Subfolders of ${[categories[category], ...path].join(" / ")}`;

  folderListId += 1;
  list.id = `subcategory-filters-${folderListId}`;
  list.setAttribute("aria-label", label);
  toggle.type = "button";
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("aria-controls", list.id);
  toggle.append(icon("chevron"));

  for (const name of [...folder.children.keys()].sort((first, second) => first.localeCompare(second))) {
    const childFolder = folder.children.get(name);
    const childPath = [...path, name];
    const item = node("li");
    const child = node("button", "subcategory-filter", name);
    child.type = "button";
    child.dataset.category = category;
    child.dataset.subcategory = childPath.join("/");
    child.setAttribute("aria-pressed", "false");

    const total = node("span", "category-count", String(childFolder.count));
    total.setAttribute("aria-hidden", "true");
    child.append(total);
    item.append(childFolder.children.size ? buildFolderBranch(child, category, childFolder, childPath) : child);
    list.append(item);
  }

  folder.toggle = toggle;
  folder.list = list;
  setFolderExpanded(folder, false);
  toggle.addEventListener("click", () => setFolderExpanded(folder, list.hidden));

  button.replaceWith(branch);
  row.append(button, toggle);
  branch.append(row, list);
  return branch;
}

function buildCategoryFilters() {
  for (const category of Object.keys(categories)) {
    if (category !== "all") categoryTrees.set(category, makeFolder());
  }
  for (const post of posts) addPostToCategory(post);

  for (const button of categoryButtons) {
    const category = button.dataset.category;
    const folder = categoryTrees.get(category);
    button.querySelector(".category-count").textContent = folder?.count ?? posts.length;
    if (folder?.children.size) {
      buildFolderBranch(button, category, folder, []);
      filters.classList.add("has-subcategories");
    }
  }
}

function restoreSubcategory() {
  if (state.subcategory === null) return;

  const ancestors = [];
  let folder = categoryTrees.get(state.category);
  for (const name of state.subcategory.split("/")) {
    const child = folder?.children.get(name);
    if (!child) {
      state.subcategory = null;
      history.replaceState(null, "", stateUrl(state));
      return;
    }
    ancestors.push(folder);
    folder = child;
  }
  for (const ancestor of ancestors) setFolderExpanded(ancestor, true);
}

function buildCard(post) {
  const locked = post.visibility === "private";
  const card = node("article", locked ? "article-card article-card-private" : "article-card");

  const meta = node("div", "card-meta");
  const categoryText = [categories[post.category], ...postFolders(post)].join(" / ");
  const category = node("span", `category-label category-${post.category}`, categoryText);
  const date = node("time", "card-date", post.date.replaceAll("-", "."));
  date.dateTime = post.date;
  meta.append(category, date);

  const title = node("h3", "card-title");
  const titleLink = node("a", "", post.title);
  titleLink.href = post.url;
  title.append(titleLink);

  const description = node("p", "card-description", locked ? "Enter the password to read this post." : post.description);

  const footer = node("div", "card-footer");
  if (locked) {
    const status = node("span", "card-status");
    status.append(icon("lock"), "Password protected");
    footer.append(status);
  }

  const action = node("a", "card-action", locked ? "Unlock post" : "Read post");
  action.href = post.url;
  action.setAttribute("aria-label", `${action.textContent} · ${post.title}`);
  footer.append(action);

  card.append(meta, title, description, footer);
  return card;
}

function renderPagination(page, total) {
  pagination.hidden = total <= 1;
  pagination.replaceChildren();
  if (total <= 1) return;

  const previous = node("button", "pagination-step", "Previous");
  previous.type = "button";
  previous.dataset.page = String(page - 1);
  previous.disabled = page === 1;

  const position = node("span", "pagination-position", `Page ${page} of ${total}`);

  const next = node("button", "pagination-step", "Next");
  next.type = "button";
  next.dataset.page = String(page + 1);
  next.disabled = page === total;

  pagination.append(previous, position, next);
}

function matchingPosts() {
  const terms = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const selectedFolders = state.subcategory?.split("/") ?? [];
  const direction = state.sort === "oldest" ? 1 : -1;
  return posts.filter((post) => {
    if (state.category !== "all" && state.category !== post.category) return false;

    const path = postFolders(post);
    if (!selectedFolders.every((name, index) => name === path[index])) return false;

    const hierarchy = [categories[post.category], ...path, path.join("/")];
    const searchable = post.visibility === "private"
      ? [post.title, ...hierarchy, "password protected", "private"]
      : [post.title, post.description, ...hierarchy, ...post.tags];
    const text = searchable.join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((first, second) => {
    return direction * first.date.localeCompare(second.date) || first.slug.localeCompare(second.slug);
  });
}

function render() {
  search.value = state.query;
  sort.value = state.sort;
  for (const button of filters.querySelectorAll("button[data-category]")) {
    const selected = button.dataset.category === state.category && (button.dataset.subcategory ?? null) === state.subcategory;
    button.setAttribute("aria-pressed", String(selected));
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
  count.textContent = matches.length === 1 ? "1 post" : `${matches.length} posts`;
  message.hidden = matches.length > 0;
  message.textContent = state.query.trim() ? "No posts match your search." : "No posts yet.";
  renderPagination(page, pages);
}

archiveTitle.tabIndex = -1;

try {
  const index = document.querySelector("#post-index");
  if (index) {
    posts = JSON.parse(index.textContent);
  } else {
    const response = await fetch(new URL("../posts/index.json", import.meta.url), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    posts = await response.json();
  }
  buildCategoryFilters();
  restoreSubcategory();
  render();

  search.addEventListener("input", () => updateState({ query: search.value }, { replace: true }));
  sort.addEventListener("change", () => updateState({ sort: sort.value }));
  filters.addEventListener("click", (event) => {
    const filter = event.target.closest("button[data-category]");
    if (filter) updateState({
      category: filter.dataset.category,
      subcategory: filter.dataset.subcategory ?? null,
    });
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
      updateState({ category: link.dataset.navCategory, subcategory: null, query: "" }, { scroll: true });
    });
  }
  window.addEventListener("popstate", () => {
    state = readState();
    restoreSubcategory();
    render();
  });
} catch (error) {
  console.error("Could not load the article index.", error);
  message.textContent = "The post list could not load. Refresh the page to try again.";
}

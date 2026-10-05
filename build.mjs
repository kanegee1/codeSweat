// Tiny static blog generator: posts/*.md -> dist/
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "dist");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fmtDate = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function parse(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "tags") v = v.replace(/^\[|\]$/g, "").split(",").map(t => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      meta[k] = v;
    }
  }
  const slug = meta.slug || slugify(path.basename(file, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, ""));
  const words = body.split(/\s+/).filter(Boolean).length;
  const firstPara = body.split(/\n\s*\n/).find(p => p.trim() && !p.trim().startsWith("#")) || "";
  return {
    ...meta,
    slug,
    tags: meta.tags || [],
    draft: meta.draft === "true",
    html: marked.parse(body),
    minutes: Math.max(1, Math.round(words / 220)),
    excerpt: meta.description || firstPara.replace(/[*_`#>\[\]()]/g, "").slice(0, 160),
  };
}

const posts = fs.readdirSync(path.join(ROOT, "posts"))
  .filter(f => f.endsWith(".md"))
  .map(f => parse(path.join(ROOT, "posts", f)))
  .filter(p => !p.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

const tagMap = {};
for (const p of posts) for (const t of p.tags) (tagMap[t] ||= []).push(p);

const BUILD = Date.now().toString(36); // changes every deploy so browsers fetch fresh CSS
const initials = cfg.author.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

function layout({ title, description, body, depth = 0 }) {
  const up = "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || cfg.description)}">
<meta name="theme-color" content="#f5f5f4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || cfg.description)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%233b49df'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'>${esc(initials)}</text></svg>">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.title)}" href="${up}feed.xml">
<link rel="stylesheet" href="${up}style.css?v=${BUILD}">
</head>
<body>
<header class="topbar">
  <div class="wrap bar">
    <a class="logo" href="${up}index.html">${esc(cfg.title)}</a>
    <nav><a href="${up}tags.html">Tags</a><a href="${up}about.html">About</a></nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="wrap foot">© ${new Date().getFullYear()} ${esc(cfg.author)} · <a href="${up}feed.xml">RSS</a></footer>
</body>
</html>`;
}

const tagChips = (tags, up) => tags.map(t => `<a class="tag" href="${up}tags/${slugify(t)}.html">#${esc(t)}</a>`).join("");

// Cover can be a full link or a site image like images/photo.jpg
const coverSrc = (p, up) => /^https?:\/\//.test(p.cover) ? p.cover : up + p.cover.replace(/^(\.\.\/|\/)+/, "");

function card(p, up) {
  const href = `${up}posts/${p.slug}.html`;
  return `<article class="card${p.cover ? " has-cover" : ""}">
  <div class="card-body">
  <div class="byline"><span class="avatar">${esc(initials)}</span><div><div class="author">${esc(cfg.author)}</div><time datetime="${p.date}">${fmtDate(p.date)}</time></div></div>
  <h2><a href="${href}">${esc(p.title)}</a></h2>
  <p class="excerpt">${esc(p.excerpt)}</p>
  <div class="tags">${tagChips(p.tags, up)}</div>
  <div class="read">${p.minutes} min read</div>
  </div>
  ${p.cover ? `<a class="card-cover" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(coverSrc(p, up))}" alt="" loading="lazy"></a>` : ""}
</article>`;
}

function write(rel, html) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "static"), OUT, { recursive: true });

// Home
write("index.html", layout({
  title: cfg.title,
  body: `<section class="hero"><h1>${esc(cfg.title)}</h1><p>${esc(cfg.description)}</p></section>
<div class="feed">${posts.map(p => card(p, "")).join("\n") || "<p>No posts yet.</p>"}</div>`,
}));

// Posts
for (const p of posts) {
  write(`posts/${p.slug}.html`, layout({
    title: `${p.title} · ${cfg.title}`,
    description: p.excerpt,
    depth: 1,
    body: `<article class="post">
  ${p.cover ? `<img class="cover" src="${esc(coverSrc(p, "../"))}" alt="">` : ""}
  <div class="post-inner">
    <div class="byline"><span class="avatar">${esc(initials)}</span><div><div class="author">${esc(cfg.author)}</div><time datetime="${p.date}">Posted ${fmtDate(p.date)} · ${p.minutes} min read</time></div></div>
    <h1>${esc(p.title)}</h1>
    <div class="tags">${tagChips(p.tags, "../")}</div>
    <div class="prose">${p.html}</div>
  </div>
</article>
<p class="back"><a href="../index.html">← All posts</a></p>`,
  }));
}

// Tags
write("tags.html", layout({
  title: `Tags · ${cfg.title}`,
  body: `<section class="hero"><h1>Tags</h1></section><div class="tag-grid">${Object.keys(tagMap).sort().map(t =>
    `<a class="tag-tile" href="tags/${slugify(t)}.html"><strong>#${esc(t)}</strong><span>${tagMap[t].length} post${tagMap[t].length > 1 ? "s" : ""}</span></a>`).join("")}</div>`,
}));
for (const [t, list] of Object.entries(tagMap)) {
  write(`tags/${slugify(t)}.html`, layout({
    title: `#${t} · ${cfg.title}`,
    depth: 1,
    body: `<section class="hero"><h1>#${esc(t)}</h1><p>${list.length} post${list.length > 1 ? "s" : ""}</p></section><div class="feed">${list.map(p => card(p, "../")).join("\n")}</div>`,
  }));
}

// About
const aboutFile = path.join(ROOT, "about.md");
write("about.html", layout({
  title: `About · ${cfg.title}`,
  body: `<article class="post"><div class="post-inner"><h1>About</h1><div class="prose">${fs.existsSync(aboutFile) ? marked.parse(fs.readFileSync(aboutFile, "utf8")) : ""}</div></div></article>`,
}));

// RSS
const base = (cfg.url || "").replace(/\/$/, "");
write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(cfg.title)}</title><link>${base}/</link><description>${esc(cfg.description)}</description>
${posts.map(p => `<item><title>${esc(p.title)}</title><link>${base}/posts/${p.slug}.html</link><guid>${base}/posts/${p.slug}.html</guid><pubDate>${new Date(p.date + "T12:00:00Z").toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join("\n")}
</channel></rss>`);

write("404.html", layout({ title: "Not found", body: `<section class="hero"><h1>Page not found</h1><p><a href="index.html">Back home</a></p></section>` }));
write(".nojekyll", "");

console.log(`Built ${posts.length} posts, ${Object.keys(tagMap).length} tags → dist/`);

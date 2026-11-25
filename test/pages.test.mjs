import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SHADOW_CLAW_LOBSTER_HASHES = new Set([
  "33a5914fdb9b42c622ceb4bdfd421d7c8792ce3809a10acc83dd356a975c1f66", // 48.png
  "a48ba6e50b2f8c54ee08480cb131365372757e9677e71fb09996395e3dacc086", // 72.png
  "1c7002983e6a36a309914466acf7aa98044b95e7fb940c17a03189638aa54a1d", // 96.png
  "4c1f774f8df852836dfbac0ac9400f0ae9fe9d3f340379f7588dbfee599c8e59", // 128.png
  "7d8bb2f52284861d86f89820f887c9b804e15f347cc3b38777612abc3c37e1f", // 152.png
  "9898621a296cc836d79a2b8881fe126bd73823eb53a8fbabbb9a0761e0280cc4", // 180.png
  "46fe87f35e8d62257eda46149045bad8edd8e382d22f0df92a4a635e0286e8a0", // 192.png
  "02c2881dbb68aa86e5e499c38c893386c1af4f048d557438987b7c2e7286eace", // 512.png
  "423e9e930bd88b9e7f28087b1a1a26e55f6c75426996d10172596e939833f5f2", // 1024.png
  "035f49ba449226300ac237220e8a5ed0472ea77885dee63a978f3db35128adda", // favicon.ico
  "8aa7e215fa7ebe34bb5a12f1842f75caa365659733c460caa42d038afe25911b", // shadow-claw-screenshot-1920x1052.png
  "7997952cc418887610d1d24d3306805ccf028d9b6f73740d456042eb0592f5e9", // shadow-claw-screenshot-731x1045.png
]);

const SHADOW_CLAW_TEMPLATE_HASHES = new Set([
  "118965590f55c73a20e25592dea4a666abf36793a1cdce08d62a2186792b835e", // template 1024.png
  "c6019d82f8567b61a8e3c903cf57ea434928fd3e89b00a49c851a1b61dbaf719", // template 128.png
  "693566d7fa9e983431130fb64d2527df191dd954f9b08e48a5253f85168ea1b5", // template 152.png
  "96137c2e1277359315aa137989761e1708b178a5b9907ee2b8b9f41a9ab434e0", // template 167.png
  "9ef307b8395e8d48a2270a022ead53fb40d6bd4ed63266a9b71dccd385c5d74a", // template 180.png / apple-touch-icon.png
  "055071ee09999687b1e32523abd32e7aaeaae981cd5e52db760c35d01b7d6d74", // template 192.png
  "79786c3636879586aa137575b62ffa28f95f256cd551664c8637090e39fe46e3", // template 48.png
  "34fc4063c90a39b466e0dcdd9f46a75a117ba2fa4875c7a22a1c80e7033940ea", // template 512.png
  "e8c1492e3623c9318a8fe653097fd1cb336afdd00f231b6bfd7a41ba1165a5cb", // template 72.png
  "db3c371dfb096aab3f081446f9eb30f13b723f9a0aeed71c3c2416c4da502698", // template 96.png
  "e3181b2b8efea759ba294b12d2624975eafed5618f47b8bfb36cb9692f4c9868", // template favicon.ico
  "eeacd97852ff157ed49573ed15b29a62306f931b07be090194758d4493e7ad34", // shadow-claw-template-1024x768.png
  "348f2ac5690b47b26d21e7fc477f2efb38bf0b752cfd75e46840eafffaa6e7bf", // shadow-claw-template-731x1045.png
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

test("PWA Manifest: Draw manifest metadata and isolation", () => {
  const manifestPath = resolve(ROOT, "pages/resources/manifest.json");
  assert.ok(existsSync(manifestPath), "manifest.json must exist");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.id, "shadow-claw-draw");
  assert.equal(manifest.name, "ShadowClaw Draw");
  assert.equal(manifest.short_name, "ShadowClaw Draw");
  assert.equal(manifest.scope, ".");
  assert.equal(manifest.start_url, ".");
  assert.equal(manifest.theme_color, "#0f1419");
  assert.equal(manifest.background_color, "#0f1419");
  assert.doesNotMatch(manifest.description || "", /\btemplate\b/i);
  assert.doesNotMatch(manifest.description || "", /\bdaw\b/i);

  assert.ok(
    Array.isArray(manifest.file_handlers) && manifest.file_handlers.length > 0,
    "manifest.file_handlers must declare Draw file handlers",
  );
  const acceptExts = Object.values(
    manifest.file_handlers[0]?.accept || {},
  ).flat();
  for (const ext of [".svg", ".png", ".scdraw.json"]) {
    assert.ok(
      acceptExts.includes(ext),
      `manifest.file_handlers[0].accept must include ${ext}`,
    );
  }

  const iconSources = manifest.icons.map((i) => i.src);
  assert.ok(
    !iconSources.includes("assets/icons/favicon.svg"),
    "manifest.icons must not include SVG favicon (avoids Chrome DevTools image decode failure)",
  );
  assert.ok(iconSources.includes("assets/icons/167.png"));
  assert.ok(iconSources.includes("assets/icons/180.png"));
  assert.ok(iconSources.includes("assets/icons/192.png"));
  assert.ok(iconSources.includes("assets/icons/512.png"));

  const screenshots = manifest.screenshots || [];
  assert.ok(
    screenshots.some((s) => s.form_factor === "wide"),
    "manifest.screenshots must include a wide screenshot",
  );
  assert.ok(
    screenshots.some((s) => s.form_factor === "narrow" || !s.form_factor),
    "manifest.screenshots must include a narrow/mobile screenshot",
  );
  for (const s of screenshots) {
    assert.doesNotMatch(
      s.src,
      /shadow-claw-screenshot|shadow-claw-template/i,
      "Must not reference default ShadowClaw or template screenshot",
    );
    const screenshotPath = resolve(ROOT, "pages/resources", s.src);
    assert.ok(
      existsSync(screenshotPath),
      `Screenshot file ${s.src} must exist on disk`,
    );
    const hash = createHash("sha256")
      .update(readFileSync(screenshotPath))
      .digest("hex");
    assert.equal(
      SHADOW_CLAW_LOBSTER_HASHES.has(hash) ||
        SHADOW_CLAW_TEMPLATE_HASHES.has(hash),
      false,
      `Screenshot ${s.src} matches leftover default/template screenshot!`,
    );
  }
});

test("Site Config: Draw branding, directPages, customElements, and security sandbox", () => {
  const configPath = resolve(ROOT, "shadow-claw.config.json");
  assert.ok(existsSync(configPath), "shadow-claw.config.json must exist");

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.site?.title, "ShadowClaw Draw");
  assert.equal(config.branding?.titleText, "ShadowClaw Draw");
  assert.equal(config.branding?.faviconPath, "assets/icons/favicon.svg");
  assert.equal(config.branding?.appleTouchIconPath, "assets/icons/180.png");
  assert.equal(config.branding?.ogImagePath, "assets/icons/512.png");
  assert.ok(
    config.branding?.logoSlotHtml &&
      config.branding.logoSlotHtml.includes("<svg"),
    "branding.logoSlotHtml must provide custom Draw SVG logo",
  );
  assert.equal(config.pwa?.id, "shadow-claw-draw");
  assert.equal(config.pwa?.name, "ShadowClaw Draw");
  assert.equal(config.pwa?.shortName, "ShadowClaw Draw");

  assert.equal(config.pages?.defaultPinnedPage, "/pages/main/index.html");
  assert.ok(
    Array.isArray(config.pages?.directPages) &&
      config.pages.directPages.includes("/pages/main/index.html"),
    "pages.directPages must include /pages/main/index.html",
  );

  const allowed = config.customElements?.allowedElements || [];
  for (const tag of [
    "shadow-claw-draw-vector-workbench",
    "shadow-claw-draw-toolbox",
    "shadow-claw-draw-vector-canvas",
    "shadow-claw-draw-layers-panel",
    "shadow-claw-draw-inspector",
    "shadow-claw-draw-status-bar",
    "shadow-claw-draw-resize-handle",
  ]) {
    assert.ok(allowed.includes(tag), `allowedElements must include ${tag}`);
  }

  const scripts = config.customElements?.scripts || [];
  const elScript = scripts.find((s) => s.id === "shadow-claw-draw-element");
  const adapterScript = scripts.find((s) => s.id === "scdraw-adapter");
  assert.ok(elScript && elScript.global === true && elScript.autoload === true);
  assert.ok(
    adapterScript &&
      adapterScript.global === true &&
      adapterScript.autoload === true &&
      adapterScript.hasInit === true,
  );

  const sandbox = config.security?.iframeSandbox || [];
  for (const token of [
    "allow-modals",
    "allow-scripts",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
  ]) {
    assert.ok(sandbox.includes(token), `iframeSandbox must include ${token}`);
  }
  assert.ok(
    Array.isArray(config.security?.workerSrc) &&
      config.security.workerSrc.includes("blob:"),
    "workerSrc must allow blob: workers for OPFS fallback",
  );
});

test("Pages: main index.html hosts shadow-claw-draw-vector-workbench directly with iframe: false and swipe suppression", () => {
  const indexPath = resolve(ROOT, "pages/main/index.html");
  assert.ok(existsSync(indexPath), "pages/main/index.html must exist");

  const indexContent = readFileSync(indexPath, "utf8");
  assert.match(indexContent, /title:\s*["']ShadowClaw Draw[^"']*["']/);
  assert.match(indexContent, /iframe:\s*false/);
  assert.match(
    indexContent,
    /<div\s+class=["']scdraw-workbench-page["'][^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["']/,
  );
  assert.match(
    indexContent,
    /<shadow-claw-draw-vector-workbench[^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["'][^>]*><\/shadow-claw-draw-vector-workbench>/,
  );
});

test("Pages: Page 2 Bitmap Studio exists with iframe: false, swipe suppression, route /main/bitmap/, directPages, and allowedElements", () => {
  const bitmapPath = resolve(ROOT, "pages/main/~/content/01-bitmap.html");
  assert.ok(
    existsSync(bitmapPath),
    "pages/main/~/content/01-bitmap.html must exist",
  );

  const bitmapContent = readFileSync(bitmapPath, "utf8");
  assert.match(
    bitmapContent,
    /title:\s*["']ShadowClaw Draw[^"']*Bitmap[^"']*["']/i,
  );
  assert.match(bitmapContent, /iframe:\s*false/);
  assert.match(
    bitmapContent,
    /<div\s+class=["']scdraw-workbench-page["'][^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["']/,
  );
  assert.match(
    bitmapContent,
    /<shadow-claw-draw-bitmap-workbench[^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["'][^>]*><\/shadow-claw-draw-bitmap-workbench>/,
  );

  const routes = JSON.parse(
    readFileSync(resolve(ROOT, "pages/resources/routes.json"), "utf8"),
  );
  assert.deepEqual(routes.routes["/pages/main/~/content/01-bitmap.html"], {
    prettyPath: "/main/bitmap/",
  });

  const config = JSON.parse(
    readFileSync(resolve(ROOT, "shadow-claw.config.json"), "utf8"),
  );
  assert.ok(
    config.pages?.directPages?.includes("/pages/main/~/content/01-bitmap.html"),
    "pages.directPages must include /pages/main/~/content/01-bitmap.html",
  );
  for (const tag of [
    "shadow-claw-draw-bitmap-workbench",
    "shadow-claw-draw-bitmap-canvas",
    "shadow-claw-draw-filter-panel",
  ]) {
    assert.ok(
      config.customElements?.allowedElements?.includes(tag),
      `allowedElements must include ${tag}`,
    );
  }

  const llmsTxt = readFileSync(
    resolve(ROOT, "pages/resources/llms.txt"),
    "utf8",
  );
  assert.match(llmsTxt, /\/main\//);
  assert.match(llmsTxt, /\/main\/bitmap\//);
  assert.match(llmsTxt, /\/main\/animation\//);
});

test("Pages: Page 3 Animation Studio exists with iframe: false, swipe suppression, route /main/animation/, directPages, and allowedElements", () => {
  const animPath = resolve(ROOT, "pages/main/~/content/02-animation.html");
  assert.ok(
    existsSync(animPath),
    "pages/main/~/content/02-animation.html must exist",
  );

  const animContent = readFileSync(animPath, "utf8");
  assert.match(
    animContent,
    /title:\s*["']ShadowClaw Draw[^"']*Animation[^"']*["']/i,
  );
  assert.match(animContent, /iframe:\s*false/);
  assert.match(
    animContent,
    /<div\s+class=["']scdraw-workbench-page["'][^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["']/,
  );
  assert.match(
    animContent,
    /<shadow-claw-draw-animation-workbench[^>]*\bdata-no-swipe=["']true["'][^>]*\bdata-no-nav=["']true["'][^>]*><\/shadow-claw-draw-animation-workbench>/,
  );

  const routes = JSON.parse(
    readFileSync(resolve(ROOT, "pages/resources/routes.json"), "utf8"),
  );
  assert.deepEqual(routes.routes["/pages/main/~/content/02-animation.html"], {
    prettyPath: "/main/animation/",
  });

  const config = JSON.parse(
    readFileSync(resolve(ROOT, "shadow-claw.config.json"), "utf8"),
  );
  assert.ok(
    config.pages?.directPages?.includes(
      "/pages/main/~/content/02-animation.html",
    ),
    "pages.directPages must include /pages/main/~/content/02-animation.html",
  );
  for (const tag of [
    "shadow-claw-draw-animation-workbench",
    "shadow-claw-draw-animation-stage",
    "shadow-claw-draw-timeline",
    "shadow-claw-draw-export-panel",
    "shadow-claw-draw-capture-panel",
  ]) {
    assert.ok(
      config.customElements?.allowedElements?.includes(tag),
      `allowedElements must include ${tag}`,
    );
  }
});

test("Iconography: Draw icons are ShadowClaw Draw-specific and do not collide with default ShadowClaw or template icons", () => {
  const iconsDir = resolve(ROOT, "pages/resources/assets/icons");
  assert.ok(existsSync(iconsDir), "assets/icons directory must exist");

  const requiredIcons = [
    "favicon.svg",
    "favicon.ico",
    "apple-touch-icon.png",
    "48.png",
    "72.png",
    "96.png",
    "128.png",
    "152.png",
    "167.png",
    "180.png",
    "192.png",
    "512.png",
    "1024.png",
  ];

  for (const iconName of requiredIcons) {
    const iconPath = resolve(iconsDir, iconName);
    assert.ok(existsSync(iconPath), `Icon file ${iconName} must exist`);

    const bytes = readFileSync(iconPath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(
      !SHADOW_CLAW_LOBSTER_HASHES.has(hash),
      `Icon ${iconName} matches default ShadowClaw lobster icon!`,
    );
    assert.ok(
      !SHADOW_CLAW_TEMPLATE_HASHES.has(hash),
      `Icon ${iconName} matches leftover shadow-claw-template blue cube icon!`,
    );
  }

  const svgContent = readFileSync(resolve(iconsDir, "favicon.svg"), "utf8");
  assert.ok(
    svgContent.includes("#f59e0b") || svgContent.includes("#38bdf8"),
    "favicon.svg must contain ShadowClaw Draw palette colors",
  );
});

test("Screenshots: Assets are ShadowClaw Draw-specific with no default ShadowClaw or template screenshots", () => {
  const screenshotsDir = resolve(ROOT, "pages/resources/assets/screenshots");
  assert.ok(
    existsSync(screenshotsDir),
    "assets/screenshots directory must exist",
  );

  const files = readdirSync(screenshotsDir);
  assert.ok(files.length > 0, "At least one screenshot must exist");
  for (const file of files) {
    assert.doesNotMatch(
      file,
      /shadow-claw-screenshot|shadow-claw-template/i,
      `Screenshot ${file} still has template/default filename`,
    );
    const filePath = resolve(screenshotsDir, file);
    const bytes = readFileSync(filePath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(
      !SHADOW_CLAW_LOBSTER_HASHES.has(hash),
      `Screenshot ${file} matches default ShadowClaw lobster screenshot!`,
    );
    assert.ok(
      !SHADOW_CLAW_TEMPLATE_HASHES.has(hash),
      `Screenshot ${file} matches leftover shadow-claw-template screenshot!`,
    );
  }
});

test("Branding & Theme Identity: strictly identifies as ShadowClaw Draw (no template, DAW, or LightMeter residue)", () => {
  assert.equal(
    existsSync(resolve(ROOT, "pages/main/~/content/01-about.md")),
    false,
    "Boilerplate 01-about.md must be removed",
  );
  const routes = JSON.parse(
    readFileSync(resolve(ROOT, "pages/resources/routes.json"), "utf8"),
  );
  assert.equal(
    routes.routes["/pages/main/~/content/01-about.md"],
    undefined,
    "routes.json must not map removed 01-about.md",
  );

  const themeCss = readFileSync(resolve(ROOT, "pages/main/theme.css"), "utf8");
  assert.doesNotMatch(themeCss, /--lightmeter-/i);
  assert.doesNotMatch(themeCss, /\btemplate\b/i);
  assert.doesNotMatch(themeCss, /\bdaw\b/i);
  assert.match(themeCss, /--scdraw-font-display/);
  assert.match(themeCss, /--shadow-claw-bg-primary-reverse/);
  assert.match(
    themeCss,
    /\.light,\s*\n?\.light-mode\s*\{[\s\S]*?--md-sys-color-primary:/,
  );
  assert.match(
    themeCss,
    /\.light,\s*\n?\.light-mode\s*\{[\s\S]*?--shadow-claw-bg-primary:/,
  );
  assert.match(
    themeCss,
    /\.scdraw-workbench-page\s*\{[\s\S]*?touch-action:\s*pan-y/,
  );
  assert.match(
    themeCss,
    /\.scdraw-workbench-page\s*\{[\s\S]*?overscroll-behavior-x:\s*contain/,
  );

  const resetMd = readFileSync(resolve(ROOT, "pages/main/RESET.md"), "utf8");
  assert.match(resetMd, /title:\s*["']ShadowClaw Draw - Reset["']/);
  assert.match(resetMd, /slug:\s*["']shadow-claw--purge-pages["']/);

  const memoryMd = readFileSync(resolve(ROOT, "pages/main/MEMORY.md"), "utf8");
  assert.match(memoryMd, /title:\s*["']ShadowClaw Draw[^"']*["']/);
  assert.match(memoryMd, /\*\*ShadowClaw Draw\*\*/);
  assert.doesNotMatch(memoryMd, /\/main\/about\//);
  assert.doesNotMatch(memoryMd, /\btemplate\b/i);

  const notFoundHtml = readFileSync(
    resolve(ROOT, "pages/resources/404.html"),
    "utf8",
  );
  assert.match(notFoundHtml, /<title>ShadowClaw Draw - Not Found<\/title>/);
  assert.match(notFoundHtml, /\/shadow-claw-draw\/main\//);
  assert.match(notFoundHtml, /\/shadow-claw-draw\/main\/bitmap\//);
  assert.match(notFoundHtml, /\/shadow-claw-draw\/main\/animation\//);

  const llmsTxt = readFileSync(
    resolve(ROOT, "pages/resources/llms.txt"),
    "utf8",
  );
  assert.doesNotMatch(llmsTxt, /Template info/i);
  assert.doesNotMatch(llmsTxt, /\/main\/about\//);

  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.name, "shadow-claw-draw");
  assert.doesNotMatch(pkg.description || "", /\btemplate\b/i);
  assert.doesNotMatch(pkg.description || "", /\bdaw\b/i);

  const pkgLock = JSON.parse(
    readFileSync(resolve(ROOT, "package-lock.json"), "utf8"),
  );
  assert.equal(pkgLock.name, "shadow-claw-draw");
  assert.equal(pkgLock.packages?.[""]?.name, "shadow-claw-draw");

  const agentsMd = readFileSync(resolve(ROOT, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agentsMd, /ShadowClaw template/i);
});

test("Documentation Links: relative links in pages/main/~/content/*.md resolve to existing files", () => {
  const contentDir = resolve(ROOT, "pages/main/~/content");
  const mdFiles = readdirSync(contentDir).filter((f) => f.endsWith(".md"));
  assert.ok(mdFiles.length > 0, "Expected markdown documentation files");

  for (const file of mdFiles) {
    const raw = readFileSync(resolve(contentDir, file), "utf8");
    const stripped = raw.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
    for (const match of stripped.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1].trim();
      if (!href || href.startsWith("#") || /^(?:https?:|mailto:)/i.test(href)) {
        continue;
      }
      assert.ok(
        !href.startsWith("../"),
        `${file}: broken relative slug link "${href}" should reference sibling .md filename`,
      );
      const target = href.split(/[?#]/, 1)[0];
      assert.ok(
        existsSync(resolve(contentDir, target)),
        `${file}: relative link "${href}" points to missing file ${target}`,
      );
    }
  }
});

test("Documentation Accuracy: docs reflect all three studios and 36 tools without stale counts", () => {
  const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
  assert.match(readme, /Three Studios/);
  assert.match(readme, /\/main\/animation\//);
  assert.match(readme, /\b36\b/);
  assert.match(readme, /06-animation-studio-tools\.md/);
  assert.doesNotMatch(readme, /Two Studios|dual-page|26 declarative|all 26/i);

  const stalePattern =
    /\bdual-page\b|\bdual-studio\b|\ball 26\b|\b26 `scdraw_\*`/i;

  for (const rel of [
    "AGENTS.md",
    "pages/resources/llms.txt",
    "pages/main/MEMORY.md",
  ]) {
    const content = readFileSync(resolve(ROOT, rel), "utf8");
    assert.doesNotMatch(
      content,
      stalePattern,
      `${rel} must not contain stale dual-studio or 26-tool counts`,
    );
  }

  const contentDir = resolve(ROOT, "pages/main/~/content");
  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(resolve(contentDir, file), "utf8");
    assert.doesNotMatch(
      content,
      stalePattern,
      `pages/main/~/content/${file} must not contain stale dual-studio or 26-tool counts`,
    );
  }

  for (const docFile of [
    "03-vector-studio-tools.md",
    "04-bitmap-studio-tools.md",
  ]) {
    const content = readFileSync(resolve(contentDir, docFile), "utf8");
    assert.match(
      content,
      /06-animation-studio-tools\.md/,
      `${docFile} must cross-link 06-animation-studio-tools.md`,
    );
  }
});

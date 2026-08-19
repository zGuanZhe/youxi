/* ============================================================
 * ag-toggle.js — 有栖（Arisu）页内主题切换按钮 v2
 * ============================================================
 * 嵌入契约：本文件由 tools/deploy.cjs 原样注入引擎
 * renderer-inject.js 的 IIFE 内部（最终 return 之前），
 * 依赖其闭包常量：THEME / DISABLED_KEY / STATE_KEY /
 * STYLE_REGISTRY_KEY / STYLE_ID / PART_ATTR / ROOT_ATTRS /
 * THEME_VARIABLES。不可独立运行，不可包含
 * __DREAM_SKIN_*__ 占位符。
 *
 * v3 变更（用户反馈：仍无法点击 + 去光晕去立体）：
 *   1) 【点击修复·根因】Shadow DOM 内 style 声明的
 *      -webkit-app-region 不会被应用（计算值实测为 none 而非
 *      no-drag）——改用 JS inline style 在 document tree 的
 *      host 元素上声明，从菜单条 drag 区豁免出可点击区。
 *      CDP 注入点击不经过 browser process 的 drag region
 *      判断，故此前测试通过而真实鼠标失败。
 *   2) 【视觉扁平】去掉 box-shadow 光晕与 radial-gradient
 *      立体感：开=纯色紫圆点；关=灰色空心环。
 *
 * v2 变更（用户反馈：无法点击 + 太花哨 + 原主题态要有图案）：
 *   1) 【点击修复·误诊】:host 与 button 在 shadow style 中声明
 *      no-drag（实测不生效，见 v3 根因说明）。
 *   2) 【视觉收敛】去掉呼吸动画/凝视环/多层辉光/hover 滤镜。
 *      开=素净紫晶圆点；关=清晰的空心环（原主题态图案），
 *      双态 16px、0.22s 淡入淡出。
 *
 * 行为：
 *   - 每个新文档随皮肤一起安装；Codex 启动 = 皮肤自动开启
 *   - 按钮挂在顶部菜单条（ApplicationMenuTopBar）最左端，
 *     React 重渲染/路由切换后 300ms 防抖自动重挂；
 *     菜单条不存在时降级为窗口左上角 fixed 覆盖层
 *   - 点击关闭：置 __CODEX_DREAM_SKIN_DISABLED__（引擎 ensure()
 *     短路，所有自修复观察器停手）→ 剥离皮肤痕迹
 *     （data-dream-* 属性 / --dream-*|--ds-* 变量 /
 *     data-ds-part / adoptedStyleSheets / style 节点）→ 纯原版
 *   - 点击开启：清 DISABLED → 复用引擎 state.ensure() 一次性
 *     恢复全部痕迹；全程零 CDP、零外部进程交互
 *   - 状态不持久化：刷新/重开文档即回到皮肤开启（符合
 *     “Codex 打开自动使用自定义主题”）
 *   - 无常驻定时器；观察器 300ms 防抖 + 已挂载早退，
 *     稳态开销≈0
 * ============================================================ */
  (() => {
    if ((THEME.id || "") !== "preset-amethyst-gaze") return;

    const AG_REGISTRY = "__AG_TOGGLE_REGISTRY__";
    const HOST_ID = "ag-theme-toggle-host";
    const BAR_SELECTOR = 'div[class*="_ApplicationMenuTopBar_"]';

    // 新一代 payload 安装时，拆除上一代按钮（观察器/定时器/节点）
    const previous = window[AG_REGISTRY];
    if (previous) {
      try { previous.dispose?.(); } catch {}
      delete window[AG_REGISTRY];
    }

    const readTruth = () => !window[DISABLED_KEY] &&
      document.documentElement.getAttribute("data-dream-skin") === "active";

    // —— 关：熄灭引擎自修复 + 剥离全部皮肤痕迹（对照引擎
    //    removeFromSession，但保留 STATE 与 artUrl 以便页内恢复）——
    const stripSkin = () => {
      window[DISABLED_KEY] = true;
      const root = document.documentElement;
      if (root) {
        for (const name of ROOT_ATTRS) root.removeAttribute(name);
        for (const attribute of [...root.attributes]) {
          if (attribute.name.startsWith("data-dream-")) root.removeAttribute(attribute.name);
        }
        for (const name of THEME_VARIABLES) root.style.removeProperty(name);
        for (const property of [...root.style]) {
          if (property.startsWith("--dream-") || property.startsWith("--ds-")) {
            root.style.removeProperty(property);
          }
        }
      }
      for (const node of document.querySelectorAll("[" + PART_ATTR + "]")) {
        node.removeAttribute(PART_ATTR);
      }
      const sheets = window[STYLE_REGISTRY_KEY];
      if (sheets && "adoptedStyleSheets" in document) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets]
          .filter((sheet) => !sheets.has(sheet));
      }
      document.getElementById(STYLE_ID)?.remove();
    };

    // —— 开：借引擎自己的修复通道一次性还原（无 CDP 往返）——
    const restoreSkin = () => {
      const state = window[STATE_KEY];
      if (typeof state?.ensure !== "function") return false;
      window[DISABLED_KEY] = false;
      state.ensure({ root: true, parts: true, scope: true });
      return true;
    };

    // —— 按钮 DOM（Shadow DOM 隔离，双态皆自洽）——
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("data-ag-toggle", "true");
    // 点击修复：Shadow DOM 内 style 声明的 -webkit-app-region 不会被应用
    // （实测计算值为 none 而非 no-drag），必须用 inline style 在 document
    // tree 的 host 上声明，才能从菜单条 drag 区豁免出可点击区
    host.style.setProperty("-webkit-app-region", "no-drag");
    const shadow = host.attachShadow({ mode: "open" });
    const styleNode = document.createElement("style");
    styleNode.textContent = [
      // no-drag：菜单条是窗口拖拽区，不声明则真实点击被拖拽吞掉
      ":host { all: initial; -webkit-app-region: no-drag;",
      "  display: flex; align-items: center; height: 100%; padding: 0 4px 0 3px; }",
      "button { all: unset; -webkit-app-region: no-drag; box-sizing: border-box;",
      "  display: grid; place-items: center; width: 26px; height: 26px;",
      "  border-radius: 8px; cursor: pointer; transition: background-color .18s ease; }",
      "button:hover { background: rgba(139, 116, 174, .16); }",
      "button:active { background: rgba(139, 116, 174, .26); }",
      "button:focus-visible { outline: 2px solid rgba(176, 121, 224, .7); outline-offset: 2px; }",
      ".stage { position: relative; width: 16px; height: 16px; }",
      ".orb { position: absolute; inset: 0; border-radius: 999px;",
      "  transition: opacity .22s ease, transform .22s ease; }",
      ".orb--on { background: #a86fd6; }",
      ".orb--off { box-sizing: border-box; border: 1.5px solid #8b95a5;",
      "  background: transparent; opacity: 0; transform: scale(.7); }",
      '[aria-checked="false"] .orb--on { opacity: 0; transform: scale(.7); }',
      '[aria-checked="false"] .orb--off { opacity: 1; transform: scale(1); }',
      "@media (prefers-reduced-motion: reduce) { .orb { transition: none; } }",
    ].join("\n");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "switch");
    const stage = document.createElement("span");
    stage.className = "stage";
    const orbOn = document.createElement("span");
    orbOn.className = "orb orb--on";
    const orbOff = document.createElement("span");
    orbOff.className = "orb orb--off";
    stage.append(orbOn, orbOff);
    button.append(stage);
    shadow.append(styleNode, button);

    const sync = () => {
      const on = readTruth();
      const stalled = !window[STATE_KEY];
      const label = stalled
        ? "有栖 · 引擎已暂停（重启注入器后可用）"
        : on ? "有栖 · 皮肤已启用 — 点击切回原版"
          : "有栖 · 皮肤已停用 — 点击换回皮肤";
      if (button.getAttribute("aria-checked") !== (on ? "true" : "false")) {
        button.setAttribute("aria-checked", on ? "true" : "false");
      }
      if (button.getAttribute("title") !== label) {
        button.setAttribute("title", label);
        button.setAttribute("aria-label", label);
      }
    };

    button.addEventListener("click", () => {
      if (readTruth()) stripSkin();
      else restoreSkin();
      sync();
    });

    // —— 挂载：优先菜单条最左端；栏不在时降级 fixed 覆盖层 ——
    // dispose 守卫：新一代 payload 安装时旧代定时器可能迟到触发，
    // 防止已拆除的旧按钮被重新挂回（僵尸按钮）
    let disposed = false;
    const timers = new Set();
    const later = (fn, delay) => {
      const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay);
      timers.add(timer);
    };
    const registry = {
      host,
      observer: null,
      dispose: () => {
        disposed = true;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        registry.observer?.disconnect();
        host.remove();
      },
    };
    window[AG_REGISTRY] = registry;

    const tryMount = () => {
      if (disposed) return false;
      const bar = document.querySelector(BAR_SELECTOR);
      if (bar) {
        if (host.parentElement === bar) return true;
        // 清掉 fixed 降级属性的同时必须保住 no-drag（cssText="" 会连它一起清掉）
        host.style.cssText = "-webkit-app-region:no-drag;";
        bar.insertBefore(host, bar.firstChild);
        return true;
      }
      return false;
    };

    const fallbackFixed = () => {
      if (disposed || host.isConnected) return;
      host.style.cssText = "position:fixed;top:0;left:4px;height:40px;" +
        "-webkit-app-region:no-drag;display:flex;align-items:center;z-index:2147483000;";
      document.documentElement.appendChild(host);
    };

    // 首次挂载：0/300/800/1600ms 梯度重试；5s 后仍未挂上则降级 fixed
    [0, 300, 800, 1600].forEach((delay) => {
      later(() => { if (!tryMount()) sync(); }, delay);
    });
    later(fallbackFixed, 5000);

    // 防抖观察器：栏消失/被 React 重建时重挂；html 门控属性被
    // 外部改动（如引擎暂停文件）时同步按钮视觉。稳态零定时器。
    let pending = false;
    const onDomActivity = () => {
      if (disposed || pending) return;
      pending = true;
      later(() => {
        pending = false;
        const parent = host.parentElement;
        if (!host.isConnected || !(parent && parent.matches && parent.matches(BAR_SELECTOR))) {
          tryMount();
        }
        sync();
      }, 300);
    };
    const observer = new MutationObserver(onDomActivity);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-dream-skin"],
    });
    const observeBody = () => {
      if (!disposed) observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) observeBody();
    else {
      document.addEventListener("DOMContentLoaded", observeBody, { once: true });
    }
    registry.observer = observer;

    sync();
  })();

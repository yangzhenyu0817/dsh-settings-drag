/*!
 * dsh-settings-drag v0.4 —— 让 DSH Web 设置面板可以自由拖动 + 缩放。
 *
 * 用法:
 *   · 拖动:按住左侧导航栏空白处或顶部标题条,把面板拉到窗口内任何位置;
 *     允许探出屏幕边缘(右/下/上可大幅探出),但始终保留可抓回的边缘:
 *     左侧至少 160px(导航栏)、顶部至少 96px(标题带)、右边/底边至少 96px 在屏内。
 *   · 缩放(v0.3:三处抓手,像普通窗口一样直观):
 *       - 右下角握角(22px 三角)        → 双轴缩放
 *       - 右边缘上段(标题条对应的 8px) → 水平缩放
 *       - 底边缘中段(避让两角 24px)    → 垂直缩放
 *     抓手都是独立 fixed 浮层元素(挂在 body 上,React 管不到,零冲突),
 *     悬停显示对应方向光标(nwse / ew / ns-resize);面板关闭时自动隐藏。
 *     尺寸范围 480x360 ~ 视口-48px,顶左角锚定不漂移。
 *   · 双击抓取区(导航/标题条)→ 位置动画归中、尺寸恢复默认、记忆清空。
 *     v0.4 起用"两次快速点按(400ms/8px)"自建检测:拖动逻辑 preventDefault 会吞掉
 *     浏览器 dblclick,原生双击在抓取区上永远不会触发。
 *   · 位置与尺寸分别记忆在 localStorage(dsh-settings-drag-offset-v1 / -size-v1),
 *     重开面板、刷新页面不丢;窗口尺寸变化时自动重新约束。
 *
 * 结构定位(刻意避开 CSS module 哈希类名,跨小版本更稳):
 *   面板   = div[role=dialog][data-shortcut-modal="settings"]
 *   侧栏   = 面板的 <nav> 直接子元素
 *   标题条 = 面板 content 的第一个子元素
 * 任何一步匹配失败都静默退化,绝不影响宿主;整体 try/catch 兜底。
 */
(function () {
	'use strict';
	try {
		if (window.__dshSettingsDragInstalled) return;
		window.__dshSettingsDragInstalled = true;

		var PANEL = '[data-shortcut-modal="settings"]';
		var OFFSET_KEY = 'dsh-settings-drag-offset-v1';
		var SIZE_KEY = 'dsh-settings-drag-size-v1';
		var STYLE_ID = 'dsh-settings-drag-style';
		var OPEN_CLASS = 'dsh-sdrag-open';
		var GRIP_CORNER = 22; // 右下角握角边长
		var EDGE = 8; // 边缘抓手厚度
		var EDGE_PAD = 24; // 底边缘抓手距两角的避让
		var HEADER_ZONE = 54; // 右边缘抓手只占标题条高度(避开 options 滚动条)
		var MIN_W = 480, MIN_H = 360; // 缩放下限
		// 缩放上限对齐应用自身 CSS(width:800px;max-width:calc(100vw-48px);height 同理)
		function maxW() { return Math.max(MIN_W, window.innerWidth - 48); }
		function maxH() { return Math.max(MIN_H, window.innerHeight - 48); }
		// 自由拖动的"可抓回"保底:各边至少保留多少 px 在屏内
		var KEEP_LEFT = 160, KEEP_RIGHT = 96, KEEP_TOP = 96, KEEP_BOTTOM = 96;
		// 抓取区里照常点击/输入的元素:从它们身上按下不算拖动开始
		var INTERACTIVE = 'button,a,input,select,textarea,label,summary,[role="button"],[role="tab"],[role="switch"],[role="menuitem"],[role="option"],[role="link"],[role="checkbox"],[role="radio"],[contenteditable=""],[contenteditable="true"]';

		var applied = new WeakMap(); // panel -> 当前生效的 {dx,dy}
		var sized = new WeakMap(); // panel -> 当前生效的 {w,h}(未设置则跟随 CSS)
		var dragging = null;
		var resizing = null;
		var lastTap = null; // v0.4:自建双击检测(pointerdown 的 preventDefault 会吞掉浏览器 dblclick)
		var zones = null; // { corner, right, bottom }
		var stored = readKey(OFFSET_KEY, function (v) { return { dx: Number(v.dx), dy: Number(v.dy) }; });
		var storedSize = readKey(SIZE_KEY, function (v) { return { w: Number(v.w), h: Number(v.h) }; });

		function current(panel) { return applied.get(panel) || { dx: 0, dy: 0 }; }
		function currentSize(panel) { return sized.get(panel) || null; }

		function readKey(key, pick) {
			try {
				var raw = localStorage.getItem(key);
				if (!raw) return null;
				var v = JSON.parse(raw);
				var out = pick(v || {});
				for (var k in out) if (!isFinite(out[k])) return null;
				return out;
			} catch (e) {}
			return null;
		}
		function writeKey(key, value) {
			try {
				if (!value) localStorage.removeItem(key);
				else localStorage.setItem(key, JSON.stringify(value));
			} catch (e) {}
		}

		// —— 位置:自由移动 + 可抓回保底 ——
		function clamp(panel, dx, dy) {
			var cur = current(panel);
			var rect = panel.getBoundingClientRect();
			var baseLeft = rect.left - cur.dx; // 未平移时的左上角坐标
			var baseTop = rect.top - cur.dy;
			var w = rect.width, h = rect.height;
			var dxMin = KEEP_LEFT - w - baseLeft; // 左探出时保住导航栏 160px
			var dxMax = window.innerWidth - KEEP_RIGHT - baseLeft; // 右探出时至少留 96px
			var dyMin = KEEP_TOP - h - baseTop; // 上探出时保住顶部抓取带 96px
			var dyMax = window.innerHeight - KEEP_BOTTOM - baseTop; // 下探出时至少留 96px
			if (dxMin > dxMax) dxMin = dxMax;
			if (dyMin > dyMax) dyMin = dyMax;
			return {
				dx: Math.min(Math.max(dx, dxMin), dxMax),
				dy: Math.min(Math.max(dy, dyMin), dyMax)
			};
		}

		function applyOffset(panel, dx, dy, animate) {
			var c = clamp(panel, dx, dy);
			if (animate) {
				panel.style.transition = 'transform 180ms ease-out';
				window.setTimeout(function () { panel.style.transition = ''; }, 220);
			}
			panel.style.transform = (c.dx === 0 && c.dy === 0) ? '' : 'translate(' + c.dx + 'px,' + c.dy + 'px)';
			applied.set(panel, c);
			syncZones();
			return c;
		}

		// —— 尺寸:内联 width/height,先夹到 [下限, 视口-48] 再应用 ——
		function applySize(panel, w, h) {
			var cw = Math.min(Math.max(Math.round(w), MIN_W), maxW());
			var ch = Math.min(Math.max(Math.round(h), MIN_H), maxH());
			panel.style.width = cw + 'px';
			panel.style.height = ch + 'px';
			sized.set(panel, { w: cw, h: ch });
			syncZones();
			return { w: cw, h: ch };
		}

		// —— 抓取区 = 侧栏 <nav> + 标题条(content 的第一个子元素) ——
		function grabAreas(panel) {
			var areas = [];
			var nav = panel.querySelector(':scope > nav');
			if (nav) areas.push(nav);
			var content = panel.querySelector(':scope > div');
			var header = content ? content.firstElementChild : null;
			if (header) areas.push(header);
			return areas;
		}
		function areaForTarget(panel, target) {
			var areas = grabAreas(panel);
			for (var i = 0; i < areas.length; i++) {
				if (areas[i] === target || areas[i].contains(target)) return areas[i];
			}
			return null;
		}
		function panelOf(node) { return node && node.closest ? node.closest(PANEL) : null; }

		// —— 缩放抓手:三个独立 fixed 浮层挂在 body 上(React 管不到,零冲突) ——
		function makeZone(id, mode, cursor, title) {
			var el = document.createElement('div');
			el.id = id;
			el.setAttribute('data-sdrag-zone', mode);
			el.title = title;
			el.hidden = true;
			el.addEventListener('pointerdown', function (e) { onZoneDown(e, mode); });
			(document.body || document.documentElement).appendChild(el);
			return el;
		}
		function ensureZones() {
			if (zones && zones.corner && zones.corner.isConnected) return zones;
			try {
				zones = {
					corner: makeZone('dsh-settings-drag-grip', 'xy', 'nwse-resize', '拖动缩放设置面板(双击标题区恢复默认)'),
					right: makeZone('dsh-settings-drag-edge-r', 'x', 'ew-resize', '拖动调整面板宽度'),
					bottom: makeZone('dsh-settings-drag-edge-b', 'y', 'ns-resize', '拖动调整面板高度')
				};
			} catch (e) { zones = null; }
			return zones;
		}
		function syncZones() {
			var z = ensureZones();
			if (!z) return;
			var panel = document.querySelector(PANEL);
			if (!panel || !panel.isConnected) {
				z.corner.hidden = z.right.hidden = z.bottom.hidden = true;
				return;
			}
			var r = panel.getBoundingClientRect();
			z.corner.hidden = false;
			z.corner.style.left = Math.round(r.right - GRIP_CORNER) + 'px';
			z.corner.style.top = Math.round(r.bottom - GRIP_CORNER) + 'px';
			// 右边缘只占标题条高度段,避开 options 区的垂直滚动条
			z.right.hidden = false;
			z.right.style.left = Math.round(r.right - EDGE) + 'px';
			z.right.style.top = Math.round(r.top + 6) + 'px';
			z.right.style.height = Math.max(24, Math.min(HEADER_ZONE, r.height) - 12) + 'px';
			// 底边缘中段,避让两角(角上有握角,且左下是导航区)
			z.bottom.hidden = false;
			z.bottom.style.left = Math.round(r.left + EDGE_PAD) + 'px';
			z.bottom.style.top = Math.round(r.bottom - EDGE) + 'px';
			z.bottom.style.width = Math.max(48, r.width - EDGE_PAD * 2) + 'px';
		}

		function onZoneDown(e, mode) {
			try {
				if (e.pointerType === 'mouse' && e.button !== 0) return;
				var panel = document.querySelector(PANEL);
				if (!panel) return;
				var rect = panel.getBoundingClientRect();
				var cur = current(panel);
				panel.style.transition = '';
				resizing = {
					panel: panel, id: e.pointerId, mode: mode,
					x0: e.clientX, y0: e.clientY,
					w0: rect.width, h0: rect.height,
					dx0: cur.dx, dy0: cur.dy
				};
				panel.classList.add(OPEN_CLASS);
				try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
				e.preventDefault();
				e.stopPropagation();
			} catch (err) {}
		}

		// —— 指针事件 ——
		function onPointerDown(e) {
			try {
				if (e.pointerType === 'mouse' && e.button !== 0) return;
				var panel = panelOf(e.target);
				if (!panel) return;
				if (e.target.closest && e.target.closest(INTERACTIVE)) return;
				var area = areaForTarget(panel, e.target);
				if (!area) return;
				// v0.4:两次快速点按 = 复位(浏览器 dblclick 被下面的 preventDefault 吞掉,只能自己判)
				var now = Date.now();
				if (lastTap && lastTap.panel === panel && now - lastTap.time < 400 &&
					Math.abs(e.clientX - lastTap.x) < 8 && Math.abs(e.clientY - lastTap.y) < 8) {
					lastTap = null;
					resetPanel(panel);
					e.preventDefault();
					return;
				}
				lastTap = { panel: panel, time: now, x: e.clientX, y: e.clientY };
				var cur = current(panel);
				panel.style.transition = ''; // 结束可能还在跑的归位动画
				dragging = {
					panel: panel, area: area, id: e.pointerId,
					x0: e.clientX, y0: e.clientY,
					dx0: cur.dx, dy0: cur.dy, moved: false
				};
				try { area.setPointerCapture(e.pointerId); } catch (err) {}
				e.preventDefault(); // 阻止选中文本/原生拖拽
			} catch (err) {}
		}

		function onPointerMove(e) {
			try {
				if (resizing) {
					if (e.pointerId !== resizing.id) return;
					var w = resizing.w0, h = resizing.h0;
					if (resizing.mode !== 'y') w = resizing.w0 + (e.clientX - resizing.x0);
					if (resizing.mode !== 'x') h = resizing.h0 + (e.clientY - resizing.y0);
					var s = applySize(resizing.panel, w, h);
					// 顶左角锚定:宽高变化的一半用平移补偿,面板不会向左上“缩回去”
					applyOffset(resizing.panel,
						resizing.dx0 + (s.w - resizing.w0) / 2,
						resizing.dy0 + (s.h - resizing.h0) / 2, false);
					return;
				}
				if (dragging) {
					if (e.pointerId !== dragging.id) return;
					var mx = e.clientX - dragging.x0;
					var my = e.clientY - dragging.y0;
					if (!dragging.moved) {
						if (Math.abs(mx) + Math.abs(my) < 3) return; // 微小抖动不算拖动
						dragging.moved = true;
						lastTap = null; // 真拖动了,就不再算双击的前半段
						dragging.panel.classList.add(OPEN_CLASS);
					}
					applyOffset(dragging.panel, dragging.dx0 + mx, dragging.dy0 + my, false);
				}
			} catch (err) {}
		}

		function endDrag(e) {
			try {
				if (!e || e.pointerId === undefined) return;
				if (resizing && e.pointerId === resizing.id) {
					var rp = resizing.panel;
					try { if (zones) (resizing.mode === 'x' ? zones.right : resizing.mode === 'y' ? zones.bottom : zones.corner).releasePointerCapture(resizing.id); } catch (err) {}
					rp.classList.remove(OPEN_CLASS);
					writeKey(SIZE_KEY, currentSize(rp));
					resizing = null;
					return;
				}
				if (dragging && e.pointerId === dragging.id) {
					var dp = dragging.panel;
					try { dragging.area.releasePointerCapture(dragging.id); } catch (err) {}
					dp.classList.remove(OPEN_CLASS);
					if (dragging.moved) writeKey(OFFSET_KEY, current(dp));
					dragging = null;
				}
			} catch (err) {}
		}

		// 复位:位置动画归中 + 尺寸恢复默认 + 清空记忆(v0.4 起双击/双击点按都走这里)
		function resetPanel(panel) {
			try {
				applyOffset(panel, 0, 0, true);
				panel.style.width = '';
				panel.style.height = '';
				sized.delete(panel);
				stored = null;
				storedSize = null;
				writeKey(OFFSET_KEY, null);
				writeKey(SIZE_KEY, null);
				syncZones();
			} catch (err) {}
		}

		function onDblClick(e) {
			try {
				var panel = panelOf(e.target);
				if (!panel || !areaForTarget(panel, e.target)) return;
				if (e.target.closest && e.target.closest(INTERACTIVE)) return;
				resetPanel(panel);
			} catch (err) {}
		}

		function onViewportChange() {
			try {
				var panels = document.querySelectorAll(PANEL);
				for (var i = 0; i < panels.length; i++) {
					var s = currentSize(panels[i]);
					if (s) applySize(panels[i], s.w, s.h);
					var c = current(panels[i]);
					if (c.dx !== 0 || c.dy !== 0) applyOffset(panels[i], c.dx, c.dy, false);
				}
				syncZones();
			} catch (err) {}
		}

		// 面板是 React portal,每次打开都是新元素:enhance 时套用记忆尺寸与位置。
		function enhance(panel) {
			if (!panel || panel.__dshSettingsDrag) return;
			panel.__dshSettingsDrag = true;
			if (storedSize) applySize(panel, storedSize.w, storedSize.h);
			if (stored && (stored.dx !== 0 || stored.dy !== 0)) applyOffset(panel, stored.dx, stored.dy, false);
			syncZones();
		}

		function scan(root) {
			try {
				if (!root || root.nodeType !== 1) return;
				if (root.matches && root.matches(PANEL)) enhance(root);
				if (root.querySelectorAll) {
					var found = root.querySelectorAll(PANEL);
					for (var i = 0; i < found.length; i++) enhance(found[i]);
				}
			} catch (err) {}
		}

		function injectStyle() {
			try {
				if (document.getElementById(STYLE_ID)) return;
				var style = document.createElement('style');
				style.id = STYLE_ID;
				style.textContent =
					'[data-shortcut-modal="settings"] > nav,' +
					'[data-shortcut-modal="settings"] > div > :first-child{cursor:grab}' +
					'[data-shortcut-modal="settings"].' + OPEN_CLASS + ',' +
					'[data-shortcut-modal="settings"].' + OPEN_CLASS + ' *{cursor:grabbing !important;user-select:none !important;-webkit-user-select:none !important}' +
					'[data-sdrag-zone]{position:fixed;z-index:1002;touch-action:none}' +
					'[data-sdrag-zone][hidden]{display:none !important}' +
					'#dsh-settings-drag-grip{width:' + GRIP_CORNER + 'px;height:' + GRIP_CORNER + 'px;cursor:nwse-resize}' +
					'#dsh-settings-drag-grip::before{content:"";position:absolute;right:4px;bottom:4px;width:12px;height:12px;opacity:.8;border-radius:2px;background:repeating-linear-gradient(-45deg,transparent 0 2px,var(--dsw-alias-label-tertiary,#98a2b3) 2px 3.5px,transparent 3.5px 7px)}' +
					'#dsh-settings-drag-edge-r{width:' + EDGE + 'px;cursor:ew-resize}' +
					'#dsh-settings-drag-edge-b{height:' + EDGE + 'px;cursor:ns-resize}' +
					'#dsh-settings-drag-edge-r::before,#dsh-settings-drag-edge-b::before{content:"";position:absolute;inset:0;border-radius:3px;opacity:0;transition:opacity .12s;background:var(--dsw-alias-label-tertiary,#98a2b3)}' +
					'#dsh-settings-drag-edge-r:hover::before,#dsh-settings-drag-edge-b:hover::before{opacity:.25}';
				(document.head || document.documentElement).appendChild(style);
			} catch (err) {}
		}

		function start() {
			injectStyle();
			ensureZones();
			window.addEventListener('pointerdown', onPointerDown, true);
			window.addEventListener('pointermove', onPointerMove, true);
			window.addEventListener('pointerup', endDrag, true);
			window.addEventListener('pointercancel', endDrag, true);
			window.addEventListener('lostpointercapture', endDrag, true);
			window.addEventListener('dblclick', onDblClick, true);
			window.addEventListener('resize', onViewportChange);
			if (typeof MutationObserver === 'function') {
				new MutationObserver(function (records) {
					for (var i = 0; i < records.length; i++) {
						var nodes = records[i].addedNodes;
						for (var j = 0; j < nodes.length; j++) scan(nodes[j]);
					}
					syncZones(); // 面板关闭(portal 卸载)时抓手自动隐藏
				}).observe(document.documentElement, { childList: true, subtree: true });
			}
			scan(document);
		}

		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
		else start();
	} catch (e) {}
})();

import {state, regionCode, mutableURL, fetchJSON, escapeHTML as esc} from './data.js?v=31';

let toastTimer;
const copyTimers = new WeakMap();
let historyOpener;
let epgOpener;
export function initTheme() {
    const mode = localStorage.getItem('gcable_theme_mode') || 'auto';
    setThemeMode(mode, false);
    
    // 监听系统深浅色偏好变动
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if ((localStorage.getItem('gcable_theme_mode') || 'auto') === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

export function setThemeMode(mode, save = true) {
    if (save) localStorage.setItem('gcable_theme_mode', mode);
    let effective = mode;
    if (mode === 'auto') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);

    const btnLight = document.getElementById('theme-btn-light');
    const btnDark = document.getElementById('theme-btn-dark');
    const btnAuto = document.getElementById('theme-btn-auto');

    for (const [button, value] of [[btnLight, 'light'], [btnDark, 'dark'], [btnAuto, 'auto']]) {
        if (!button) continue;
        button.classList.toggle('active', mode === value);
        button.setAttribute('aria-pressed', String(mode === value));
    }
}

// -------------------------------------------------------------
// 2. 返回顶部与剪贴板反馈
// -------------------------------------------------------------
window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-back-to-top');
    if (btn) {
        if (window.scrollY > 260) {
            btn.style.display = 'inline-flex';
        } else {
            btn.style.display = 'none';
        }
    }
}, { passive: true });

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1800);
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    const previous = document.activeElement;
    ta.focus();
    ta.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { ta.remove(); previous?.focus({preventScroll:true}); }
    return copied ? Promise.resolve() : Promise.reject(new Error('Clipboard unavailable'));
}

export function copyBtnFeedback(btn, text, successMsg) {
    copyTextToClipboard(text).then(() => {
        showToast(successMsg || '已复制：' + text);
        if (btn) {
            const pending = copyTimers.get(btn);
            const orig = pending?.original || btn.innerHTML;
            clearTimeout(pending?.timer);
            btn.innerText = '✓ 已复制';
            btn.classList.add('copied');
            const timer = setTimeout(() => {
                btn.innerHTML = orig;
                btn.classList.remove('copied');
                copyTimers.delete(btn);
            }, 1500);
            copyTimers.set(btn, {original:orig,timer});
        }
    }).catch(() => showToast('复制失败，请允许剪贴板访问后重试'));
}


export function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    const body = document.getElementById('history-modal-body');
    if (!modal || !body) return;
    if (!modal.classList.contains('active')) historyOpener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modal.classList.add('active');
    body.scrollTop = 0;
    body.focus({preventScroll:true});
    
    fetchJSON(mutableURL('./channel_history.json')).then(data => {
        const meta = data.meta || {};
        const events = data.events || [];
        const dead = data.dead_channels || {};
        
        let html = `
            <div class="info-panel" style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div><b>最近监测：</b> ${esc(meta.last_updated || '-')}</div>
                    <div style="display:flex; gap:8px;">
                        <span style="color:var(--accent); font-weight:700;">🟢 HLS 清单已取得: ${meta.playable_count || 0}</span>
                        <span style="color:var(--danger); font-weight:700;">🔴 HLS 清单未取得: ${meta.dead_count || 0}</span>
                    </div>
                </div>
            </div>
            
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">🔴 本次未取得谷豆 HLS 清单的频道 (${Object.keys(dead).length})</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; padding:4px;">
        `;
        
        for (const [cid, info] of Object.entries(dead)) {
            html += `<span class="pill-cat" style="background:var(--strip-bg); color:var(--danger); border:1px solid var(--border-light); font-size:11px; padding:3px 8px; border-radius:4px;">#${esc(cid)} ${esc(info.name)}</span>`;
        }
        
        html += `
            </div>
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">🕒 变更与状态变动时间线 (最新 ${events.length} 条)</div>
            <div class="epg-timeline-list">
        `;
        
        const typeMap = {
            'channel_added': '<span style="color:var(--accent); font-weight:700;">[新增]</span>',
            'channel_removed': '<span style="color:var(--text-muted); font-weight:700;">[下架]</span>',
            'stream_dead': '<span style="color:var(--danger); font-weight:700;">[清单未取得]</span>',
            'stream_recovered': '<span style="color:var(--rtp-color); font-weight:700;">[清单恢复]</span>'
        };
        
        events.slice().reverse().forEach(ev => {
            const tag = typeMap[ev.type] || '[变动]';
            html += `
                <div class="epg-entry">
                    <div>
                        <div style="font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums;">${esc(ev.timestamp)} · 频道ID: ${esc(ev.channelID)}</div>
                        <div style="font-size:13px; font-weight:600; margin-top:2px;">${tag} <b>${esc(ev.name)}</b> - <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">${esc(ev.detail)}</span></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        body.innerHTML = html;
    }).catch(() => {
        body.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:30px;">暂未找到历史变更记录</div>';
    });
}

export function closeHistoryModal(e) {
    if (!e?.target || e.target.id === 'history-modal') {
        const modal = document.getElementById('history-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        if (historyOpener?.isConnected) historyOpener.focus({preventScroll:true});
    }
}
export function openEpgModal() {
    const modal = document.getElementById('epg-modal');
    const body = document.getElementById('epg-modal-body');
    if (!modal || !body) return;
    if (!state.index) {
        showToast('频道与地区索引尚未载入，请稍候重试');
        return;
    }
    if (!modal.classList.contains('active')) epgOpener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modal.classList.add('active');
    body.scrollTop = 0;
    renderEpgModal(body);
    body.focus({preventScroll:true});
}

export function closeEpgModal(e) {
    if (!e?.target || e.target.id === 'epg-modal') {
        const modal = document.getElementById('epg-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        if (epgOpener?.isConnected) epgOpener.focus({preventScroll:true});
    }
}

function initModalControls() {
    for (const [id, close] of [['history-modal', closeHistoryModal], ['epg-modal', closeEpgModal]]) {
        const modal = document.getElementById(id);
        if (!modal) continue;
        modal.addEventListener('click', event => {
            const target = event.target;
            if (target === modal || (target instanceof Element && target.closest('[data-modal-close]'))) close();
        });
    }
}
initModalControls();

function renderEpgModal(body) {
    const idx = state.index;
    const currentCode = regionCode();
    const currentRegion = currentCode ? idx.regions[currentCode] : null;
    const totalExports = idx.exports;
    const cityOrder = ['广州','深圳','珠海','佛山','东莞','中山','江门','惠州','肇庆','汕头','潮州','揭阳','汕尾','湛江','茂名','阳江','韶关','清远','梅州','河源','云浮'];
    const cityEntries = cityOrder
        .map(name => {
            const code = state.regionByName.get(name);
            return code && idx.regions[code] ? {code, region: idx.regions[code], title: `${name} (${code})`, detail: `21 地市快捷 · ${idx.regions[code].channels} 个频道 · ${Number(idx.regions[code].programmes || 0).toLocaleString('zh-CN')} 条节目`} : null;
        })
        .filter(Boolean);
    const groupEntries = (idx.regionGroups || []).map(group => {
        const code = group.representativeCode;
        const region = idx.regions[code];
        const knownNames = (group.knownCityCodes || []).map(c => idx.regions[c]?.name).filter(Boolean);
        const title = knownNames.length ? `${knownNames.join(' / ')} (${code})` : `${region.name} (${code})`;
        const shared = group.codes.length > 1 ? `共享编码 (${group.codes.length}): ${group.codes.slice(0, 12).join(', ')}${group.codes.length > 12 ? '…' : ''}` : `独立编码: ${code}`;
        return {
            code, region, title,
            detail: `${region.channels} 个频道 · ${Number(region.programmes || 0).toLocaleString('zh-CN')} 条节目 · ${shared}`,
            search: `${title} ${group.codes.join(' ')} ${knownNames.join(' ')}`.toLowerCase()
        };
    });
    const allEntries = Object.entries(idx.regions).map(([code, region]) => ({
        code, region,
        title: region.name.startsWith('区域 ') ? `${region.name}` : `${region.name} (${code})`,
        detail: `区域编码 ${code} · ${region.channels} 个频道 · ${Number(region.programmes || 0).toLocaleString('zh-CN')} 条节目`,
        search: `${code} ${region.name}`.toLowerCase()
    }));
    for (const item of cityEntries) item.search = `${item.code} ${item.region.name} ${item.title}`.toLowerCase();

    function actionRow(epgUrl, playlistUrl, gudouUrl, dlPrefix, labelPrefix, isGz) {
        const ext = isGz ? '.xml.gz' : '.xml';
        return `
            <div class="epg-dl-actions">
                <a class="btn btn-sm btn-accent" href="./${esc(epgUrl)}" download="${esc(dlPrefix)}${ext}">下载 EPG (${ext})</a>
                <button type="button" class="btn btn-sm" data-epg-copy="./${esc(epgUrl)}" data-epg-label="${esc(labelPrefix)} XMLTV 节目单">复制 EPG 链接</button>
                <a class="btn btn-sm btn-primary" href="./${esc(playlistUrl)}" download="${esc(dlPrefix)}.m3u">下载组播 M3U</a>
                <button type="button" class="btn btn-sm" data-epg-copy="./${esc(playlistUrl)}" data-epg-label="${esc(labelPrefix)} 组播订阅">复制组播 M3U</button>
                <button type="button" class="btn btn-sm btn-purple" data-epg-copy="./${esc(gudouUrl)}" data-epg-label="${esc(labelPrefix)} 谷豆订阅">复制谷豆 M3U</button>
            </div>
        `;
    }

    const currentHtml = currentRegion ? `
        <div class="epg-dl-card highlight">
            <div class="epg-dl-head">
                <span class="epg-dl-title">当前已选地区：${esc(currentRegion.name)} (${esc(currentCode)})</span>
                <span class="epg-dl-meta">${currentRegion.channels} 个频道 · ${Number(currentRegion.programmes || 0).toLocaleString('zh-CN')} 条节目 · ${currentRegion.epgStatus === 'ok' ? 'EPG 完整' : 'EPG 部分覆盖'}</span>
            </div>
            ${actionRow(currentRegion.epgUrl, currentRegion.playlistUrl, currentRegion.gudouPlaylistUrl, `gcable_${currentCode}`, `${currentRegion.name} (${currentCode})`, currentRegion.epgUrl.endsWith('.xml.gz'))}
        </div>
    ` : '';

    const summaryHtml = `
        <div class="epg-dl-card highlight">
            <div class="epg-dl-head">
                <span class="epg-dl-title">全网总表（全部 ${idx.totals.channels} 个电视台 + 跨地区差异节目单）</span>
                <span class="epg-dl-meta">${Number(idx.totals.programmes || 0).toLocaleString('zh-CN')} 条节目 · 更新于 ${esc(idx.updatedAt || '-')}</span>
            </div>
            <div class="epg-dl-meta">包含全省所有组播频道的标准 XMLTV (<code>epg.xml</code>)，自动关联 <code>playlist.m3u</code> 与 <code>gudou_playlist.m3u</code>。</div>
            ${actionRow(totalExports.epgUrl, totalExports.playlistUrl, totalExports.gudouPlaylistUrl, 'gcable_all', '全网总表', false)}
        </div>
        ${currentHtml}
    `;
    if (!body.epgController) {
        body.innerHTML = `
            <div id="epg-modal-summary"></div>
            <div class="epg-dl-toolbar">
                <div class="epg-toolbar-title">按地市 / 区域编码下载专属 EPG (.xml.gz) 与 M3U</div>
                <input type="search" id="epg-modal-search" class="search-box" placeholder="搜索城市名（如 广州、深圳）或区域编码（如 020、755、1684）" autocomplete="off">
                <div class="epg-dl-views" role="group" aria-label="地区列表范围">
                    <button type="button" class="btn btn-sm active" data-epg-view="cities" aria-pressed="true">21 地市</button>
                    <button type="button" class="btn btn-sm" data-epg-view="groups" aria-pressed="false">不同节目单配置</button>
                    <button type="button" class="btn btn-sm" data-epg-view="all" aria-pressed="false">全部区域编码</button>
                </div>
                <div id="epg-modal-status" class="epg-dl-meta" role="status" aria-live="polite"></div>
            </div>
            <div id="epg-modal-list" class="epg-timeline-list"></div>
            <button type="button" id="epg-modal-more" class="btn epg-modal-more" hidden>加载更多地区</button>
        `;
        const controller = {
            activeView: 'cities', renderedCount: 0, filteredEntries: [],
            cityEntries: [], groupEntries: [], allEntries: [],
            listEl: body.querySelector('#epg-modal-list'),
            statusEl: body.querySelector('#epg-modal-status'),
            moreBtn: body.querySelector('#epg-modal-more'),
            searchInput: body.querySelector('#epg-modal-search')
        };
        const PAGE = 50;
        const sourceForView = () => controller.activeView === 'cities' ? controller.cityEntries
            : controller.activeView === 'groups' ? controller.groupEntries : controller.allEntries;
        const renderBatch = () => {
            const nextEnd = Math.min(controller.renderedCount + PAGE, controller.filteredEntries.length);
            const htmlParts = [];
            for (let i = controller.renderedCount; i < nextEnd; i++) {
                const item = controller.filteredEntries[i];
                const r = item.region;
                const statusBadge = r.epgStatus === 'ok'
                    ? '<span class="epg-status-complete">EPG 完整</span>'
                    : '<span class="epg-status-partial">EPG 部分覆盖</span>';
                htmlParts.push(`
                    <div class="epg-dl-card" data-region-code="${esc(item.code)}">
                        <div class="epg-dl-head">
                            <span class="epg-dl-title">${esc(item.title)}</span>
                            <span class="epg-dl-meta">${statusBadge}</span>
                        </div>
                        <div class="epg-dl-meta">${esc(item.detail)}</div>
                        ${actionRow(r.epgUrl, r.playlistUrl, r.gudouPlaylistUrl, `gcable_${item.code}`, `${r.name} (${item.code})`, r.epgUrl.endsWith('.xml.gz'))}
                    </div>
                `);
            }
            controller.listEl.insertAdjacentHTML('beforeend', htmlParts.join(''));
            controller.renderedCount = nextEnd;
            controller.moreBtn.hidden = controller.renderedCount >= controller.filteredEntries.length;
            if (!controller.moreBtn.hidden) {
                controller.moreBtn.textContent = `加载更多（还有 ${controller.filteredEntries.length - controller.renderedCount} 个地区）`;
            }
            controller.statusEl.textContent = controller.filteredEntries.length
                ? `共匹配 ${controller.filteredEntries.length} 项，已显示 ${controller.renderedCount} 项（压缩 XMLTV 支持 TiviMate、Kodi、OTT Navigator、APTV 等播放器直接加载）`
                : '未找到匹配的地区或编码，请尝试其他关键词';
        };
        const refreshList = () => {
            const q = controller.searchInput.value.trim().toLowerCase();
            const pool = q ? controller.allEntries : sourceForView();
            controller.filteredEntries = q ? pool.filter(item => item.search.includes(q)) : pool;
            controller.renderedCount = 0;
            controller.listEl.replaceChildren();
            renderBatch();
        };
        controller.refreshList = refreshList;
        controller.renderBatch = renderBatch;
        controller.searchInput.addEventListener('input', refreshList);
        controller.moreBtn.addEventListener('click', renderBatch);
        body.addEventListener('click', event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const viewButton = target.closest('[data-epg-view]');
            if (viewButton && body.contains(viewButton)) {
                controller.activeView = viewButton.dataset.epgView;
                body.querySelectorAll('[data-epg-view]').forEach(button => {
                    const selected = button === viewButton;
                    button.classList.toggle('active', selected);
                    button.setAttribute('aria-pressed', String(selected));
                });
                refreshList();
                return;
            }
            const copyButton = target.closest('[data-epg-copy]');
            if (!copyButton || !body.contains(copyButton)) return;
            const fullUrl = new URL(copyButton.dataset.epgCopy, document.baseURI).href;
            copyBtnFeedback(copyButton, fullUrl, `已复制 ${copyButton.dataset.epgLabel}`);
        });
        body.epgController = controller;
    }
    const controller = body.epgController;
    controller.cityEntries = cityEntries;
    controller.groupEntries = groupEntries;
    controller.allEntries = allEntries;
    controller.activeView = 'cities';
    controller.searchInput.value = '';
    body.querySelector('#epg-modal-summary').innerHTML = summaryHtml;
    const viewLabels = {
        cities: `21 地市 (${cityEntries.length})`,
        groups: `不同节目单配置 (${groupEntries.length})`,
        all: `全部区域编码 (${allEntries.length})`
    };
    body.querySelectorAll('[data-epg-view]').forEach(button => {
        button.textContent = viewLabels[button.dataset.epgView];
        const selected = button.dataset.epgView === controller.activeView;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    controller.refreshList();
}

window.addEventListener('pointerdown', () => {
    document.documentElement.toggleAttribute('data-pointer-input', true);
}, {capture:true, passive:true});
window.addEventListener('keydown', event => {
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        document.documentElement.removeAttribute('data-pointer-input');
    }
}, {capture:true});

window.addEventListener('keydown', event => {
    const historyModal = document.getElementById('history-modal');
    const epgModal = document.getElementById('epg-modal');
    const modal = historyModal?.classList.contains('active') ? historyModal : epgModal?.classList.contains('active') ? epgModal : null;
    if (!modal) return;
    if (event.key === 'Escape') {
        if (modal === historyModal) closeHistoryModal();
        else closeEpgModal();
    }
    if (event.key === 'Tab') {
        const targets = Array.from(modal.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
            .filter(element => element.getClientRects().length && !element.disabled);
        const first = targets[0], last = targets.at(-1);
        if (!first) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({preventScroll:true}); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({preventScroll:true}); }
        else if (!modal.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus({preventScroll:true}); }
    }
});

import {state, regionCode, fetchJSON, escapeHTML as esc} from './data.js?v=20261117-rendition-proof';

let toastTimer;
const copyTimers = new WeakMap();
let historyOpener;
let historyRequest = 0;
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
const backToTop = document.getElementById('btn-back-to-top');
const pageActions = document.getElementById('drawer-page-actions');
const drawerOverlay = document.getElementById('drawer-overlay');
const desktopActions = window.matchMedia('(min-width: 1180px)');

function placeBackToTop() {
    const docked = desktopActions.matches && drawerOverlay.classList.contains('active');
    const parent = docked ? pageActions : document.body;
    if (backToTop.parentElement !== parent) parent.append(backToTop);
    backToTop.classList.toggle('is-docked', docked);
    const label = docked ? '返回频道列表顶部' : '返回顶部';
    backToTop.title = label;
    backToTop.setAttribute('aria-label', label);
}

placeBackToTop();
desktopActions.addEventListener('change', placeBackToTop);
new MutationObserver(placeBackToTop).observe(drawerOverlay, {attributes: true, attributeFilter: ['class']});
window.addEventListener('scroll', () => {
    backToTop.style.display = window.scrollY > 260 ? 'inline-flex' : 'none';
}, {passive: true});

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
    const request = ++historyRequest;
    if (!modal.classList.contains('active')) historyOpener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modal.classList.add('active');
    body.scrollTop = 0;
    body.focus({preventScroll:true});
    body.innerHTML = '<div class="info-panel">正在读取本轮媒体观察与历史目录记录…</div>';

    const localTime = value => {
        if (!value) return '未知';
        // Legacy timestamps have no timezone: retain them verbatim, never guess one.
        if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return `${value}（原记录时间，时区未注明）`;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : `${date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai', hour12:false})} UTC+8`;
    };
    const newest = events => events.slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 100);
    const rawDetail = detail => typeof detail === 'string' ? detail : JSON.stringify(detail ?? '');
    const nodeKey = value => String(value || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    Promise.allSettled([
        fetchJSON('./gudou_scan_report.json', {cache:'no-cache'}),
        fetchJSON('./channel_history.json', {cache:'no-cache'})
    ]).then(([scanResult, historyResult]) => {
        if (request !== historyRequest || !modal.classList.contains('active')) return;
        const report = scanResult.status === 'fulfilled' ? scanResult.value : null;
        const history = historyResult.status === 'fulfilled' ? historyResult.value : null;
        const nodes = Array.isArray(report?.nodes) ? report.nodes : [];
        const node = nodes.find(item => nodeKey(item.node) === '172.16.149.18:9090') || (nodes.length === 1 ? nodes[0] : null);
        const campaign = report?.campaign;
        let html = '<section id="history-scan-health"><h3>本轮媒体观察</h3>';
        if (!node || !campaign?.id || !Array.isArray(report?.entries) || !Array.isArray(node.testedIDs)) {
            html += '<div class="info-panel">本轮扫描报告缺失或不完整：检查、媒体、解码、目录匹配及待检查数量均未知。历史目录快照不能替代媒体观察。</div>';
        } else {
            const tested = new Set(node.testedIDs.map(String));
            const current = new Map();
            for (const entry of report.entries) {
                if (entry.currentCampaignChecked !== true || nodeKey(entry.node) !== nodeKey(node.node) || !tested.has(String(entry.streamID))) continue;
                const id = String(entry.streamID);
                const previous = current.get(id);
                if (!previous || String(entry.lastCheckedAt || '') >= String(previous.lastCheckedAt || '')) current.set(id, entry);
            }
            const checked = current.size;
            const countSet = ids => Array.isArray(ids) ? new Set(ids.map(String).filter(id => current.has(id))).size : null;
            const media = countSet(node.mediaIDs);
            const decoded = countSet(node.decodedIDs);
            const matched = countSet(node.matchedIDs);
            let playlistOnly = 0;
            let unverified = 0;
            for (const entry of current.values()) {
                if (entry.mediaDetected === true || entry.verification === 'decoded') continue;
                if (entry.state === 'manifest-only' || entry.verification === 'manifest') playlistOnly++;
                else unverified++;
            }
            const planned = Number.isInteger(node.plannedIDs) && node.plannedIDs >= checked ? node.plannedIDs : null;
            const metrics = [
                ['checked', '已检查', checked, planned],
                ['media', '媒体已识别', media, checked],
                ['decoded', '样本已解码', decoded, checked],
                ['matched', '台名已匹配目录', matched, checked],
                ['playlist-only', '仅取得播放列表', playlistOnly, checked],
                ['unverified', '未确认 / 无媒体', unverified, checked],
                ['pending', '待检查', planned === null ? null : planned - checked, planned]
            ];
            html += `<div class="info-panel" style="margin-bottom:12px;"><div><b>节点：</b>${esc(node.node)}</div><div><b>本轮：</b>${esc(campaign.id)} · ${campaign.complete === true ? '已完成' : '未完成'}</div><div><b>检查截至：</b>${esc(localTime(campaign.checkedThroughAt))}</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">`;
            for (const [key, label, count, denominator] of metrics) {
                html += `<span class="pill-cat" data-health="${key}" style="background:var(--strip-bg);border:1px solid var(--border-light);padding:4px 8px;">${label}：<b>${count ?? '未知'}</b> / ${denominator ?? '未知'}</span>`;
            }
            html += '</div><p style="font-size:12px;color:var(--text-muted);">已检查、待检查以该节点计划 ID 数为分母，其余以本轮已检查 ID 数为分母；按 ID 去重。媒体识别、样本解码、台名匹配是重叠的观察层级，不能相加。目录匹配仅是其中一个子集，不是全部可播放数量。仅播放列表与未确认 / 无媒体分列；本次未确认不代表永久失效或停播。旧节点与历史成功记录不计入本轮结果。</p></div>';
        }
        const eventLabels = {
            first_decoded:'首次解码记录', decode_unconfirmed:'样本解码未确认',
            check_failed:'本次媒体未确认', decode_recovered:'再次解码确认',
            identity_changed:'目录绑定变化', quality_changed:'同档位参数变化',
            rendition_decode_unconfirmed:'档位样本解码未确认', rendition_decode_confirmed:'档位样本解码确认'
        };
        const events = node && campaign?.id && Array.isArray(report?.events)
            ? report.events.filter(event => nodeKey(event.node) === nodeKey(node.node) && event.campaignId === campaign.id)
            : null;
        html += '<div id="history-media-events">';
        if (events) {
            html += `<h4>本轮最新媒体观察事件（显示最新 ${Math.min(100, events.length)} / ${events.length} 条）</h4><div class="epg-timeline-list">`;
            for (const event of newest(events)) {
                const catalogName = state.byId.get(String(event.streamID))?.name;
                const name = event.serviceName || (catalogName ? `${catalogName}（目录名）` : '台名未取得');
                html += `<div class="epg-entry"><div><div style="font-size:11px;color:var(--text-muted);">${esc(localTime(event.timestamp))} · ${esc(event.node)} · ID ${esc(event.streamID)}</div><div style="font-size:13px;margin-top:2px;"><b>${esc(eventLabels[event.type] || event.type || '媒体观察')} · ${esc(name)}</b></div><div style="font-size:12px;color:var(--text-muted);">${esc(rawDetail(event.detail))}</div></div></div>`;
            }
            if (!events.length) html += '<div class="info-panel">本轮该节点暂无变更事件；事件数量不是已检查数量。</div>';
            html += '</div>';
        } else html += '<p>本轮媒体观察事件未知。</p>';
        html += '</div></section><details id="history-catalog-events" style="margin-top:16px;"><summary>历史目录记录（旧版，展开查看）</summary>';
        html += '<p style="font-size:12px;color:var(--text-muted);">以下是历史目录变化和旧版检查记录，不等同于本轮播放列表或媒体结果。“目录未再下发”不代表实际停播。原始详情单独保留，可能包含旧版判断，不作为当前播放健康证据。</p>';
        if (history && Array.isArray(history.events)) {
            html += `<div class="info-panel">目录快照时间：${esc(localTime(history.meta?.last_updated))}</div><h4>历史记录（显示最新 ${Math.min(100, history.events.length)} / ${history.events.length} 条）</h4><div class="epg-timeline-list">`;
            const labels = {channel_added:'目录新增', channel_removed:'目录未再下发', stream_dead:'旧版检查未通过', stream_recovered:'旧版检查通过', media_check_failed:'本次媒体未确认', media_check_recovered:'再次识别到媒体'};
            for (const event of newest(history.events)) {
                html += `<div class="epg-entry"><div><div style="font-size:11px;color:var(--text-muted);">${esc(localTime(event.timestamp))} · 目录 ID ${esc(event.channelID)}</div><div style="font-size:13px;margin-top:2px;"><b>${esc(labels[event.type] || event.type || '历史变动')} · ${esc(event.name || '')}</b></div><details><summary style="font-size:12px;">原始历史详情（旧版证据）</summary><div style="font-size:12px;color:var(--text-muted);">${esc(rawDetail(event.detail))}</div></details></div></div>`;
            }
            html += '</div>';
        } else html += '<div class="info-panel">历史目录记录未能读取；不影响上方独立的本轮媒体观察。</div>';
        body.innerHTML = html + '</details>';
    });
}

export function closeHistoryModal(e) {
    if (!e?.target || e.target.id === 'history-modal') {
        historyRequest++;
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

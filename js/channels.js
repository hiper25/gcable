import {state, catalog, escapeHTML as esc, regionCode, exportsForSelection, loadRegion, isNewUI} from './data.js?v=46';
import {getChannelIconHTML} from './icons.js?v=46';
import {showToast} from './ui.js?v=46';
import {openPicker} from './picker.js?v=46';
import {updateWeatherSelection} from './weather.js?v=46';
const cards = new Map();
const rows = new Map();
let onOpen;
let onCopy;
let renderFrame = 0;
let cityRequest = 0;
let urlSyncReady = false;
const catalogStatsCache = new WeakMap();

function formatUpdatedAt(iso) {
    if (!iso) return '';
    return String(iso).replace('T', ' ').replace(/:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/, '');
}

function scrollCatalogToTop() {
    const pane = document.getElementById('catalog-pane');
    if (!pane) return;
    const targetTop = Math.max(0, Math.round(pane.getBoundingClientRect().top + window.scrollY - 76));
    if (window.scrollY > targetTop + 60) {
        window.scrollTo({
            top: targetTop,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
    }
}

function syncDesktopInspectorSelection(forceRegionSync = false) {
    if (!isNewUI() || !window.matchMedia('(min-width: 1180px)').matches) return;
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay?.classList.contains('active') || !state.filtered.length) return;
    const currentMatch = state.selectedChannelID
        ? state.filtered.find(ch => String(ch.channelID) === String(state.selectedChannelID))
        : null;
    if (!currentMatch) {
        onOpen?.(state.filtered[0], {restore: true});
    } else if (forceRegionSync) {
        onOpen?.(currentMatch, {restore: true});
    }
}
function updateSubscriptionActionLabels(cityName, currentCode, epgExt, filterCount) {
    const isGlobal = !currentCode || cityName === '全网总表';
    const cityPrefix = isGlobal ? '全网' : cityName;
    document.querySelectorAll('[data-subscription-action]').forEach(action => {
        const key = action.dataset.subscriptionAction;
        const labelEl = action.querySelector('.subscription-action-label');
        if (!labelEl) return;
        const isMobile = action.closest('.mobile-quick-actions');
        if (key === 'copyM3U') {
            labelEl.textContent = isMobile ? `复制${cityPrefix} M3U 订阅` : `复制${cityPrefix} M3U`;
        } else if (key === 'copyEPG') {
            labelEl.textContent = isMobile ? `复制${cityPrefix} 7天 EPG` : `复制${cityPrefix} EPG 链接`;
        } else if (key === 'copyGudouM3U') {
            labelEl.textContent = isMobile ? `${cityPrefix}谷豆单播` : `复制${cityPrefix}谷豆地址`;
        } else if (key === 'exportTxt') {
            labelEl.textContent = isMobile ? `复制当前筛选 TXT` : `导出当前筛选 TXT`;
        } else if (key === 'downloadM3U') {
            labelEl.textContent = isMobile ? `下载${cityPrefix} M3U` : `下载${cityPrefix} M3U (.m3u)`;
        } else if (key === 'downloadEPG') {
            labelEl.textContent = isMobile ? `下载${cityPrefix} EPG` : `下载${cityPrefix} EPG (${epgExt})`;
        } else if (key === 'openEpgModal') {
            labelEl.textContent = isMobile ? `各地区 EPG 与订阅下载窗口` : `地区 EPG`;
        }
    });
    const regionHint = document.getElementById('header-tools-current-region');
    if (regionHint) {
        regionHint.innerHTML = isGlobal
            ? `当前范围：<b>全网总表</b> · 包含全省频道`
            : `当前范围：<b>${esc(cityName)} (${esc(currentCode)})</b> · ${filterCount} 个频道`;
    }
    const triggerText = document.getElementById('header-tools-trigger-text');
    if (triggerText) {
        triggerText.textContent = isGlobal ? '更多操作' : `更多 (${cityName})`;
    }
    const dockM3u = document.getElementById('mobile-dock-m3u-text');
    if (dockM3u) {
        dockM3u.textContent = isGlobal ? '复制 M3U' : `复制${cityName}`;
    }
}
export function syncURLState() {
    if (!urlSyncReady || state.status !== 'ready') return;
    const params = new URLSearchParams(location.search);
    const searchInput = document.getElementById('search-kw');
    const keyword = searchInput ? searchInput.value.trim() : '';
    const onlyReplay = Boolean(document.getElementById('only-replay')?.checked);
    const currentCode = regionCode();
    if (state.city && state.city !== '全网总表') params.set('city', currentCode || state.city);
    else params.delete('city');
    if (state.category && state.category !== '全部') params.set('cat', state.category);
    else params.delete('cat');
    if (keyword) params.set('q', keyword);
    else params.delete('q');
    if (state.sourceGroup) params.set('group', state.sourceGroup);
    else params.delete('group');
    if (onlyReplay) params.set('replay', '1');
    else params.delete('replay');
    if (state.view === 'table') params.set('view', 'table');
    else params.delete('view');
    const query = params.toString();
    const nextURL = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
    if (nextURL !== `${location.pathname}${location.search}${location.hash}`) {
        history.replaceState(history.state, '', nextURL);
    }
}

export function updateSelectedChannelCard(selectedId = state.selectedChannelID) {
    state.selectedChannelID = selectedId ? String(selectedId) : '';
    for (const [cid, card] of cards) {
        card.classList.toggle('is-selected', cid === state.selectedChannelID);
    }
    for (const [cid, row] of rows) {
        row.classList.toggle('is-selected', cid === state.selectedChannelID);
    }
}

export function renderCatalogError(onRetry) {
    const grid = document.getElementById('channels-grid');
    const tableWrap = document.getElementById('channels-table-wrap');
    if (tableWrap) tableWrap.style.display = 'none';
    if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = `
            <div class="catalog-error-card" role="alert">
                <div class="catalog-error-title">频道数据载入失败，请检查网络连接或重试。</div>
                <button type="button" class="btn btn-sm btn-primary" id="catalog-retry-btn">重新加载</button>
            </div>
        `;
        grid.querySelector('#catalog-retry-btn')?.addEventListener('click', () => onRetry?.());
    }
    const coverage = document.getElementById('data-coverage');
    if (coverage) coverage.textContent = '数据读取失败，请点击重试';
    const matchCount = document.getElementById('match-count');
    if (matchCount) matchCount.textContent = '0';
}
function catalogStats(source) {
    let stats = catalogStatsCache.get(source);
    if (stats) return stats;
    const categories = new Map();
    let rtp = 0;
    for (const channel of source) {
        if (channel.rtp) rtp++;
        categories.set(channel.category, (categories.get(channel.category) || 0) + 1);
    }
    stats = {categories, rtp};
    catalogStatsCache.set(source, stats);
    return stats;
}


function replayLabel(channel) {
    if (channel.isTVAnyTime === '1') return '<span class="badge-timeshift"><span class="dot dot-accent"></span>支持7天时移</span>';
    if (channel.hasEPG) return '<span class="badge-timeshift badge-epg">含节目单 · 无回看</span>';
    return '<span class="badge-live-only">仅直播</span>';
}
function content(channel, table) {
    const name = esc(channel.name), cid = esc(channel.channelID), number = esc(channel.channelNumber), category = esc(channel.category);
    const rtp = `<span class="rtp-code">${esc(channel.rtp)}</span><button class="btn btn-sm" data-action="copy">${table ? '复制' : '复制组播'}</button>`;
    const details = '<button class="btn btn-sm" data-action="details">查看详情 ➔</button>';
    if (table) return `<td class="ch-no">#${number}</td><td><div class="table-channel">${getChannelIconHTML(channel)}<span class="table-channel-name">${name}</span></div></td><td><span class="pill-cat">${category}</span></td><td class="pill-id">${cid}</td><td><div class="table-rtp">${rtp}</div></td><td>${replayLabel(channel)}</td><td class="table-actions">${details}</td>`;
    return `<div class="ch-top">${getChannelIconHTML(channel)}<div class="ch-info"><div class="ch-title-row"><div class="ch-name" title="${name}">${name}</div><span class="ch-no">#${number}</span></div><div class="ch-tags"><span class="pill-cat">${category}</span><span class="pill-id">ID:${cid}</span></div></div></div><div class="rtp-strip">${rtp}</div><div class="ch-bottom">${replayLabel(channel)}${details}</div>`;
}

// Keep matching nodes connected. Moving every card through a detached fragment restarts image rendering.
function reconcile(container, channels, pool, table) {
    const wanted = new Set(channels.map(channel => String(channel.channelID)));
    for (const child of Array.from(container.children)) if (!wanted.has(child.dataset.cid)) child.remove();
    let cursor = container.firstElementChild;
    for (const channel of channels) {
        const cid = String(channel.channelID);
        let item = pool.get(cid);
        if (!item) {
            item = document.createElement(table ? 'tr' : 'div');
            if (!table) item.className = 'ch-card';
            item.dataset.cid = cid;
            item.innerHTML = content(channel, table);
            pool.set(cid, item);
        } else {
            const previous = item.channel;
            if (previous.name !== channel.name || previous.rtp !== channel.rtp || previous.category !== channel.category || previous.hasEPG !== channel.hasEPG || previous.isTVAnyTime !== channel.isTVAnyTime) {
                item.innerHTML = content(channel, table);
            } else if (previous.channelNumber !== channel.channelNumber) {
                item.querySelector('.ch-no').textContent = `#${channel.channelNumber}`;
            }
        }
        item.channel = channel;
        item.classList.toggle('is-selected', cid === state.selectedChannelID);
        if (item !== cursor) container.insertBefore(item, cursor);
        cursor = item.nextElementSibling;
    }
    if (!channels.length) {
        const empty = document.createElement(table ? 'tr' : 'div');
        if (table) { const cell = empty.insertCell(); cell.colSpan = 7; cell.textContent = '未找到符合条件的频道，可清空搜索或重置筛选。'; }
        else { empty.style.gridColumn = '1/-1'; empty.textContent = '未找到符合条件的频道，可清空搜索或重置筛选。'; }
        container.append(empty);
    }
}

function matchesKeyword(channel, keyword) {
    if (!channel.searchText) {
        channel.searchText = [channel.name, channel.channelNumber, channel.channelID, channel.rtp,
            ...(channel.sourceNames || []).map(source => source.name)]
            .map(value => String(value ?? '').toLowerCase()).join(' ');
    }
    return channel.searchText.includes(keyword);
}

export function applyFilters() {
    if (state.status !== 'ready' || !state.index) return;
    const searchInput = document.getElementById('search-kw');
    const keyword = searchInput.value.toLowerCase().trim();
    const onlyReplay = document.getElementById('only-replay').checked;
    const currentCode = regionCode();
    const source = catalog();
    const stats = catalogStats(source);
    state.filtered = source.filter(channel => (!onlyReplay || channel.isTVAnyTime === '1') &&
        (state.category === '全部' || channel.category === state.category) &&
        (!state.sourceGroup || channel.sourceGroups?.includes(state.sourceGroup)) &&
        (!keyword || matchesKeyword(channel, keyword)));
    document.getElementById('match-count').textContent = state.filtered.length;
    document.getElementById('search-scope').textContent = `搜索范围：${state.city} · ${state.category}${state.sourceGroup ? ` · ${state.sourceGroup}` : ''}${onlyReplay ? ' · 支持时移' : ''}；包含源站地区别名`;
    document.getElementById('active-filter-summary').textContent = `${state.city} · ${state.category}${state.sourceGroup ? ` · ${state.sourceGroup}` : ''}${onlyReplay ? ' · 支持时移' : ''}`;
    const headerCityText = document.getElementById('header-city-trigger-text');
    if (headerCityText) headerCityText.textContent = currentCode ? `${state.city} (${currentCode})` : state.city;
    const dockCityText = document.getElementById('mobile-dock-city-text');
    if (dockCityText) dockCityText.textContent = state.city === '全网总表' ? '切换地区' : state.city;
    document.getElementById('search-clear').hidden = !searchInput.value;
    document.getElementById('reset-filters').hidden = !keyword && state.category === '全部' && !state.sourceGroup && !onlyReplay;
    const limited = currentCode || state.category !== '全部' || state.sourceGroup || onlyReplay;
    const globalMatches = keyword && limited ? state.channels.filter(channel => matchesKeyword(channel, keyword)).length : 0;
    const globalSearch = document.getElementById('search-global');
    globalSearch.hidden = globalMatches <= state.filtered.length;
    globalSearch.textContent = `全网查找（${globalMatches}）`;
    const newUI = isNewUI();
    const totalEl = document.getElementById('summary-total');
    totalEl.textContent = source.length;
    if (totalEl.previousElementSibling) totalEl.previousElementSibling.textContent = newUI ? '频道：' : '独立频道：';
    document.getElementById('summary-rtp').textContent = stats.rtp;
    const region = currentCode ? state.index.regions[currentCode] : null;
    const count = region ? region.programmes : state.index.totals.programmes;
    const epgEl = document.getElementById('summary-epg');
    epgEl.textContent = Number(count || 0).toLocaleString('zh-CN') + ' 条';
    if (epgEl.previousElementSibling) epgEl.previousElementSibling.textContent = newUI ? '节目：' : '节目单记录：';
    const shortUpdated = formatUpdatedAt(state.index.updatedAt);
    const coverage = document.getElementById('data-coverage');
    coverage.textContent = region
        ? `${state.city} · ${region.epgStatus === 'ok' ? 'EPG 已采集' : 'EPG 部分缺失'}${!newUI && shortUpdated ? ` · 更新于 ${shortUpdated}` : ''}`
        : `${Object.keys(state.index.regions).length} 个区域${!newUI && shortUpdated ? ` · 更新于 ${shortUpdated}` : ''}`;
    coverage.title = `采集更新：${state.index.updatedAt}；节目数含源站占位。总表按频道和不同地区节目单去重，地区表只统计当前地区。`;
    const headerFreshness = document.getElementById('header-freshness');
    if (headerFreshness) {
        headerFreshness.textContent = newUI && shortUpdated ? `更新于 ${shortUpdated}` : '组播 · EPG · 时移';
        headerFreshness.title = coverage.title;
    }
    const telemetry = document.getElementById('header-telemetry-pill');
    if (telemetry) {
        telemetry.textContent = `${source.length} 频道 · ${Object.keys(state.index.regions).length} 区域${shortUpdated ? ` · 更新于 ${shortUpdated}` : ''}`;
        telemetry.title = coverage.title;
    }
    const kickerText = document.getElementById('catalog-kicker-text');
    const titleText = document.getElementById('catalog-title-text');
    const hintText = document.getElementById('catalog-hint-text');
    const filterTitles = document.querySelectorAll('.controls-card .filter-section-title > span');
    if (newUI) {
        if (kickerText) kickerText.textContent = state.view === 'table' ? '数据表格视图' : '频道矩阵视图';
        if (titleText) titleText.textContent = `${state.city} · ${state.category}${state.sourceGroup ? ` · ${state.sourceGroup}` : ''}${onlyReplay ? ' · 支持时移' : ''}`;
        const desktopHint = window.matchMedia('(min-width: 1180px)').matches ? ' · 点击任意频道实时检视右侧节目单' : '';
        if (hintText) hintText.textContent = `匹配 ${state.filtered.length} / ${source.length} 频道${desktopHint}`;
        if (filterTitles[0]) filterTitles[0].textContent = '内容属性分类';
        if (filterTitles[1]) filterTitles[1].textContent = '地市频道表';
        const isMobile = window.matchMedia('(max-width: 700px)').matches;
        const advTitle = document.getElementById('advanced-filters-title');
        if (advTitle) advTitle.textContent = isMobile ? '内容分类筛选' : '地区与分类筛选';
    } else {
        if (kickerText) kickerText.textContent = '全省频道目录';
        if (titleText) titleText.textContent = '频道清单';
        if (hintText) hintText.textContent = '选择频道后可复制组播地址或查看详情';
    }
    document.getElementById('summary-epg').title = region ? '当前地区节目单记录，包含源站占位' : '总 XMLTV 节目记录；同频道相同地区节目单仅计一次，跨频道保留对应关系';
    document.querySelectorAll('#cat-pills [data-cat]').forEach(button => {
        const category = button.dataset.cat;
        const label = `${category} (${category === '全部' ? source.length : stats.categories.get(category) || 0})`;
        if (button.textContent !== label) button.textContent = label;
        button.classList.toggle('active', category === state.category);
        button.setAttribute('aria-pressed', String(category === state.category));
    });
    document.querySelectorAll('#city-pills [data-city]').forEach(button => {
        button.classList.toggle('active', button.dataset.city === state.city);
        button.setAttribute('aria-pressed', String(button.dataset.city === state.city));
    });
    if (newUI) updateWeatherSelection();
    const isShortcutCity = Array.from(document.querySelectorAll('#city-pills [data-city]')).some(btn => btn.dataset.city === state.city);
    const regionLabel = !region ? '查找其他频道'
        : (newUI && isShortcutCity) ? `更多业务编码 (${Object.keys(state.index.regions).length})`
        : region.name.startsWith('区域 ') ? `未命名配置 ${currentCode}` : `${region.name} · ${currentCode}`;
    const districtTrigger = document.getElementById('district-select');
    districtTrigger.querySelector('.picker-trigger-text').textContent = regionLabel;
    districtTrigger.classList.toggle('active', Boolean(region && !isShortcutCity));
    document.querySelector('#source-group-select .picker-trigger-text').textContent = state.sourceGroup || '全部分组';
    const selectedExports = exportsForSelection();
    const playlist = './' + selectedExports.playlistUrl;
    const playlistDownloadName = currentCode ? `gcable_multicast_${currentCode}.m3u` : 'gcable_multicast.m3u';
    for (const download of document.querySelectorAll('[data-playlist-download]')) {
        download.href = playlist;
        download.download = playlistDownloadName;
    }
    const epgHref = './' + selectedExports.epgUrl;
    const epgExt = selectedExports.epgUrl.endsWith('.xml.gz') ? '.xml.gz' : '.xml';
    const epgDownloadName = currentCode ? `gcable_epg_${currentCode}${epgExt}` : `gcable_epg${epgExt}`;
    for (const download of document.querySelectorAll('[data-epg-download]')) {
        download.href = epgHref;
        download.download = epgDownloadName;
    }
    const summaryEpgDownload = document.getElementById('summary-epg-download');
    if (summaryEpgDownload) {
        summaryEpgDownload.textContent = currentCode ? `下载${state.city} EPG (${epgExt})` : `下载全网 EPG (${epgExt})`;
    }
    updateSubscriptionActionLabels(state.city, currentCode, epgExt, state.filtered.length);
    document.getElementById('channels-grid').style.display = state.view === 'card' ? 'grid' : 'none';
    document.getElementById('channels-table-wrap').style.display = state.view === 'table' ? 'block' : 'none';
    reconcile(document.getElementById(state.view === 'card' ? 'channels-grid' : 'channels-table-body'), state.filtered, state.view === 'card' ? cards : rows, state.view === 'table');
    syncURLState();
}

export function scheduleFilter() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(() => {
        applyFilters();
        scrollCatalogToTop();
        syncDesktopInspectorSelection(false);
    });
}
function revealSelectedChip(id) {
    const strip = document.getElementById(id);
    const selected = strip.querySelector('.active');
    if (!selected || strip.scrollWidth <= strip.clientWidth) return;
    const bounds = strip.getBoundingClientRect(), item = selected.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
}

export function setCategory(category) {
    if (state.category === category) return;
    state.category = category;
    applyFilters();
    revealSelectedChip('cat-pills');
    scrollCatalogToTop();
    syncDesktopInspectorSelection(false);
}
export async function setCity(city) {
    const request = ++cityRequest;
    if (state.city === city) {
        scrollCatalogToTop();
        return;
    }
    try {
        if (city !== '全网总表') await loadRegion(state.regionByName.get(city));
        if (request !== cityRequest) return;
        state.city = city;
        ensureCategoryButtons(catalog());
        updateSourceGroups();
        applyFilters();
        revealSelectedChip('city-pills');
        revealSelectedChip('cat-pills');
        scrollCatalogToTop();
        syncDesktopInspectorSelection(true);
    } catch {
        if (request === cityRequest) showToast('该地区频道表载入失败，请重试');
    }
}
export function switchView(view) {
    if (state.view === view) return;
    state.view = view;
    document.getElementById('btn-view-card').classList.toggle('active', view === 'card');
    document.getElementById('btn-view-table').classList.toggle('active', view === 'table');
    document.getElementById('btn-view-card').setAttribute('aria-pressed', String(view === 'card'));
    document.getElementById('btn-view-table').setAttribute('aria-pressed', String(view === 'table'));
    if (state.status !== 'ready' || !state.index) return;
    document.getElementById('channels-grid').style.display = view === 'card' ? 'grid' : 'none';
    document.getElementById('channels-table-wrap').style.display = view === 'table' ? 'block' : 'none';
    applyFilters();
}
export async function initChannels(open, copy) {
    onOpen = open; onCopy = copy;
    urlSyncReady = false;
    document.getElementById('channels-grid').replaceChildren();
    for (const id of ['channels-grid', 'channels-table-body']) {
        const container = document.getElementById(id);
        if (container.dataset.listenerBound) continue;
        container.dataset.listenerBound = 'true';
        container.addEventListener('click', event => {
            const item = event.target.closest('[data-cid]');
            if (!item?.channel) return;
            const button = event.target.closest('[data-action]');
            if (button) {
                if (button.dataset.action === 'details') onOpen(item.channel);
                else onCopy(button, item.channel.rtp, '已复制组播地址');
                return;
            }
            if (isNewUI() && window.matchMedia('(min-width: 1180px)').matches && !window.getSelection()?.toString()) {
                onOpen(item.channel);
            }
        });
    }
    const cities = document.getElementById('city-pills');
    cities.replaceChildren();
    const cityOrder = ['广州','深圳','珠海','佛山','东莞','中山','江门','惠州','肇庆','汕头','潮州','揭阳','汕尾','湛江','茂名','阳江','韶关','清远','梅州','河源','云浮'];
    for (const name of ['全网总表', ...cityOrder.filter(name => state.regionByName.has(name))]) {
        const button = document.createElement('button');
        button.className = 'city-btn'; button.dataset.city = name; button.type = 'button';
        const code = state.regionByName.get(name);
        button.textContent = name + (code ? ` (${code})` : ` (${state.channels.length})`);
        button.onclick = () => setCity(name);
        cities.append(button);
    }
    initRegionPicker();
    document.getElementById('search-clear').onclick = () => {
        const search = document.getElementById('search-kw');
        search.value = '';
        applyFilters();
        scrollCatalogToTop();
        syncDesktopInspectorSelection(false);
        search.focus({preventScroll:true});
    };
    document.getElementById('reset-filters').onclick = () => {
        state.category = '全部';
        state.sourceGroup = '';
        document.getElementById('search-kw').value = '';
        document.getElementById('only-replay').checked = false;
        applyFilters();
        revealSelectedChip('cat-pills');
        scrollCatalogToTop();
        syncDesktopInspectorSelection(false);
        document.getElementById('search-kw').focus({preventScroll:true});
    };
    document.getElementById('search-global').onclick = async () => {
        state.category = '全部';
        state.sourceGroup = '';
        document.getElementById('only-replay').checked = false;
        await setCity('全网总表');
        applyFilters();
        scrollCatalogToTop();
        syncDesktopInspectorSelection(true);
    };
    document.getElementById('source-group-select').onclick = event => {
        const source = catalog();
        const counts = new Map();
        for (const channel of source) for (const group of channel.sourceGroups || []) counts.set(group, (counts.get(group) || 0) + 1);
        openPicker({trigger:event.currentTarget, title:'选择源站分组',
            description:'源站分组按当前地区的原始资料显示，可与内容分类和搜索组合筛选。', selected:state.sourceGroup,
            options:[{value:'', label:'全部分组', detail:`${source.length} 个频道`},
                ...Array.from(counts, ([group, count]) => ({value:group, label:group, detail:`${count} 个频道`}))],
            onSelect:value => {
                state.sourceGroup = value;
                applyFilters();
                scrollCatalogToTop();
                syncDesktopInspectorSelection(false);
            }
        });
    };
    await restoreInitialURLState();
    updateSourceGroups();
    ensureCategoryButtons(catalog());
    urlSyncReady = true;
    applyFilters();
    if (isNewUI() && window.matchMedia('(min-width: 1180px)').matches && !state.selectedChannelID && state.filtered.length) {
        onOpen(state.filtered[0], {restore: true});
    }
}

async function restoreInitialURLState() {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q !== null) document.getElementById('search-kw').value = q;
    if (params.get('replay') === '1') document.getElementById('only-replay').checked = true;
    const view = params.get('view');
    if (view === 'table' || view === 'card') {
        state.view = view;
        document.getElementById('btn-view-card').classList.toggle('active', view === 'card');
        document.getElementById('btn-view-table').classList.toggle('active', view === 'table');
        document.getElementById('btn-view-card').setAttribute('aria-pressed', String(view === 'card'));
        document.getElementById('btn-view-table').setAttribute('aria-pressed', String(view === 'table'));
    }
    const cityParam = params.get('city');
    if (cityParam && cityParam !== '全网总表') {
        let targetCity = null;
        if (state.regionByName.has(cityParam)) {
            targetCity = cityParam;
        } else if (state.index.regions[cityParam]) {
            targetCity = state.index.regions[cityParam].name;
        }
        if (targetCity) {
            try {
                await loadRegion(state.regionByName.get(targetCity));
                state.city = targetCity;
            } catch {
                state.city = '全网总表';
            }
        }
    }
    ensureCategoryButtons(catalog());
    const catParam = params.get('cat');
    if (catParam && (catParam === '全部' || catalog().some(ch => ch.category === catParam))) {
        state.category = catParam;
    }
    const groupParam = params.get('group');
    if (groupParam && catalog().some(ch => ch.sourceGroups?.includes(groupParam))) {
        state.sourceGroup = groupParam;
    }
    revealSelectedChip('city-pills');
    revealSelectedChip('cat-pills');
}

function updateSourceGroups() {
    if (!catalog().some(channel => channel.sourceGroups?.includes(state.sourceGroup))) state.sourceGroup = '';
}

function initRegionPicker() {
    const groups = state.index.regionGroups;
    const byCode = new Map(groups.flatMap(group => group.codes.map(code => [code, group])));
    const channelName = id => state.byId.get(id)?.name || `频道 ${id}`;
    const cityOrder = ['广州','深圳','珠海','佛山','东莞','中山','江门','惠州','肇庆','汕头','潮州','揭阳','汕尾','湛江','茂名','阳江','韶关','清远','梅州','河源','云浮'];
    function buildPickerViews(current) {
        function option(group, exactCode) {
            const code = exactCode ?? (group.codes.includes(current) ? current : group.representativeCode);
            const knownNames = group.knownCityCodes.map(value => state.index.regions[value].name);
            const extra = group.extraChannelIds;
            const samples = (extra.length ? extra : group.channelIds).slice(0,3).map(channelName).join('、');
            const label = exactCode ? `${state.index.regions[code].name.startsWith('区域 ') ? '未命名编码' : state.index.regions[code].name} · ${code}`
                : knownNames.length ? `${knownNames.join(' / ')} · 相同数据配置` : `未命名配置 ${group.representativeCode}`;
            return {value:code, label,
                detail:`${group.channelIds.length} 个频道${extra.length ? ` · ${extra.length} 个地市表外频道` : ''} · ${group.codes.length} 个同数据编码\n${samples}`,
                keywords:[...group.codes,...knownNames,...group.channelIds.map(id => `${id} ${channelName(id)} ${(state.byId.get(id)?.sourceNames || []).map(source => source.name).join(' ')}`)].join(' ')};
        }
        const additional = groups.filter(group => group.extraChannelIds.length).map(group => option(group));
        const distinct = groups.map(group => option(group));
        const original = Object.keys(state.index.regions).map(code => option(byCode.get(code), code));
        const cities = [
            {value:'__ALL__', label:`全网总表 (${state.channels.length} 个频道)`, detail:'汇总全省所有已收录组播频道与跨地市别名', keywords:'全网总表 全省 all 0'},
            ...cityOrder.filter(name => state.regionByName.has(name)).map(name => {
                const code = state.regionByName.get(name);
                const reg = state.index.regions[code];
                return {
                    value: code,
                    label: `${name} (${code})`,
                    detail: `${reg.channels} 个频道 · ${Number(reg.programmes || 0).toLocaleString('zh-CN')} 条节目`,
                    keywords: `${name} ${code}`
                };
            })
        ];
        return {cities, additional, distinct, original};
    }
    const picker = document.getElementById('district-select');
    picker.onclick = () => {
        const current = regionCode();
        const {additional, distinct, original} = buildPickerViews(current);
        openPicker({trigger:picker, title:'查找其他频道配置', selected:current,
            description:'这些是源站业务编码，不一定是区县。相同频道、频点和节目单合并展示，不代表地理归属；原始编码仍全部保留。可搜索频道名、ID 或编码。',
            options:distinct, views:[
                {id:'additional', label:`额外频道 (${additional.length})`, options:additional},
                {id:'distinct', label:`全部配置 (${distinct.length})`, options:distinct},
                {id:'original', label:`原始编码 (${original.length})`, options:original}
            ],
            onSelect:async code => { const name = state.index.regions[code].name; await setCity(name); return state.city === name; }
        });
    };
    for (const id of ['header-city-trigger', 'mobile-dock-region']) {
        const trigger = document.getElementById(id);
        if (!trigger) continue;
        trigger.onclick = () => {
            const current = regionCode() || '__ALL__';
            const {cities, additional, distinct, original} = buildPickerViews(regionCode());
            openPicker({trigger, title:'切换地市与频道配置', selected:current,
                description:'支持快速切换 21 地市频道表、全网总表或按源站业务编码检索。',
                options:cities, views:[
                    {id:'cities', label:`21 地市 (${cities.length})`, options:cities},
                    {id:'additional', label:`额外频道 (${additional.length})`, options:additional},
                    {id:'distinct', label:`全部配置 (${distinct.length})`, options:distinct},
                    {id:'original', label:`原始编码 (${original.length})`, options:original}
                ],
                onSelect:async code => {
                    const name = code === '__ALL__' ? '全网总表' : state.index.regions[code]?.name;
                    if (!name) return false;
                    await setCity(name);
                    return state.city === name;
                }
            });
        };
    }
}

function ensureCategoryButtons(channels) {
    const existing = new Set(Array.from(document.querySelectorAll('#cat-pills [data-cat]'), button => button.dataset.cat));
    for (const category of new Set(channels.map(channel => channel.category))) {
        if (existing.has(category)) continue;
        const button = document.createElement('button');
        button.className = 'cat-btn'; button.dataset.cat = category; button.type = 'button';
        button.onclick = () => setCategory(category);
        document.getElementById('cat-pills').append(button);
        existing.add(category);
    }
}

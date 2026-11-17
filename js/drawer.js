import {state, regionalChannel, channelRegions, regionCode, loadRegion, loadSchedule, escapeHTML as esc, chinaTime, chinaDate, streamURL, replayTemplate} from './data.js?v=20261117-gudou-health';
import {getChannelIconHTML} from './icons.js?v=20261117-gudou-health';
import {copyBtnFeedback, showToast} from './ui.js?v=20261117-gudou-health';
import {openPicker, closePicker} from './picker.js?v=20261117-gudou-health';
import {updateSelectedChannelCard} from './channels.js?v=20261117-gudou-health';
const desktopSplitQuery = window.matchMedia('(min-width: 1180px)');
let channel = null;
let programmes = [];
let activeDate = '';
let requestVersion = 0;
let renderVersion = 0;
let observer;
let opener;
let pendingHistoryClose = false;
let queuedOpen;

function deliveryValues(value) {
    if (!value?.startsWith('delivery://')) return null;
    const parts = value.slice(11).split('.');
    if (parts.length < 6) return null;
    return [Number(parts[0]) >= 10000 ? `${Number(parts[0]) / 1000} MHz` : `${parts[0]} MHz`, `${parts[1]} KSym/s`, `QAM-${parts[2]}`, ...parts.slice(3,6).map(part => part === 'null' ? '未指定' : part)];
}
function mediaDetails(record) {
    const values = [];
    if (record?.width > 0 && record?.height > 0) values.push(`${record.width}×${record.height}`);
    if (record?.videoCodec) values.push(record.videoCodec.toUpperCase());
    if (record?.audioCodec) values.push(`音频 ${record.audioCodec.toUpperCase()}`);
    return values.join(' · ') || '未取得媒体参数';
}
function observationStatus(record) {
    if (!record) return '尚无检测记录';
    if (record.decoded === true || record.status === 'decoded') return '样本解码成功';
    if (record.mediaDetected === true) return '已识别媒体，未取得解码帧';
    const labels = {'request-failed':'本次请求失败（不代表永久失效）', unavailable:'本次请求未通过',
        pending:'尚未检测', 'not-checked':'尚未检测', 'media-detected':'已识别媒体，样本解码未确认',
        'metadata-only':'已识别媒体，样本解码未确认', 'manifest-only':'仅取得清单，媒体未确认',
        manifest:'仅取得清单，媒体未确认', encrypted:'加密媒体，未验证',
        incomplete:'媒体样本不完整', invalid:'媒体样本未通过', 'media-unverified':'媒体尚未确认'};
    return labels[record.status] || '检测状态未确认';
}
function fillGudou() {
    const check = channel.gudouCheck;
    const url = streamURL(channel);
    const address = document.getElementById('d-gudou');
    address.textContent = url || '未提供安全的已记录单播地址';
    address.title = url;
    document.getElementById('btn-copy-gudou-d').disabled = !url;
    const http = Array.isArray(check?.httpStatuses) && check.httpStatuses.length ? ` · HTTP ${check.httpStatuses.join(' / ')}` : '';
    document.getElementById('d-gudou-status').textContent = observationStatus(check) + http;
    const checkedAt = typeof check?.checkedAt === 'string' ? chinaTime(check.checkedAt) : NaN;
    const time = Number.isFinite(checkedAt) ? new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(checkedAt)) + ' UTC+8' : '未提供';
    const observation = document.getElementById('d-gudou-observation');
    observation.textContent = `检测时间：${time} · ${mediaDetails(check)}`;
    observation.title = check?.checkedAt || '';
    const identity = check?.identityStatus === 'matched' ? `台名已匹配${check.serviceName ? `：${check.serviceName}` : ''}`
        : check?.identityStatus === 'mismatch' ? '媒体台名与目录不匹配'
        : '台名尚未匹配；与上方媒体检测结果分开记录';
    document.getElementById('d-gudou-identity').textContent = identity;
    const renditions = document.getElementById('d-gudou-renditions');
    renditions.replaceChildren();
    if (Array.isArray(check?.renditions) && check.renditions.length) {
        for (const rendition of check.renditions) {
            const row = document.createElement('div');
            const path = typeof rendition.playlistPath === 'string' ? rendition.playlistPath : '';
            row.textContent = `${path.split('/').pop() || '档位名未记录'} · ${mediaDetails(rendition)} · ${rendition.status === 'decoded' ? '已解码' : observationStatus(rendition)}`;
            row.title = path;
            renditions.append(row);
        }
    } else renditions.textContent = '未提供子播放列表记录';
    const history = document.getElementById('d-gudou-history');
    history.open = false;
    const historicalURLs = Array.isArray(check?.historicalURLs) ? check.historicalURLs : [];
    history.hidden = !historicalURLs.length;
    document.getElementById('d-gudou-history-urls').textContent = historicalURLs.join('\n');
    const template = replayTemplate(channel);
    document.getElementById('d-catchup-tpl').textContent = template || '未满足请求模板条件：需源站时移标记、已识别媒体及安全记录地址';
    document.getElementById('d-catchup-tpl').title = template;
    document.getElementById('btn-copy-catchup-tpl').disabled = !template;
    document.getElementById('row-catchup').hidden = channel.isTVAnyTime !== '1';
}
function fillChannel() {
    document.getElementById('d-emblem').innerHTML = getChannelIconHTML(channel);
    document.getElementById('d-title').textContent = channel.name;
    document.getElementById('d-num').textContent = `#${channel.channelNumber} · 频道ID: ${channel.channelID}`;
    document.getElementById('d-cat').textContent = channel.category;
    document.getElementById('d-source-groups').textContent = channel.sourceGroups?.join('、') || '未提供';
    document.getElementById('d-start-over').textContent = channel.isStartOver === '1' ? '支持从头播放' : '未开通从头播放';
    document.getElementById('d-source-metadata').textContent = JSON.stringify(channel.sourceMetadata || channel, null, 2);
    document.getElementById('d-rtp').textContent = channel.rtp;
    document.getElementById('btn-copy-rtp-d').disabled = !channel.rtp;
    fillGudou();
    // Capability and category are displayed in the channel hero header
    const values = deliveryValues(channel.delivery);
    const grid = document.getElementById('d-dvb-grid');
    grid.replaceChildren();
    if (values) {
        ['中心载波频率', '符号率 (SR)', '调制方式', '业务标识 (SID)', '视频 PID', '音频 PID'].forEach((label, index) => {
            const chip = document.createElement('div'); chip.className = 'dvb-chip';
            chip.innerHTML = `<span class="dvb-chip-label">${label}</span><span class="dvb-chip-val">${esc(values[index])}</span>`;
            grid.append(chip);
        });
    } else {
        const message = document.createElement('div'); message.style.gridColumn = '1/-1';
        message.textContent = '该地区未下发 DVB-C 频点参数'; grid.append(message);
    }
    const heroBadge = document.getElementById('hero-live-badge');
    const heroLiveText = document.getElementById('hero-live-text');
    const cap = channel.isTVAnyTime === '1' ? 'timeshift' : channel.hasEPG ? 'epg' : 'live';
    heroBadge.setAttribute('data-capability', cap);
    if (heroLiveText) heroLiveText.textContent = cap === 'timeshift' ? '源站标记时移' : cap === 'epg' ? '含节目单' : '仅直播';
    heroBadge.title = cap === 'timeshift' ? '源站提供时移标记；请求模板不代表本次已验证回看能力' : cap === 'epg' ? '该频道提供电子节目单，未开通时移回看' : '该频道仅提供实时组播/单播直播';
}

let userPinnedTab = '';
export function setInspectorTab(tab) {
    const drawerEl = document.getElementById('main-drawer');
    if (!drawerEl) return;
    drawerEl.setAttribute('data-active-tab', tab);
    document.querySelectorAll('#main-drawer .drawer-section-nav button[data-inspector-tab]').forEach(btn => {
        const active = btn.dataset.inspectorTab === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

export function openDrawer(selected, {restore = false, region: restoredRegion} = {}) {
    // Wait for our asynchronous Back before creating another drawer entry.
    if (pendingHistoryClose && !restore) {
        queuedOpen = {selected, trigger: document.activeElement};
        return;
    }
    const cid = String(selected.channelID);
    const codes = channelRegions(cid);
    if (!codes.length || (restore && restoredRegion !== undefined && !codes.includes(restoredRegion))) return;
    closePicker(false);
    const overlay = document.getElementById('drawer-overlay');
    const wasActive = overlay.classList.contains('active');
    if (!wasActive) opener = document.activeElement;
    updateSelectedChannelCard(cid);
    document.getElementById('d-title').textContent = selected.name;
    document.getElementById('d-emblem').innerHTML = getChannelIconHTML(selected);
    const trigger = document.getElementById('d-region');
    const preferred = (restore && restoredRegion !== undefined) ? restoredRegion : String(regionCode() || selected.sourceRegion || selected.regionCode || codes[0]);
    trigger.value = codes.includes(preferred) ? preferred : codes[0];
    document.getElementById('d-region-text').textContent = `${state.index.regions[trigger.value].name} (${trigger.value})`;
    trigger.onclick = () => openPicker({
        trigger, title: '选择详情地区来源',
        description: '仅列出该频道实际存在的地区来源；切换后读取对应地区的频道参数和节目单，不使用其他地区数据替代。',
        selected: trigger.value,
        options: codes.map(value => ({value, label: `${state.index.regions[value].name} (${value})`})),
        onSelect: code => {
            trigger.value = code;
            document.getElementById('d-region-text').textContent = `${state.index.regions[code].name} (${code})`;
            history.replaceState({...history.state, drawerOpen:true, channelID:cid, regionCode:code}, '');
            return updateRegion(cid, code);
        }
    });
    overlay.classList.add('active');
    document.documentElement.classList.add('drawer-open');
    const dockedDesktop = desktopSplitQuery.matches;
    document.body.style.overflow = dockedDesktop ? '' : 'hidden';
    setInspectorTab(userPinnedTab || (selected.hasEPG === false ? 'streams' : 'epg'));
    if (!restore) {
        const nextState = {...history.state, drawerOpen:true, channelID:cid, regionCode:trigger.value};
        if (wasActive && history.state?.drawerOpen) history.replaceState(nextState, '');
        else history.pushState(nextState, '');
    }
    updateRegion(cid, trigger.value);
    document.querySelector('#main-drawer .drawer-body').scrollTop = 0;
    if (!dockedDesktop && !restore) {
        document.getElementById('drawer-close').focus({preventScroll:true});
    }
}
async function updateRegion(cid, code) {
    const version = ++requestVersion;
    observer?.disconnect(); ++renderVersion;
    channel = null;
    for (const id of ['d-cat','d-source-groups','d-start-over','d-source-metadata','d-rtp','d-gudou','d-gudou-status','d-gudou-observation','d-gudou-identity','d-gudou-renditions','d-catchup-tpl','d-delivery']) {
        const el = document.getElementById(id);
        if (el) { el.textContent = '正在载入…'; el.removeAttribute('title'); }
    }
    document.getElementById('d-gudou-history').hidden = true;
    document.getElementById('d-gudou-history').open = false;
    document.getElementById('d-gudou-history-urls').textContent = '';
    document.getElementById('row-catchup').hidden = true;
    document.getElementById('d-dvb-grid').replaceChildren();
    document.getElementById('d-num').textContent = `频道ID: ${cid} · 正在载入地区信息`;
    document.querySelectorAll('#main-drawer .stream-entry button').forEach(button => { button.disabled = true; });
    programmes = [];
    const list = document.getElementById('d-epg-list');
    document.getElementById('date-tabs').replaceChildren();
    document.getElementById('d-epg-count').textContent = '正在载入…';
    list.textContent = '正在读取该地区节目单…';
    try {
        await loadRegion(code);
        if (version !== requestVersion) return false;
        channel = regionalChannel(cid, code);
        if (!channel) throw new Error('Channel missing from region catalog');
        fillChannel();
        const result = await loadSchedule(cid, code);
        if (version !== requestVersion) return false;
        if (result === null) {
            document.getElementById('d-epg-count').textContent = '未取得数据';
            list.textContent = '本次未取得该地区节目单，未使用其他地区数据替代。';
            if (!userPinnedTab) setInspectorTab('all');
            return true;
        }
        programmes = result;
        document.getElementById('d-epg-count').textContent = `${programmes.length} 条节目`;
        buildDateTabs(); renderProgrammes();
        return true;
    } catch {
        if (version !== requestVersion) return false;
        if (!channel) {
            for (const id of ['d-gudou','d-gudou-status','d-gudou-observation','d-gudou-identity','d-gudou-renditions','d-catchup-tpl']) document.getElementById(id).textContent = '地区数据载入失败，未使用其他地区证据';
        }
        document.getElementById('d-epg-count').textContent = '载入失败';
        list.textContent = '该地区节目单载入失败，请重新选择地区重试。';
        return false;
    }
}
function buildDateTabs() {
    const dates = [...new Set(programmes.map(programme => programme.start.slice(0,10)))].sort().reverse();
    const today = chinaDate();
    activeDate = dates.includes(today) ? today : dates[0] || 'ALL';
    const tabs = document.getElementById('date-tabs'); tabs.replaceChildren();
    for (const date of [...dates, 'ALL']) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'date-pill';
        button.dataset.date = date;
        button.textContent = date === 'ALL' ? '全部日期' : `${date === today ? '今天 ' : ''}${date.slice(5).replace('-','月')}日`;
        button.onclick = () => { if (activeDate === date) return; activeDate = date; renderProgrammes(); };
        tabs.append(button);
    }
}
function replayAllowed(programme) {
    const start = chinaTime(programme.start), end = chinaTime(programme.end), now = Date.now();
    return Boolean(replayTemplate(channel)) && programme.canReplay !== false && end <= now && start >= now - 7 * 86400000 && end > start;
}
function programmeCard(programme, now) {
    const start = chinaTime(programme.start), end = chinaTime(programme.end);
    const current = start <= now && now < end;
    const card = document.createElement('div'); card.className = 'epg-entry' + (current ? ' now' : '');
    const body = document.createElement('div'); body.style.cssText = 'flex:1;min-width:0;';
    const time = document.createElement('div'); time.className = 'epg-time';
    time.textContent = `${programme.start.slice(11,16)} ~ ${programme.end.slice(11,16)} (${programme.start.slice(5,10)})`;
    const title = document.createElement('div'); title.className = 'epg-title';
    const placeholder = programme.placeholder || /^(?:\d{1,2}:\d{2}(?::\d{2})?|无节目名|暂无节目|无节目信息)$/.test(programme.title.trim());
    title.textContent = placeholder ? '未提供节目名称（源站占位）' : programme.title;
    body.append(time,title); card.append(body);
    if (replayAllowed(programme)) {
        const button = document.createElement('button'); button.className = 'btn-copy-catchup'; button.textContent = '复制回看请求';
        button.onclick = () => {
            if (!replayAllowed(programme)) { showToast('当前未满足回看请求条件'); return; }
            const offset = Math.floor((Date.now() - start) / 1000);
            const url = new URL(streamURL(channel));
            url.searchParams.set('volume', 'Suma');
            url.searchParams.set('offset', String(offset));
            copyBtnFeedback(button, url.href, '已复制回看请求模板，尚未验证回看能力');
        };
        card.append(button);
    } else {
        const badge = document.createElement('span'); badge.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap;';
        badge.textContent = current ? '正在播出' : start > now ? '即将播出' : channel.isTVAnyTime !== '1' ? '未开通回看' : !replayTemplate(channel) ? '未满足回看请求条件' : '已超出回看范围';
        card.append(badge);
    }
    return card;
}
function renderProgrammes() {
    observer?.disconnect();
    const version = ++renderVersion;
    document.querySelectorAll('#date-tabs .date-pill').forEach(button => {
        const selected = button.dataset.date === activeDate;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        if (selected) {
            const tabs = button.parentElement;
            const strip = tabs.getBoundingClientRect(), chosen = button.getBoundingClientRect();
            const left = strip.left + tabs.clientLeft, right = left + tabs.clientWidth;
            if (chosen.left < left) tabs.scrollLeft += chosen.left - left;
            else if (chosen.right > right) tabs.scrollLeft += chosen.right - right;
        }
    });
    const list = document.getElementById('d-epg-list'); list.replaceChildren();
    const selected = activeDate === 'ALL' ? programmes : programmes.filter(programme => programme.start.startsWith(activeDate));
    document.getElementById('d-epg-count').textContent = `共 ${programmes.length} 条 · ${activeDate === 'ALL' ? '全部日期' : activeDate} ${selected.length} 条`;
    if (!selected.length) { list.textContent = '该日期下暂无节目单记录'; return; }
    let offset = 0;
    const sentinel = document.createElement('div'); sentinel.textContent = '继续滚动查看更多节目'; list.append(sentinel);
    function appendPage() {
        if (version !== renderVersion) return;
        const fragment = document.createDocumentFragment();
        const end = Math.min(offset + 60, selected.length), now = Date.now();
        while (offset < end) fragment.append(programmeCard(selected[offset++], now));
        list.insertBefore(fragment, sentinel);
        if (offset === selected.length) { sentinel.remove(); observer?.disconnect(); }
    }
    appendPage();
    if (offset < selected.length) {
        observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) appendPage(); }, {root:document.querySelector('#main-drawer .drawer-body'),rootMargin:'200px'});
        observer.observe(sentinel);
    }
}
export function hideDrawer(back = true) {
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay.classList.contains('active')) return;
    closePicker(false);
    ++requestVersion; ++renderVersion; observer?.disconnect();
    channel = null;
    updateSelectedChannelCard('');
    overlay.classList.remove('active');
    document.documentElement.classList.remove('drawer-open');
    document.body.style.overflow = '';
    if (back && history.state?.drawerOpen) {
        pendingHistoryClose = true;
        history.back();
    }
    if (opener?.isConnected) opener.focus({preventScroll:true});
}
export function closeDrawer(event) { if (event.target.id === 'drawer-overlay') hideDrawer(); }
export function copyCurrentRtp(button) { if (channel?.rtp) copyBtnFeedback(button, channel.rtp, '已复制组播地址'); }
export function copyCurrentGudou(button) {
    const url = streamURL(channel);
    if (url) copyBtnFeedback(button, url, `已复制记录地址（${observationStatus(channel.gudouCheck)}）`);
}
export function copyNativeCatchupTemplate(button) {
    const template = replayTemplate(channel);
    if (template) copyBtnFeedback(button, template, '已复制时移请求模板，尚未验证回看能力');
}
window.addEventListener('popstate', () => {
    pendingHistoryClose = false;
    if (queuedOpen) {
        const {selected, trigger} = queuedOpen;
        queuedOpen = undefined;
        openDrawer(selected);
        opener = trigger;
        return;
    }
    // Read the current entry, not a potentially superseded traversal event.
    const entry = history.state;
    const selected = entry?.drawerOpen && state.byId.get(entry.channelID);
    if (selected && typeof entry.regionCode === 'string' && channelRegions(entry.channelID).includes(entry.regionCode)) {
        openDrawer(selected, {restore:true, region:entry.regionCode});
    } else {
        hideDrawer(false);
    }
});
desktopSplitQuery.addEventListener('change', () => {
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay?.classList.contains('active')) return;
    document.body.style.overflow = desktopSplitQuery.matches ? '' : 'hidden';
});
document.getElementById('main-drawer').addEventListener('click', event => {
    const button = event.target.closest('#main-drawer .drawer-section-nav button[data-drawer-target]');
    if (!button) return;
    const body = document.querySelector('#main-drawer .drawer-body');
    if (button.dataset.inspectorTab) {
        userPinnedTab = button.dataset.inspectorTab;
        setInspectorTab(userPinnedTab);
        body.scrollTop = 0;
        return;
    }
    const target = document.getElementById(button.dataset.drawerTarget);
    if (!target || !body.contains(target)) return;
    document.querySelectorAll('#main-drawer .drawer-section-nav button[data-drawer-target]').forEach(item => {
        item.classList.toggle('active', item === button);
    });
    target.focus({preventScroll:true});
    body.scrollTo({
        top: body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientTop,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
});
window.addEventListener('keydown', event => {
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay?.classList.contains('active')) return;
    if (document.getElementById('filter-picker').open) return;
    if (event.key === 'Escape') hideDrawer();
    if (event.key === 'Tab') {
        const targets = Array.from(document.getElementById('main-drawer').querySelectorAll('button,select,a[href],summary')).filter(element => element.getClientRects().length && !element.disabled);
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
});

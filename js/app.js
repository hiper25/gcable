import {state, loadCatalog, fetchJSON, mutableURL, exportsForSelection} from './data.js?v=28';
import {initChannels, applyFilters, scheduleFilter, setCategory, setCity, switchView} from './channels.js?v=28';
import * as drawer from './drawer.js?v=28';
import {initTheme, setThemeMode, scrollToTop, showToast, copyBtnFeedback, openHistoryModal, closeHistoryModal, openEpgModal, closeEpgModal} from './ui.js?v=28';

function copyExport(button, field, label) {
    if (!state.index) { showToast('频道数据尚未载入'); return; }
    const path = exportsForSelection()[field];
    if (!path) { showToast('本次未生成该地区订阅'); return; }
    copyBtnFeedback(button, new URL(path, document.baseURI).href, `已复制${state.city} ${label}`);
}
function copyM3U(button) { copyExport(button, 'playlistUrl', '组播订阅'); }
function copyGudouM3U(button) { copyExport(button, 'gudouPlaylistUrl', '谷豆订阅'); }
function copyEPG(button) { copyExport(button, 'epgUrl', 'XMLTV 节目单'); }
function exportTxt(button) {
    copyBtnFeedback(button, state.filtered.map(channel => `${channel.name},${channel.rtp}`).join('\n'), `已复制当前筛选的 ${state.filtered.length} 条组播地址`);
}
const ACTION_ICONS = {
    copyM3U: '<svg class="btn-svg" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    copyEPG: '<svg class="btn-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    copyGudouM3U: '<svg class="btn-svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
    exportTxt: '<svg class="btn-svg" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>',
    download: '<svg class="btn-svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    modal: '<svg class="btn-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
};
const SUBSCRIPTION_ACTIONS = [
    {key:'copyM3U', classes:'btn btn-primary', label:'复制 M3U 订阅源', mobileLabel:'复制 M3U 订阅', icon:'copyM3U', handler:copyM3U},
    {key:'copyEPG', classes:'btn btn-accent', label:'复制 7天 EPG', mobileLabel:'复制 7天 EPG', icon:'copyEPG', handler:copyEPG},
    {key:'copyGudouM3U', classes:'btn btn-purple', label:'谷豆单播源', mobileLabel:'谷豆单播源', icon:'copyGudouM3U', handler:copyGudouM3U},
    {key:'exportTxt', classes:'btn btn-amber', label:'复制组播 TXT', mobileLabel:'复制组播 TXT', icon:'exportTxt', handler:exportTxt},
    {key:'downloadM3U', classes:'btn', label:'下载 M3U', mobileLabel:'下载当前地区 M3U', icon:'download', download:'playlist'},
    {key:'downloadEPG', classes:'btn btn-accent', label:'下载 EPG', mobileLabel:'下载当前地区 EPG', icon:'download', download:'epg'},
    {key:'openEpgModal', classes:'btn', label:'地区 EPG 下载', mobileLabel:'各地区 EPG 与订阅下载窗口', icon:'modal', mobileClass:'mobile-epg-modal-btn', handler:openEpgModal}
];
function renderSubscriptionActions() {
    for (const [targetId, mobile] of [['desktop-subscription-actions', false], ['mobile-subscription-actions', true]]) {
        const target = document.getElementById(targetId);
        if (!target) continue;
        target.replaceChildren();
        for (const spec of SUBSCRIPTION_ACTIONS) {
            const element = document.createElement(spec.download ? 'a' : 'button');
            element.className = `${spec.classes}${mobile && spec.mobileClass ? ` ${spec.mobileClass}` : ''}`;
            if (!spec.download) element.type = 'button';
            if (spec.download === 'playlist') {
                element.dataset.playlistDownload = '';
                element.href = './playlist.m3u';
                element.download = 'gcable_multicast.m3u';
            } else if (spec.download === 'epg') {
                element.dataset.epgDownload = '';
                element.href = './epg.xml';
                element.download = 'gcable_epg.xml';
            }
            element.innerHTML = ACTION_ICONS[spec.icon];
            element.append(document.createTextNode(mobile ? spec.mobileLabel : spec.label));
            if (spec.handler) element.addEventListener('click', () => spec.handler(element));
            target.append(element);
        }
    }
}
renderSubscriptionActions();
// Existing static buttons retain their handlers; dynamic content uses delegated listeners.
Object.assign(window, {setThemeMode,scrollToTop,setCategory,setCity,switchView,applyFilters:scheduleFilter,copyM3U,copyGudouM3U,copyEPG,exportTxt,openHistoryModal,closeHistoryModal,openEpgModal,closeEpgModal,...drawer});
initTheme();
const compactLayout = window.matchMedia('(max-width: 700px)');
const overview = document.getElementById('site-overview');
overview.open = !compactLayout.matches;
document.getElementById('advanced-filters').open = window.matchMedia('(min-width: 1201px)').matches;
compactLayout.addEventListener('change', () => { overview.open = !compactLayout.matches; });
document.querySelectorAll('#cat-pills [data-cat]').forEach(button => {
    button.setAttribute('role','button'); button.tabIndex = 0;
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } });
});
for (const id of ['cat-pills','city-pills']) {
    const element = document.getElementById(id);
    element.addEventListener('wheel', event => {
        if (event.deltaY && !event.deltaX && element.scrollWidth > element.clientWidth) {
            const before = element.scrollLeft;
            element.scrollLeft += event.deltaY;
            if (element.scrollLeft !== before) event.preventDefault();
        }
    }, {passive:false});
}

function renderNotices(notices) {
    const container = document.getElementById('notice-container'); container.replaceChildren();
    const groups = new Map();
    for (const [code, notice] of Object.entries(notices)) {
        const message = notice.msg?.trim();
        if (!message) continue;
        if (!groups.has(message)) groups.set(message, new Set());
        groups.get(message).add(notice.city || `区域 ${code}`);
    }
    const grouped = [...groups].sort((a, b) => b[1].size - a[1].size);
    for (const [index, [message, regions]] of grouped.entries()) {
        const cities = [...regions];
        const card = document.createElement('div'); card.className = index ? 'notice-card diff' : 'notice-card';
        const tag = document.createElement('span'); tag.className = index ? 'notice-tag diff' : 'notice-tag';
        tag.textContent = cities.length === 1 ? `${cities[0]}通告` : `${cities.length}地共同通告`;
        const wrap = document.createElement('div'); wrap.className = 'ticker-wrap'; wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', `${tag.textContent}，聚焦暂停滚动`);
        const content = document.createElement('div'); content.className = 'ticker-move';
        const text = document.createElement('span'); text.className = 'ticker-message'; text.textContent = message;
        const duplicate = text.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true');
        content.append(text, duplicate); wrap.append(content); card.append(tag, wrap);
        if (cities.length > 1) {
            const details = document.createElement('details'); details.className = 'notice-regions';
            const summary = document.createElement('summary'); summary.textContent = '查看适用地区';
            const list = document.createElement('div'); list.textContent = cities.join('、');
            details.append(summary, list); card.append(details);
        }
        container.append(card);
    }
}
loadCatalog().then(() => initChannels(drawer.openDrawer, copyBtnFeedback)).catch(error => {
    document.getElementById('channels-grid').textContent = '频道数据载入失败，请刷新重试。';
    console.error(error);
});
fetchJSON(mutableURL('./weather.json')).then(data => {
    const track = document.getElementById('weather-track'); track.replaceChildren();
    const cycle = document.createElement('div'); cycle.className = 'weather-cycle';
    for (const [city, weather] of Object.entries(data)) {
        const chip = document.createElement('div'); chip.className = 'weather-chip';
        const name = document.createElement('b'); name.textContent = city;
        const summary = document.createElement('span'); summary.textContent = weather.weather;
        const temperature = document.createElement('span'); temperature.className = 'temp'; temperature.textContent = weather.temperature;
        chip.append(name,summary,temperature);
        const wind = document.createElement('span'); wind.textContent = weather.wind || '';
        chip.append(wind); chip.title = [weather.locationName,weather.locationCode,weather.date,weather.wind].filter(Boolean).join(' · ');
        cycle.append(chip);
    }
    const duplicate = cycle.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true');
    track.append(cycle, duplicate);
}).catch(() => { document.getElementById('weather-track').textContent = '天气数据暂不可用'; });
fetchJSON(mutableURL('./notices.json')).then(renderNotices).catch(() => {});

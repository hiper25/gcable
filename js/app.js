import {state, loadCatalog, fetchJSON, mutableURL, exportsForSelection} from './data.js?v=32';
import {initChannels, applyFilters, scheduleFilter, setCategory, setCity, switchView} from './channels.js?v=32';
import * as drawer from './drawer.js?v=32';
import {initTheme, setThemeMode, scrollToTop, showToast, copyBtnFeedback, openHistoryModal, closeHistoryModal, openEpgModal, closeEpgModal} from './ui.js?v=32';

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
const SUBSCRIPTION_ACTIONS = Object.freeze([
    {key:'copyM3U', desktop:'复制 M3U', mobile:'复制 M3U 订阅', handler:copyM3U},
    {key:'copyEPG', desktop:'复制 EPG 链接', mobile:'复制 7天 EPG', handler:copyEPG},
    {key:'copyGudouM3U', desktop:'复制谷豆地址', mobile:'谷豆单播源', handler:copyGudouM3U},
    {key:'exportTxt', desktop:'导出组播 TXT', mobile:'复制组播 TXT', handler:exportTxt},
    {key:'downloadM3U', desktop:'下载 M3U', mobile:'下载当前地区 M3U'},
    {key:'downloadEPG', desktop:'下载 EPG', mobile:'下载当前地区 EPG'},
    {key:'openEpgModal', desktop:'地区 EPG', mobile:'各地区 EPG 与订阅下载窗口', handler:openEpgModal}
]);
const DESKTOP_PRIMARY_ACTIONS = new Set(['copyM3U', 'openEpgModal']);
const DESKTOP_TOOLS_GROUPS = Object.freeze([
    {label:'EPG 与单播订阅', keys:['copyEPG', 'copyGudouM3U']},
    {label:'下载与导出', keys:['exportTxt', 'downloadM3U', 'downloadEPG']}
]);
function populateSubscriptionActions(target, {mobile, primaryOnly} = {}) {
    const fragment = document.getElementById('subscription-actions-template').content.cloneNode(true);
    fragment.querySelectorAll('[data-subscription-action]').forEach(action => {
        const spec = SUBSCRIPTION_ACTIONS.find(item => item.key === action.dataset.subscriptionAction);
        if (!spec) return;
        if (!mobile && primaryOnly !== DESKTOP_PRIMARY_ACTIONS.has(spec.key)) {
            action.remove();
            return;
        }
        action.querySelector('.subscription-action-label').textContent = mobile ? spec.mobile : spec.desktop;
        if (!mobile && spec.key === 'downloadM3U') action.id = 'download-m3u';
        if (!mobile && spec.key === 'downloadEPG') action.id = 'download-epg';
        if (!mobile && spec.key === 'openEpgModal') action.classList.add('btn-accent');
        if (mobile && spec.key === 'openEpgModal') action.classList.add('mobile-epg-modal-btn');
        if (spec.handler) action.addEventListener('click', () => spec.handler(action));
    });
    if (!mobile && primaryOnly === false) {
        const groupedActions = document.createDocumentFragment();
        for (const group of DESKTOP_TOOLS_GROUPS) {
            const section = document.createElement('section');
            section.className = 'header-tools-section';
            const heading = document.createElement('h3');
            heading.className = 'header-tools-group-title';
            heading.textContent = group.label;
            const actions = document.createElement('div');
            actions.className = 'header-tools-group';
            for (const key of group.keys) {
                const action = fragment.querySelector(`[data-subscription-action="${key}"]`);
                if (action) actions.append(action);
            }
            section.append(heading, actions);
            groupedActions.append(section);
        }
        target.replaceChildren(groupedActions);
        return;
    }
    target.replaceChildren(fragment);
}
function renderSubscriptionActions() {
    populateSubscriptionActions(document.getElementById('desktop-primary-actions'), {primaryOnly:true});
    populateSubscriptionActions(document.getElementById('desktop-subscription-actions'), {primaryOnly:false});
    populateSubscriptionActions(document.getElementById('mobile-subscription-actions'), {mobile:true});
}
renderSubscriptionActions();
const desktopToolsMenu = document.querySelector('.header-tools-menu');
desktopToolsMenu?.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-subscription-action]')) return;
    desktopToolsMenu.open = false;
    desktopToolsMenu.querySelector('summary').focus({preventScroll:true});
});
document.addEventListener('click', event => {
    if (desktopToolsMenu?.open && !desktopToolsMenu.contains(event.target)) desktopToolsMenu.open = false;
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !desktopToolsMenu?.open) return;
    desktopToolsMenu.open = false;
    desktopToolsMenu.querySelector('summary').focus({preventScroll:true});
});
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

import {state, loadCatalog, fetchJSON, exportsForSelection} from './data.js?v=47';
import {initChannels, renderCatalogError, scheduleFilter, setCategory, setCity, switchView} from './channels.js?v=47';
import * as drawer from './drawer.js?v=47';
import {initTheme, setThemeMode, scrollToTop, showToast, copyBtnFeedback, openHistoryModal, closeHistoryModal, openEpgModal, closeEpgModal} from './ui.js?v=47';
import {initWeather} from './weather.js?v=47';
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
const MOBILE_MORE_ACTIONS = ['copyGudouM3U', 'exportTxt', 'downloadM3U'];
const DESKTOP_TOOLS_GROUPS = Object.freeze([
    {label:'EPG 与单播订阅', keys:['copyEPG', 'copyGudouM3U']},
    {label:'下载与导出', keys:['exportTxt', 'downloadM3U', 'downloadEPG']}
]);
function populateSubscriptionActions(target, {mobile, primaryOnly} = {}) {
    const fragment = document.getElementById('subscription-actions-template').content.cloneNode(true);
    fragment.querySelectorAll('[data-subscription-action]').forEach(action => {
        const spec = SUBSCRIPTION_ACTIONS.find(item => item.key === action.dataset.subscriptionAction);
        if (!spec) return;
        if ((!mobile && primaryOnly !== DESKTOP_PRIMARY_ACTIONS.has(spec.key)) || (mobile && spec.key === 'downloadEPG')) {
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
    if (mobile) {
        const more = document.createElement('details');
        more.className = 'mobile-actions-more';
        const summary = document.createElement('summary');
        summary.textContent = '更多订阅与导出';
        const actions = document.createElement('div');
        actions.className = 'mobile-actions-overflow';
        for (const key of MOBILE_MORE_ACTIONS) {
            const action = fragment.querySelector(`[data-subscription-action="${key}"]`);
            if (action) actions.append(action);
        }
        more.append(summary, actions);
        more.addEventListener('click', event => {
            if (event.target instanceof Element && event.target.closest('[data-subscription-action]')) more.open = false;
        });
        fragment.append(more);
    }
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
    const desktopPrimary = document.getElementById('desktop-primary-actions');
    const desktopActions = document.getElementById('desktop-subscription-actions');
    if (desktopPrimary) populateSubscriptionActions(desktopPrimary, {primaryOnly:true});
    if (desktopActions) populateSubscriptionActions(desktopActions, {primaryOnly:false});
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
const overviewSummary = document.getElementById('site-overview-summary');
if (overviewSummary) overviewSummary.textContent = '通告与天气快照';
overview.open = !compactLayout.matches;
document.getElementById('advanced-filters').open = window.matchMedia('(min-width: 1180px)').matches;
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
    function buildNoticeCard(index, message, regions) {
        const cities = [...regions];
        const card = document.createElement('div'); card.className = index ? 'notice-card diff' : 'notice-card';
        const tag = document.createElement('span'); tag.className = index ? 'notice-tag diff' : 'notice-tag';
        tag.textContent = cities.length === 1 ? `${cities[0]}通告` : `${cities.length}地共同通告`;
        const details = document.createElement('details'); details.className = 'notice-message';
        const summary = document.createElement('summary');
        const preview = document.createElement('span'); preview.className = 'notice-preview'; preview.textContent = message;
        const hint = document.createElement('span'); hint.className = 'notice-expand-hint'; hint.textContent = '展开'; hint.setAttribute('aria-hidden', 'true');
        summary.append(preview, hint);
        const full = document.createElement('div'); full.className = 'notice-expanded'; full.textContent = message; full.setAttribute('aria-hidden', 'true');
        details.append(summary, full);
        details.addEventListener('toggle', () => {
            preview.hidden = details.open;
            full.setAttribute('aria-hidden', String(!details.open));
            hint.textContent = details.open ? '收起' : '展开';
        });
        card.append(tag, details);
        if (cities.length > 1) {
            const regionsDetails = document.createElement('details'); regionsDetails.className = 'notice-regions';
            const regionsSummary = document.createElement('summary'); regionsSummary.textContent = '查看适用地区';
            const list = document.createElement('div'); list.textContent = cities.join('、');
            regionsDetails.append(regionsSummary, list); card.append(regionsDetails);
        }
        return card;
    }
    if (!grouped.length) return;
    const [firstMessage, firstRegions] = grouped[0];
    container.append(buildNoticeCard(0, firstMessage, firstRegions));
    if (grouped.length > 1) {
        const moreWrap = document.createElement('details');
        moreWrap.className = 'notice-more-wrap';
        const moreSummary = document.createElement('summary');
        moreSummary.textContent = `另有 ${grouped.length - 1} 条其他地市差异通告`;
        const moreList = document.createElement('div');
        moreList.className = 'notice-more-list';
        for (let i = 1; i < grouped.length; i++) {
            moreList.append(buildNoticeCard(i, grouped[i][0], grouped[i][1]));
        }
        moreWrap.append(moreSummary, moreList);
        container.append(moreWrap);
    }
}
function bootstrapCatalog() {
    const grid = document.getElementById('channels-grid');
    if (grid) grid.textContent = '正在加载全省频道列表...';
    loadCatalog().then(() => initChannels(drawer.openDrawer, copyBtnFeedback)).catch(error => {
        renderCatalogError(bootstrapCatalog);
        console.error(error);
    });
}
bootstrapCatalog();
fetchJSON('./weather.json', {cache: 'no-cache'}).then(initWeather).catch(() => {
    const track = document.getElementById('weather-track');
    if (track) track.textContent = '天气数据暂不可用';
});
fetchJSON('./notices.json', {cache: 'no-cache'}).then(renderNotices).catch(() => {});
document.getElementById('mobile-dock-catalog')?.addEventListener('click', () => {
    drawer.hideDrawer();
    closeEpgModal();
    closeHistoryModal();
    const search = document.getElementById('search-kw');
    if (search) {
        search.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center'});
        search.focus({preventScroll: true});
    }
});
document.getElementById('mobile-dock-m3u')?.addEventListener('click', event => copyM3U(event.currentTarget));
document.getElementById('mobile-dock-epg')?.addEventListener('click', () => openEpgModal());
document.getElementById('mobile-dock-history')?.addEventListener('click', () => openHistoryModal());

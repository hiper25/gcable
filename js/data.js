// Regional catalogs and immutable, content-addressed schedules.
export const state = {
    status: 'loading', error: null, selectedChannelID: '',
    channels: [], cities: {}, index: null, city: '全网总表', category: '全部',
    view: 'card', sourceGroup: '', filtered: [], byId: new Map(), regionByName: new Map()
};
const schedules = new Map();
const regionCatalogs = new Map();
const regionalViews = new Map();
const epgIndexes = new Map();

export function mutableURL(url) {
    const path = url.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    const revision = state.index?.assets?.[path];
    if (!revision) return url;
    const [address, fragment] = url.split('#', 2);
    return `${address}${address.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision)}${fragment === undefined ? '' : '#' + fragment}`;
}
export async function fetchJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

export function prepareChannel(channel) {
    const aliases = (channel.sourceNames || []).map(source => source.name);
    channel.searchText = [channel.name, channel.channelNumber, channel.channelID, channel.rtp, ...aliases]
        .map(value => String(value ?? '').toLowerCase()).join(' ');
    return channel;
}

export async function loadCatalog() {
    state.status = 'loading';
    state.error = null;
    try {
        const index = await fetchJSON('./data_index.json', {cache: 'no-cache'});
        state.index = index;
        const channels = await fetchJSON(mutableURL('./channels.json'));
        state.channels = channels.filter(channel => channel.rtp).map(prepareChannel);
        state.byId = new Map(state.channels.map(channel => [String(channel.channelID), channel]));
        state.regionByName.clear();
        for (const [code, region] of Object.entries(index.regions)) {
            state.regionByName.set(region.name, code);
        }
        state.status = 'ready';
    } catch (error) {
        state.status = 'error';
        state.error = error;
        throw error;
    }
}

export function loadRegion(code) {
    const region = state.index.regions[code];
    const url = mutableURL('./' + region.channelsUrl);
    const key = JSON.stringify([String(code), url]);
    if (!regionalViews.has(key)) {
        if (!regionCatalogs.has(url)) {
            regionCatalogs.set(url, fetchJSON(url)
                .catch(error => { regionCatalogs.delete(url); throw error; }));
        }
        regionalViews.set(key, regionCatalogs.get(url).then(channels => {
            const list = channels.filter(channel => channel.rtp)
                .map(channel => prepareChannel({...channel, regionCode: String(code)}));
            state.cities[region.name] = list;
            return list;
        }).catch(error => { regionalViews.delete(key); throw error; }));
    }
    return regionalViews.get(key);
}

export function regionCode() { return state.regionByName.get(state.city); }
export function catalog() {
    return state.city === '全网总表' ? state.channels : (state.cities[state.city] || []);
}
export function regionalChannel(cid, code) {
    const name = state.index.regions[code]?.name;
    return (state.cities[name] || []).find(channel => String(channel.channelID) === String(cid));
}
export function channelRegions(cid) {
    return (state.byId.get(String(cid))?.regionCodes || []).map(String).filter(code => state.index.regions[code]);
}
export function exportsForSelection() {
    return regionCode() ? state.index.regions[regionCode()] : state.index.exports;
}
export async function loadSchedule(cid, code) {
    const indexURL = mutableURL('./' + state.index.regions[code].epgIndexUrl);
    if (!epgIndexes.has(indexURL)) {
        epgIndexes.set(indexURL, fetchJSON(indexURL)
            .catch(error => { epgIndexes.delete(indexURL); throw error; }));
    }
    const index = await epgIndexes.get(indexURL);
    const guide = index[String(cid)];
    if (!guide) return null;
    const url = mutableURL('./' + guide);
    if (!schedules.has(url)) {
        schedules.set(url, fetchJSON(url).catch(error => { schedules.delete(url); throw error; }));
    }
    return schedules.get(url);
}

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function chinaTime(value) {
    return Date.parse(value.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : '+08:00'));
}
export function chinaDate(offset = 0) {
    return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'})
        .format(new Date(Date.now() - offset * 86400000));
}
export function streamURL(channel) {
    const recorded = channel?.gudouCheck?.url;
    if (typeof recorded !== 'string' || !/^http:\/\/172\.16\.149\.18:9090\/live\/\d+\.m3u8$/.test(recorded)) return '';
    try {
        const url = new URL(recorded);
        if (url.origin !== 'http://172.16.149.18:9090' || url.username || url.password || url.search || url.hash || !/^\/live\/\d+\.m3u8$/.test(url.pathname)) return '';
        return recorded;
    } catch { return ''; }
}
export function replayTemplate(channel) {
    const url = streamURL(channel);
    if (!url || channel?.isTVAnyTime !== '1') return '';
    return `${url}?starttime=\${(b)timestamp}&endtime=\${(e)timestamp}`;
}

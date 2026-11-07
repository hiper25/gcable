import {state} from './data.js?v=43';

let stations = [];
let context;
let cycles = [];
let weatherObserver;
let lastCity;

const CLOUD = '<path d="M6 18h12a4 4 0 0 0 .1-8 6 6 0 0 0-11.7-1.2A4.6 4.6 0 0 0 6 18Z"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';

function weatherIcon(condition) {
    let paths = CLOUD;
    if (/雷/.test(condition)) paths = CLOUD + '<path d="m12 12-3 5h4l-2 5"/>';
    else if (/雨/.test(condition)) paths = '<path d="M6 14h12a4 4 0 0 0 .1-8 6 6 0 0 0-11.7-1.2A4.6 4.6 0 0 0 6 14Zm2 3-1 3m5-3-1 3m5-3-1 3"/>';
    else if (/雪/.test(condition)) paths = '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>';
    else if (/雾|霾/.test(condition)) paths = '<path d="M4 7h16M2 12h20M4 17h16"/>';
    else if (/晴/.test(condition) && !/云|阴/.test(condition)) paths = SUN;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('weather-icon');
    icon.innerHTML = paths;
    return icon;
}

function windLabel(value) {
    const wind = String(value ?? '').trim();
    if (!wind) return '';
    if (/^\d+(?:\s*[-~～至–—]\s*\d+)?$/.test(wind)) {
        return `风力 ${wind.replace(/\s*[-~～至–—]\s*/, '–')} 级`;
    }
    return /^\d.*级$/.test(wind) ? `风力 ${wind}` : wind;
}

function stationChip(station) {
    const chip = document.createElement('div');
    chip.className = 'weather-chip';
    const name = document.createElement('b');
    name.textContent = station.name;
    const condition = document.createElement('span');
    condition.textContent = station.weather || '天气未提供';
    const temperature = document.createElement('span');
    temperature.className = 'temp';
    temperature.textContent = station.temperature || '气温未提供';
    chip.append(weatherIcon(station.weather), name, condition, temperature);
    const wind = windLabel(station.wind);
    if (wind) {
        const windBadge = document.createElement('span');
        windBadge.className = 'wind-badge';
        windBadge.textContent = wind;
        chip.append(windBadge);
    }
    chip.title = [
        `源站台站：${station.name}`,
        `源站编码：${[...station.codes].join('、') || '未提供'}`,
        `请求地区：${station.requests.join('、')}`,
        station.date ? `源站日期：${station.date}` : '源站未提供观测时间；此处为采集快照'
    ].join('；');
    return chip;
}

// Group by the returned station and readings, never by equal temperatures alone.
export function initWeather(data) {
    const groups = new Map();
    for (const [requestedCity, reading] of Object.entries(data)) {
        const name = String(reading.locationName || requestedCity).trim();
        const weather = String(reading.weather || '').trim();
        const temperature = String(reading.temperature || '').trim();
        const wind = String(reading.wind || '').trim();
        const date = String(reading.date || '').trim();
        const key = JSON.stringify([name, weather, temperature, wind, date]);
        let station = groups.get(key);
        if (!station) {
            station = {name, weather, temperature, wind, date, requests: [], codes: new Set(), chips: []};
            groups.set(key, station);
        }
        station.requests.push(requestedCity);
        if (reading.locationCode) station.codes.add(String(reading.locationCode));
    }
    stations = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const track = document.getElementById('weather-track');
    const viewport = track.closest('.weather-scroll-container');
    viewport.classList.add('weather-stations');
    viewport.setAttribute('aria-label', '天气采集快照，按源站返回台站去重；悬停或聚焦可暂停，减少动态效果时可手动浏览');
    context = document.getElementById('weather-context');
    if (!context) {
        context = document.createElement('p');
        context.id = 'weather-context';
        context.className = 'weather-context';
        context.setAttribute('role', 'status');
        viewport.before(context);
    }
    if (!viewport.dataset.weatherWheelBound) {
        viewport.dataset.weatherWheelBound = 'true';
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        viewport.addEventListener('wheel', event => {
            if (!reducedMotion.matches || !event.deltaY || event.deltaX) return;
            const before = viewport.scrollLeft;
            viewport.scrollLeft += event.deltaY;
            if (viewport.scrollLeft !== before) event.preventDefault();
        }, {passive: false});
    }
    weatherObserver?.disconnect();
    track.replaceChildren();
    cycles = [];
    lastCity = undefined;
    if (!stations.length) {
        context.textContent = '天气快照暂不可用';
        return;
    }
    for (let index = 0; index < 2; index++) {
        const cycle = document.createElement('div');
        cycle.className = 'weather-cycle';
        if (index) cycle.setAttribute('aria-hidden', 'true');
        for (const station of stations) {
            const chip = stationChip(station);
            station.chips.push(chip);
            cycle.append(chip);
        }
        cycles.push(cycle);
        track.append(cycle);
    }
    weatherObserver = new ResizeObserver(() => {
        const width = cycles[0].getBoundingClientRect().width;
        viewport.classList.toggle('is-static', width <= viewport.clientWidth - 24);
    });
    weatherObserver.observe(viewport);
    updateWeatherSelection();
}

export function updateWeatherSelection() {
    if (!context || !stations.length) return;
    const city = state.city;
    if (city === lastCity) return;
    lastCity = city;
    const matches = stations.filter(station => station.requests.some(name => name === city || name.startsWith(city)));
    const selected = new Set(matches);
    for (const station of stations) {
        for (const chip of station.chips) chip.classList.toggle('is-current-city', selected.has(station));
    }
    for (const [index, cycle] of cycles.entries()) {
        for (const station of [...matches, ...stations.filter(item => !selected.has(item))]) {
            cycle.append(station.chips[index]);
        }
    }
    const track = document.getElementById('weather-track');
    track.parentElement.scrollLeft = 0;
    for (const animation of track.getAnimations()) animation.currentTime = 0;
    if (city === '全网总表') {
        context.textContent = `天气快照 · ${stations.length} 条台站记录 · 按源站返回地点展示`;
    } else if (!matches.length) {
        context.textContent = `${city}：无对应天气记录 · 以下为源站台站快照`;
    } else {
        const names = [...new Set(matches.map(station => station.name))].join('、');
        const exact = matches.every(station => station.name === city);
        context.textContent = exact ? `${city} · 天气采集快照` : `${city}请求 · 源站返回${names}（不作为本地实况）`;
    }
    context.title = '保留源站实际返回的地点和读数，不将回退台站改名为请求城市；未提供观测时间的记录不标作实时天气。';
}

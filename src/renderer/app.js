'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const VIEW_META = {
  overview: ['COMMAND CENTER', 'Overview'],
  miner: ['RANDOMWOW', 'Solo miner'],
  node: ['PEER-TO-PEER', 'Local node'],
  learn: ['KNOWLEDGE BASE', 'Learn'],
  settings: ['PREFERENCES', 'Settings']
};

const state = {
  api: null,
  bootstrap: null,
  settings: null,
  draftSettings: null,
  snapshot: null,
  logs: [],
  hashrateHistory: [],
  currentView: 'overview',
  currentLesson: 0,
  busy: false,
  pollTimer: null,
  clockTimer: null
};

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US').format(number) : '—';
}

function formatBytes(value) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (number >= 1024 && index < units.length - 1) {
    number /= 1024;
    index += 1;
  }
  return `${number.toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
}

function formatHashrate(value, includeUnit = true) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return includeUnit ? '0 H/s' : '0';
  const units = ['', 'K', 'M', 'G', 'T'];
  let scaled = number;
  let index = 0;
  while (scaled >= 1000 && index < units.length - 1) {
    scaled /= 1000;
    index += 1;
  }
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)}${units[index]}${includeUnit ? ' H/s' : ''}`;
}

function formatDuration(seconds, compact = false) {
  const safe = Math.max(0, Number(seconds) || 0);
  if (!Number.isFinite(safe)) return '—';
  if (compact && safe >= 31_536_000) return `${(safe / 31_536_000).toFixed(1)} years`;
  if (compact && safe >= 86_400) return `${(safe / 86_400).toFixed(1)} days`;
  if (compact && safe >= 3_600) return `${(safe / 3_600).toFixed(1)} hours`;
  if (compact && safe >= 60) return `${Math.round(safe / 60)} min`;
  if (compact) return `${Math.round(safe)} sec`;
  const hours = Math.floor(safe / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((safe % 3600) / 60).toString().padStart(2, '0');
  const secs = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

function isPrimaryAddress(value) {
  return /^Wo[1-9A-HJ-NP-Za-km-z]{95}$/.test(String(value || '').trim());
}

function isSynchronized(snapshot) {
  if (!snapshot?.reachable || !snapshot.info) return false;
  if (snapshot.info.synchronized === true) return true;
  const height = Number(snapshot.info.height) || 0;
  const target = Number(snapshot.info.target_height) || 0;
  return target > 0 && height >= target && snapshot.info.busy_syncing !== true;
}

function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  const dot = document.createElement('i');
  const text = document.createElement('span');
  text.textContent = message;
  element.append(dot, text);
  $('#toastRegion').append(element);
  setTimeout(() => element.remove(), 4_500);
}

function showFatal(message) {
  const element = $('#fatalError');
  element.textContent = message;
  element.classList.remove('hidden');
}

function switchView(view) {
  if (!VIEW_META[view]) return;
  state.currentView = view;
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $('#viewEyebrow').textContent = VIEW_META[view][0];
  $('#viewTitle').textContent = VIEW_META[view][1];
  $('.main').scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'miner') requestAnimationFrame(drawHashrateChart);
}

function setBusy(isBusy, message = '') {
  state.busy = isBusy;
  $$('[data-action="start-node"], [data-action="stop-node"], #mineButton').forEach((button) => {
    button.disabled = isBusy || button.disabled;
  });
  if (message) toast(message, 'warning');
  updateInterface();
}

async function perform(action, workingMessage) {
  if (state.busy) return null;
  setBusy(true, workingMessage);
  try {
    const result = await action();
    if (result?.ok === false) throw new Error(result.error || 'Operation failed.');
    await refreshSnapshot(true);
    return result?.value ?? result;
  } catch (error) {
    toast(error.message || 'Operation failed.', 'error');
    return null;
  } finally {
    setBusy(false);
  }
}

async function handleAction(action) {
  if (action === 'start-node') {
    const result = await perform(() => state.api.daemon.start(), 'Starting the local node…');
    if (result) toast(result.attached ? 'Attached to the existing local node.' : 'Local node started. Synchronization is running.');
  }
  if (action === 'stop-node') {
    const result = await perform(() => state.api.daemon.stop(), 'Stopping the local node safely…');
    if (result) toast(result.stopped ? 'Local node stopped.' : 'Attached nodes are left running.', result.stopped ? 'success' : 'warning');
  }
  if (action === 'toggle-mining') {
    const mining = state.snapshot?.mining?.active;
    if (mining) {
      const result = await perform(() => state.api.mining.stop(), 'Stopping mining…');
      if (result) toast('Mining stopped.');
    } else {
      const address = $('#minerAddress').value.trim();
      const threads = Number($('#threadSlider').value);
      if (!isPrimaryAddress(address)) {
        toast('Enter a valid primary Wownero address beginning with Wo.', 'error');
        $('#minerAddress').focus();
        return;
      }
      const result = await perform(() => state.api.mining.start(address, threads), 'Starting RandomWOW…');
      if (result) {
        state.settings.address = address;
        state.settings.threads = threads;
        toast(`Solo mining started on ${threads} CPU threads.`);
      }
    }
  }
  if (action === 'clear-logs') {
    state.logs = [];
    renderLogs();
  }
  if (action === 'choose-directory') {
    const directory = await state.api.settings.chooseDataDirectory();
    if (directory) {
      state.draftSettings.dataDirectory = directory;
      $('#dataDirectory').textContent = directory;
      markSettingsDirty();
    }
  }
  if (action === 'open-directory') {
    const result = await state.api.shell.openDataDirectory();
    if (result?.ok === false) toast(result.error || 'Could not open the folder.', 'error');
  }
  if (action === 'save-settings') await saveSettings();
}

async function refreshSnapshot(manual = false) {
  if (!state.api || state.busy && !manual) return;
  if (manual) $('#refreshButton').classList.add('spinning');
  try {
    const snapshot = await state.api.daemon.snapshot();
    state.snapshot = snapshot;
    const speed = snapshot?.mining?.active ? Number(snapshot.mining.speed) || 0 : 0;
    state.hashrateHistory.push(speed);
    if (state.hashrateHistory.length > 60) state.hashrateHistory.shift();
    updateInterface();
  } catch (error) {
    showFatal(`Could not read local status: ${error.message}`);
  } finally {
    if (manual) setTimeout(() => $('#refreshButton').classList.remove('spinning'), 300);
  }
}

function updateInterface() {
  if (!state.bootstrap || !state.settings) return;
  const snapshot = state.snapshot || {};
  const info = snapshot.info || {};
  const mining = snapshot.mining || {};
  const reachable = snapshot.reachable === true;
  const synchronized = isSynchronized(snapshot);
  const active = mining.active === true;
  const height = Number(info.height) || 0;
  const target = Number(info.target_height) || height;
  const progress = reachable
    ? synchronized ? 100 : target > 0 ? Math.max(0, Math.min(99.9, (height / target) * 100)) : 0
    : 0;
  const peers = (Number(info.incoming_connections_count) || 0) + (Number(info.outgoing_connections_count) || 0);
  const speed = active ? Number(mining.speed) || 0 : 0;
  const targetSeconds = Number(mining.block_target) || Number(info.target) || 300;
  const networkHashrate = Number(info.difficulty) > 0 ? Number(info.difficulty) / targetSeconds : 0;

  const global = $('#globalStatus');
  global.className = `status-pill ${reachable ? synchronized ? 'online' : 'syncing' : 'offline'}`;
  $('#globalStatusText').textContent = active ? `Mining · ${formatHashrate(speed)}` : reachable ? synchronized ? 'Node ready' : 'Synchronizing' : 'Node offline';

  $$('[data-action="start-node"]').forEach((button) => {
    button.disabled = state.busy || reachable;
    const text = $('span:last-child', button);
    if (text && button.classList.contains('primary-button')) text.textContent = reachable ? 'Node running' : 'Start local node';
  });
  $$('[data-action="stop-node"]').forEach((button) => button.disabled = state.busy || !snapshot.owned);

  $('#overviewHashrate').textContent = formatHashrate(speed);
  $('#overviewHashCaption').textContent = active ? `${mining.threads_count || state.settings.threads} threads · ${mining.pow_algorithm || 'RandomWOW'}` : 'Miner idle';
  $('#overviewHeight').textContent = reachable ? formatNumber(height) : '—';
  $('#overviewHeightCaption').textContent = reachable ? synchronized ? 'Fully synchronized' : `${progress.toFixed(1)}% synchronized` : 'Start your node';
  $('#overviewNetworkHash').textContent = networkHashrate ? formatHashrate(networkHashrate) : '—';
  $('#overviewPeers').textContent = reachable ? formatNumber(peers) : '—';
  $('#overviewPeerCaption').textContent = reachable ? `${info.incoming_connections_count || 0} in · ${info.outgoing_connections_count || 0} out` : 'Incoming + outgoing';

  $('#syncPercent').textContent = `${progress < 100 ? progress.toFixed(1) : '100'}%`;
  $('#syncRing').style.setProperty('--progress', `${progress * 3.6}deg`);
  $('#syncProgress').style.width = `${progress}%`;
  $('#syncBadge').textContent = reachable ? synchronized ? 'READY' : 'SYNCING' : 'OFFLINE';
  $('#syncBadge').classList.toggle('online', reachable);
  $('#localHeight').textContent = reachable ? formatNumber(height) : '—';
  $('#targetHeight').textContent = reachable && target ? formatNumber(target) : '—';
  $('#databaseSize').textContent = reachable ? formatBytes(info.database_size) : '—';
  $('#daemonVersion').textContent = reachable ? info.version || 'Connected' : '—';
  $('#syncNote').textContent = reachable
    ? synchronized ? 'The local chain is verified and ready for solo mining.' : 'Keep the app running. Progress is saved and resumes automatically.'
    : 'Start the local node to download and validate the Wownero blockchain.';

  $('#stepNode').classList.toggle('done', reachable);
  $('#stepAddress').classList.toggle('done', isPrimaryAddress($('#minerAddress').value));
  $('#stepMine').classList.toggle('done', active);

  const preflight = $('#minerPreflight');
  preflight.classList.toggle('ready', synchronized);
  $('span', preflight).textContent = synchronized ? '✓' : '!';
  $('strong', preflight).textContent = synchronized ? 'Ready to mine' : reachable ? 'Synchronizing' : 'Node required';
  $('p', preflight).textContent = synchronized ? 'Your local chain is synchronized and validated.' : reachable ? `${progress.toFixed(1)}% complete. Mining unlocks at 100%.` : 'Start and synchronize your local node before mining.';

  $('#miningBadge').textContent = active ? 'MINING' : 'IDLE';
  $('#miningBadge').className = `small-badge ${active ? 'mining' : ''}`;
  const mineButton = $('#mineButton');
  mineButton.disabled = state.busy || (!active && (!synchronized || !isPrimaryAddress($('#minerAddress').value)));
  mineButton.classList.toggle('mining', active);
  $('.mine-icon', mineButton).textContent = active ? '■' : '▶';
  $('.mine-label', mineButton).textContent = active ? 'Stop mining' : 'Start mining';
  $('small', mineButton).textContent = active ? 'ACTIVE' : 'SOLO';
  $('#liveHashrate').textContent = formatHashrate(speed, false);

  const expectedSeconds = speed > 0 && Number(mining.difficulty) > 0 ? Number(mining.difficulty) / speed : 0;
  $('#expectedBlock').textContent = expectedSeconds ? formatDuration(expectedSeconds, true) : '—';
  $('#blockReward').textContent = Number(mining.block_reward) > 0 ? (Number(mining.block_reward) / 1e11).toFixed(2) : '—';
  updateSessionClock();

  $('#nodeOrbDot').classList.toggle('online', reachable);
  $('#nodeStateTitle').textContent = reachable ? synchronized ? 'Local node ready' : 'Synchronizing local node' : 'Local node offline';
  $('#nodeStateCopy').textContent = snapshot.owned
    ? 'This app owns the active daemon and will shut it down safely when you exit.'
    : reachable ? 'Attached to an existing local daemon. It will be left running when this app closes.' : 'Your node verifies every block itself and exposes RPC only to this computer.';
  $('#nodeFactStatus').textContent = reachable ? synchronized ? 'Ready' : 'Synchronizing' : 'Offline';
  $('#nodeFactNetwork').textContent = info.nettype ? info.nettype[0].toUpperCase() + info.nettype.slice(1) : 'Mainnet';
  $('#nodeFactPeers').textContent = reachable ? `${peers} peers` : '—';
  $('#nodeFactPool').textContent = reachable ? `${formatNumber(info.tx_pool_size || 0)} transactions` : '—';
  $('#nodeFactDisk').textContent = reachable ? formatBytes(info.free_space) : '—';
  $('#nodeFactPruned').textContent = state.settings.pruneBlockchain ? 'Enabled' : 'Disabled';
  drawHashrateChart();
}

function updateSessionClock() {
  const active = state.snapshot?.mining?.active;
  const startedAt = Number(state.snapshot?.sessionStartedAt);
  $('#sessionTime').textContent = active && startedAt ? formatDuration((Date.now() - startedAt) / 1000) : '00:00:00';
}

function drawHashrateChart() {
  const canvas = $('#hashrateChart');
  if (!canvas || state.currentView !== 'miner') return;
  const context = canvas.getContext('2d');
  const rectangle = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(300, rectangle.width);
  const height = Math.max(160, rectangle.height);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const values = state.hashrateHistory;
  const maximum = Math.max(1, ...values) * 1.15;
  const styles = getComputedStyle(document.documentElement);
  const green = styles.getPropertyValue('--green').trim();
  const line = styles.getPropertyValue('--line').trim();

  context.strokeStyle = line;
  context.lineWidth = 1;
  for (let row = 0; row <= 4; row += 1) {
    const y = (height / 4) * row;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  if (values.length < 2 || Math.max(...values) <= 0) {
    $('#chartEmpty').classList.remove('hidden');
    return;
  }
  $('#chartEmpty').classList.add('hidden');
  const points = values.map((value, index) => ({
    x: (index / Math.max(1, values.length - 1)) * width,
    y: height - (value / maximum) * (height - 8) - 4
  }));
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${green}42`);
  gradient.addColorStop(1, `${green}00`);
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.strokeStyle = green;
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.stroke();
}

function appendLog(entry) {
  if (!entry || typeof entry.message !== 'string') return;
  const lines = entry.message.split(/\r?\n/).filter(Boolean);
  lines.forEach((message) => state.logs.push({ ...entry, message }));
  if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
  renderLogs();
}

function renderLogs() {
  const list = $('#logList');
  list.replaceChildren();
  if (!state.logs.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'log-placeholder';
    placeholder.textContent = 'Node messages will appear here.';
    list.append(placeholder);
    return;
  }
  state.logs.slice(-100).forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const time = document.createElement('time');
    time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false });
    const level = document.createElement('span');
    level.className = `log-level ${entry.level}`;
    level.textContent = entry.level;
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = entry.message;
    row.append(time, level, message);
    list.append(row);
  });
  list.scrollTop = list.scrollHeight;
}

function setThreadProfile(profile) {
  const maximum = state.bootstrap.logicalCpuCount;
  const ratios = { efficient: 0.25, balanced: 0.5, maximum: 1 };
  const count = Math.max(1, Math.round(maximum * ratios[profile]));
  $('#threadSlider').value = String(count);
  $('#threadValue').textContent = String(count);
  state.draftSettings.threads = count;
  $$('.profile-row button').forEach((button) => button.classList.toggle('active', button.dataset.profile === profile));
  markSettingsDirty();
}

function updateProfileFromThreads() {
  const value = Number($('#threadSlider').value);
  const maximum = state.bootstrap.logicalCpuCount;
  const ratios = {
    efficient: Math.max(1, Math.round(maximum * .25)),
    balanced: Math.max(1, Math.round(maximum * .5)),
    maximum
  };
  $$('.profile-row button').forEach((button) => button.classList.toggle('active', ratios[button.dataset.profile] === value));
}

function markSettingsDirty() {
  $('#settingsStatus').textContent = 'Unsaved changes';
}

async function saveSettings() {
  state.draftSettings.address = $('#minerAddress').value.trim();
  state.draftSettings.threads = Number($('#threadSlider').value);
  state.draftSettings.startWithWindows = $('#startWithWindows').checked;
  state.draftSettings.startNodeOnLaunch = $('#startNodeOnLaunch').checked;
  state.draftSettings.pruneBlockchain = $('#pruneBlockchain').checked;
  const result = await perform(() => state.api.settings.save(state.draftSettings), 'Saving settings…');
  if (result) {
    state.settings = result;
    state.draftSettings = { ...result };
    $('#settingsStatus').textContent = 'All changes saved';
    toast('Settings saved locally.');
  }
}

function applySettingsToInterface() {
  const settings = state.settings;
  $('#minerAddress').value = settings.address || '';
  $('#threadSlider').max = String(state.bootstrap.logicalCpuCount);
  $('#threadSlider').value = String(settings.threads);
  $('#threadMax').textContent = String(state.bootstrap.logicalCpuCount);
  $('#threadValue').textContent = String(settings.threads);
  $('#cpuModel').textContent = state.bootstrap.cpuModel;
  $('#cpuSummary').textContent = `${state.bootstrap.logicalCpuCount} logical threads · RandomWOW`;
  $('#dataDirectory').textContent = settings.dataDirectory || state.bootstrap.snapshot.defaultDataDirectory || 'Default app folder';
  $('#startWithWindows').checked = settings.startWithWindows;
  $('#startNodeOnLaunch').checked = settings.startNodeOnLaunch;
  $('#pruneBlockchain').checked = settings.pruneBlockchain;
  document.documentElement.dataset.theme = settings.theme;
  $$('.theme-picker button').forEach((button) => button.classList.toggle('active', button.dataset.themeValue === settings.theme));
  updateProfileFromThreads();
}

function showLesson(index) {
  const lessons = $$('.lesson');
  state.currentLesson = Math.max(0, Math.min(lessons.length - 1, index));
  lessons.forEach((lesson, lessonIndex) => lesson.classList.toggle('active', lessonIndex === state.currentLesson));
  $$('.lesson-nav button').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === state.currentLesson));
  $('#lessonProgress').textContent = `${state.currentLesson + 1} / ${lessons.length}`;
  $('#lessonPrevious').disabled = state.currentLesson === 0;
  $('#lessonNext').disabled = state.currentLesson === lessons.length - 1;
}

function bindEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.go)));
  $$('[data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action)));
  $$('[data-external]').forEach((button) => button.addEventListener('click', async () => {
    const result = await state.api.shell.openExternal(button.dataset.external);
    if (result?.ok === false) toast(result.error || 'Could not open the link.', 'error');
  }));
  $$('.profile-row button').forEach((button) => button.addEventListener('click', () => setThreadProfile(button.dataset.profile)));
  $('#threadSlider').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('#threadValue').textContent = String(value);
    state.draftSettings.threads = value;
    updateProfileFromThreads();
    markSettingsDirty();
  });
  $('#minerAddress').addEventListener('input', (event) => {
    state.draftSettings.address = event.target.value.trim();
    markSettingsDirty();
    updateInterface();
  });
  ['startWithWindows', 'startNodeOnLaunch', 'pruneBlockchain'].forEach((id) => {
    $(`#${id}`).addEventListener('change', markSettingsDirty);
  });
  $$('.theme-picker button').forEach((button) => button.addEventListener('click', () => {
    state.draftSettings.theme = button.dataset.themeValue;
    document.documentElement.dataset.theme = state.draftSettings.theme;
    $$('.theme-picker button').forEach((item) => item.classList.toggle('active', item === button));
    markSettingsDirty();
    drawHashrateChart();
  }));
  $$('.lesson-nav button').forEach((button, index) => button.addEventListener('click', () => showLesson(index)));
  $('#lessonPrevious').addEventListener('click', () => showLesson(state.currentLesson - 1));
  $('#lessonNext').addEventListener('click', () => showLesson(state.currentLesson + 1));
  $('#refreshButton').addEventListener('click', () => refreshSnapshot(true));
  window.addEventListener('resize', drawHashrateChart);
}

function createDemoApi() {
  const demo = {
    reachable: true,
    owned: true,
    starting: false,
    sessionStartedAt: null,
    defaultDataDirectory: 'C:\\Users\\You\\AppData\\Roaming\\WOW Miner\\blockchain',
    info: {
      height: 983421,
      target_height: 983421,
      difficulty: 14_600_000,
      target: 300,
      incoming_connections_count: 2,
      outgoing_connections_count: 8,
      tx_pool_size: 3,
      database_size: 8_482_349_238,
      free_space: 618_482_349_238,
      version: '0.11.4.0-release',
      synchronized: true,
      busy_syncing: false,
      nettype: 'mainnet'
    },
    mining: {
      active: false,
      speed: 0,
      threads_count: 12,
      pow_algorithm: 'RandomWOW',
      block_target: 300,
      block_reward: 420000000000,
      difficulty: 14_600_000
    }
  };
  const okay = (value) => Promise.resolve({ ok: true, value });
  return {
    bootstrap: () => Promise.resolve({
      version: '1.0.0', platform: 'win32', logicalCpuCount: 32,
      cpuModel: 'Intel(R) Core(TM) i9-14900K', totalMemory: 68_719_476_736,
      settings: { address: '', threads: 16, dataDirectory: '', pruneBlockchain: true, startNodeOnLaunch: false, startWithWindows: false, minimizeToTray: false, theme: 'dark' },
      snapshot: demo
    }),
    daemon: {
      start: () => okay({ attached: false }), stop: () => okay({ stopped: true }),
      snapshot: () => Promise.resolve(demo), onLog: () => () => {}
    },
    mining: {
      start: (_address, threads) => { demo.mining.active = true; demo.mining.speed = 1280; demo.mining.threads_count = threads; demo.sessionStartedAt = Date.now(); return okay({}); },
      stop: () => { demo.mining.active = false; demo.mining.speed = 0; demo.sessionStartedAt = null; return okay({}); }
    },
    settings: { save: (settings) => okay(settings), chooseDataDirectory: () => Promise.resolve('D:\\Wownero') },
    shell: { openDataDirectory: () => okay({}), openExternal: () => okay({}) }
  };
}

async function initialize() {
  const demoMode = new URLSearchParams(location.search).get('demo') === '1';
  state.api = window.wow || (demoMode ? createDemoApi() : null);
  if (!state.api) {
    showFatal('Secure desktop bridge unavailable. Restart WOW Miner.');
    return;
  }
  try {
    state.bootstrap = await state.api.bootstrap();
    state.settings = state.bootstrap.settings;
    state.draftSettings = { ...state.settings };
    state.snapshot = state.bootstrap.snapshot;
    $('#appVersion').textContent = `WOW MINER · v${state.bootstrap.version}`;
    applySettingsToInterface();
    bindEvents();
    showLesson(0);
    updateInterface();
    state.api.daemon.onLog(appendLog);
    state.pollTimer = setInterval(() => refreshSnapshot(false), 2_000);
    state.clockTimer = setInterval(updateSessionClock, 1_000);
  } catch (error) {
    showFatal(`WOW Miner could not initialize: ${error.message}`);
  }
}

initialize();

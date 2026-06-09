// Link Right — Main UI (Settings + Picker)
import * as App from '../wailsjs/go/main/App.js';
import * as Runtime from '../wailsjs/runtime/runtime.js';

// ─── Browser SVG Assets ───────────────────────────────────────────────────────
import svgBrave   from './assets/brave.svg?url';
import svgBrowser from './assets/browser.svg?url';
import svgChrome  from './assets/chrome.svg?url';
import svgEdge    from './assets/edge.svg?url';
import svgFirefox from './assets/firefox.svg?url';
import svgOpera   from './assets/opera.svg?url';
import svgTor     from './assets/tor.svg?url';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  // Mode
  mode: 'settings',        // 'settings' | 'picker'

  // Settings UI
  tab: 'general',          // 'general' | 'browsers' | 'rules'
  browsers: [],            // all browsers (active + archived), used in Browsers tab
  activeBrowsers: [],      // non-archived browsers only, used in General tab + Rule editor
  rules: [],
  config: {},
  appStatus: {},
  validations: [],
  editingRule: null,
  dragSrcIndex: null,
  selectedBrowserPath: null,  // path of selected browser row in Browsers tab

  // Picker UI
  pickerData: null,        // PickerRequest
  pickerSettings: {},      // PickerSettings
  selectedBrowserIndex: 0,
  selectedProfileId: '',
  alwaysUse: false,

  // First-run
  showFirstRun: false,

};

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  // Set the window title so it appears correctly in the Windows taskbar.
  // Frameless Wails windows need an explicit title set after load.
  try { Runtime.WindowSetTitle('Link Right'); } catch (_) {}

  try {
    // Check if we're in picker mode (launched with a URL)
    let isPicker = false;
    try { isPicker = await App.IsPickerMode(); } catch (_) {}

    if (isPicker) {
        state.mode = 'picker';

        try {
          // Process the URL — if a rule matches and browser launches, window closes
          const url = await App.GetCurrentURL();
          const result = await App.ProcessURL(url);

          if (result === 'launched') {
            // Browser launched successfully — close this window
            await App.CancelPicker();
            return;
          }

          // Need to show picker — load data
          const [pickerData, pickerSettings] = await Promise.all([
            App.GetPickerData(),
            App.GetPickerSettings(),
          ]);
          state.pickerData = pickerData;
          state.pickerSettings = pickerSettings;

          // Default: select first browser, first profile
          if (pickerData.browsers && pickerData.browsers.length > 0) {
            state.selectedBrowserIndex = 0;
            const firstBrowser = pickerData.browsers[0];
            state.selectedProfileId = firstBrowser.profiles && firstBrowser.profiles.length > 0
              ? firstBrowser.profiles[0].id
              : '';
          }
        } catch (e) {
          // Any failure in URL processing → show picker with empty data (graceful fallback)
          console.warn('URL processing failed, showing picker:', e);
          if (!state.pickerData) {
            state.pickerData = { url: '', domain: '', reason: 'error', warning: '', browsers: [] };
            try { state.pickerData.browsers = await App.GetBrowsers(); } catch (_) {}
          }
        }

      } else {
        state.mode = 'settings';

        const [browsers, rules, config, appStatus] = await Promise.all([
          App.GetBrowsers(),
          App.GetRules(),
          App.GetConfig(),
          App.GetAppStatus(),
        ]);
        state.browsers = browsers || [];
        state.activeBrowsers = (browsers || []).filter(b => !b.archived);
        state.rules = rules || [];
        state.config = config || {};
        state.appStatus = appStatus || {};
        state.validations = await App.ValidateRules().catch(() => []);

        // First-run: show welcome prompt if not yet set as default browser
        try {
          const isFirstRun = await App.IsFirstRun();
          if (isFirstRun) {
            state.showFirstRun = true;
          }
        } catch (_) {}
      }
  } catch (e) {
    console.warn('Backend not available, using empty state', e);
  }

  render();

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);
});

// ─── Keyboard Handler ─────────────────────────────────────────────────────────
function handleKeyDown(e) {
  if (state.mode === 'picker') {
    if (e.key === 'Escape') {
      cancelPicker();
      return;
    }
    if (e.key === 'Enter') {
      openWithSelected();
      return;
    }
    // Number keys 1-9 select browser
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && state.pickerData) {
      const idx = num - 1;
      if (idx < state.pickerData.browsers.length) {
        selectBrowser(idx);
      }
    }
  } else {
    // Settings mode: Escape closes rule editor
    if (e.key === 'Escape' && state.editingRule !== null) {
      state.editingRule = null;
      render();
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  if (state.mode === 'picker') {
    renderPickerMode();
  } else {
    renderSettingsMode();
  }
}

// ─── PICKER MODE ──────────────────────────────────────────────────────────────
function renderPickerMode() {
  const data = state.pickerData;
  const settings = state.pickerSettings || { showBrowserNames: true, showURL: true };

  if (!data) {
    document.getElementById('app').innerHTML = `
      <div class="flex items-center justify-center h-screen bg-gray-900 text-gray-400 text-sm">
        Loading…
      </div>`;
    return;
  }

  const showNames = settings.showBrowserNames !== false;
  const showURL = settings.showURL !== false;

  const browsers = data.browsers || [];
  const selectedBrowser = browsers[state.selectedBrowserIndex] || null;

  document.getElementById('app').innerHTML = `
    <div class="picker-root flex flex-col h-screen bg-gray-900 text-gray-100 select-none overflow-hidden">

      <!-- Frameless title bar / drag region -->
      <div class="flex items-center h-8 bg-gray-900 select-none flex-shrink-0"
           style="--wails-draggable: drag">
        <span class="flex-1 pl-3 text-xs text-gray-500">Open with…</span>
        <button id="btn-picker-close"
          class="w-9 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-600 transition-colors text-sm leading-none"
          style="--wails-draggable: no-drag"
          title="Close">&#x2715;</button>
      </div>

      <!-- Header: URL display -->
      ${showURL ? `
      <div class="px-4 pt-2 pb-2">
        <div class="text-xs text-gray-500 mb-1">Opening link</div>
        <div class="break-all text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-700 max-h-[52px] overflow-y-auto font-mono">${esc(truncateURL(data.url, 80))}</div>
      </div>
      ` : `
      <div class="px-4 pt-4 pb-2">
        <div class="text-sm font-medium text-gray-300">Open with…</div>
      </div>
      `}

      ${data.warning ? `
      <div class="mx-4 mb-2 px-3 py-2 bg-yellow-900 border border-yellow-700 rounded-lg text-xs text-yellow-200">
        <span style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE89D;</span> ${esc(data.warning)}
      </div>
      ` : ''}

      <!-- Browser grid -->
      <div class="flex-1 overflow-y-auto px-4 py-2">
        <div class="flex flex-wrap gap-2.5 justify-center py-1">
          ${browsers.map((b, i) => renderPickerBrowserCard(b, i, showNames)).join('')}
        </div>
      </div>

      <!-- Profile selector (shown when selected browser has multiple profiles) -->
      ${selectedBrowser && selectedBrowser.profiles && selectedBrowser.profiles.length > 1 ? `
      <div class="px-4 pb-2">
        <select id="picker-profile" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
          ${selectedBrowser.profiles.map(p => `
            <option value="${esc(p.id)}" ${state.selectedProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>
          `).join('')}
        </select>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="px-4 pb-4 pt-2 border-t border-gray-800 space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="picker-always-use" class="accent-blue-500 w-4 h-4" ${state.alwaysUse ? 'checked' : ''}>
          <span class="text-xs text-gray-400">Always use this browser for <span class="text-gray-300 font-medium">${esc(data.domain || 'this site')}</span></span>
        </label>
        <div class="flex gap-2">
          <button id="btn-picker-cancel"
            class="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700">
            Cancel
          </button>
          <button id="btn-picker-open"
            class="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors ${!selectedBrowser ? 'opacity-50 cursor-not-allowed' : ''}">
            Open
          </button>
        </div>
      </div>

    </div>
  `;

  attachPickerListeners();
}

function renderPickerBrowserCard(browser, index, showNames) {
  const isSelected = index === state.selectedBrowserIndex;
  const icon = getBrowserEmoji(browser, '24px');
  const num = index + 1;

  const sizeStyles = { card: 'w-16 h-[72px] pt-2 px-1 pb-1', icon: '' };

  const baseCard = `relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer select-none transition-all duration-150`;
  const stateCard = isSelected
    ? 'bg-[#1e3a5f] border-blue-500 shadow-[0_0_0_1px_#3b82f6]'
    : 'bg-gray-800 border-transparent hover:bg-gray-700 hover:border-gray-600 hover:-translate-y-px';

  const numColor = isSelected ? 'text-blue-300' : 'text-gray-500';
  const nameColor = isSelected ? 'text-blue-200' : 'text-gray-400';

  return `
    <div class="picker-browser-card ${baseCard} ${stateCard} ${sizeStyles.card}"
         data-browser-index="${index}"
         title="${esc(browser.name)}">
      <div class="absolute top-1 left-1.5 text-[0.65rem] font-semibold leading-none ${numColor}">${num <= 9 ? num : ''}</div>
      <div class="${sizeStyles.icon} leading-none mb-1">${icon}</div>
      ${showNames ? `<div class="text-[0.65rem] ${nameColor} text-center w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 leading-tight">${esc(shortBrowserName(browser.name))}</div>` : ''}
    </div>
  `;
}

function attachPickerListeners() {
  // Frameless close button
  document.getElementById('btn-picker-close')?.addEventListener('click', cancelPicker);

  // Browser card clicks
  document.querySelectorAll('.picker-browser-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.browserIndex);
      selectBrowser(idx);
    });
    card.addEventListener('dblclick', () => {
      const idx = parseInt(card.dataset.browserIndex);
      selectBrowser(idx);
      openWithSelected();
    });
  });

  // Profile selector
  const profileSel = document.getElementById('picker-profile');
  if (profileSel) {
    profileSel.addEventListener('change', () => {
      state.selectedProfileId = profileSel.value;
    });
  }

  // Always use checkbox
  const alwaysUseChk = document.getElementById('picker-always-use');
  if (alwaysUseChk) {
    alwaysUseChk.addEventListener('change', () => {
      state.alwaysUse = alwaysUseChk.checked;
    });
  }

  // Open button
  document.getElementById('btn-picker-open')?.addEventListener('click', openWithSelected);

  // Cancel button
  document.getElementById('btn-picker-cancel')?.addEventListener('click', cancelPicker);
}

function selectBrowser(idx) {
  state.selectedBrowserIndex = idx;
  const browser = state.pickerData.browsers[idx];
  if (browser && browser.profiles && browser.profiles.length > 0) {
    state.selectedProfileId = browser.profiles[0].id;
  } else {
    state.selectedProfileId = '';
  }
  render();
}

async function openWithSelected() {
  const browsers = state.pickerData?.browsers || [];
  const browser = browsers[state.selectedBrowserIndex];
  if (!browser) return;

  // Get profile
  let profileId = state.selectedProfileId;
  let profileName = '';
  const profileSel = document.getElementById('picker-profile');
  if (profileSel) {
    profileId = profileSel.value;
    profileName = profileSel.options[profileSel.selectedIndex]?.text || '';
  } else if (browser.profiles && browser.profiles.length > 0) {
    const p = browser.profiles.find(p => p.id === profileId) || browser.profiles[0];
    profileId = p.id;
    profileName = p.name;
  }

  const alwaysUse = document.getElementById('picker-always-use')?.checked || false;

  const resp = {
    browserPath: browser.path,
    browserName: browser.name,
    profile: profileId,
    profileName: profileName,
    alwaysUse: alwaysUse,
  };

  try {
    await App.OpenWithBrowser(resp);
    // Close the window after launching
    await App.CancelPicker();
  } catch (e) {
    showToast('Failed to open browser: ' + e, 'error');
  }
}

async function cancelPicker() {
  try {
    await App.CancelPicker();
  } catch (e) {
    // Window may already be closing
  }
}

// ─── SETTINGS MODE ────────────────────────────────────────────────────────────
function renderSettingsMode() {
  document.getElementById('app').innerHTML = `
    <div class="flex flex-col h-screen bg-gray-900 text-gray-100 select-none">
      ${renderTitleBar()}
      ${renderTabs()}
      <div class="flex-1 overflow-hidden">
        ${state.tab === 'general'  ? renderGeneral()  : ''}
        ${state.tab === 'browsers' ? renderBrowsers() : ''}
        ${state.tab === 'rules'    ? renderRules()    : ''}
      </div>
    </div>
    ${state.editingRule !== null ? renderRuleEditorOverlay() : ''}
    ${state.showFirstRun ? renderFirstRunOverlay() : ''}
  `;
  attachListeners();
  if (state.showFirstRun) attachFirstRunListeners();
}

// ─── First-Run Overlay ────────────────────────────────────────────────────────
function renderFirstRunOverlay() {
  return `
    <div id="first-run-overlay" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100] p-6">
      <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 flex flex-col items-center text-center px-8 py-8 gap-5 fade-in">

        <!-- Icon -->
        <div class="text-5xl leading-none" style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE71B;</div>

        <!-- Heading -->
        <div>
          <h1 class="text-lg font-bold text-gray-100 mb-1">Welcome to Link Right</h1>
          <p class="text-sm text-gray-400 leading-relaxed">
            Link Right is registered as a browser.<br>
            To intercept all links, set it as your <strong class="text-gray-200">Windows default browser</strong>.
          </p>
        </div>

        <!-- Steps -->
        <ol class="text-left text-xs text-gray-400 space-y-1.5 w-full bg-gray-900 rounded-lg px-4 py-3">
          <li class="flex items-start gap-2"><span class="text-blue-400 font-bold mt-px">1.</span><span>Click <strong class="text-gray-200">Set as Default…</strong> below</span></li>
          <li class="flex items-start gap-2"><span class="text-blue-400 font-bold mt-px">2.</span><span>Find <strong class="text-gray-200">Link Right</strong> in the browser list</span></li>
          <li class="flex items-start gap-2"><span class="text-blue-400 font-bold mt-px">3.</span><span>Click it to set as default — done!</span></li>
        </ol>

        <!-- Buttons -->
        <div class="flex flex-col gap-2 w-full">
          <button id="btn-firstrun-set-default"
            class="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
            Set as Default…
          </button>
          <button id="btn-firstrun-dismiss"
            class="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            I'll do this later
          </button>
        </div>

      </div>
    </div>
  `;
}

function attachFirstRunListeners() {
  document.getElementById('btn-firstrun-set-default')?.addEventListener('click', async () => {
    try {
      await App.OpenDefaultAppsSettings();
      // Mark first run done and dismiss overlay
      state.showFirstRun = false;
      await App.MarkFirstRunComplete().catch(() => {});
      render();
    } catch (e) {
      showToast('Could not open Windows settings', 'error');
    }
  });

  document.getElementById('btn-firstrun-dismiss')?.addEventListener('click', async () => {
    state.showFirstRun = false;
    await App.MarkFirstRunComplete().catch(() => {});
    render();
  });
}

// ─── Title Bar ────────────────────────────────────────────────────────────────
function renderTitleBar() {
  return `
    <div class="flex items-center h-9 border-b border-gray-700 bg-gray-900 select-none"
         style="--wails-draggable: drag">
      <span class="flex-1 pl-3 text-sm font-semibold text-gray-200 tracking-wide">Preferences</span>
      <button id="btn-titlebar-minimize"
        class="w-10 h-9 flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors text-base leading-none"
        style="--wails-draggable: no-drag"
        title="Minimize">&#x2014;</button>
      <button id="btn-titlebar-maximize"
        class="w-10 h-9 flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors leading-none"
        style="--wails-draggable: no-drag; font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.8rem;"
        title="Maximize / Restore">&#xE922;</button>
      <button id="btn-titlebar-close"
        class="w-10 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors text-base leading-none"
        style="--wails-draggable: no-drag"
        title="Close">&#x2715;</button>
    </div>
  `;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function renderTabs() {
  // All icons from Segoe MDL2 Assets
  const tabs = [
    { id: 'general',  label: 'General',  icon: '\uE713' }, // Settings
    { id: 'browsers', label: 'Browsers', icon: '\uE774' }, // Slideshow (globe-like)
    { id: 'rules',    label: 'Rules',    icon: '\uE71C' }, // Filter
  ];
  return `
    <div class="flex justify-center gap-1 py-2 border-b border-gray-700 bg-gray-900 overflow-x-hidden">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="flex flex-col items-center gap-0.5 px-3 py-1 rounded text-xs transition-colors min-w-0
          ${state.tab === t.id
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'}"
          title="${t.label}">
          <span class="text-lg leading-none" style="font-family:'Segoe MDL2 Assets',sans-serif">${t.icon}</span>
          <span class="leading-none">${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// ─── General Tab ──────────────────────────────────────────────────────────────
function renderGeneral() {
  const s = state.appStatus;
  const c = state.config;
  const defaultBrowser = (state.activeBrowsers || []).find(b => b.name === c.defaultBrowser);
  return `
    <div class="p-5 space-y-5 overflow-y-auto h-full">

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Default Browser Status</h2>
        <div class="bg-gray-800 rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-200">Default browser</div>
              <div class="text-xs text-gray-400">${s.isDefaultBrowser ? 'Link Right is the Windows default' : 'Not set as default'}</div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-refresh-default-status" title="Check default browser status"
                class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE72C;</button>
              ${!s.isDefaultBrowser
                ? `<button id="btn-set-default" class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Set as Default…</button>`
                : `<span class="text-xs text-green-400 font-medium">✓ Active</span>`
              }
            </div>
          </div>
          <div class="text-xs text-gray-500 border-t border-gray-700 pt-2 mt-1">
            <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem; vertical-align:middle;">&#xE946;</span>
            Link Right must be set as the <strong class="text-gray-400">Windows Default Browser</strong> to intercept and route links. Without this, clicking links will bypass Link Right entirely.
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Primary Browser ( and Profile )</h2>
        <div class="bg-gray-800 rounded-lg p-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-gray-400 block mb-1">Browser</label>
              <select id="sel-default-browser" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="">— None —</option>
                ${state.activeBrowsers.map(b => `
                  <option value="${esc(b.name)}" ${c.defaultBrowser === b.name ? 'selected' : ''}>${esc(b.name)}</option>
                `).join('')}
              </select>
            </div>
            <div id="default-profile-row" class="flex-1 ${c.defaultBrowser ? '' : 'invisible'}">
              <label class="text-xs text-gray-400 block mb-1">Profile</label>
              <select id="sel-default-profile" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                ${renderProfileOptions(c.defaultBrowser, c.defaultProfile)}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fallback Behavior</h2>
        <div class="bg-gray-800 rounded-lg p-4">
          <div class="text-xs text-gray-400 mb-3">When no rule matches a link:</div>
          <div class="flex gap-3">
            <label class="flex-1 flex items-start gap-3 cursor-pointer bg-gray-750 rounded-lg p-3 border-2 transition-colors ${(c.fallbackBehavior || 'default') === 'default' ? 'border-blue-600 bg-blue-950' : 'border-gray-700 hover:border-gray-600'}" style="${(c.fallbackBehavior || 'default') === 'default' ? 'background:#0f1f3d' : ''}">
              <input type="radio" name="fallback" value="default" class="accent-blue-500 mt-0.5 flex-shrink-0"
                ${(c.fallbackBehavior || 'default') === 'default' ? 'checked' : ''}>
              <div>
                <div class="text-sm text-gray-200 font-medium">Use primary browser</div>
                <div class="text-xs text-gray-400 mt-0.5">${defaultBrowser ? defaultBrowser.name : 'Set a primary browser above'}</div>
              </div>
            </label>
            <label class="flex-1 flex items-start gap-3 cursor-pointer rounded-lg p-3 border-2 transition-colors ${(c.fallbackBehavior || 'default') === 'picker' ? 'border-blue-600' : 'border-gray-700 hover:border-gray-600'}" style="${(c.fallbackBehavior || 'default') === 'picker' ? 'background:#0f1f3d' : ''}">
              <input type="radio" name="fallback" value="picker" class="accent-blue-500 mt-0.5 flex-shrink-0"
                ${(c.fallbackBehavior || 'default') === 'picker' ? 'checked' : ''}>
              <div>
                <div class="text-sm text-gray-200 font-medium">Show browser picker</div>
                <div class="text-xs text-gray-400 mt-0.5">Ask which browser to use each time</div>
              </div>
            </label>
          </div>
        </div>
      </section>

    </div>
  `;
}

function renderProfileOptions(browserName, selectedProfile) {
  const browser = (state.activeBrowsers || []).find(b => b.name === browserName);
  if (!browser || !browser.profiles || browser.profiles.length === 0) {
    return `<option value="">Default</option>`;
  }
  return browser.profiles.map(p => `
    <option value="${esc(p.id)}" ${selectedProfile === p.id ? 'selected' : ''}>${esc(p.name)}</option>
  `).join('');
}

// ─── Browsers Tab ─────────────────────────────────────────────────────────────
function renderBrowsers() {
  return `
    <div class="flex flex-col h-full">
      <div class="border-b border-gray-700 px-4 py-2 flex items-center gap-3 bg-gray-900">
        <button id="btn-refresh-browsers" title="Refresh browser list"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-sm">↺</button>
        <span class="text-xs text-gray-500">Refresh</span>
      </div>
      <div class="flex-1 overflow-y-auto">
        ${state.browsers.length === 0
          ? `<div class="flex items-center justify-center h-32 text-gray-500 text-sm">No browsers detected</div>`
          : state.browsers.map((b, i) => renderBrowserRow(b, i)).join('')
        }
      </div>
    </div>
  `;
}

function renderBrowserRow(browser, index) {
  const isDefault = state.config.defaultBrowser === browser.name;
  const isSelected = state.selectedBrowserPath === browser.path;
  const icon = getBrowserEmoji(browser, '20px');
  const isArchived = !!browser.archived;

  const rowBase = `browser-row flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 cursor-pointer transition-colors`;
  const rowState = isArchived
    ? 'opacity-50 hover:opacity-70 hover:bg-gray-800'
    : (isSelected ? 'bg-blue-900 hover:bg-blue-800' : 'hover:bg-gray-800');

  return `
    <div class="${rowBase} ${rowState}"
         data-browser-index="${index}" data-browser-path="${esc(browser.path)}">
      <span class="leading-none flex-shrink-0 ${isArchived ? 'grayscale' : ''}">${icon}</span>
      <span class="flex-1 text-sm ${isArchived ? 'text-gray-500 line-through' : 'text-gray-200'}">${esc(browser.name)}</span>
      ${isArchived
        ? `<span class="text-xs text-gray-600 font-medium px-2 py-0.5 rounded border border-gray-700 bg-gray-800">Archived</span>
           <button class="btn-unarchive-browser text-xs text-gray-400 hover:text-green-300 hover:bg-gray-700 px-2 py-0.5 rounded transition-colors flex-shrink-0"
             data-browser-path="${esc(browser.path)}" title="Restore this browser">Restore</button>`
        : `${isDefault
            ? `<span class="text-xs text-blue-400 font-medium px-2 py-0.5 rounded border border-blue-800 bg-blue-950">Primary</span>`
            : `<button class="btn-set-default-browser text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-700 px-2 py-0.5 rounded transition-colors"
                 data-browser-index="${index}" title="Set as primary browser">Set as primary</button>`
          }
          <button class="btn-archive-browser text-xs text-gray-500 hover:text-yellow-300 hover:bg-gray-700 px-2 py-0.5 rounded transition-colors flex-shrink-0"
            data-browser-path="${esc(browser.path)}" title="Hide this browser from the picker">Archive</button>`
      }
    </div>
  `;
}


// ─── Rules Tab ────────────────────────────────────────────────────────────────
function renderRules() {
  return `
    <div class="flex flex-col h-full">
      <div class="flex-1 overflow-y-auto">
        ${state.rules.length === 0
          ? `<div class="flex flex-col items-center justify-center h-40 text-gray-500 text-sm gap-2">
               <span class="text-3xl" style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE71C;</span>
               <span>No rules yet</span>
               <span class="text-xs text-gray-600">Click + to add your first rule</span>
             </div>`
          : state.rules.map((r, i) => renderRuleRow(r, i)).join('')
        }
      </div>
      <div class="border-t border-gray-700 px-4 py-2 flex items-center gap-3 bg-gray-900">
        <button id="btn-add-rule" title="Add rule"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-lg font-light">+</button>
        <button id="btn-delete-rule" title="Delete selected rule"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-lg font-light">−</button>
      </div>
    </div>
  `;
}

function renderRuleRow(rule, index) {
  const validation = (state.validations || []).find(v => v.ruleId === rule.id);
  const hasWarning = validation && (validation.browserMissing || validation.profileMissing);
  const condSummary = getRuleConditionSummary(rule);
  const browserName = rule.browser || '—';
  return `
    <div class="rule-row flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors"
         data-rule-index="${index}" data-rule-id="${esc(rule.id)}">
      <div class="text-gray-600 cursor-grab text-xs leading-none select-none">⠿</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-200 truncate">${esc(rule.name || 'Unnamed rule')}</span>
          ${hasWarning ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[0.75rem] font-medium">⚠ ${esc(validation.message)}</span>` : ''}
        </div>
        <div class="text-xs text-gray-500 truncate mt-0.5">${esc(condSummary)} → ${esc(browserName)}</div>
      </div>
      <button class="btn-edit-rule-item flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
        data-rule-index="${index}" title="Edit rule"
        style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem;">&#xE70F;</button>
      <button class="btn-delete-rule-item flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
        data-rule-id="${esc(rule.id)}" data-rule-index="${index}" title="Delete rule"
        style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem;">&#xE74D;</button>
      <label class="toggle flex-shrink-0" title="${rule.enabled ? 'Disable' : 'Enable'} rule">
        <input type="checkbox" class="rule-toggle" data-rule-id="${esc(rule.id)}" ${rule.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

function getRuleConditionSummary(rule) {
  if (rule.conditions && rule.conditions.length > 0) {
    const logic = rule.conditionLogic === 'any' ? 'Any' : 'All';
    const parts = rule.conditions.map(c => `${c.field} ${c.operator.replace(/_/g,' ')} "${c.value}"`);
    if (parts.length === 1) return parts[0];
    return `${logic} of: ${parts.slice(0, 2).join(', ')}${parts.length > 2 ? ` +${parts.length - 2} more` : ''}`;
  }
  if (rule.pattern) return `${rule.matchType || 'domain'}: ${rule.pattern}`;
  return 'No conditions';
}

// ─── Icons Tab ────────────────────────────────────────────────────────────────
function renderIconsTab() {
  // Segoe MDL2 Assets — common glyphs with names and codepoints
  const mdl2Icons = [
    { code: '\uE700', name: 'GlobalNavButton' },
    { code: '\uE701', name: 'Wifi' },
    { code: '\uE702', name: 'Bluetooth' },
    { code: '\uE703', name: 'Connect' },
    { code: '\uE704', name: 'InternetSharing' },
    { code: '\uE705', name: 'VPN' },
    { code: '\uE706', name: 'Brightness' },
    { code: '\uE707', name: 'MapPin' },
    { code: '\uE708', name: 'QuietHours' },
    { code: '\uE709', name: 'Airplane' },
    { code: '\uE70A', name: 'Tablet' },
    { code: '\uE70B', name: 'QuickNote' },
    { code: '\uE70C', name: 'RememberedDevice' },
    { code: '\uE70D', name: 'ChevronDown' },
    { code: '\uE70E', name: 'ChevronUp' },
    { code: '\uE70F', name: 'Edit' },
    { code: '\uE710', name: 'Add' },
    { code: '\uE711', name: 'Cancel' },
    { code: '\uE712', name: 'More' },
    { code: '\uE713', name: 'Settings' },
    { code: '\uE714', name: 'Video' },
    { code: '\uE715', name: 'Mail' },
    { code: '\uE716', name: 'People' },
    { code: '\uE717', name: 'Phone' },
    { code: '\uE718', name: 'Pin' },
    { code: '\uE719', name: 'Shop' },
    { code: '\uE71A', name: 'Stop' },
    { code: '\uE71B', name: 'Link' },
    { code: '\uE71C', name: 'Filter' },
    { code: '\uE71D', name: 'AllApps' },
    { code: '\uE71E', name: 'Zoom' },
    { code: '\uE71F', name: 'ZoomOut' },
    { code: '\uE720', name: 'Microphone' },
    { code: '\uE721', name: 'Search' },
    { code: '\uE722', name: 'Camera' },
    { code: '\uE723', name: 'Attach' },
    { code: '\uE724', name: 'Send' },
    { code: '\uE725', name: 'SendFill' },
    { code: '\uE726', name: 'WalkSolid' },
    { code: '\uE727', name: 'InPrivate' },
    { code: '\uE728', name: 'FavoriteList' },
    { code: '\uE729', name: 'PageSolid' },
    { code: '\uE72A', name: 'Forward' },
    { code: '\uE72B', name: 'Back' },
    { code: '\uE72C', name: 'Refresh' },
    { code: '\uE72D', name: 'Share' },
    { code: '\uE72E', name: 'Lock' },
    { code: '\uE730', name: 'ReportHacked' },
    { code: '\uE731', name: 'EMI' },
    { code: '\uE734', name: 'FavoriteStar' },
    { code: '\uE735', name: 'FavoriteStarFill' },
    { code: '\uE738', name: 'Remove' },
    { code: '\uE739', name: 'Checkbox' },
    { code: '\uE73A', name: 'CheckboxComposite' },
    { code: '\uE73B', name: 'CheckboxFill' },
    { code: '\uE73C', name: 'CheckboxIndeterminate' },
    { code: '\uE73D', name: 'CheckboxCompositeReversed' },
    { code: '\uE73E', name: 'CheckMark' },
    { code: '\uE740', name: 'BackSpaceQWERTY' },
    { code: '\uE741', name: 'SelectAll' },
    { code: '\uE742', name: 'Orientation' },
    { code: '\uE743', name: 'Import' },
    { code: '\uE74A', name: 'TouchPointer' },
    { code: '\uE74B', name: 'Merge' },
    { code: '\uE74C', name: 'NewWindow' },
    { code: '\uE74D', name: 'Mail2' },
    { code: '\uE74E', name: 'MailFilled' },
    { code: '\uE74F', name: 'BlockContact' },
    { code: '\uE750', name: 'AddFriend' },
    { code: '\uE751', name: 'TouchPointer2' },
    { code: '\uE752', name: 'GoToStart' },
    { code: '\uE753', name: 'ZeroBars' },
    { code: '\uE754', name: 'OneBar' },
    { code: '\uE755', name: 'TwoBars' },
    { code: '\uE756', name: 'ThreeBars' },
    { code: '\uE757', name: 'FourBars' },
    { code: '\uE758', name: 'World' },
    { code: '\uE759', name: 'Comment' },
    { code: '\uE75A', name: 'MusicInfo' },
    { code: '\uE75B', name: 'ChevronLeft' },
    { code: '\uE75C', name: 'ChevronRight' },
    { code: '\uE75D', name: 'InkingTool' },
    { code: '\uE75E', name: 'Emoji2' },
    { code: '\uE75F', name: 'GripperBarHorizontal' },
    { code: '\uE760', name: 'System' },
    { code: '\uE761', name: 'Personalize' },
    { code: '\uE762', name: 'Devices' },
    { code: '\uE763', name: 'SearchAndApps' },
    { code: '\uE764', name: 'Globe' },
    { code: '\uE765', name: 'TimeLanguage' },
    { code: '\uE766', name: 'EaseOfAccess' },
    { code: '\uE767', name: 'UpdateRestore' },
    { code: '\uE768', name: 'HangUp' },
    { code: '\uE769', name: 'ContactInfo' },
    { code: '\uE76A', name: 'Unpin' },
    { code: '\uE76B', name: 'Contact' },
    { code: '\uE76C', name: 'Memo' },
    { code: '\uE76D', name: 'IncomingCall' },
    { code: '\uE76E', name: 'Paste' },
    { code: '\uE76F', name: 'PhoneBook' },
    { code: '\uE770', name: 'LEDLight' },
    { code: '\uE771', name: 'Error' },
    { code: '\uE772', name: 'GripperBarVertical' },
    { code: '\uE773', name: 'Unlock' },
    { code: '\uE774', name: 'Slideshow' },
    { code: '\uE775', name: 'Calendar' },
    { code: '\uE776', name: 'GripperResize' },
    { code: '\uE777', name: 'Megaphone' },
    { code: '\uE778', name: 'Trim' },
    { code: '\uE779', name: 'NewWindow2' },
    { code: '\uE77A', name: 'SaveLocal' },
    { code: '\uE77B', name: 'Color' },
    { code: '\uE77C', name: 'DataSense' },
    { code: '\uE77D', name: 'SaveAs' },
    { code: '\uE77E', name: 'Light' },
    { code: '\uE77F', name: 'Effects' },
    { code: '\uE780', name: 'Bus' },
    { code: '\uE781', name: 'Cloudy' },
    { code: '\uE782', name: 'PartlyCloudyDay' },
    { code: '\uE783', name: 'PartlyCloudyNight' },
    { code: '\uE784', name: 'ClearNight' },
    { code: '\uE785', name: 'StrongWind' },
    { code: '\uE786', name: 'Squalls' },
    { code: '\uE787', name: 'Freezing' },
    { code: '\uE788', name: 'Hail' },
    { code: '\uE789', name: 'SleetShowers' },
    { code: '\uE78A', name: 'Sleet' },
    { code: '\uE78B', name: 'SnowShowers' },
    { code: '\uE78C', name: 'Snow' },
    { code: '\uE78D', name: 'BlowingSnow' },
    { code: '\uE78E', name: 'Frigid' },
    { code: '\uE78F', name: 'Fog' },
    { code: '\uE790', name: 'Haze' },
    { code: '\uE791', name: 'RainShowers' },
    { code: '\uE792', name: 'Rain' },
    { code: '\uE793', name: 'Thunderstorms' },
    { code: '\uE794', name: 'TStormShowers' },
    { code: '\uE795', name: 'TStormSnoShowers' },
    { code: '\uE796', name: 'ChanceOfRain' },
    { code: '\uE797', name: 'ChanceOfSnow' },
    { code: '\uE798', name: 'ChanceOfStorms' },
    { code: '\uE799', name: 'Hot' },
    { code: '\uE79A', name: 'Blizzard' },
    { code: '\uE79B', name: 'Snowy' },
    { code: '\uE79C', name: 'BatterySaver9' },
    { code: '\uE79D', name: 'BatterySaver10' },
    { code: '\uE79E', name: 'BatterySaverFull' },
    { code: '\uE7A5', name: 'Battery0' },
    { code: '\uE7A6', name: 'Battery1' },
    { code: '\uE7A7', name: 'Battery2' },
    { code: '\uE7A8', name: 'Battery3' },
    { code: '\uE7A9', name: 'Battery4' },
    { code: '\uE7AA', name: 'Battery5' },
    { code: '\uE7AB', name: 'Battery6' },
    { code: '\uE7AC', name: 'Battery7' },
    { code: '\uE7AD', name: 'Battery8' },
    { code: '\uE7AE', name: 'Battery9' },
    { code: '\uE7AF', name: 'Battery10' },
    { code: '\uE7B0', name: 'BatteryCharging0' },
    { code: '\uE7B1', name: 'BatteryCharging1' },
    { code: '\uE7B2', name: 'BatteryCharging2' },
    { code: '\uE7B3', name: 'BatteryCharging3' },
    { code: '\uE7B4', name: 'BatteryCharging4' },
    { code: '\uE7B5', name: 'BatteryCharging5' },
    { code: '\uE7B6', name: 'BatteryCharging6' },
    { code: '\uE7B7', name: 'BatteryCharging7' },
    { code: '\uE7B8', name: 'BatteryCharging8' },
    { code: '\uE7B9', name: 'BatteryCharging9' },
    { code: '\uE7BA', name: 'BatteryCharging10' },
    { code: '\uE7BC', name: 'BatteryUnknown' },
    { code: '\uE7BE', name: 'WifiAttentionOverlay' },
    { code: '\uE7BF', name: 'Robots' },
    { code: '\uE7C0', name: 'Bus2' },
    { code: '\uE7C1', name: 'Car' },
    { code: '\uE7C2', name: 'Ferry' },
    { code: '\uE7C3', name: 'Walk' },
    { code: '\uE7C4', name: 'Cycling' },
    { code: '\uE7C5', name: 'TransitConnection' },
    { code: '\uE7C6', name: 'TransitConnectionDash' },
    { code: '\uE7C7', name: 'TransitConnectionTransfer' },
    { code: '\uE7C8', name: 'StatusCircleLeft' },
    { code: '\uE7C9', name: 'StatusTriangleLeft' },
    { code: '\uE7CA', name: 'StatusCircleRight' },
    { code: '\uE7CB', name: 'StatusTriangleRight' },
    { code: '\uE7CC', name: 'StatusCircleInner' },
    { code: '\uE7CD', name: 'StatusTriangleInner' },
    { code: '\uE7CE', name: 'StatusCircleRing' },
    { code: '\uE7CF', name: 'StatusTriangleOuter' },
    { code: '\uE7D0', name: 'StatusCircleCheckmark' },
    { code: '\uE7D1', name: 'StatusCircleInfo' },
    { code: '\uE7D2', name: 'StatusCircleBlock' },
    { code: '\uE7D3', name: 'StatusCircleBlock2' },
    { code: '\uE7D4', name: 'StatusCircleQuestionMark' },
    { code: '\uE7D5', name: 'StatusCircleSync' },
    { code: '\uE7D6', name: 'Dial1' },
    { code: '\uE7D7', name: 'Dial2' },
    { code: '\uE7D8', name: 'Dial3' },
    { code: '\uE7D9', name: 'Dial4' },
    { code: '\uE7DA', name: 'Dial5' },
    { code: '\uE7DB', name: 'Dial6' },
    { code: '\uE7DC', name: 'Dial7' },
    { code: '\uE7DD', name: 'Dial8' },
    { code: '\uE7DE', name: 'DialShape1' },
    { code: '\uE7DF', name: 'DialShape2' },
    { code: '\uE7E0', name: 'DialShape3' },
    { code: '\uE7E1', name: 'DialShape4' },
    { code: '\uE7E3', name: 'TollSolid' },
    { code: '\uE7E4', name: 'TrafficCongestionSolid' },
    { code: '\uE7E6', name: 'ExploreContentSingle' },
    { code: '\uE7E7', name: 'CollapseContent' },
    { code: '\uE7E8', name: 'CollapseContentSingle' },
    { code: '\uE7E9', name: 'InfoSolid' },
    { code: '\uE7EA', name: 'GroupList' },
    { code: '\uE7EB', name: 'CaretBottomRightSolidCenter8' },
    { code: '\uE7EC', name: 'ProgressRingDots' },
    { code: '\uE7ED', name: 'Checkbox2' },
    { code: '\uE7EE', name: 'CheckboxComposite2' },
    { code: '\uE7EF', name: 'CheckboxIndeterminate2' },
    { code: '\uE7F0', name: 'CheckboxCompositeReversed2' },
    { code: '\uE7F1', name: 'CheckMark2' },
    { code: '\uE7F2', name: 'BackSpaceQWERTYSm' },
    { code: '\uE7F3', name: 'BackSpaceQWERTYMd' },
    { code: '\uE7F4', name: 'Swipe' },
    { code: '\uE7F5', name: 'Fingerprint' },
    { code: '\uE7F6', name: 'Handwriting' },
    { code: '\uE7F7', name: 'ChromeBack' },
    { code: '\uE7F8', name: 'ChromeForward' },
    { code: '\uE7F9', name: 'ChromeRefresh' },
    { code: '\uE7FA', name: 'ChromeShare' },
    { code: '\uE7FB', name: 'ChromeBookmarks' },
    { code: '\uE7FC', name: 'ChromeBookmarksFill' },
    { code: '\uE7FD', name: 'ChromeTabsSearch' },
    { code: '\uE7FE', name: 'ChromeHome' },
    { code: '\uE7FF', name: 'ChromeAnnotate' },
    { code: '\uE800', name: 'ChromeAnnotateFill' },
    { code: '\uE801', name: 'ChromeClose' },
    { code: '\uE802', name: 'ChromeMinimize' },
    { code: '\uE803', name: 'ChromeMaximize' },
    { code: '\uE804', name: 'ChromeRestore' },
    { code: '\uE805', name: 'Paste2' },
    { code: '\uE806', name: 'Cut' },
    { code: '\uE807', name: 'Copy' },
    { code: '\uE808', name: 'Important' },
    { code: '\uE809', name: 'MailReply' },
    { code: '\uE80A', name: 'Sort' },
    { code: '\uE80B', name: 'MobileTablet' },
    { code: '\uE80C', name: 'DisconnectDrive' },
    { code: '\uE80D', name: 'MapDrive' },
    { code: '\uE80E', name: 'OpenFile' },
    { code: '\uE80F', name: 'ClearSelection' },
    { code: '\uE810', name: 'FontDecrease' },
    { code: '\uE811', name: 'FontIncrease' },
    { code: '\uE812', name: 'FontSize' },
    { code: '\uE813', name: 'CellPhone' },
    { code: '\uE814', name: 'ReShare' },
    { code: '\uE815', name: 'Tag' },
    { code: '\uE816', name: 'RepeatOne' },
    { code: '\uE817', name: 'RepeatAll' },
    { code: '\uE818', name: 'OutlineStar' },
    { code: '\uE819', name: 'SolidStar' },
    { code: '\uE81A', name: 'Calculator' },
    { code: '\uE81B', name: 'Directions' },
    { code: '\uE81C', name: 'Target' },
    { code: '\uE81D', name: 'Library' },
    { code: '\uE81E', name: 'PhoneBook2' },
    { code: '\uE81F', name: 'Memo2' },
    { code: '\uE820', name: 'Microphone2' },
    { code: '\uE821', name: 'PostUpdate' },
    { code: '\uE822', name: 'BackToWindow' },
    { code: '\uE823', name: 'FullScreen' },
    { code: '\uE824', name: 'NewFolder' },
    { code: '\uE825', name: 'CalendarReply' },
    { code: '\uE826', name: 'UnsyncFolder' },
    { code: '\uE827', name: 'SyncFolder' },
    { code: '\uE828', name: 'BlockContact2' },
    { code: '\uE829', name: 'SwitchApps' },
    { code: '\uE82A', name: 'AddFriend2' },
    { code: '\uE82B', name: 'TouchPointer3' },
    { code: '\uE82C', name: 'GoToStart2' },
    { code: '\uE82D', name: 'ZeroBars2' },
    { code: '\uE82E', name: 'StopSlideshow' },
    { code: '\uE82F', name: 'Permissions' },
    { code: '\uE830', name: 'Highlight' },
    { code: '\uE831', name: 'DisableUpdates' },
    { code: '\uE832', name: 'UnfavoriteStarFill' },
    { code: '\uE833', name: 'Italic' },
    { code: '\uE834', name: 'Underline' },
    { code: '\uE835', name: 'Bold' },
    { code: '\uE836', name: 'MoveToFolder' },
    { code: '\uE837', name: 'LikeDislike' },
    { code: '\uE838', name: 'Dislike' },
    { code: '\uE839', name: 'Like' },
    { code: '\uE83A', name: 'AlignRight' },
    { code: '\uE83B', name: 'AlignCenter' },
    { code: '\uE83C', name: 'AlignLeft' },
    { code: '\uE83D', name: 'Zoom2' },
    { code: '\uE83E', name: 'ZoomOut2' },
    { code: '\uE83F', name: 'OpenWith' },
    { code: '\uE840', name: 'Rotate' },
    { code: '\uE841', name: 'Shuffle' },
    { code: '\uE842', name: 'Movies' },
    { code: '\uE843', name: 'SelectAll2' },
    { code: '\uE844', name: 'Orientation2' },
    { code: '\uE845', name: 'Import2' },
    { code: '\uE846', name: 'Folder' },
    { code: '\uE847', name: 'Picture' },
    { code: '\uE848', name: 'Caption' },
    { code: '\uE849', name: 'ChromeBackMirrored' },
    { code: '\uE84A', name: 'ChromeForwardMirrored' },
    { code: '\uE84B', name: 'ChromeBackMirrored2' },
    { code: '\uE84C', name: 'ChromeForwardMirrored2' },
    { code: '\uE84D', name: 'Trim2' },
    { code: '\uE84E', name: 'AttachCamera' },
    { code: '\uE84F', name: 'ZoomIn' },
    { code: '\uE850', name: 'Bookmarks' },
    { code: '\uE851', name: 'Document' },
    { code: '\uE852', name: 'ProtectedDocument' },
    { code: '\uE853', name: 'OpenInNewWindow' },
    { code: '\uE854', name: 'MailFill' },
    { code: '\uE855', name: 'ViewAll' },
    { code: '\uE856', name: 'VideoChat' },
    { code: '\uE857', name: 'Switch' },
    { code: '\uE858', name: 'Rename' },
    { code: '\uE859', name: 'Go' },
    { code: '\uE85A', name: 'SurfaceHub' },
    { code: '\uE85B', name: 'Remote' },
    { code: '\uE85C', name: 'Click' },
    { code: '\uE85D', name: 'Shuffle2' },
    { code: '\uE85E', name: 'Movies2' },
    { code: '\uE85F', name: 'SelectAll3' },
    { code: '\uE860', name: 'Orientation3' },
    { code: '\uE861', name: 'Import3' },
    { code: '\uE862', name: 'Folder2' },
    { code: '\uE863', name: 'Picture2' },
    { code: '\uE864', name: 'Caption2' },
    { code: '\uE865', name: 'Trim3' },
    { code: '\uE866', name: 'AttachCamera2' },
    { code: '\uE867', name: 'ZoomIn2' },
    { code: '\uE868', name: 'Bookmarks2' },
    { code: '\uE869', name: 'Document2' },
    { code: '\uE86A', name: 'ProtectedDocument2' },
    { code: '\uE86B', name: 'Page' },
    { code: '\uE86C', name: 'Bullets' },
    { code: '\uE86D', name: 'Comment2' },
    { code: '\uE86E', name: 'MailReply2' },
    { code: '\uE86F', name: 'Undo' },
    { code: '\uE870', name: 'Redo' },
    { code: '\uE871', name: 'BookmarksMirrored' },
    { code: '\uE872', name: 'Bullseye' },
    { code: '\uE873', name: 'NUIFace' },
    { code: '\uE874', name: 'CalendarMirrored' },
    { code: '\uE875', name: 'ChevronUpSmall' },
    { code: '\uE876', name: 'ChevronDownSmall' },
    { code: '\uE877', name: 'ChevronLeftSmall' },
    { code: '\uE878', name: 'ChevronRightSmall' },
    { code: '\uE879', name: 'ChevronUpMed' },
    { code: '\uE87A', name: 'ChevronDownMed' },
    { code: '\uE87B', name: 'ChevronLeftMed' },
    { code: '\uE87C', name: 'ChevronRightMed' },
    { code: '\uE87D', name: 'Devices2' },
    { code: '\uE87E', name: 'PC1' },
    { code: '\uE87F', name: 'PresenceChicklet' },
    { code: '\uE880', name: 'PresenceChickletVideo' },
    { code: '\uE881', name: 'Reply' },
    { code: '\uE882', name: 'HalfStarLeft' },
    { code: '\uE883', name: 'HalfStarRight' },
    { code: '\uE884', name: 'CommandPrompt' },
    { code: '\uE885', name: 'Presentation' },
    { code: '\uE886', name: 'MultiSelect' },
    { code: '\uE887', name: 'KeyboardClassic' },
    { code: '\uE888', name: 'Play' },
    { code: '\uE889', name: 'Pause' },
    { code: '\uE88A', name: 'ChevronLeft2' },
    { code: '\uE88B', name: 'ChevronRight2' },
    { code: '\uE88C', name: 'InkingToolFill' },
    { code: '\uE88D', name: 'XBOX' },
    { code: '\uE88E', name: 'Trackers' },
    { code: '\uE88F', name: 'Nav2DMapView' },
    { code: '\uE890', name: 'StreetsideSplitMinimize' },
    { code: '\uE891', name: 'StreetsideSplitExpand' },
    { code: '\uE892', name: 'Car2' },
    { code: '\uE893', name: 'Walk2' },
    { code: '\uE894', name: 'Bus3' },
    { code: '\uE895', name: 'TiltUp' },
    { code: '\uE896', name: 'TiltDown' },
    { code: '\uE897', name: 'CallForwarding' },
    { code: '\uE898', name: 'RotateCamera' },
    { code: '\uE899', name: 'Home' },
    { code: '\uE89A', name: 'ParkingLocation' },
    { code: '\uE89B', name: 'MapCompassTop' },
    { code: '\uE89C', name: 'MapCompassBottom' },
    { code: '\uE89D', name: 'IncidentTriangle' },
    { code: '\uE89E', name: 'Touch' },
    { code: '\uE89F', name: 'MapDirections' },
    { code: '\uE8A0', name: 'StartPoint' },
    { code: '\uE8A1', name: 'StopPoint' },
    { code: '\uE8A2', name: 'EndPoint' },
    { code: '\uE8A3', name: 'History' },
    { code: '\uE8A4', name: 'Location' },
    { code: '\uE8A5', name: 'MapLayers' },
    { code: '\uE8A6', name: 'Accident' },
    { code: '\uE8A7', name: 'Work' },
    { code: '\uE8A8', name: 'Construction' },
    { code: '\uE8A9', name: 'Recent' },
    { code: '\uE8AA', name: 'Bank' },
    { code: '\uE8AB', name: 'DownloadMap' },
    { code: '\uE8AC', name: 'InkingToolFill2' },
    { code: '\uE8AD', name: 'HighlightFill' },
    { code: '\uE8AE', name: 'EraseToolFill' },
    { code: '\uE8AF', name: 'EraseToolFill2' },
    { code: '\uE8B0', name: 'Dictionary' },
    { code: '\uE8B1', name: 'DictionaryAdd' },
    { code: '\uE8B2', name: 'ToolTip' },
    { code: '\uE8B3', name: 'ChromeBack2' },
    { code: '\uE8B4', name: 'ProvisioningPackage' },
    { code: '\uE8B5', name: 'AddRemoteDevice' },
    { code: '\uE8B6', name: 'FolderOpen' },
    { code: '\uE8B7', name: 'Ethernet' },
    { code: '\uE8B8', name: 'ShareBroadband' },
    { code: '\uE8B9', name: 'DirectAccess' },
    { code: '\uE8BA', name: 'DialUp' },
    { code: '\uE8BB', name: 'DefenderApp' },
    { code: '\uE8BC', name: 'BatteryCharging11' },
    { code: '\uE8BD', name: 'Battery11' },
    { code: '\uE8BE', name: 'Trackers2' },
    { code: '\uE8BF', name: 'AddSurfaceHub' },
    { code: '\uE8C0', name: 'DevUpdate' },
    { code: '\uE8C1', name: 'Unit' },
    { code: '\uE8C2', name: 'AddTo' },
    { code: '\uE8C3', name: 'RemoveFrom' },
    { code: '\uE8C4', name: 'RadioBtnOff' },
    { code: '\uE8C5', name: 'RadioBtnOn' },
    { code: '\uE8C6', name: 'RadioBullet' },
    { code: '\uE8C7', name: 'ExploreContent' },
    { code: '\uE8C8', name: 'ScrollMode' },
    { code: '\uE8C9', name: 'ZoomMode' },
    { code: '\uE8CA', name: 'PanMode' },
    { code: '\uE8CB', name: 'WiredUSB' },
    { code: '\uE8CC', name: 'WirelessUSB' },
    { code: '\uE8CD', name: 'USBSafeConnect' },
    { code: '\uE8CE', name: 'ActionCenterNotification' },
    { code: '\uE8CF', name: 'ResetDevice' },
    { code: '\uE8D0', name: 'Feedback' },
    { code: '\uE8D1', name: 'Subtitles' },
    { code: '\uE8D2', name: 'SubtitlesAudio' },
    { code: '\uE8D3', name: 'OpenFolderHorizontal' },
    { code: '\uE8D4', name: 'CalendarDay' },
    { code: '\uE8D5', name: 'CalendarWeek' },
    { code: '\uE8D6', name: 'Characters' },
    { code: '\uE8D7', name: 'MailReplyAll' },
    { code: '\uE8D8', name: 'Read' },
    { code: '\uE8D9', name: 'ShowBcc' },
    { code: '\uE8DA', name: 'HideBcc' },
    { code: '\uE8DB', name: 'Cut2' },
    { code: '\uE8DC', name: 'PaymentCard' },
    { code: '\uE8DD', name: 'Copy2' },
    { code: '\uE8DE', name: 'Important2' },
    { code: '\uE8DF', name: 'MailReply3' },
    { code: '\uE8E0', name: 'Sort2' },
    { code: '\uE8E1', name: 'MobileTablet2' },
    { code: '\uE8E2', name: 'DisconnectDrive2' },
    { code: '\uE8E3', name: 'MapDrive2' },
    { code: '\uE8E4', name: 'OpenFile2' },
    { code: '\uE8E5', name: 'ClearSelection2' },
    { code: '\uE8E6', name: 'FontDecrease2' },
    { code: '\uE8E7', name: 'FontIncrease2' },
    { code: '\uE8E8', name: 'FontSize2' },
    { code: '\uE8E9', name: 'CellPhone2' },
    { code: '\uE8EA', name: 'ReShare2' },
    { code: '\uE8EB', name: 'Tag2' },
    { code: '\uE8EC', name: 'RepeatOne2' },
    { code: '\uE8ED', name: 'RepeatAll2' },
    { code: '\uE8EE', name: 'Calculator2' },
    { code: '\uE8EF', name: 'Directions2' },
    { code: '\uE8F0', name: 'Library2' },
    { code: '\uE8F1', name: 'ChatBubbles' },
    { code: '\uE8F2', name: 'PostUpdate2' },
    { code: '\uE8F3', name: 'NewWindow3' },
    { code: '\uE8F4', name: 'SaveLocal2' },
    { code: '\uE8F5', name: 'Color2' },
    { code: '\uE8F6', name: 'DataSense2' },
    { code: '\uE8F7', name: 'SaveAs2' },
    { code: '\uE8F8', name: 'Light2' },
    { code: '\uE8F9', name: 'Effects2' },
    { code: '\uE8FA', name: 'Microphone3' },
    { code: '\uE8FB', name: 'Feedback2' },
    { code: '\uE8FC', name: 'Subtitles2' },
    { code: '\uE8FD', name: 'SubtitlesAudio2' },
    { code: '\uE8FE', name: 'OpenFolderHorizontal2' },
    { code: '\uE8FF', name: 'CalendarDay2' },
  ];

  const iconCard = (glyph, name, font) => `
    <div class="icon-card group relative flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer transition-colors border border-transparent hover:border-gray-600"
         title="${esc(name)} (${esc(font)})"
         onclick="navigator.clipboard.writeText('${esc(glyph)}').then(()=>{ const t=this.querySelector('.icon-copied'); if(t){t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1000);} })">
      <span class="text-2xl leading-none" style="font-family:'${esc(font)}',sans-serif">${glyph}</span>
      <span class="text-[9px] text-gray-500 text-center leading-tight w-full truncate px-0.5">${esc(name)}</span>
      <span class="icon-copied hidden absolute inset-0 flex items-center justify-center bg-blue-600 bg-opacity-90 rounded-lg text-white text-[10px] font-semibold">Copied!</span>
    </div>
  `;

  return `
    <div class="p-4 overflow-y-auto h-full space-y-6">

      <div class="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 flex items-center gap-2">
        <span style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE82F;</span>
        Click any icon to copy it to clipboard. Segoe MDL2 Assets is built into Windows 10/11 — no external libraries needed.
      </div>

      <!-- Segoe MDL2 Assets -->
      <section>
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Segoe MDL2 Assets
          <span class="ml-2 text-gray-600 font-normal normal-case">${mdl2Icons.length} icons · Windows 10/11 built-in</span>
        </h2>
        <div class="grid gap-1" style="grid-template-columns: repeat(auto-fill, minmax(72px, 1fr))">
          ${mdl2Icons.map(i => iconCard(i.code, i.name, 'Segoe MDL2 Assets')).join('')}
        </div>
      </section>

    </div>
  `;
}

// ─── Rule Editor Dialog ───────────────────────────────────────────────────────
function renderRuleEditorOverlay() {
  const rule = state.editingRule;
  const isNew = !rule.id;
  const conditions = rule.conditions && rule.conditions.length > 0
    ? rule.conditions
    : [{ field: 'url', operator: 'contains', value: '' }];
  const conditionLogic = rule.conditionLogic || 'all';

  return `
    <div class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 flex flex-col max-h-[90vh]">

        <!-- Header -->
        <div class="px-5 pt-5 pb-3 border-b border-gray-700">
          <h2 class="text-base font-semibold text-gray-100">${isNew ? 'New Rule' : 'Edit Rule'}</h2>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          <!-- Title -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1">Title</label>
            <input id="rule-name" type="text" placeholder="Title"
              value="${esc(rule.name || '')}"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500">
          </div>

          <!-- Condition Builder -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium text-gray-400">Use this rule when:</span>
            </div>

            <!-- Logic selector row -->
            <div class="flex items-center gap-2 mb-3">
              <select id="condition-logic" class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="all" ${conditionLogic === 'all' ? 'selected' : ''}>All</option>
                <option value="any" ${conditionLogic === 'any' ? 'selected' : ''}>Any</option>
              </select>
              <span class="text-sm text-gray-400">of the following are true</span>
              <div class="flex-1"></div>
              <button id="btn-add-condition"
                class="w-6 h-6 flex items-center justify-center bg-gray-600 hover:bg-gray-500 text-gray-200 rounded text-sm font-bold transition-colors" title="Add condition">+</button>
            </div>

            <!-- Condition rows -->
            <div id="conditions-list" class="space-y-2">
              ${conditions.map((c, i) => renderConditionRow(c, i, conditions.length)).join('')}
            </div>
          </div>

          <!-- Action -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-2">Open in browser:</label>
            <div class="bg-gray-750 border border-gray-600 rounded-lg p-3 space-y-3" style="background:#2d3748">
              <div class="flex gap-2">
                <select id="rule-browser" class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                  <option value="">— Select browser —</option>
                  ${state.activeBrowsers.map(b => `
                    <option value="${esc(b.name)}" data-path="${esc(b.path)}"
                      ${rule.browser === b.name ? 'selected' : ''}>${esc(b.name)}</option>
                  `).join('')}
                </select>
                <select id="rule-profile" class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                  ${renderProfileOptions(rule.browser, rule.profile)}
                </select>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-gray-700 flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer flex-1">
            <input type="checkbox" id="rule-enabled" class="accent-blue-500 w-4 h-4" ${rule.enabled !== false ? 'checked' : ''}>
            <span class="text-sm text-gray-300">Enable this rule</span>
          </label>
          <button id="btn-rule-cancel"
            class="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
            Cancel
          </button>
          <button id="btn-rule-save"
            class="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
            OK
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderConditionRow(condition, index, total) {
  return `
    <div class="condition-row flex items-center gap-2" data-condition-index="${index}">
      <span class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-400 select-none">URL</span>
      <span class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-400 select-none">contains</span>
      <input type="text" class="cond-value flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        placeholder="value" value="${esc(condition.value || '')}">
      <button class="btn-remove-condition w-6 h-6 flex items-center justify-center bg-gray-600 hover:bg-red-700 text-gray-300 hover:text-white rounded text-sm font-bold transition-colors flex-shrink-0"
        data-condition-index="${index}" title="Remove condition">−</button>
      <button class="btn-add-condition-inline w-6 h-6 flex items-center justify-center bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white rounded text-sm font-bold transition-colors flex-shrink-0"
        data-condition-index="${index}" title="Add condition">+</button>
    </div>
  `;
}

// ─── Settings Event Listeners ─────────────────────────────────────────────────
function attachListeners() {
  // Title bar window controls
  document.getElementById('btn-titlebar-minimize')?.addEventListener('click', () => {
    Runtime.WindowMinimise();
  });
  document.getElementById('btn-titlebar-maximize')?.addEventListener('click', () => {
    Runtime.WindowToggleMaximise();
  });
  document.getElementById('btn-titlebar-close')?.addEventListener('click', () => {
    Runtime.Quit();
  });

  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });

  // ── General tab ──
  const btnRefreshDefaultStatus = document.getElementById('btn-refresh-default-status');
  if (btnRefreshDefaultStatus) btnRefreshDefaultStatus.addEventListener('click', async () => {
    const btn = btnRefreshDefaultStatus;
    btn.style.transition = 'transform 0.4s';
    btn.style.transform = 'rotate(360deg)';
    setTimeout(() => { btn.style.transition = ''; btn.style.transform = ''; }, 400);
    try {
      state.appStatus = await App.GetAppStatus();
      render();
    } catch (e) { showToast('Could not check status', 'error'); }
  });

  const btnSetDefault = document.getElementById('btn-set-default');
  if (btnSetDefault) btnSetDefault.addEventListener('click', async () => {
    try { await App.OpenDefaultAppsSettings(); } catch (e) { showToast('Could not open settings', 'error'); }
  });

  const selDefaultBrowser = document.getElementById('sel-default-browser');
  if (selDefaultBrowser) selDefaultBrowser.addEventListener('change', () => {
    const profileRow = document.getElementById('default-profile-row');
    const selProfile = document.getElementById('sel-default-profile');
    if (selDefaultBrowser.value) {
      profileRow.classList.remove('invisible');
      selProfile.innerHTML = renderProfileOptions(selDefaultBrowser.value, '');
    } else {
      profileRow.classList.add('invisible');
    }
  });

  // Auto-save general settings on any change
  async function saveGeneralSettings() {
    const browser = document.getElementById('sel-default-browser')?.value || '';
    const profile = document.getElementById('sel-default-profile')?.value || '';
    const fallback = document.querySelector('input[name="fallback"]:checked')?.value || 'picker';
    try {
      await App.SaveSettings(browser, profile, fallback);
      state.config.defaultBrowser = browser;
      state.config.defaultProfile = profile;
      state.config.fallbackBehavior = fallback;
    } catch (e) { showToast('Save failed: ' + e, 'error'); }
  }

  if (selDefaultBrowser) selDefaultBrowser.addEventListener('change', saveGeneralSettings);
  document.getElementById('sel-default-profile')?.addEventListener('change', saveGeneralSettings);
  document.querySelectorAll('input[name="fallback"]').forEach(r => r.addEventListener('change', saveGeneralSettings));

  // ── Browsers tab ──
  const btnRefreshBrowsers = document.getElementById('btn-refresh-browsers');
  if (btnRefreshBrowsers) btnRefreshBrowsers.addEventListener('click', async () => {
    try {
      state.browsers = await App.RefreshBrowsers();
      state.activeBrowsers = state.browsers.filter(b => !b.archived);
      render();
      showToast('Browser list refreshed', 'info');
    }
    catch (e) { showToast('Refresh failed', 'error'); }
  });

  document.querySelectorAll('.btn-set-default-browser').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.browserIndex);
      const browser = state.browsers[index];
      if (!browser) return;
      try {
        await App.SaveSettings(browser.name, state.config.defaultProfile || '', state.config.fallbackBehavior || 'picker');
        state.config.defaultBrowser = browser.name;
        render();
        showToast(`${browser.name} set as primary`, 'success');
      } catch (err) {
        showToast('Failed to set primary browser', 'error');
      }
    });
  });

  // Browser row click → select
  document.querySelectorAll('.browser-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-set-default-browser') ||
          e.target.closest('.btn-archive-browser') ||
          e.target.closest('.btn-unarchive-browser')) return;
      state.selectedBrowserPath = row.dataset.browserPath || null;
      document.querySelectorAll('.browser-row').forEach(r => {
        r.classList.remove('bg-blue-900', 'hover:bg-blue-800');
        r.classList.add('hover:bg-gray-800');
      });
      row.classList.add('bg-blue-900', 'hover:bg-blue-800');
      row.classList.remove('hover:bg-gray-800');
    });
  });

  // Archive browser (hide from picker and rules)
  document.querySelectorAll('.btn-archive-browser').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.browserPath;
      const browser = state.browsers.find(b => b.path && b.path.toLowerCase() === path.toLowerCase());
      if (!browser) return;

      // Check if this is the current primary browser
      const isPrimary = state.config.defaultBrowser === browser.name;

      try {
        await App.ArchiveBrowser(path);
        state.browsers = await App.GetBrowsers();
        state.activeBrowsers = state.browsers.filter(b => !b.archived);

        if (isPrimary) {
          // Clear the primary browser since it's now archived
          state.config.defaultBrowser = '';
          state.config.defaultProfile = '';
          await App.SaveSettings('', '', state.config.fallbackBehavior || 'default').catch(() => {});

          // Switch to General tab so user can pick a new primary
          state.tab = 'general';
          render();
          showToast(`${browser.name} was your primary browser — please select a new one.`, 'info');
        } else {
          render();
          showToast(`${browser.name} archived`, 'info');
        }
      } catch (e) { showToast('Failed to archive browser: ' + e, 'error'); }
    });
  });

  // Unarchive browser (restore to picker and rules)
  document.querySelectorAll('.btn-unarchive-browser').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.browserPath;
      const browser = state.browsers.find(b => b.path && b.path.toLowerCase() === path.toLowerCase());
      if (!browser) return;
      try {
        await App.UnarchiveBrowser(path);
        state.browsers = await App.GetBrowsers();
        state.activeBrowsers = state.browsers.filter(b => !b.archived);
        render();
        showToast(`${browser.name} restored`, 'success');
      } catch (e) { showToast('Failed to restore browser: ' + e, 'error'); }
    });
  });

  // ── Rules tab ──
  const btnAddRule = document.getElementById('btn-add-rule');
  if (btnAddRule) btnAddRule.addEventListener('click', () => {
    state.editingRule = {
      id: '', name: '', conditions: [{ field: 'url', operator: 'contains', value: '' }],
      conditionLogic: 'all', browser: '', browserPath: '', profile: '', profileName: '',
      enabled: true, priority: state.rules.length + 1,
    };
    render();
  });

  const btnDeleteRule = document.getElementById('btn-delete-rule');
  if (btnDeleteRule) btnDeleteRule.addEventListener('click', async () => {
    const selected = document.querySelector('.rule-row.selected');
    if (!selected) { showToast('Select a rule first', 'info'); return; }
    const id = selected.dataset.ruleId;
    if (!confirm('Delete this rule?')) return;
    try {
      await App.DeleteRule(id);
      state.rules = (await App.GetRules()) || [];
      state.validations = (await App.ValidateRules().catch(() => [])) || [];
      render();
      showToast('Rule deleted', 'success');
    } catch (e) { showToast('Delete failed: ' + e, 'error'); }
  });

  // Per-row edit buttons
  document.querySelectorAll('.btn-edit-rule-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.ruleIndex);
      state.editingRule = JSON.parse(JSON.stringify(state.rules[index]));
      render();
    });
  });

  // Per-row delete buttons
  document.querySelectorAll('.btn-delete-rule-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.ruleId;
      if (!id) return;
      if (!confirm('Delete this rule?')) return;
      try {
        await App.DeleteRule(id);
        state.rules = (await App.GetRules()) || [];
        state.validations = (await App.ValidateRules().catch(() => [])) || [];
        render();
        showToast('Rule deleted', 'success');
      } catch (e) { showToast('Delete failed: ' + e, 'error'); }
    });
  });

  // Rule row click → select / double-click → edit
  document.querySelectorAll('.rule-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle') || e.target.closest('.btn-edit-rule-item') || e.target.closest('.btn-delete-rule-item')) return;
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('selected', 'bg-blue-900'));
      row.classList.add('selected', 'bg-blue-900');
    });
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('.toggle') || e.target.closest('.btn-edit-rule-item') || e.target.closest('.btn-delete-rule-item')) return;
      const index = parseInt(row.dataset.ruleIndex);
      state.editingRule = JSON.parse(JSON.stringify(state.rules[index]));
      render();
    });
  });

  // Rule enable/disable toggles
  document.querySelectorAll('.rule-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const id = toggle.dataset.ruleId;
      const rule = state.rules.find(r => r.id === id);
      if (!rule) return;
      rule.enabled = toggle.checked;
      try {
        await App.SaveRule(rule);
        state.validations = await App.ValidateRules().catch(() => []);
      } catch (err) {
        rule.enabled = !toggle.checked;
        showToast('Failed to update rule', 'error');
        render();
      }
    });
  });

  // Drag-to-reorder rules
  attachDragListeners();

  // ── Rule Editor ──
  attachRuleEditorListeners();

}

// ─── Rule Editor Listeners ────────────────────────────────────────────────────
function attachRuleEditorListeners() {
  const overlay = document.querySelector('.fixed.inset-0');
  if (!overlay) return;

  document.getElementById('btn-rule-cancel')?.addEventListener('click', () => {
    state.editingRule = null;
    render();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { state.editingRule = null; render(); }
  });

  // Browser change → update profile dropdown
  const ruleBrowser = document.getElementById('rule-browser');
  if (ruleBrowser) ruleBrowser.addEventListener('change', () => {
    const profileSel = document.getElementById('rule-profile');
    profileSel.innerHTML = renderProfileOptions(ruleBrowser.value, '');
  });

  // Add condition (top + button)
  document.getElementById('btn-add-condition')?.addEventListener('click', () => {
    const conditions = collectConditions();
    conditions.push({ field: 'url', operator: 'contains', value: '' });
    state.editingRule.conditions = conditions;
    state.editingRule.conditionLogic = document.getElementById('condition-logic')?.value || 'all';
    state.editingRule.name = document.getElementById('rule-name')?.value || '';
    state.editingRule.browser = document.getElementById('rule-browser')?.value || '';
    state.editingRule.profile = document.getElementById('rule-profile')?.value || '';
    state.editingRule.enabled = document.getElementById('rule-enabled')?.checked !== false;
    render();
  });

  // Add/remove condition inline buttons
  document.querySelectorAll('.btn-remove-condition').forEach(btn => {
    btn.addEventListener('click', () => {
      const conditions = collectConditions();
      const idx = parseInt(btn.dataset.conditionIndex);
      if (conditions.length <= 1) { showToast('At least one condition is required', 'info'); return; }
      conditions.splice(idx, 1);
      state.editingRule.conditions = conditions;
      state.editingRule.conditionLogic = document.getElementById('condition-logic')?.value || 'all';
      state.editingRule.name = document.getElementById('rule-name')?.value || '';
      state.editingRule.browser = document.getElementById('rule-browser')?.value || '';
      state.editingRule.profile = document.getElementById('rule-profile')?.value || '';
      state.editingRule.enabled = document.getElementById('rule-enabled')?.checked !== false;
      render();
    });
  });

  document.querySelectorAll('.btn-add-condition-inline').forEach(btn => {
    btn.addEventListener('click', () => {
      const conditions = collectConditions();
      const idx = parseInt(btn.dataset.conditionIndex);
      conditions.splice(idx + 1, 0, { field: 'url', operator: 'contains', value: '' });
      state.editingRule.conditions = conditions;
      state.editingRule.conditionLogic = document.getElementById('condition-logic')?.value || 'all';
      state.editingRule.name = document.getElementById('rule-name')?.value || '';
      state.editingRule.browser = document.getElementById('rule-browser')?.value || '';
      state.editingRule.profile = document.getElementById('rule-profile')?.value || '';
      state.editingRule.enabled = document.getElementById('rule-enabled')?.checked !== false;
      render();
    });
  });

  // Save rule
  document.getElementById('btn-rule-save')?.addEventListener('click', async () => {
    const name = document.getElementById('rule-name')?.value?.trim();
    if (!name) { showToast('Please enter a rule title', 'error'); return; }

    const conditions = collectConditions();
    if (conditions.length === 0 || conditions.some(c => !c.value.trim())) {
      showToast('All conditions must have a value', 'error'); return;
    }

    const browserSel = document.getElementById('rule-browser');
    const browserName = browserSel?.value;
    if (!browserName) { showToast('Please select a browser', 'error'); return; }

    const browserOpt = browserSel.options[browserSel.selectedIndex];
    const browserPath = browserOpt?.dataset?.path || '';
    const profileSel = document.getElementById('rule-profile');
    const profileId = profileSel?.value || '';
    const profileName = profileSel?.options[profileSel.selectedIndex]?.text || '';

    const rule = {
      ...state.editingRule,
      name,
      conditions,
      conditionLogic: document.getElementById('condition-logic')?.value || 'all',
      browser: browserName,
      browserPath,
      profile: profileId,
      profileName,
      enabled: document.getElementById('rule-enabled')?.checked !== false,
      pattern: '',
      matchType: '',
    };

    try {
      await App.SaveRule(rule);
      state.rules = (await App.GetRules()) || [];
      state.validations = await App.ValidateRules().catch(() => []);
      state.editingRule = null;
      render();
      showToast(rule.id ? 'Rule updated' : 'Rule created', 'success');
    } catch (e) {
      showToast('Save failed: ' + e, 'error');
    }
  });
}

// Collect current condition values from the DOM
function collectConditions() {
  const rows = document.querySelectorAll('.condition-row');
  return Array.from(rows).map(row => ({
    field:    'url',
    operator: 'contains',
    value:    row.querySelector('.cond-value')?.value    || '',
  }));
}

// ─── Drag-to-Reorder ──────────────────────────────────────────────────────────
function attachDragListeners() {
  const rows = document.querySelectorAll('.rule-row');
  rows.forEach(row => {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', (e) => {
      state.dragSrcIndex = parseInt(row.dataset.ruleIndex);
      row.classList.add('opacity-50');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('opacity-50');
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('border-t-2', 'border-blue-400'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('border-t-2', 'border-blue-400'));
      row.classList.add('border-t-2', 'border-blue-400');
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const destIndex = parseInt(row.dataset.ruleIndex);
      if (state.dragSrcIndex === null || state.dragSrcIndex === destIndex) return;

      const reordered = [...state.rules];
      const [moved] = reordered.splice(state.dragSrcIndex, 1);
      reordered.splice(destIndex, 0, moved);
      state.rules = reordered;
      state.dragSrcIndex = null;

      try {
        await App.ReorderRules(reordered.map(r => r.id));
        state.rules = await App.GetRules();
      } catch (e) {
        showToast('Reorder failed', 'error');
      }
      render();
    });
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.querySelector('.js-toast');
  if (existing) existing.remove();

  const typeClasses = {
    success: 'bg-green-100 text-green-800 border border-green-300',
    error:   'bg-red-100 text-red-800 border border-red-300',
    info:    'bg-blue-100 text-blue-800 border border-blue-300',
  };

  const toast = document.createElement('div');
  toast.className = [
    'js-toast',
    'fixed bottom-4 right-4 z-[9999]',
    'px-5 py-3 rounded-lg text-sm font-medium',
    'shadow-[0_4px_12px_rgba(0,0,0,0.15)]',
    'fade-in',
    typeClasses[type] || typeClasses.info,
  ].join(' ');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBrowserSvgUrl(browser) {
  const name = (browser.name || '').toLowerCase();
  if (name.includes('chrome'))  return svgChrome;
  if (name.includes('edge'))    return svgEdge;
  if (name.includes('firefox')) return svgFirefox;
  if (name.includes('brave'))   return svgBrave;
  if (name.includes('opera'))   return svgOpera;
  if (name.includes('tor'))     return svgTor;
  return svgBrowser; // Generic fallback
}

function getBrowserEmoji(browser, size) {
  const url = getBrowserSvgUrl(browser);
  const px = size || '1.5em';
  return `<img src="${url}" alt="${esc(browser.name || 'browser')}" style="width:${px};height:${px};display:inline-block;vertical-align:middle;" draggable="false">`;
}

// Shorten browser name for display in picker cards
function shortBrowserName(name) {
  if (!name) return '';
  // Remove common suffixes
  return name
    .replace(/\s*(Browser|Web Browser)\s*$/i, '')
    .replace(/^Microsoft\s+/i, '')
    .replace(/^Google\s+/i, '')
    .trim();
}

// Truncate a URL for display
function truncateURL(url, maxLen) {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 1) + '…';
}

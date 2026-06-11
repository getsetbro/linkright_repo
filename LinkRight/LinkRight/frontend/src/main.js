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
import appIcon    from '../../build/appicon.png?url';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  // Mode
  mode: 'settings',        // 'settings' | 'picker'

  // Settings UI
  tab: 'general',          // 'general' | 'browsers' | 'rules' | 'apps'
  browsers: [],            // all browsers (active + excluded), used in Browsers tab
  activeBrowsers: [],      // non-excluded browsers only, used in General tab + Rule editor
  rules: [],
  config: {},
  appStatus: {},
  appRedirects: [],        // app redirect configurations
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
        try { Runtime.WindowSetTitle('Linker'); } catch (_) {}

        try {
          // Process the URL — if a rule matches and browser launches, window closes
          const url = await App.GetCurrentURL();
          const result = await App.ProcessURL(url);

          if (result === 'launched') {
            // Browser launched successfully — close without ever showing the window
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

          // Now that we know the picker is needed, show the window
          try { Runtime.WindowCenter(); } catch (_) {}
          try { Runtime.WindowShow(); } catch (_) {}

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
          // Ensure the window is visible even on error
          try { Runtime.WindowCenter(); } catch (_) {}
          try { Runtime.WindowShow(); } catch (_) {}
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
        state.activeBrowsers = (browsers || []).filter(b => !b.archived && !b.unsupported);
        state.rules = rules || [];
        state.config = config || {};
        state.appStatus = appStatus || {};
        state.validations = await App.ValidateRules().catch(() => []);
        state.appRedirects = await App.GetAppRedirects().catch(() => []);

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
    // Enter opens the selected browser (but not if focus is on a button/select)
    if (e.key === 'Enter' && !e.target.closest('button, select, input')) {
      openWithSelected();
      return;
    }
    // Arrow key navigation within the browser grid
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && state.pickerData) {
      e.preventDefault();
      const total = state.pickerData.browsers.length;
      if (total === 0) return;

      // Determine columns from the grid layout
      const grid = document.querySelector('.picker-root .grid');
      const cols = grid ? Math.round(grid.offsetWidth / grid.querySelector('.picker-browser-card')?.offsetWidth) || 1 : 5;

      let newIdx = state.selectedBrowserIndex;
      switch (e.key) {
        case 'ArrowRight': newIdx = Math.min(total - 1, newIdx + 1); break;
        case 'ArrowLeft':  newIdx = Math.max(0, newIdx - 1); break;
        case 'ArrowDown':  newIdx = Math.min(total - 1, newIdx + cols); break;
        case 'ArrowUp':    newIdx = Math.max(0, newIdx - cols); break;
      }
      if (newIdx !== state.selectedBrowserIndex) {
        selectBrowser(newIdx);
      }
      return;
    }
    // Space selects/confirms the focused card
    if (e.key === ' ' && document.activeElement?.classList.contains('picker-browser-card')) {
      e.preventDefault();
      const idx = parseInt(document.activeElement.dataset.browserIndex);
      if (!isNaN(idx)) selectBrowser(idx);
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
      <div class="flex items-center justify-center h-screen bg-app-vignette text-text-secondary text-sm">
        Loading…
      </div>`;
    return;
  }

  const showNames = settings.showBrowserNames !== false;
  const showURL = settings.showURL !== false;

  const browsers = data.browsers || [];
  const selectedBrowser = browsers[state.selectedBrowserIndex] || null;

  document.getElementById('app').innerHTML = `
    <div class="picker-root flex flex-col h-screen bg-app-vignette text-text-primary select-none overflow-hidden">

      <!-- Frameless title bar / drag region -->
      <div class="flex items-center h-8 bg-surface select-none flex-shrink-0 rounded-t-xl"
           style="--wails-draggable: drag">
        <span class="flex-1 pl-3 text-xs text-text-muted">Open with…</span>
        <button id="btn-picker-close"
          class="w-9 h-8 flex items-center justify-center text-text-muted hover:text-white hover:bg-red-600 rounded-tr-xl transition-colors text-sm leading-none"
          style="--wails-draggable: no-drag"
          title="Close">&#x2715;</button>
      </div>

      <!-- Header: URL display -->
      ${showURL ? `
      <div class="px-4 pt-2 pb-2">
        <div class="break-all text-xs text-text-secondary bg-surface px-3 py-1.5 rounded-md border border-border max-h-[52px] overflow-y-auto font-mono">${esc(truncateURL(data.url, 80))}</div>
      </div>
      ` : `
      <div class="px-4 pt-4 pb-2">
        <div class="text-sm font-medium text-text-primary">Open with…</div>
      </div>
      `}

      ${data.warning ? `
      <div class="mx-4 mb-2 px-3 py-2 bg-yellow-900 border border-yellow-700 rounded-lg text-xs text-yellow-200">
        ⚠ ${esc(data.warning)}
      </div>
      ` : ''}

      <!-- Browser grid -->
      <div class="flex-1 px-4 py-2">
        <div class="grid gap-2.5 py-1" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));">
          ${browsers.map((b, i) => renderPickerBrowserCard(b, i, showNames)).join('')}
        </div>
      </div>

      <!-- Profile selector (shown when selected browser is Chromium-based and has multiple profiles) -->
      ${selectedBrowser && selectedBrowser.type === 'chromium' && selectedBrowser.profiles && selectedBrowser.profiles.length > 1 ? `
      <div class="px-4 pb-2 flex items-center gap-2">
        <label for="picker-profile" class="text-xs font-medium text-text-secondary whitespace-nowrap">Profile</label>
        <select id="picker-profile" class="flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
          ${selectedBrowser.profiles.map(p => `
            <option value="${esc(p.id)}" ${state.selectedProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>
          `).join('')}
        </select>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="px-4 pb-4 pt-2 border-t border-border space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="picker-always-use" class="accent-accent w-4 h-4" ${state.alwaysUse ? 'checked' : ''}>
          <span class="text-xs text-text-secondary">Make this a rule</span>
        </label>
        <div class="text-[0.65rem] text-text-muted leading-relaxed">
          💡 Tip: To skip this picker and always use your primary browser, <a id="picker-tip-settings" href="#" class="text-accent-light hover:underline">open Settings → General</a> and set Fallback to "Use primary browser".
        </div>
        <div class="flex gap-2">
          <button id="btn-picker-cancel"
            class="flex-1 py-2 text-sm text-text-secondary hover:text-text-primary bg-surface hover:bg-surface-raised rounded-lg transition-colors border border-border">
            Cancel
          </button>
          <button id="btn-picker-open"
            class="flex-1 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-glow rounded-lg transition-colors ${!selectedBrowser ? 'opacity-50 cursor-not-allowed' : ''}">
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
  const icon = getBrowserEmoji(browser, '28px');
  const num = index + 1;

  const baseCard = `picker-browser-card relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer select-none transition-all duration-150 pt-2 px-2 pb-1.5 min-h-[76px]`;
  const stateCard = isSelected
    ? 'bg-accent-muted border-accent shadow-glow-sm'
    : 'bg-surface border-transparent hover:bg-surface-raised hover:border-border hover:-translate-y-px';
  const focusRing = 'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-transparent';

  const numColor = isSelected ? 'text-accent-light' : 'text-text-muted';
  const nameColor = isSelected ? 'text-accent-light' : 'text-text-secondary';

  return `
    <div class="${baseCard} ${stateCard} ${focusRing}"
         data-browser-index="${index}"
         tabindex="0"
         role="button"
         aria-pressed="${isSelected}"
         aria-label="${esc(browser.name)}"
         title="${esc(browser.name)}">
      <div class="absolute top-1 left-1.5 text-[0.65rem] font-semibold leading-none ${numColor}">${num <= 9 ? num : ''}</div>
      <div class="leading-none mb-1">${icon}</div>
      ${showNames ? `<div class="text-[0.65rem] ${nameColor} text-center w-full leading-tight line-clamp-2">${esc(browser.name)}</div>` : ''}
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

  // Tip link → open Settings window to General tab
  document.getElementById('picker-tip-settings')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await App.OpenSettings();
    } catch (err) {
      console.warn('Could not open settings:', err);
    }
  });

  // Open button
  document.getElementById('btn-picker-open')?.addEventListener('click', openWithSelected);

  // Cancel button
  document.getElementById('btn-picker-cancel')?.addEventListener('click', cancelPicker);

  // Focus the selected browser card for keyboard users
  const selectedCard = document.querySelector(`.picker-browser-card[data-browser-index="${state.selectedBrowserIndex}"]`);
  if (selectedCard) selectedCard.focus();
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
    <div class="flex flex-col h-screen bg-app-vignette text-text-primary select-none">
      ${renderTitleBar()}
      ${renderTabs()}
      <div class="flex-1 overflow-hidden">
        ${state.tab === 'general'  ? renderGeneral()  : ''}
        ${state.tab === 'browsers' ? renderBrowsers() : ''}
        ${state.tab === 'rules'    ? renderRules()    : ''}
        ${state.tab === 'apps'     ? renderApps()     : ''}
        ${state.tab === 'info'     ? renderInfo()     : ''}
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
      <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border flex flex-col items-center text-center px-8 py-8 gap-5 fade-in">
        <div class="text-5xl leading-none" style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE71B;</div>
        <div>
          <h1 class="text-lg font-bold text-text-primary mb-1">Welcome to Link Right</h1>
          <p class="text-sm text-text-secondary leading-relaxed">
            Link Right is registered as a browser.<br>
            To intercept all links, set it as your <strong class="text-text-primary">Windows default browser</strong>.
          </p>
        </div>
        <ol class="text-left text-xs text-text-secondary space-y-1.5 w-full bg-app-bg rounded-lg px-4 py-3">
          <li class="flex items-start gap-2"><span class="text-accent-light font-bold mt-px">1.</span><span>Click <strong class="text-text-primary">Set as Default…</strong> below</span></li>
          <li class="flex items-start gap-2"><span class="text-accent-light font-bold mt-px">2.</span><span>Find <strong class="text-text-primary">Link Right</strong> in the browser list</span></li>
          <li class="flex items-start gap-2"><span class="text-accent-light font-bold mt-px">3.</span><span>Click it to set as default — done!</span></li>
        </ol>
        <div class="flex flex-col gap-2 w-full">
          <button id="btn-firstrun-set-default"
            class="w-full py-2.5 text-sm font-semibold text-white bg-accent hover:bg-accent-glow rounded-lg transition-colors">
            Set as Default…
          </button>
          <button id="btn-firstrun-dismiss"
            class="w-full py-2 text-xs text-text-muted hover:text-text-primary transition-colors">
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
    <div class="flex items-center h-9 border-b border-border select-none rounded-t-xl"
         style="--wails-draggable: drag">
      <img src="${appIcon}" alt="Link Right" class="w-5 h-5 ml-2.5" draggable="false">
      <span class="flex-1 pl-2 text-sm font-semibold text-text-primary tracking-wide">Link Right</span>
      <button id="btn-titlebar-minimize"
        class="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors text-base leading-none"
        style="--wails-draggable: no-drag"
        title="Minimize">&#x2014;</button>
      <button id="btn-titlebar-maximize"
        class="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors leading-none"
        style="--wails-draggable: no-drag; font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.8rem;"
        title="Maximize / Restore">&#xE922;</button>
      <button id="btn-titlebar-close"
        class="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-white hover:bg-red-600 rounded-tr-xl transition-colors text-base leading-none"
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
    { id: 'apps',     label: 'Apps',     icon: '\uE71D' }, // AllApps
    { id: 'info',     label: 'Info',     icon: '\uE946' }, // Info
  ];
  return `
    <div class="flex justify-around gap-1 py-2 border-b border-border bg-surface overflow-x-hidden">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="flex flex-col items-center gap-0.5 px-3 py-1 rounded text-xs transition-colors min-w-0
          ${state.tab === t.id
            ? 'text-accent-light border-b-2 border-accent-light'
            : 'text-text-secondary hover:text-text-primary'}"
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
        <h2 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Default Browser Status</h2>
        <div class="bg-surface rounded-lg p-4 space-y-3">
          <div class="text-xs">
            To work Link Right must be set as the <strong class="text-text-secondary">Windows Default Browser</strong> to intercept and route links.
          </div>
          <div class="flex items-center gap-3">
            ${!s.isDefaultBrowser
              ? `<button id="btn-set-default" class="px-3 py-1.5 text-xs bg-accent hover:bg-accent-glow text-white rounded transition-colors">Set as Default…</button>`
              : `<span class="text-xs text-green-400 font-medium">✓ Active</span>`
            }
            <div class="text-xs text-text-secondary">${s.isDefaultBrowser ? 'Link Right is the Windows default' : 'Not set as default'}</div>
            <button id="btn-refresh-default-status" title="Check default browser status"
              class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors">
              <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE72C;</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Fallback Behavior</h2>
        <div class="bg-surface rounded-lg p-4">
          <div class="text-xs text-text-secondary mb-3">When no rule matches a link:</div>
          <div class="flex gap-3">
            <label class="fallback-option flex-1 flex items-start gap-3 cursor-pointer rounded-lg p-3 border-2 border-border transition-colors">
              <input type="radio" name="fallback" value="picker"
                ${(c.fallbackBehavior || 'default') === 'picker' || state.activeBrowsers.length === 0 ? 'checked' : ''}>
              <div>
                <div class="text-sm text-text-primary font-medium">Show browser picker</div>
                <div class="text-xs text-text-secondary mt-0.5">Ask which browser to use each time</div>
              </div>
            </label>
            <label class="fallback-option flex-1 flex items-start gap-3 ${state.activeBrowsers.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} rounded-lg p-3 border-2 border-border transition-colors">
              <input type="radio" name="fallback" value="default"
                ${state.activeBrowsers.length === 0 ? 'disabled' : ''}
                ${(c.fallbackBehavior || 'default') === 'default' && state.activeBrowsers.length > 0 ? 'checked' : ''}>
              <div>
                <div class="text-sm text-text-primary font-medium">Use primary browser</div>
                ${state.activeBrowsers.length === 0 ? '<div class="text-xs text-text-muted mt-0.5">No browsers available</div>' : ''}
              </div>
            </label>
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Primary Browser &plus; Profile</h2>
        <div class="bg-surface rounded-lg p-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-text-secondary block mb-1">Browser</label>
              <select id="sel-default-browser" class="w-full bg-surface-raised border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                ${state.activeBrowsers.map(b => `
                  <option value="${esc(b.name)}" ${(c.defaultBrowser === b.name || (!c.defaultBrowser && b === state.activeBrowsers[0])) ? 'selected' : ''}>${esc(b.name)}</option>
                `).join('')}
              </select>
            </div>
            <div id="default-profile-row" class="flex-1">
              <label class="text-xs text-text-secondary block mb-1">Profile</label>
              <select id="sel-default-profile" class="w-full bg-surface-raised border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent${!browserSupportsProfiles(c.defaultBrowser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '') ? ' opacity-50 cursor-not-allowed' : ''}"
                ${!browserSupportsProfiles(c.defaultBrowser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '') ? 'disabled' : ''}>
                ${renderProfileOptions(c.defaultBrowser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '', c.defaultProfile)}
              </select>
            </div>
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

// Check if a browser supports profiles (must be Chromium-based AND have profiles detected)
function browserSupportsProfiles(browserName) {
  const browser = (state.activeBrowsers || []).find(b => b.name === browserName);
  return browser && browser.type === 'chromium' && browser.profiles && browser.profiles.length > 0;
}

// ─── Browsers Tab ─────────────────────────────────────────────────────────────
function renderBrowsers() {
  return `
    <div class="flex flex-col h-full">
      <div class="border-b border-border px-4 py-2 flex items-center gap-3 bg-surface">
        <button id="btn-refresh-browsers" title="Refresh browser list"
          class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors">
          <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE72C;</span>
          <span>Refresh</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        ${state.browsers.length === 0
          ? `<div class="flex items-center justify-center h-32 text-text-muted text-sm">No browsers detected</div>`
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
  const isUnsupported = !!browser.unsupported;

  const rowBase = `browser-row flex items-center gap-3 px-4 py-2.5 border-b border-border transition-colors`;
  const rowState = isUnsupported
    ? 'opacity-60 cursor-default'
    : isArchived
      ? 'opacity-50 hover:opacity-70 hover:bg-surface cursor-pointer'
      : (isSelected ? 'bg-accent-muted hover:bg-accent-muted cursor-pointer' : 'hover:bg-surface cursor-pointer');

  return `
    <div class="${rowBase} ${rowState}"
         data-browser-index="${index}" data-browser-path="${esc(browser.path)}">
      <span class="leading-none flex-shrink-0 ${isArchived || isUnsupported ? 'grayscale' : ''}">${icon}</span>
      <div class="flex-1 min-w-0">
        <span class="text-sm ${isUnsupported ? 'text-text-muted' : isArchived ? 'text-text-muted line-through' : 'text-text-primary'}">${esc(browser.name)}</span>
        ${isUnsupported ? `<div class="text-[0.65rem] text-yellow-400 mt-0.5 leading-tight">${esc(browser.unsupportedReason || 'This browser is not supported')}</div>` : ''}
      </div>
      ${isDefault && !isUnsupported ? `<span class="text-xs text-accent-light font-medium px-2 py-0.5 rounded border border-accent-muted bg-accent-muted">Primary</span>` : ''}
      ${isUnsupported
        ? `<span class="text-[0.65rem] text-yellow-400 font-medium px-2 py-0.5 rounded border border-yellow-700 bg-yellow-900 flex-shrink-0">Unsupported</span>`
        : `<label class="toggle flex-shrink-0" title="${isArchived ? 'Include' : 'Exclude'} this browser">
            <input type="checkbox" class="browser-include-toggle" data-browser-path="${esc(browser.path)}" ${!isArchived ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>`
      }
    </div>
  `;
}


// ─── Rules Tab ────────────────────────────────────────────────────────────────
function renderRules() {
  return `
    <div class="flex flex-col h-full">
      <div class="border-b border-border px-4 py-2 flex items-center justify-between bg-surface">
        <button id="btn-refresh-rules" title="Refresh rules"
          class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors">
          <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE72C;</span>
          <span>Refresh</span>
        </button>
        <button id="btn-add-rule" title="Add rule"
          class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors">
          <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE710;</span>
          <span>Add</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        ${state.rules.length === 0
          ? `<div class="flex flex-col items-center justify-center h-40 text-text-muted text-sm gap-2">
               <span class="text-3xl" style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE71C;</span>
               <span>No rules yet</span>
               <span class="text-xs text-text-muted">Click + to add your first rule</span>
             </div>`
          : state.rules.map((r, i) => renderRuleRow(r, i)).join('')
        }
      </div>
    </div>
  `;
}

function renderRuleRow(rule, index) {
  const validation = (state.validations || []).find(v => v.ruleId === rule.id);
  const hasWarning = validation && (validation.browserMissing || validation.profileMissing);
  const condSummary = getRuleConditionSummary(rule);
  const browserName = rule.browser || '—';
  const priority = index + 1;
  return `
    <div class="rule-row flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-surface cursor-pointer transition-colors"
         data-rule-index="${index}" data-rule-id="${esc(rule.id)}">
      <div class="text-text-muted cursor-grab text-xs leading-none select-none flex flex-col items-center w-5">
        <span class="text-[0.6rem] text-text-muted leading-none mb-0.5">${priority}</span>
        <span>⠿</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-text-primary truncate">${esc(rule.name || 'Unnamed rule')}</span>
          ${hasWarning ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[0.75rem] font-medium">⚠ ${esc(validation.message)}</span>` : ''}
        </div>
        <div class="text-xs text-text-muted truncate mt-0.5">${esc(condSummary)} → ${esc(browserName)}</div>
      </div>
      <button class="btn-edit-rule-item flex-shrink-0 w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-raised rounded transition-colors"
        data-rule-index="${index}" title="Edit rule"
        style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem;">&#xE70F;</button>
      <button class="btn-delete-rule-item flex-shrink-0 w-7 h-7 flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-surface-raised rounded transition-colors"
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
    const parts = rule.conditions.map(c => `link ${c.operator.replace(/_/g,' ')} "${c.value}"`);
    if (parts.length === 1) return parts[0];
    return `${logic} of: ${parts.slice(0, 2).join(', ')}${parts.length > 2 ? ` +${parts.length - 2} more` : ''}`;
  }
  if (rule.pattern) return `link contains "${rule.pattern}"`;
  return 'No conditions';
}

// ─── Apps Tab ─────────────────────────────────────────────────────────────────
function renderApps() {
  const apps = state.appRedirects || [];
  return `
    <div class="flex flex-col h-full">
      <div class="px-4 py-3">
        <div class="text-xs text-text-secondary leading-relaxed">
          This lets you open links <strong class="text-text-primary">to</strong> certain websites directly in their desktop app or in a specific browser.
        </div>
      </div>
      <div class="border-y border-border px-4 py-3 bg-surface space-y-3">
        <div class="flex flex-col gap-2">
          <button id="btn-refresh-apps" title="Refresh app list"
            class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors w-fit">
            <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.9rem;">&#xE72C;</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        ${apps.length === 0
          ? `<div class="flex flex-col items-center justify-center h-40 text-text-muted text-sm gap-2">
               <span class="text-3xl" style="font-family:'Segoe MDL2 Assets',sans-serif">&#xE71D;</span>
               <span>No app redirects available</span>
             </div>`
          : apps.map(app => renderAppRow(app)).join('')
        }
      </div>
    </div>
  `;
}

function renderAppRow(app) {
  const domains = (app.domains || []).join(', ');
  const availClass = app.isAvailable ? 'text-green-400' : 'text-text-muted';
  const availText = app.isAvailable ? 'Installed' : 'Not detected';
  const availIcon = app.isAvailable ? '&#xE73E;' : '&#xE711;';
  const disabledClass = !app.isAvailable ? 'opacity-50 cursor-not-allowed' : '';
  const disabledAttr = !app.isAvailable ? 'disabled' : '';
  const toggleTitle = !app.isAvailable
    ? `${esc(app.name)} not detected — install the app to enable this redirect`
    : `${app.enabled ? 'Disable' : 'Enable'} ${esc(app.name)} redirect`;

  return `
    <div class="app-row flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-surface transition-colors ${!app.isAvailable ? 'opacity-70' : ''}">
      <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-surface-raised">
        <img src="${svgBrowser}" alt="${esc(app.name)}" style="width:20px;height:20px;" draggable="false">
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-text-primary">${esc(app.name)}</span>
          <span class="text-[0.65rem] ${availClass} flex items-center gap-0.5">
            <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.6rem;">${availIcon}</span>
            ${esc(availText)}
          </span>
        </div>
        <div class="text-xs text-text-muted truncate mt-0.5">${esc(domains)}</div>
      </div>
      <label class="toggle flex-shrink-0 ${disabledClass}" title="${toggleTitle}">
        <input type="checkbox" class="app-redirect-toggle" data-app-id="${esc(app.id)}" ${app.enabled ? 'checked' : ''} ${disabledAttr}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────
function renderInfo() {
  return `
    <div class="p-5 space-y-5 overflow-y-auto h-full">

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Report an Issue</h2>
        <div class="bg-surface rounded-lg p-4 space-y-3">
          <div class="text-xs text-text-secondary leading-relaxed">
            Found a bug or have a feature request? Open an issue on GitHub:
          </div>
          <ol class="text-xs text-text-secondary space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Click <strong class="text-text-primary">Open Issues</strong> below</li>
            <li>Click <strong class="text-text-primary">New Issue</strong> on GitHub</li>
            <li>Give it a clear title and describe the problem or suggestion</li>
            <li>Submit — we'll take a look!</li>
          </ol>
          <button id="btn-open-issues"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent-glow text-white rounded transition-colors">
            <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem;">&#xE71B;</span>
            <span>Open Issues</span>
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Discussions</h2>
        <div class="bg-surface rounded-lg p-4 space-y-3">
          <div class="text-xs text-text-secondary leading-relaxed">
            Have a question, idea, or want to chat with other users? Join the GitHub Discussions.
          </div>
          <button id="btn-open-discussions"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent-glow text-white rounded transition-colors">
            <span style="font-family:'Segoe MDL2 Assets',sans-serif; font-size:0.85rem;">&#xE8F1;</span>
            <span>Open Discussions</span>
          </button>
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
      <div class="bg-surface rounded-xl shadow-2xl w-full max-w-lg border border-border flex flex-col max-h-[90vh]">

        <!-- Header -->
        <div class="px-5 pt-5 pb-3 border-b border-border">
          <h2 class="text-base font-semibold text-text-primary">${isNew ? 'New Rule' : 'Edit Rule'}</h2>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          <!-- Title -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">Title</label>
            <input id="rule-name" type="text" placeholder="Title"
              value="${esc(rule.name || '')}"
              class="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent">
          </div>

          <!-- Condition Builder -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium text-text-secondary">Use this rule when:</span>
            </div>

            <!-- Logic selector row -->
            <div class="flex items-center gap-2 mb-3">
              <select id="condition-logic" class="bg-surface-raised border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent">
                <option value="all" ${conditionLogic === 'all' ? 'selected' : ''}>All</option>
                <option value="any" ${conditionLogic === 'any' ? 'selected' : ''}>Any</option>
              </select>
              <span class="text-sm text-text-secondary">of the following are true</span>
              <div class="flex-1"></div>
              <button id="btn-add-condition"
                class="w-6 h-6 flex items-center justify-center bg-border-bright hover:bg-border-bright text-text-primary rounded text-sm font-bold transition-colors" title="Add condition">+</button>
            </div>

            <!-- Condition rows -->
            <div id="conditions-list" class="space-y-2">
              ${conditions.map((c, i) => renderConditionRow(c, i, conditions.length)).join('')}
            </div>
          </div>

          <!-- Action -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-2">Open in browser:</label>
            <div class="bg-surface-raised border border-border rounded-lg p-3 space-y-3" style="background:#1e1e38">
              <div class="flex gap-2">
              <select id="rule-browser" class="flex-1 bg-surface-raised border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                  ${state.activeBrowsers.map((b, i) => `
                    <option value="${esc(b.name)}" data-path="${esc(b.path)}"
                      ${rule.browser ? (rule.browser === b.name ? 'selected' : '') : (i === 0 ? 'selected' : '')}>${esc(b.name)}</option>
                  `).join('')}
                </select>
                <select id="rule-profile" class="flex-1 bg-surface-raised border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent${!browserSupportsProfiles(rule.browser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '') ? ' opacity-50 cursor-not-allowed' : ''}"
                  ${!browserSupportsProfiles(rule.browser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '') ? 'disabled' : ''}>
                  ${renderProfileOptions(rule.browser || (state.activeBrowsers[0] && state.activeBrowsers[0].name) || '', rule.profile)}
                </select>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-border flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer flex-1">
            <input type="checkbox" id="rule-enabled" class="accent-accent w-4 h-4" ${rule.enabled !== false ? 'checked' : ''}>
            <span class="text-sm text-text-primary">Enable this rule</span>
          </label>
          <button id="btn-rule-cancel"
            class="px-4 py-2 text-sm text-text-primary hover:text-text-primary bg-surface-raised hover:bg-border-bright rounded-lg transition-colors">
            Cancel
          </button>
          <button id="btn-rule-save"
            class="px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-glow rounded-lg transition-colors">
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
      <span class="flex-1 bg-surface-raised border border-border rounded px-2 py-1.5 text-sm text-text-secondary select-none">Link</span>
      <span class="flex-1 bg-surface-raised border border-border rounded px-2 py-1.5 text-sm text-text-secondary select-none">contains</span>
      <input type="text" class="cond-value flex-1 bg-surface-raised border border-border rounded px-2 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
        placeholder="value" value="${esc(condition.value || '')}">
      <button class="btn-remove-condition w-6 h-6 flex items-center justify-center bg-border-bright hover:bg-red-700 text-text-primary hover:text-white rounded text-sm font-bold transition-colors flex-shrink-0"
        data-condition-index="${index}" title="Remove condition">−</button>
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
    const selProfile = document.getElementById('sel-default-profile');
    if (selDefaultBrowser.value) {
      selProfile.innerHTML = renderProfileOptions(selDefaultBrowser.value, '');
      // Disable profile dropdown if browser doesn't support profiles
      selProfile.disabled = !browserSupportsProfiles(selDefaultBrowser.value);
      if (selProfile.disabled) {
        selProfile.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        selProfile.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  });

  // Set initial disabled state for default profile dropdown
  {
    const selProfile = document.getElementById('sel-default-profile');
    if (selDefaultBrowser && selProfile && selDefaultBrowser.value) {
      selProfile.disabled = !browserSupportsProfiles(selDefaultBrowser.value);
      if (selProfile.disabled) {
        selProfile.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  }

  // Auto-save general settings on any change
  async function saveGeneralSettings() {
    const browserSel = document.getElementById('sel-default-browser');
    let browser = browserSel?.value || '';
    let profile = document.getElementById('sel-default-profile')?.value || '';
    const fallback = document.querySelector('input[name="fallback"]:checked')?.value || 'picker';

    // Guard: "Use primary browser" requires a browser to be selected.
    // If none is selected, auto-pick the first available browser to prevent loops.
    if (fallback === 'default' && !browser && state.activeBrowsers.length > 0) {
      const first = state.activeBrowsers[0];
      browser = first.name;
      profile = first.profiles && first.profiles.length > 0 ? first.profiles[0].id : '';
      // Update the dropdown to reflect the auto-selection
      if (browserSel) browserSel.value = browser;
      const profileRow = document.getElementById('default-profile-row');
      const selProfile = document.getElementById('sel-default-profile');
      if (profileRow) profileRow.classList.remove('invisible');
      if (selProfile) {
        selProfile.innerHTML = renderProfileOptions(browser, profile);
        selProfile.value = profile;
      }
      showToast('Primary browser auto-selected — a browser is required when using "Use primary browser" fallback.', 'info');
    }

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
      state.activeBrowsers = state.browsers.filter(b => !b.archived && !b.unsupported);
      render();
      showToast('Browser list refreshed', 'info');
    }
    catch (e) { showToast('Refresh failed', 'error'); }
  });

  // Browser row click → select
  document.querySelectorAll('.browser-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      state.selectedBrowserPath = row.dataset.browserPath || null;
      document.querySelectorAll('.browser-row').forEach(r => {
        r.classList.remove('bg-accent-muted', 'hover:bg-accent-muted');
        r.classList.add('hover:bg-surface');
      });
      row.classList.add('bg-accent-muted', 'hover:bg-accent-muted');
      row.classList.remove('hover:bg-surface');
    });
  });

  // Browser include/exclude toggle
  document.querySelectorAll('.browser-include-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const path = toggle.dataset.browserPath;
      const browser = state.browsers.find(b => b.path && b.path.toLowerCase() === path.toLowerCase());
      if (!browser) return;

      if (toggle.checked) {
        // Include (unarchive)
        try {
          await App.UnarchiveBrowser(path);
          state.browsers = await App.GetBrowsers();
          state.activeBrowsers = state.browsers.filter(b => !b.archived);
          render();
          showToast(`${browser.name} included`, 'success');
        } catch (err) {
          toggle.checked = false;
          showToast('Failed to include browser: ' + err, 'error');
        }
      } else {
        // Exclude (archive)
        const isPrimary = state.config.defaultBrowser === browser.name;
        try {
          await App.ArchiveBrowser(path);
          state.browsers = await App.GetBrowsers();
          state.activeBrowsers = state.browsers.filter(b => !b.archived);

          if (isPrimary) {
            state.config.defaultBrowser = '';
            state.config.defaultProfile = '';
            await App.SaveSettings('', '', state.config.fallbackBehavior || 'default').catch(() => {});
            state.tab = 'general';
            render();
            showToast(`${browser.name} was your primary browser — please select a new one.`, 'info');
          } else {
            render();
            showToast(`${browser.name} excluded from LinkRight`, 'info');
          }
        } catch (err) {
          toggle.checked = true;
          showToast('Failed to exclude browser: ' + err, 'error');
        }
      }
    });
  });

  // ── Rules tab ──
  const btnRefreshRules = document.getElementById('btn-refresh-rules');
  if (btnRefreshRules) btnRefreshRules.addEventListener('click', async () => {
    try {
      state.rules = (await App.GetRules()) || [];
      state.validations = (await App.ValidateRules().catch(() => [])) || [];
      render();
      showToast('Rules refreshed', 'info');
    } catch (e) { showToast('Refresh failed', 'error'); }
  });

  const btnAddRule = document.getElementById('btn-add-rule');
  if (btnAddRule) btnAddRule.addEventListener('click', () => {
    state.editingRule = {
      id: '', name: '', conditions: [{ field: 'url', operator: 'contains', value: '' }],
      conditionLogic: 'all', browser: '', browserPath: '', profile: '', profileName: '',
      enabled: true, priority: state.rules.length + 1,
    };
    render();
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
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('selected', 'bg-accent-muted'));
      row.classList.add('selected', 'bg-accent-muted');
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

  // ── Apps tab ──
  const btnRefreshApps = document.getElementById('btn-refresh-apps');
  if (btnRefreshApps) btnRefreshApps.addEventListener('click', async () => {
    try {
      state.appRedirects = await App.GetAppRedirects();
      render();
      showToast('App list refreshed', 'info');
    } catch (e) { showToast('Refresh failed', 'error'); }
  });

  document.querySelectorAll('.app-redirect-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      const appId = toggle.dataset.appId;
      const enabled = toggle.checked;
      try {
        await App.SetAppRedirectEnabled(appId, enabled);
        // Update local state
        const app = state.appRedirects.find(a => a.id === appId);
        if (app) app.enabled = enabled;
        showToast(`${app?.name || 'App'} redirect ${enabled ? 'enabled' : 'disabled'}`, 'success');
      } catch (err) {
        toggle.checked = !enabled;
        showToast('Failed to update app redirect', 'error');
      }
    });
  });

  // ── Info tab ──
  const btnOpenIssues = document.getElementById('btn-open-issues');
  if (btnOpenIssues) btnOpenIssues.addEventListener('click', () => {
    const url = 'https://github.com/getsetbro/linkright_repo/issues';
    if (window.runtime && window.runtime.BrowserOpenURL) {
      window.runtime.BrowserOpenURL(url);
    } else {
      window.open(url, '_blank');
    }
  });

  const btnOpenDiscussions = document.getElementById('btn-open-discussions');
  if (btnOpenDiscussions) btnOpenDiscussions.addEventListener('click', () => {
    const url = 'https://github.com/getsetbro/linkright_repo/discussions';
    if (window.runtime && window.runtime.BrowserOpenURL) {
      window.runtime.BrowserOpenURL(url);
    } else {
      window.open(url, '_blank');
    }
  });

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


  // Auto-fill: on title blur, update first condition value if it's empty
  const ruleNameInput = document.getElementById('rule-name');
  if (ruleNameInput) {
    ruleNameInput.addEventListener('blur', () => {
      const firstCondValue = document.querySelector('.cond-value');
      if (firstCondValue && firstCondValue.value.trim() === '') {
        firstCondValue.value = ruleNameInput.value;
      }
    });
  }

  // Auto-fill: on first condition value blur, update title if it's empty (use domain if URL)
  const firstCondValue = document.querySelector('.cond-value');
  if (firstCondValue) {
    firstCondValue.addEventListener('blur', () => {
      const ruleNameEl = document.getElementById('rule-name');
      if (ruleNameEl && ruleNameEl.value.trim() === '') {
        const val = firstCondValue.value.trim();
        if (val) {
          ruleNameEl.value = extractDomainIfUrl(val);
        }
      }
    });
  }

  // Browser change → update profile dropdown
  const ruleBrowser = document.getElementById('rule-browser');
  if (ruleBrowser) ruleBrowser.addEventListener('change', () => {
    const profileSel = document.getElementById('rule-profile');
    profileSel.innerHTML = renderProfileOptions(ruleBrowser.value, '');
    // Disable profile dropdown if browser doesn't support profiles
    profileSel.disabled = !browserSupportsProfiles(ruleBrowser.value);
    if (profileSel.disabled) {
      profileSel.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      profileSel.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });

  // Set initial disabled state for profile dropdown based on selected browser
  {
    const profileSel = document.getElementById('rule-profile');
    const browserSel = document.getElementById('rule-browser');
    if (profileSel && browserSel && browserSel.value) {
      profileSel.disabled = !browserSupportsProfiles(browserSel.value);
      if (profileSel.disabled) {
        profileSel.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  }

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
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('border-t-2', 'border-accent-light'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('border-t-2', 'border-accent-light'));
      row.classList.add('border-t-2', 'border-accent-light');
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

  const icons = {
    success: '✓',
    warning: '⚠',
    error:   '✕',
    info:    'ℹ',
  };

  const cssClass = {
    success: 'toast-success',
    warning: 'toast-warning',
    error:   'toast-danger',
    info:    'toast-info',
  };

  const toast = document.createElement('div');
  toast.className = [
    'js-toast',
    'fixed bottom-4 right-4 z-[9999]',
    'flex items-center gap-2',
    'px-4 py-2 rounded-full text-sm font-medium',
    'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
    'fade-in',
    cssClass[type] || cssClass.info,
  ].join(' ');
  toast.innerHTML = `<span class="text-base leading-none">${icons[type] || icons.info}</span><span>${esc(message)}</span>`;
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

// Extract domain from a URL string; returns the original value if it's not a URL
function extractDomainIfUrl(val) {
  if (!val) return val;
  try {
    // Check if it looks like a URL (has protocol or starts with common patterns)
    let urlStr = val;
    if (/^https?:\/\//i.test(urlStr) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(urlStr)) {
      if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;
      const url = new URL(urlStr);
      return url.hostname.replace(/^www\./, '');
    }
  } catch (_) {}
  return val;
}

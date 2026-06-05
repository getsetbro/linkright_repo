// Link Right — Main UI (Phase 8 Settings + Phase 7 Chooser)
import * as App from '../wailsjs/go/main/App.js';
import * as Runtime from '../wailsjs/runtime/runtime.js';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  // Mode
  mode: 'settings',        // 'settings' | 'chooser' | 'tray'

  // Settings UI
  tab: 'general',          // 'general' | 'browsers' | 'rules' | 'prompt'
  browsers: [],
  rules: [],
  config: {},
  appStatus: {},
  validations: [],
  editingRule: null,
  dragSrcIndex: null,

  // Chooser UI
  chooserData: null,       // ChooserRequest
  chooserSettings: {},     // ChooserSettings
  selectedBrowserIndex: 0,
  selectedProfileId: '',
  alwaysUse: false,

  // Tray UI
  trayData: null,          // TrayData

  // First-run
  showFirstRun: false,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  try {
    // Check tray mode first (--tray flag)
    const isTray = await App.IsTrayMode();

    if (isTray) {
      state.mode = 'tray';
      const trayData = await App.GetTrayData();
      state.trayData = trayData;

    } else {
      // Check if we're in chooser mode (launched with a URL)
      let isChooser = false;
      try { isChooser = await App.IsChooserMode(); } catch (_) {}

      if (isChooser) {
        state.mode = 'chooser';

        try {
          // Process the URL — if a rule matches and browser launches, window closes
          const url = await App.GetCurrentURL();
          const result = await App.ProcessURL(url);

          if (result === 'launched') {
            // Browser launched successfully — close this window
            await App.CancelChooser();
            return;
          }

          // Need to show chooser — load data
          const [chooserData, chooserSettings] = await Promise.all([
            App.GetChooserData(),
            App.GetChooserSettings(),
          ]);
          state.chooserData = chooserData;
          state.chooserSettings = chooserSettings;

          // Default: select first browser, first profile
          if (chooserData.browsers && chooserData.browsers.length > 0) {
            state.selectedBrowserIndex = 0;
            const firstBrowser = chooserData.browsers[0];
            state.selectedProfileId = firstBrowser.profiles && firstBrowser.profiles.length > 0
              ? firstBrowser.profiles[0].id
              : '';
          }
        } catch (e) {
          // Any failure in URL processing → show chooser with empty data (graceful fallback)
          console.warn('URL processing failed, showing chooser:', e);
          if (!state.chooserData) {
            state.chooserData = { url: '', domain: '', reason: 'error', warning: '', browsers: [] };
            try { state.chooserData.browsers = await App.GetBrowsers(); } catch (_) {}
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
  if (state.mode === 'chooser') {
    if (e.key === 'Escape') {
      cancelChooser();
      return;
    }
    if (e.key === 'Enter') {
      openWithSelected();
      return;
    }
    // Number keys 1-9 select browser
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && state.chooserData) {
      const idx = num - 1;
      if (idx < state.chooserData.browsers.length) {
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
  if (state.mode === 'tray') {
    renderTrayMode();
  } else if (state.mode === 'chooser') {
    renderChooserMode();
  } else {
    renderSettingsMode();
  }
}

// ─── TRAY MODE ────────────────────────────────────────────────────────────────
function renderTrayMode() {
  const data = state.trayData;
  const browsers = data?.browsers || [];
  const defaultBrowser = data?.defaultBrowser || '';
  const clipURL = data?.clipboardURL || '';

  // Shared tray row classes
  const rowBase = 'flex items-center gap-2.5 px-3.5 py-1.5 cursor-pointer transition-colors min-h-[32px] relative';
  const rowHover = 'hover:bg-blue-500/20 active:bg-blue-500/30';
  const rowDisabled = 'opacity-40 cursor-default pointer-events-none';
  const iconCls = 'w-[18px] text-center text-sm flex-shrink-0 leading-none';
  const labelCls = 'flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-slate-200 text-[13px]';
  const shortcutCls = 'text-[11px] text-slate-500 font-mono flex-shrink-0 min-w-[14px] text-right';

  document.getElementById('app').innerHTML = `
    <div class="tray-root flex flex-col h-screen bg-[#1c2333] text-slate-200 text-[13px] select-none overflow-hidden border border-white/[0.08] rounded-[10px]">

      <!-- Open URL from Clipboard -->
      <div class="${rowBase} ${clipURL ? rowHover : rowDisabled}" id="tray-open-clip">
        <span class="${iconCls}">🔗</span>
        <span class="${labelCls}">Open URL from Clipboard</span>
        ${clipURL ? `<span class="${shortcutCls}">P</span>` : ''}
      </div>
      ${clipURL ? `<div class="text-[10px] text-slate-500 font-mono px-3.5 pb-1.5 pl-[42px] whitespace-nowrap overflow-hidden text-ellipsis -mt-1">${esc(truncateURL(clipURL, 42))}</div>` : ''}

      <div class="h-px bg-white/[0.07] my-1"></div>

      <!-- Primary Browser section -->
      <div class="px-3.5 pt-2 pb-1 text-[11px] font-semibold text-slate-500 tracking-[0.03em]">Primary Browser</div>
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        ${browsers.map((b, i) => {
          const isDefault = b.name === defaultBrowser;
          const icon = getBrowserEmoji(b);
          const num = i + 1;
          return `
            <div class="${rowBase} ${rowHover} tray-browser-row" data-browser-name="${esc(b.name)}">
              <span class="w-4 text-center text-blue-400 text-[13px] flex-shrink-0">${isDefault ? '✓' : ''}</span>
              <span class="${iconCls}">${icon}</span>
              <span class="${labelCls}">${esc(b.name)}</span>
              <span class="${shortcutCls}">${num <= 9 ? num : ''}</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="h-px bg-white/[0.07] my-1"></div>

      <!-- Footer actions -->
      <div class="flex-shrink-0">
        <div class="${rowBase} ${rowHover}" id="tray-settings">
          <span class="${iconCls}">⚙</span>
          <span class="${labelCls}">Settings…</span>
          <span class="${shortcutCls}">⌘,</span>
        </div>
        <div class="${rowBase} ${rowHover}" id="tray-more">
          <span class="${iconCls}">···</span>
          <span class="${labelCls}">More</span>
          <span class="text-[10px] text-slate-500 flex-shrink-0">›</span>
        </div>
        <div class="h-px bg-white/[0.07] my-1"></div>
        <div class="${rowBase} ${rowHover}" id="tray-quit">
          <span class="${iconCls}">⊗</span>
          <span class="${labelCls}">Quit LinkRight</span>
          <span class="${shortcutCls}">⌘Q</span>
        </div>
      </div>

    </div>
  `;

  attachTrayListeners(clipURL);
}

function attachTrayListeners(clipURL) {
  // Open URL from clipboard
  if (clipURL) {
    document.getElementById('tray-open-clip')?.addEventListener('click', async () => {
      try {
        await App.OpenURLFromClipboard();
        await App.QuitApp();
      } catch (e) {
        console.error('OpenURLFromClipboard failed', e);
      }
    });
  }

  // Browser rows — open clipboard URL in that browser
  document.querySelectorAll('.tray-browser-row').forEach(row => {
    row.addEventListener('click', async () => {
      const name = row.dataset.browserName;
      try {
        if (clipURL) {
          await App.LaunchBrowserByName(name);
        } else {
          // No URL — just set as default? For now open settings
          await App.OpenSettings();
        }
        await App.QuitApp();
      } catch (e) {
        console.error('LaunchBrowserByName failed', e);
      }
    });
  });

  // Settings
  document.getElementById('tray-settings')?.addEventListener('click', async () => {
    try {
      await App.OpenSettings();
      await App.QuitApp();
    } catch (e) {
      console.error('OpenSettings failed', e);
    }
  });

  // Quit
  document.getElementById('tray-quit')?.addEventListener('click', async () => {
    try { await App.QuitApp(); } catch (e) {}
  });

  // Keyboard shortcuts in tray mode
  document.addEventListener('keydown', handleTrayKeyDown, { once: false });
}

function handleTrayKeyDown(e) {
  if (state.mode !== 'tray') return;
  const data = state.trayData;
  const clipURL = data?.clipboardURL || '';

  if (e.key === 'Escape') {
    App.QuitApp().catch(() => {});
    return;
  }
  if ((e.key === 'p' || e.key === 'P') && clipURL) {
    App.OpenURLFromClipboard().then(() => App.QuitApp()).catch(() => {});
    return;
  }
  const num = parseInt(e.key);
  if (!isNaN(num) && num >= 1 && data?.browsers) {
    const browser = data.browsers[num - 1];
    if (browser) {
      if (clipURL) {
        App.LaunchBrowserByName(browser.name).then(() => App.QuitApp()).catch(() => {});
      }
    }
  }
}

// ─── CHOOSER MODE ─────────────────────────────────────────────────────────────
function renderChooserMode() {
  const data = state.chooserData;
  const settings = state.chooserSettings || { iconSize: 'large', showBrowserNames: true, showURL: true };

  if (!data) {
    document.getElementById('app').innerHTML = `
      <div class="flex items-center justify-center h-screen bg-gray-900 text-gray-400 text-sm">
        Loading…
      </div>`;
    return;
  }

  const iconSize = settings.iconSize || 'large';
  const showNames = settings.showBrowserNames !== false;
  const showURL = settings.showURL !== false;

  const browsers = data.browsers || [];
  const selectedBrowser = browsers[state.selectedBrowserIndex] || null;

  document.getElementById('app').innerHTML = `
    <div class="chooser-root flex flex-col h-screen bg-gray-900 text-gray-100 select-none overflow-hidden">

      <!-- Header: URL display -->
      ${showURL ? `
      <div class="px-4 pt-4 pb-2">
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
        ⚠ ${esc(data.warning)}
      </div>
      ` : ''}

      <!-- Browser grid -->
      <div class="flex-1 overflow-y-auto px-4 py-2">
        <div class="flex flex-wrap gap-2.5 justify-center py-1">
          ${browsers.map((b, i) => renderChooserBrowserCard(b, i, iconSize, showNames)).join('')}
        </div>
      </div>

      <!-- Profile selector (shown when selected browser has multiple profiles) -->
      ${selectedBrowser && selectedBrowser.profiles && selectedBrowser.profiles.length > 1 ? `
      <div class="px-4 pb-2">
        <select id="chooser-profile" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
          ${selectedBrowser.profiles.map(p => `
            <option value="${esc(p.id)}" ${state.selectedProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>
          `).join('')}
        </select>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="px-4 pb-4 pt-2 border-t border-gray-800 space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="chooser-always-use" class="accent-blue-500 w-4 h-4" ${state.alwaysUse ? 'checked' : ''}>
          <span class="text-xs text-gray-400">Always use this browser for <span class="text-gray-300 font-medium">${esc(data.domain || 'this site')}</span></span>
        </label>
        <div class="flex gap-2">
          <button id="btn-chooser-cancel"
            class="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700">
            Cancel
          </button>
          <button id="btn-chooser-open"
            class="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors ${!selectedBrowser ? 'opacity-50 cursor-not-allowed' : ''}">
            Open
          </button>
        </div>
      </div>

    </div>
  `;

  attachChooserListeners();
}

function renderChooserBrowserCard(browser, index, iconSize, showNames) {
  const isSelected = index === state.selectedBrowserIndex;
  const icon = getBrowserEmoji(browser);
  const num = index + 1;

  // Size variants: width × height × padding × icon-size
  const sizeStyles = iconSize === 'small'
    ? { card: 'w-16 h-[72px] pt-2 px-1 pb-1', icon: 'text-2xl' }
    : iconSize === 'medium'
    ? { card: 'w-20 h-[88px] pt-2.5 px-1.5 pb-1.5', icon: 'text-[1.75rem]' }
    : { card: 'w-24 h-[104px] pt-3 px-2 pb-2', icon: 'text-[2.25rem]' };

  const baseCard = `relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer select-none transition-all duration-150`;
  const stateCard = isSelected
    ? 'bg-[#1e3a5f] border-blue-500 shadow-[0_0_0_1px_#3b82f6]'
    : 'bg-gray-800 border-transparent hover:bg-gray-700 hover:border-gray-600 hover:-translate-y-px';

  const numColor = isSelected ? 'text-blue-300' : 'text-gray-500';
  const nameColor = isSelected ? 'text-blue-200' : 'text-gray-400';

  return `
    <div class="chooser-browser-card ${baseCard} ${stateCard} ${sizeStyles.card}"
         data-browser-index="${index}"
         title="${esc(browser.name)}">
      <div class="absolute top-1 left-1.5 text-[0.65rem] font-semibold leading-none ${numColor}">${num <= 9 ? num : ''}</div>
      <div class="${sizeStyles.icon} leading-none mb-1">${icon}</div>
      ${showNames ? `<div class="text-[0.65rem] ${nameColor} text-center w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 leading-tight">${esc(shortBrowserName(browser.name))}</div>` : ''}
    </div>
  `;
}

function attachChooserListeners() {
  // Browser card clicks
  document.querySelectorAll('.chooser-browser-card').forEach(card => {
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
  const profileSel = document.getElementById('chooser-profile');
  if (profileSel) {
    profileSel.addEventListener('change', () => {
      state.selectedProfileId = profileSel.value;
    });
  }

  // Always use checkbox
  const alwaysUseChk = document.getElementById('chooser-always-use');
  if (alwaysUseChk) {
    alwaysUseChk.addEventListener('change', () => {
      state.alwaysUse = alwaysUseChk.checked;
    });
  }

  // Open button
  document.getElementById('btn-chooser-open')?.addEventListener('click', openWithSelected);

  // Cancel button
  document.getElementById('btn-chooser-cancel')?.addEventListener('click', cancelChooser);
}

function selectBrowser(idx) {
  state.selectedBrowserIndex = idx;
  const browser = state.chooserData.browsers[idx];
  if (browser && browser.profiles && browser.profiles.length > 0) {
    state.selectedProfileId = browser.profiles[0].id;
  } else {
    state.selectedProfileId = '';
  }
  render();
}

async function openWithSelected() {
  const browsers = state.chooserData?.browsers || [];
  const browser = browsers[state.selectedBrowserIndex];
  if (!browser) return;

  // Get profile
  let profileId = state.selectedProfileId;
  let profileName = '';
  const profileSel = document.getElementById('chooser-profile');
  if (profileSel) {
    profileId = profileSel.value;
    profileName = profileSel.options[profileSel.selectedIndex]?.text || '';
  } else if (browser.profiles && browser.profiles.length > 0) {
    const p = browser.profiles.find(p => p.id === profileId) || browser.profiles[0];
    profileId = p.id;
    profileName = p.name;
  }

  const alwaysUse = document.getElementById('chooser-always-use')?.checked || false;

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
    await App.CancelChooser();
  } catch (e) {
    showToast('Failed to open browser: ' + e, 'error');
  }
}

async function cancelChooser() {
  try {
    await App.CancelChooser();
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
        ${state.tab === 'prompt'   ? renderPrompt()   : ''}
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
        <div class="text-5xl leading-none">🔗</div>

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
    <div class="flex items-center justify-center py-3 border-b border-gray-700 bg-gray-900">
      <span class="text-sm font-semibold text-gray-200 tracking-wide">Preferences</span>
    </div>
  `;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function renderTabs() {
  const tabs = [
    { id: 'general',  label: 'General',  icon: '⚙️' },
    { id: 'browsers', label: 'Browsers', icon: '🌐' },
    { id: 'rules',    label: 'Rules',    icon: '☰' },
    { id: 'prompt',   label: 'Prompt',   icon: '🔲' },
  ];
  return `
    <div class="flex justify-center gap-6 py-2 border-b border-gray-700 bg-gray-900">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="flex flex-col items-center gap-0.5 px-4 py-1 rounded text-xs transition-colors
          ${state.tab === t.id
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'}">
          <span class="text-lg leading-none">${t.icon}</span>
          <span>${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// ─── General Tab ──────────────────────────────────────────────────────────────
function renderGeneral() {
  const s = state.appStatus;
  const c = state.config;
  const defaultBrowser = state.browsers.find(b => b.name === c.defaultBrowser);
  return `
    <div class="p-5 space-y-5 overflow-y-auto h-full">

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registration</h2>
        <div class="bg-gray-800 rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-200">Registered as browser</div>
              <div class="text-xs text-gray-400">${s.isRegistered ? 'Link Right is registered in Windows' : 'Not registered'}</div>
            </div>
            <div class="flex gap-2">
              ${s.isRegistered
                ? `<button id="btn-unregister" class="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors">Unregister</button>`
                : `<button id="btn-register" class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Register</button>`
              }
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-200">Default browser</div>
              <div class="text-xs text-gray-400">${s.isDefaultBrowser ? 'Link Right is the Windows default' : 'Not set as default'}</div>
            </div>
            ${!s.isDefaultBrowser
              ? `<button id="btn-set-default" class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Set as Default…</button>`
              : `<span class="text-xs text-green-400 font-medium">✓ Active</span>`
            }
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fallback Behavior</h2>
        <div class="bg-gray-800 rounded-lg p-4 space-y-3">
          <div class="text-xs text-gray-400 mb-2">When no rule matches a link:</div>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="radio" name="fallback" value="chooser" class="accent-blue-500"
              ${(c.fallbackBehavior || 'chooser') === 'chooser' ? 'checked' : ''}>
            <div>
              <div class="text-sm text-gray-200">Show browser chooser</div>
              <div class="text-xs text-gray-400">Ask which browser to use each time</div>
            </div>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="radio" name="fallback" value="default" class="accent-blue-500"
              ${c.fallbackBehavior === 'default' ? 'checked' : ''}>
            <div>
              <div class="text-sm text-gray-200">Use default browser</div>
              <div class="text-xs text-gray-400">
                ${defaultBrowser ? defaultBrowser.name : 'No default set — configure below'}
              </div>
            </div>
          </label>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Default Browser</h2>
        <div class="bg-gray-800 rounded-lg p-4 space-y-3">
          <div>
            <label class="text-xs text-gray-400 block mb-1">Browser</label>
            <select id="sel-default-browser" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="">— None —</option>
              ${state.browsers.map(b => `
                <option value="${esc(b.name)}" ${c.defaultBrowser === b.name ? 'selected' : ''}>${esc(b.name)}</option>
              `).join('')}
            </select>
          </div>
          <div id="default-profile-row" class="${c.defaultBrowser ? '' : 'hidden'}">
            <label class="text-xs text-gray-400 block mb-1">Profile</label>
            <select id="sel-default-profile" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
              ${renderProfileOptions(c.defaultBrowser, c.defaultProfile)}
            </select>
          </div>
          <button id="btn-save-settings" class="w-full py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium">
            Save Settings
          </button>
        </div>
      </section>

    </div>
  `;
}

function renderProfileOptions(browserName, selectedProfile) {
  const browser = state.browsers.find(b => b.name === browserName);
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
      <div class="flex-1 overflow-y-auto">
        ${state.browsers.length === 0
          ? `<div class="flex items-center justify-center h-32 text-gray-500 text-sm">No browsers detected</div>`
          : state.browsers.map((b, i) => renderBrowserRow(b, i)).join('')
        }
      </div>
      <div class="border-t border-gray-700 px-4 py-2 flex items-center gap-3 bg-gray-900">
        <button id="btn-add-browser" title="Add custom browser"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-lg font-light">+</button>
        <button id="btn-remove-browser" title="Remove selected browser"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-lg font-light">−</button>
        <div class="flex-1"></div>
        <button id="btn-refresh-browsers" title="Refresh browser list"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-sm">↺</button>
        <button id="btn-set-default-browser" title="Set as default"
          class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors text-sm">✓</button>
      </div>
    </div>
  `;
}

function renderBrowserRow(browser, index) {
  const isDefault = state.config.defaultBrowser === browser.name;
  const icon = getBrowserEmoji(browser);
  return `
    <div class="browser-row flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors"
         data-browser-index="${index}">
      <span class="text-lg leading-none">${icon}</span>
      <span class="flex-1 text-sm text-gray-200">${esc(browser.name)}</span>
      ${isDefault ? `<span class="text-blue-400 text-sm">✓</span>` : ''}
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
               <span class="text-3xl">📋</span>
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
        <div class="flex-1"></div>
        <button id="btn-edit-rule" title="Edit selected rule"
          class="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">Edit</button>
      </div>
    </div>
  `;
}

function renderRuleRow(rule, index) {
  const validation = state.validations.find(v => v.ruleId === rule.id);
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

// ─── Prompt Tab ───────────────────────────────────────────────────────────────
function renderPrompt() {
  const cfg = state.config;
  const cs = cfg.chooserSettings || { iconSize: 'large', showBrowserNames: true, showURL: true };

  return `
    <div class="p-5 space-y-5 overflow-y-auto h-full">

      <section class="space-y-2">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Chooser Popup</h2>
        <div class="bg-gray-800 rounded-lg p-4 space-y-4">

          <!-- Icon size -->
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-200">Icon size</span>
            <div class="flex items-center gap-4">
              ${['small', 'medium', 'large'].map(size => `
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="icon-size" value="${size}" class="accent-blue-500"
                    ${(cs.iconSize || 'large') === size ? 'checked' : ''}>
                  <span class="text-sm text-gray-300 capitalize">${size.charAt(0).toUpperCase() + size.slice(1)}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Show browser names -->
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-200">Show browser names</span>
            <label class="toggle">
              <input type="checkbox" id="toggle-show-names" class="accent-blue-500"
                ${cs.showBrowserNames !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Show URL -->
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-200">Show URL</span>
            <label class="toggle">
              <input type="checkbox" id="toggle-show-url" class="accent-blue-500"
                ${cs.showURL !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

        </div>
      </section>

      <div class="flex gap-3">
        <button id="btn-save-prompt-settings"
          class="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium">
          Save Settings
        </button>
        <button id="btn-preview-prompt"
          class="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors border border-gray-600">
          Preview Prompt
        </button>
      </div>

    </div>
  `;
}

// ─── Rule Editor Dialog ───────────────────────────────────────────────────────
function renderRuleEditorOverlay() {
  const rule = state.editingRule;
  const isNew = !rule.id;
  const conditions = rule.conditions && rule.conditions.length > 0
    ? rule.conditions
    : [{ field: 'host', operator: 'contains', value: '' }];
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
            <label class="block text-xs font-medium text-gray-400 mb-2">When this rule is used:</label>
            <div class="bg-gray-750 border border-gray-600 rounded-lg p-3 space-y-3" style="background:#2d3748">
              <div>
                <select id="rule-action" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                  <option value="open_browser">Open in the following browser</option>
                </select>
              </div>
              <div class="flex gap-2">
                <select id="rule-browser" class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                  <option value="">— Select browser —</option>
                  ${state.browsers.map(b => `
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
  const fields = [
    { value: 'host',   label: 'URL Host' },
    { value: 'scheme', label: 'URL Scheme' },
    { value: 'path',   label: 'URL Path' },
    { value: 'query',  label: 'URL Query String' },
    { value: 'url',    label: 'Full URL' },
  ];
  const operators = [
    { value: 'contains',      label: 'contains' },
    { value: 'is',            label: 'is' },
    { value: 'is_not',        label: 'is not' },
    { value: 'begins_with',   label: 'begins with' },
    { value: 'ends_with',     label: 'ends with' },
    { value: 'matches_regex', label: 'matches regex' },
  ];
  return `
    <div class="condition-row flex items-center gap-2" data-condition-index="${index}">
      <select class="cond-field flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
        ${fields.map(f => `<option value="${f.value}" ${condition.field === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <select class="cond-operator flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
        ${operators.map(o => `<option value="${o.value}" ${condition.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
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
  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });

  // ── General tab ──
  const btnRegister = document.getElementById('btn-register');
  if (btnRegister) btnRegister.addEventListener('click', async () => {
    try { await App.RegisterAsDefaultBrowser(); state.appStatus = await App.GetAppStatus(); render(); showToast('Registered successfully', 'success'); }
    catch (e) { showToast('Registration failed: ' + e, 'error'); }
  });

  const btnUnregister = document.getElementById('btn-unregister');
  if (btnUnregister) btnUnregister.addEventListener('click', async () => {
    if (!confirm('Unregister Link Right as a browser?')) return;
    try { await App.UnregisterAsDefaultBrowser(); state.appStatus = await App.GetAppStatus(); render(); showToast('Unregistered', 'success'); }
    catch (e) { showToast('Failed: ' + e, 'error'); }
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
      profileRow.classList.remove('hidden');
      selProfile.innerHTML = renderProfileOptions(selDefaultBrowser.value, '');
    } else {
      profileRow.classList.add('hidden');
    }
  });

  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', async () => {
    const browser = document.getElementById('sel-default-browser').value;
    const profile = document.getElementById('sel-default-profile')?.value || '';
    const fallback = document.querySelector('input[name="fallback"]:checked')?.value || 'chooser';
    try {
      await App.SaveSettings(browser, profile, fallback);
      state.config.defaultBrowser = browser;
      state.config.defaultProfile = profile;
      state.config.fallbackBehavior = fallback;
      showToast('Settings saved', 'success');
    } catch (e) { showToast('Save failed: ' + e, 'error'); }
  });

  // ── Browsers tab ──
  const btnRefreshBrowsers = document.getElementById('btn-refresh-browsers');
  if (btnRefreshBrowsers) btnRefreshBrowsers.addEventListener('click', async () => {
    try { state.browsers = await App.RefreshBrowsers(); render(); showToast('Browser list refreshed', 'info'); }
    catch (e) { showToast('Refresh failed', 'error'); }
  });

  // ── Rules tab ──
  const btnAddRule = document.getElementById('btn-add-rule');
  if (btnAddRule) btnAddRule.addEventListener('click', () => {
    state.editingRule = {
      id: '', name: '', conditions: [{ field: 'host', operator: 'contains', value: '' }],
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
      state.rules = await App.GetRules();
      state.validations = await App.ValidateRules().catch(() => []);
      render();
      showToast('Rule deleted', 'success');
    } catch (e) { showToast('Delete failed: ' + e, 'error'); }
  });

  const btnEditRule = document.getElementById('btn-edit-rule');
  if (btnEditRule) btnEditRule.addEventListener('click', () => {
    const selected = document.querySelector('.rule-row.selected');
    if (!selected) { showToast('Select a rule first', 'info'); return; }
    const index = parseInt(selected.dataset.ruleIndex);
    state.editingRule = JSON.parse(JSON.stringify(state.rules[index]));
    render();
  });

  // Rule row click → select / double-click → edit
  document.querySelectorAll('.rule-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      document.querySelectorAll('.rule-row').forEach(r => r.classList.remove('selected', 'bg-blue-900'));
      row.classList.add('selected', 'bg-blue-900');
    });
    row.addEventListener('dblclick', () => {
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

  // ── Prompt tab ──
  const btnSavePromptSettings = document.getElementById('btn-save-prompt-settings');
  if (btnSavePromptSettings) btnSavePromptSettings.addEventListener('click', async () => {
    const iconSize = document.querySelector('input[name="icon-size"]:checked')?.value || 'large';
    const showBrowserNames = document.getElementById('toggle-show-names')?.checked !== false;
    const showURL = document.getElementById('toggle-show-url')?.checked !== false;
    try {
      const settings = { iconSize, showBrowserNames, showURL };
      await App.SaveChooserSettings(settings);
      if (!state.config.chooserSettings) state.config.chooserSettings = {};
      state.config.chooserSettings = settings;
      showToast('Prompt settings saved', 'success');
    } catch (e) { showToast('Save failed: ' + e, 'error'); }
  });

  const btnPreviewPrompt = document.getElementById('btn-preview-prompt');
  if (btnPreviewPrompt) btnPreviewPrompt.addEventListener('click', () => {
    // Show a preview of the chooser using current settings and real browser list
    const cs = state.config.chooserSettings || { iconSize: 'large', showBrowserNames: true, showURL: true };
    showChooserPreview(cs);
  });
}

// ─── Chooser Preview (in settings mode) ──────────────────────────────────────
function showChooserPreview(settings) {
  // Save current state
  const prevMode = state.mode;
  const prevChooserData = state.chooserData;
  const prevChooserSettings = state.chooserSettings;

  // Set up preview data
  state.mode = 'chooser';
  state.chooserData = {
    url: 'https://example.com/some/page?ref=preview',
    domain: 'example.com',
    reason: 'no_rule',
    warning: '',
    browsers: state.browsers,
  };
  state.chooserSettings = settings;
  state.selectedBrowserIndex = 0;
  state.alwaysUse = false;

  // Render chooser over settings
  const appEl = document.getElementById('app');
  const prevHTML = appEl.innerHTML;

  renderChooserMode();

  // Override cancel to restore settings
  const cancelBtn = document.getElementById('btn-chooser-cancel');
  const openBtn = document.getElementById('btn-chooser-open');

  const restoreSettings = () => {
    state.mode = prevMode;
    state.chooserData = prevChooserData;
    state.chooserSettings = prevChooserSettings;
    render();
  };

  if (cancelBtn) cancelBtn.addEventListener('click', restoreSettings, { once: true });
  if (openBtn) openBtn.addEventListener('click', restoreSettings, { once: true });
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
    conditions.push({ field: 'host', operator: 'contains', value: '' });
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
      conditions.splice(idx + 1, 0, { field: 'host', operator: 'contains', value: '' });
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
      state.rules = await App.GetRules();
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
    field:    row.querySelector('.cond-field')?.value    || 'host',
    operator: row.querySelector('.cond-operator')?.value || 'contains',
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

function getBrowserEmoji(browser) {
  const name = (browser.name || '').toLowerCase();
  if (name.includes('chrome'))  return '🟡';
  if (name.includes('edge'))    return '🔵';
  if (name.includes('firefox')) return '🦊';
  if (name.includes('brave'))   return '🦁';
  if (name.includes('safari'))  return '🧭';
  if (name.includes('opera'))   return '🔴';
  return '🌐';
}

// Shorten browser name for display in chooser cards
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

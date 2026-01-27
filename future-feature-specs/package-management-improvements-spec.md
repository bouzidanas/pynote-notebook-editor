# Package Management Improvements Spec

## Overview

Improve the package installation experience in PyNote by making common data science packages easier to install while maintaining the benefits of on-demand loading. This spec balances startup performance with user convenience.

## Problem Statement

Currently, users must:
1. Know that packages need to be installed
2. Manually run `await micropip.install("package")` 
3. Re-install packages every session (packages aren't persistent in Pyodide's memory)
4. Wait for WASM compilation each time (though downloads are cached by browser)

Note: The browser automatically caches package downloads via HTTP cache, but packages still need to be "installed" into Pyodide's runtime each session. This creates friction, especially for new users who expect numpy/pandas to "just work."

## Goals

1. **Fast initial startup** - Keep app load time under 2 seconds
2. **Easy access to common packages** - One-click install for numpy+pandas+matplotlib
3. **Streamlined repeat sessions** - Leverage browser's HTTP cache for fast package re-installation
4. **Progressive enhancement** - Power users can pre-load on startup
5. **Educational** - Teach users about micropip early in tutorial

## Browser Caching Behavior

**Important Discovery**: Pyodide packages are automatically cached by the browser's HTTP cache! When loading packages from the CDN (jsdelivr), the browser stores them in its disk cache.

- **First session**: Downloads packages from CDN (~11 MB for numpy)
- **Subsequent sessions**: Loads from HTTP disk cache (fast!) + compiles WASM (~2-3s)
- **What CAN'T be cached**: Compiled WASM modules (browsers removed this around 2019)

This means we don't need custom IndexedDB caching. The bottleneck on repeat sessions is WASM compilation, not downloads.

## Package Size Reference

```
Package          Download    In-Memory   Use Case
-------------    ----------  -----------  ---------------------
numpy            11.4 MB     40 MB        Numerical computing
pandas           15.8 MB     60 MB        Data analysis  
matplotlib       15.0 MB     50 MB        Visualization
scipy            32.5 MB     105 MB       Scientific computing
scikit-learn     12.3 MB     40 MB        Machine learning
requests         0.4 MB      2 MB         HTTP requests

Common combos:
- numpy only:                 11 MB / 40 MB
- numpy + pandas:             27 MB / 100 MB
- numpy + pandas + matplotlib: 42 MB / 150 MB
- Full scientific stack:      75 MB / 250 MB
```

## Proposed Features

### 1. Quick Setup Button (Priority: HIGH)

**Description**: Add a "Quick Setup" button in the UI that installs the data science trio (numpy, pandas, matplotlib) with one click.

**Location**: 
- Notebook toolbar (top right, near kernel status)
- Welcome/first-run dialog
- Empty notebook placeholder

**UI Mockup**:
```
┌─────────────────────────────────────────────────┐
│  📦 Quick Setup                                 │
│  Install common packages: numpy, pandas,       │
│  matplotlib (~42 MB download)                   │
│                                                 │
│  [Install Now]  [Customize]  [Skip]            │
└─────────────────────────────────────────────────┘
```

**Behavior**:
- Shows progress indicator with package names
- Estimates time remaining
- Can be cancelled mid-install
- On completion, shows success message with "Get Started" CTA
- Persists install state so button doesn't reappear

**Implementation**:
```typescript
// UI Component
interface QuickSetupButton {
  packages: string[];  // ['numpy', 'pandas', 'matplotlib']
  onComplete: () => void;
  onCancel: () => void;
}

// Worker API
interface InstallPackagesMessage {
  type: 'install_packages';
  packages: string[];
  progress_callback?: (pkg: string, progress: number) => void;
}
```

**States**:
1. Not installed → Show button
2. Installing → Show progress
3. Installed → Hide button (or show "Installed ✓")
4. Error → Show retry option

### 2. Browser Cache Awareness (Priority: MEDIUM)

**Description**: Help users understand that packages are cached by the browser and provide cache management tools.

**Why this matters**:
- Users may think packages are "slow to install" when it's actually WASM compilation
- Clearing browser cache will require re-downloading packages
- Understanding cache behavior helps with debugging

**UI Indicators**:
```typescript
// Show cache status during install
interface InstallProgress {
  package: string;
  status: 'downloading' | 'cached' | 'installing';
  fromCache: boolean;  // Show if loaded from HTTP cache
  progress: number;
}
```

**Cache Status UI**:
```
Installing numpy...
✓ Loaded from browser cache (11.4 MB)
⏳ Compiling WASM module...
✓ numpy 1.26.4 ready!
```

**Browser Cache Management**:
```
Settings → Developer Tools
  
  Browser Cache Info:
  Pyodide automatically uses your browser's HTTP cache.
  Packages are stored in: DevTools > Application > Cache Storage
  
  To clear package cache:
  1. Open DevTools (F12)
  2. Application > Storage > Clear site data
  
  Note: First load after clearing will re-download packages.
```

### 3. Tutorial Enhancement (Priority: MEDIUM)

**Description**: Add section early in tutorial showing micropip usage and package ecosystem.

**New Tutorial Section** (after "Part 2: Interactive UI Components"):

```markdown
# Part 2.5: Python Package Ecosystem

PyNote supports thousands of Python packages! Since it runs in the browser via WebAssembly, packages are installed on-demand.

## Installing Packages

Use `micropip` to install any pure Python package from PyPI:
```

**Tutorial Cells**:
```python
# Cell 1: Basic installation
import micropip
await micropip.install("cowsay")
import cowsay
cowsay.cow("Hello from PyPI!")

# Cell 2: Install multiple packages
await micropip.install(["requests", "beautifulsoup4"])
print("✓ Ready for web scraping!")

# Cell 3: Common data science packages
# These are built-in to Pyodide (optimized for WebAssembly)
await micropip.install(["numpy", "pandas", "matplotlib"])
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
print("✓ Data science stack ready!")
```

**Callout Box**:
```
💡 Tip: Use the "Quick Setup" button in the toolbar to install 
numpy, pandas, and matplotlib with one click!
```

### 4. Auto-Preload Setting (Priority: LOW)

**Description**: Optional setting to automatically preload packages on startup for power users.

**Settings UI**:
```
Settings → Advanced → Startup Packages

  ⚙️ Auto-load packages on startup
  
  ☐ Preload numpy (11 MB)
  ☐ Preload pandas (16 MB) 
  ☐ Preload matplotlib (15 MB)
  ☐ Preload scipy (33 MB)
  
  Estimated startup delay: ~3 seconds
  
  [Save Preferences]
```

**Storage**: 
```typescript
interface StartupConfig {
  auto_preload: boolean;
  packages: string[];
  last_updated: number;
}

// Store in localStorage
const config = localStorage.getItem('pynote-startup-config');
```

**Implementation**:
```typescript
// In pyodide.worker.ts initPyodide()
async function initPyodide(): Promise<void> {
  pyodide = await loadPyodide(/* ... */);
  
  // Load startup config
  const config = getStartupConfig();
  
  if (config.auto_preload && config.packages.length > 0) {
    postMessage({ type: 'startup_preload_begin', packages: config.packages });
    
    for (const pkg of config.packages) {
      await pyodide.loadPackage(pkg);
      postMessage({ type: 'startup_preload_progress', package: pkg });
    }
    
    postMessage({ type: 'startup_preload_complete' });
  }
  
  // ... rest of init
}
```

**UI Feedback**:
```
Kernel Status: Starting... (Preloading numpy)
Kernel Status: Starting... (Preloading pandas)
Kernel Status: Starting... (Preloading matplotlib)
Kernel Status: Ready ✓
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Research browser cache behavior with Pyodide CDN
- [ ] Add network activity monitoring in worker
- [ ] Implement cache detection (check if loaded from disk cache)
- [ ] Add cache status to install progress messages

### Phase 2: Quick Setup Button (Week 1-2)
- [ ] Design Quick Setup UI component
- [ ] Implement install progress tracking
- [ ] Add worker message handlers
- [ ] Show button on first run / empty notebooks
- [ ] Add settings toggle to hide button

### Phase 3: Tutorial Update (Week 2)
- [ ] Write new "Python Packages" tutorial section
- [ ] Add micropip examples
- [ ] Add callout for Quick Setup button
- [ ] Test tutorial flow

### Phase 4: Auto-Preload (Week 3)
- [ ] Create settings UI for startup packages
- [ ] Implement preload logic in worker
- [ ] Add progress indicators during startup
- [ ] Save/restore user preferences
- [ ] Performance testing

### Phase 5: Polish (Week 3-4)
- [ ] Browser cache awareness documentation
- [ ] Cache status indicators during install
- [ ] Error handling improvements
- [ ] Documentation updates
- [ ] User testing

## Technical Considerations

### Browser HTTP Cache
- Automatically managed by browser (Chrome, Firefox, Safari)
- Packages from jsdelivr CDN include proper cache headers
- Typical cache size: several GB (browser-managed)
- Cache-Control: public, max-age=31536000 (1 year)
- Users can clear via DevTools or browser settings

### Performance Impact
- **First session**: Download (11 MB for numpy) + compile (~3-5s total)
- **Subsequent sessions**: HTTP cache (~100ms) + compile (~2-3s total)
- **Compilation cannot be cached**: This is the main bottleneck on repeat sessions
- **Startup preload**: Adds 2-5 seconds depending on packages (compilation time)

### Network Monitoring
```typescript
// Detect if package loaded from cache
const perfEntries = performance.getEntriesByType('resource');
const packageEntry = perfEntries.find(e => e.name.includes('numpy'));
const fromCache = packageEntry.transferSize === 0; // 0 = cache hit
```

### CDN Reliability
- jsdelivr CDN has 99.9%+ uptime
- Automatic failover to GitHub if CDN down
- Browser cache works offline after first load
- Consider self-hosting for enterprise deployments

## Success Metrics

### User Experience
- **Faster repeat sessions**: 60% reduction in package install time (from ~5s to ~2s via HTTP cache)
- **Reduced friction**: 90% of users install common packages via Quick Setup
- **Tutorial completion**: 20% increase in users completing package tutorial
- **User understanding**: 70%+ users understand packages persist in browser cache

### Performance
- **Browser cache effectiveness**: 95%+ of repeat installs use HTTP cache
- **Startup time**: Remains under 2 seconds (non-preload)
- **Average install time**: <3s for cached packages, <6s for fresh downloads

### Technical
- **CDN reliability**: 99.9%+ uptime for jsdelivr
- **Cache detection accuracy**: 95%+ correct identification of cache hits
- **Network errors**: <1% of installs fail due to network issues

## Future Enhancements

### Not in Scope (for now)
1. **Package version management**: Allow users to specify/update versions
2. **Custom package registries**: Support private PyPI mirrors
3. **Dependency analysis**: Show package dependency trees
4. **Import autocomplete**: Suggest packages based on import statements
5. **Package search UI**: Browse available Pyodide packages
6. **Background preloading**: Load popular packages while user reads tutorial
7. **Shared cache**: Share cache between notebooks/tabs (via SharedArrayBuffer)

### Post-Launch Ideas
- **Smart preload**: Machine learning to predict which packages user will need
- **Package bundles**: Predefined sets like "Data Science", "Web Scraping", "ML"
- **Community templates**: Share notebook + required packages
- **Offline mode**: Fully functional with pre-cached packages

## Open Questions

1. **Should we differentiate between Pyodide packages vs pure Python?**
   - Pyodide packages (numpy, pandas) are ~10x larger but more reliable
   - Pure Python packages are smaller but may have compatibility issues
   - Proposed: Show "Built for Pyodide ✓" badge for optimized packages
   
2. **Show cache status during installation?**
   - Pro: Educational, helps users understand performance
   - Con: May be too technical for beginners
   - Proposed: Show cache indicator for power users only (settings toggle)

3. **Show estimated download sizes before install?**
   - Pro: Users know what they're committing to (especially on mobile)
   - Con: Adds complexity to Quick Setup flow
   - Proposed: Show size in "Customize" mode only

4. **Warn users before clearing browser cache?**
   - Pro: Prevents accidental re-downloads
   - Con: Can't actually prevent it (browser setting)
   - Proposed: Add info box explaining cache location and consequences

## References

- [Pyodide Package List](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)
- [Pyodide Loading Packages](https://pyodide.org/en/stable/usage/loading-packages.html)
- [Browser HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API)
- [micropip Documentation](https://micropip.pyodide.org/)
- [Pyodide Issue #3940](https://github.com/pyodide/pyodide/issues/3940) - Caching discussion
- [V8 WASM Code Caching](https://v8.dev/blog/wasm-code-caching)

## Revision History

- 2026-01-27: Initial spec created
- 2026-01-27: Updated based on browser caching research - removed IndexedDB caching feature (browser already handles this via HTTP cache)

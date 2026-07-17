/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import "katex/dist/katex.min.css";
import App from './App.tsx'
import { loadThemeFonts, injectCachedThemeFonts } from './lib/font-loader'
import { loadAppTheme } from './lib/theme'
import { sessionManager } from './lib/session'

const root = document.getElementById('root')

// Google fonts referenced by the initial theme (session theme when one
// exists, else the app theme). Rendering is only ever held up when BOTH are
// true: a font actually needs a network fetch, and this is a session being
// created (no restorable session data). Refreshes and reloads of an existing
// session always render immediately; session-cached font CSS is registered
// synchronously so the font is still there at first paint, and anything
// uncached loads in the background and swaps in.
const boot = (() => {
  try {
    const sessionId = sessionManager.getSessionIdFromUrl();
    const session = sessionId ? sessionManager.loadSession(sessionId) : null;
    return { theme: session?.theme || loadAppTheme(), existingSession: !!session };
  } catch {
    return { theme: null, existingSession: false };
  }
})();

const start = () => render(() => <App />, root!)
if (boot.theme) {
  const allCached = injectCachedThemeFonts(boot.theme)
  if (!allCached && !boot.existingSession) {
    loadThemeFonts(boot.theme).then(start, start)
  } else {
    void loadThemeFonts(boot.theme)
    start()
  }
} else {
  start()
}

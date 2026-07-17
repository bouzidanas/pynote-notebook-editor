/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import "katex/dist/katex.min.css";
import App from './App.tsx'
import { loadThemeFonts } from './lib/font-loader'
import { loadAppTheme } from './lib/theme'
import { sessionManager } from './lib/session'

const root = document.getElementById('root')

// Fetch any Google fonts the initial theme references before first render,
// so the first paint already uses them (no fallback-font flash). The theme
// applied on mount is the session theme when one exists, else the app theme.
const initialTheme = (() => {
  try {
    const sessionId = sessionManager.getSessionIdFromUrl();
    const session = sessionId ? sessionManager.loadSession(sessionId) : null;
    return session?.theme || loadAppTheme();
  } catch {
    return null;
  }
})();

const start = () => render(() => <App />, root!)
if (initialTheme) {
  // Resolves immediately when the theme's fonts are cached or bundled; only
  // a genuinely un-fetched Google font holds first render, capped at 1.5s so
  // a slow network can't leave the preloader background up for long.
  loadThemeFonts(initialTheme, 1500).then(start, start)
} else {
  start()
}

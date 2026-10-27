// The project sits inside the PyNote repository in tests; its own folder is the
// root. `next dev` (the StrictMode test) writes no agent instruction files.
export default { turbopack: { root: import.meta.dirname }, agentRules: false };

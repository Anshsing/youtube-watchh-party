// Frontend config for WatchParty.
//
// Since the frontend is served by the same Express server as the backend,
// WS_URL stays null — the browser auto-connects to the same host and port.
// No changes needed here for deployment.

const WATCH_PARTY_CONFIG = {
  WS_URL: null,
};

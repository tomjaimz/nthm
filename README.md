# nthm

minimal client/server implementation of the public Web Playback SDK

run with `node server.js` (install not required)

recommended order of operations is

1. connect (can be set to connect automatically)
2. transfer (should be automatic if connect was successful)
3. (if paused) togglePlay

- requires nodejs, but uses no npm modules (except a json formatter loaded from a cdn client-side)
- prompts for client id, client secret, and redirect uri
- stores client settings in a local settings json file
- runs and opens a web server
- token handling including renewal - stored in the client's local storage
- transfers playback to local device
- provides buttons for main methods
- anthem events logged to console and in browser

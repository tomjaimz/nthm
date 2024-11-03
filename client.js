
const saveSettings = async (key, id) => {
    console.log({ key, id })
    const settingsResponse = await fetch('/settings')
    const settings = await settingsResponse.json()
    settings.client[key] = document.getElementById(id).value
    await writeSettings(settings)
}

const writeSettings = async (settings) => await fetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
    headers: { 'Content-Type': 'application/json' },
})

const readSettings = async () => {
    const settingsResponse = await fetch('/settings')
    const settings = await settingsResponse.json()
    const { id, secret, redirect_uri } = settings?.client
    const token = JSON.parse(localStorage.getItem('token'))
    document.getElementById("clientId").value = id
    document.getElementById("clientSecret").value = secret
    document.getElementById("redirectURI").value = redirect_uri
    document.getElementById("accessToken").value = token.access_token
    document.getElementById("refreshToken").value = token.refresh_token

    document.getElementById("clientId").onchange = async () => saveSettings("id", "clientId")
    document.getElementById("clientSecret").onchange = async () => saveSettings("secret", "clientSecret")
    document.getElementById("redirectURI").onchange = async () => saveSettings("redirect_uri", "redirectURI")

    document.getElementById("saveClientId").onclick = async () => saveSettings("id", "clientId")
    document.getElementById("saveClientSecret").onclick = async () => saveSettings("secret", "clientSecret")
    document.getElementById("saveRedirectURI").onclick = async () => saveSettings("redirect_uri", "redirectURI")


    document.getElementById("accessToken").onchange = async () => {
        token.access_token = document.getElementById("accessToken").value
        localStorage.setItem('token', JSON.stringify(token));
    }
    document.getElementById("refreshToken").onchange = async () => {
        token.access_token = document.getElementById("refreshToken").value
        localStorage.setItem('token', JSON.stringify(token));
    }
}

// client function
window.onSpotifyWebPlaybackSDKReady = async () => {
    /* Add Button Actions */
    const autoConnectCheckbox = document.getElementById("autoConnectCheckbox");
    autoConnectCheckbox.checked = JSON.parse(localStorage.getItem("autoConnectCheckbox"));
    autoConnectCheckbox.onclick = e => {
        localStorage.setItem("autoConnectCheckbox", JSON.stringify(e.target.checked));
    };

    const playButton = document.getElementById('playButton')
    playButton.onclick = async () => {
        const inputValue = document.getElementById("urlInput").value;
        const match = inputValue.match(/https:\/\/open\.spotify\.com\/(.*)\/([^?]*)/);
        const [, type, id] = match ? match : inputValue.split(':');
        const uri = `spotify:${type}:${id}`;
        await api(`me/player/play`, 'PUT', ['track', 'episode'].includes(type) ? { uris: [uri] } : { context_uri: uri });
    };

    const actionElement = document.getElementById("actions")
    for (const action of ACTIONS) {
        const button = document.createElement('button');
        const [func, parameter] = action.split('#');
        button.onclick = async () => log({
            [action]: await player[func](parameter ? parameter : null)
        });
        button.innerText = func + (parameter ? `(${parameter})` : '');
        actionElement.append(button, ' ');
    }

    const logDiv = document.getElementById("log")
    logDiv.addEventListener("click", () => {
        if (logDiv.scrollTop === logDiv.scrollHeight)
            setTimeout(() => { logDiv.scrollTop = logDiv.scrollHeight; }, 400);
    });

    const log = v => {
        const formatter = new JSONFormatter(v, 1, { hoverPreviewEnabled: true, hoverPreviewArrayCount: 100, hoverPreviewFieldCount: 5, });
        logDiv.appendChild(formatter.render());
        logDiv.scrollTop = logDiv.scrollHeight;
        console.log((new Date()).toISOString(), v);
    };

    /* Token Handling */

    const { origin, pathname, searchParams } = new URL(document.location);

    const requestToken = async (body) => {
        const response = await fetch(`/requestToken`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
        });
        if (response.status >= '400') {
            return await response.json();
        }
        token = await response.json();
        if (!token.refresh_token && body.refresh_token) token.refresh_token = body.refresh_token;
        token.expires_at = new Date().setSeconds(new Date().getSeconds() + token.expires_in);
        localStorage.setItem('token', JSON.stringify(token));
        return token.access_token;
    };

    if (searchParams.get('code')) { // have been redirected from spotify callback
        const redirect_uri = `${origin}${pathname}`;
        const response = await requestToken({ code: searchParams.get('code'), state: searchParams.get('state'), grant_type: 'authorization_code', redirect_uri });
        const redirect_uri_invalid = (response.statusCode == 400 && response.body?.error_description == 'Invalid redirect URI')
        location.href = `${pathname}?request_result=${(redirect_uri_invalid ? 'invalid_redirect_uri' : 'success')}`
        return
    }

    const newToken = async () => {
        location.href = '/authorizeUrl';
    }

    const refreshToken = async () => {
        const { refresh_token } = JSON.parse(localStorage.getItem('token'))
        const response = await requestToken({ refresh_token, grant_type: 'refresh_token' })
        if (response.statusCode == 400) {
            if (response.body.error == 'invalid_grant') {
                token = {}
                localStorage.setItem('token', JSON.stringify(token));
                return "Token has been revoked.  Use newToken to create a new token."
            }
            if (response.body.error == 'invalid_request') {
                return "No token.  Use newToken to create a new token."
            }
        }
        return response
    }

    const getToken = async () => {
        const token = JSON.parse(localStorage.getItem('token')) || {};
        const { access_token, expires_at } = token;
        if (!access_token) {
            return newToken();
        }
        if (new Date(expires_at) < new Date()) {
            return await refreshToken()
        }
        return access_token;
    };

    const api = async (url, method, body) => fetch(`https://api.spotify.com/v1/${url}`, {
        method,
        body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
    });

    if (searchParams.get('request_result') == 'invalid_redirect_uri') { // have been redirected from spotify callback
        log(`ERROR: Redirect URI ${origin}${pathname} has not been registered.`)
    }

    if (searchParams.get('request_result') == 'success') { // have been redirected from spotify callback
        log(`New token created.`)
    }

    log("DOM Initialised");

    await readSettings()

    /* Initialise Player */
    const player = new Spotify.Player({
        name: PLAYER_NAME,
        getOAuthToken: async fn => fn(await getToken())
    });

    log(`Player created with name ${PLAYER_NAME}`);

    player.newToken = newToken

    player.refreshToken = refreshToken

    player.transfer = async () => {
        const { device_id } = player._options;
        if (device_id) {
            const response = await api('me/player', 'PUT', { device_ids: [device_id] });
            if (response.status === 404) {
                const { message } = await response.json();
                if (message === "Device not found") {
                    log('Device not found: Try connect first');
                }
            }
        } else {
            log('No Device ID: Try connect first');
        }
        return device_id;
    };

    player.me = async () => await (await api('me', 'GET')).json();

    player.playerState = async () => {
        const playerResponse = await api('me/player', 'GET')
        if (playerResponse.status == 204) {
            return "Nothing playing right now"
        }
        return await playerResponse.json()
    };

    for (const event of EVENTS) {
        player.addListener(`${event}`, body => {
            if (event === 'ready') {
                log({ body })
                player._options.device_id = body.device_id;
                log("Auto transferring...");
                player.transfer();
            }
            if (event === 'playback_error' && body.message === 'Cannot perform operation; no list was loaded.') {
                log('Try transfer to transfer playback to this client first.');
            }
            log({
                [event]: body
            });
        });
    }

    if (JSON.parse(localStorage.getItem("autoConnectCheckbox"))) {
        log("Auto connecting...");
        player.connect();
    }
};
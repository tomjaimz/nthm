const PLAYER_NAME = "Web Playback SDK [" + new Date().toISOString() + "]";

const inputs = [
    { id: "client_id", label: "Enter Client ID", buttonLabel: "Save", action: "saveSetting" },
    { id: "client_secret", label: "Enter Client Secret", buttonLabel: "Save", action: "saveSetting" },
    { id: "redirect_uri", label: "Enter Redirect URI", buttonLabel: "Save", action: "saveSetting" },
    { id: "access_token", label: "Enter Access Token", buttonLabel: "Save", action: "saveToken" },
    { id: "refresh_token", label: "Enter Refresh Token", buttonLabel: "Save", action: "saveToken" },
    { id: "url_input", label: "Enter URL or URI", buttonLabel: "Play", action: "playAction" },
]

const actions = [
    { action: "newToken", type: "base", requires: 'client' },
    { action: "refreshToken", type: "base", requires: 'client' },
    { action: "me", type: "base", requires: 'token' },
    { action: "playerState", type: "base", requires: 'token' },
    { action: "transfer", type: "base", requires: 'token' },
    { action: "connect", type: "player" },
    { action: "previousTrack", type: "player", },
    { action: "pause", type: "player", },
    { action: "togglePlay", type: "player", },
    { action: "resume", type: "player", },
    { action: "nextTrack", type: "player", },
    { action: "getCurrentState", type: "player", },
    { action: "getVolume", type: "player", },
    { action: "setVolume", type: "player", parameter: "0", },
    { action: "setVolume", type: "player", parameter: "0.5", },
    { action: "setVolume", type: "player", parameter: "1", },
    { action: "seek", type: "player", parameter: "0", },
    { action: "seek", type: "player", parameter: "10000", },
    { action: "disconnect", type: "player", }
];

const events = [
    "initialization_error",
    "authentication_error",
    "account_error",
    "playback_error",
    "player_state_changed",
    "ready",
    "not_ready",
];

const addEvent = (el, ev, fn) => (el.attachEvent) ? el.attachEvent('on' + ev, fn) : el.addEventListener(ev, fn, false);

const create = (tag, props, text) => {
    const el = document.createElement(tag);
    for (const key in props) {
        el[key] = props[key];
    }
    if (text) { el.innerText = text; }
    return el;
}

const inputActions = {
    saveToken: async (key, value, span) => {
        token[key] = value;
        localStorage.setItem("token", JSON.stringify(token))
        span.innerText = "Saved"
    },
    saveSetting: async (key, value, span) => {
        await fetch("/settings", {
            method: "PUT",
            body: JSON.stringify({ [key]: value }),
            headers: { "Content-Type": "application/json" },
        });
        span.innerText = "Saved"
        location.reload()
    },
    playAction: async (key, value, span) => {
        const match = value.match(
            /https:\/\/open\.spotify\.com\/(.*)\/([^?]*)/
        );
        const [, type, id] = match ? match : value.split(":");
        const uri = `spotify:${type}:${id}`;
        await api(
            `me/player/play`,
            "PUT",
            ["track", "episode"].includes(type)
                ? { uris: [uri] }
                : { context_uri: uri }
        );
        span.innerText = "Playing"
    },
}

const log = (v) => {
    const logDiv = document.getElementById("log");
    const formatter = new JSONFormatter(v, 1, {
        hoverPreviewEnabled: true,
        hoverPreviewArrayCount: 100,
        hoverPreviewFieldCount: 5,
    });
    logDiv.appendChild(formatter.render());
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(new Date().toISOString(), v);
};

const requestToken = async (body) => {
    const response = await fetch(`/requestToken`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
    if (response.status >= "400") {
        return await response.json();
    }
    token = await response.json();
    if (!token.refresh_token && body.refresh_token) token.refresh_token = body.refresh_token;
    token.expires_at = new Date().setSeconds(
        new Date().getSeconds() + token.expires_in
    );
    localStorage.setItem("token", JSON.stringify(token));
    return token.access_token;
};

const newToken = async () => {
    location.href = "/authorizeUrl";
};

const refreshToken = async () => {
    const { refresh_token } = JSON.parse(localStorage.getItem("token"));
    const response = await requestToken({
        refresh_token,
        grant_type: "refresh_token",
    });
    if (response.statusCode == 400) {
        if (response.body.error == "invalid_grant") {
            token = {};
            localStorage.setItem("token", JSON.stringify(token));
            return "Token has been revoked.  Use newToken to create a new token.";
        }
        if (response.body.error == "invalid_request") {
            return "No token.  Use newToken to create a new token.";
        }
    }
    return response;
};

const getAccessToken = async () => {
    const { access_token, expires_at } = token;
    if (!access_token) {
        return newToken();
    }
    if (new Date(expires_at) < new Date()) {
        return await refreshToken();
    }
    return access_token;
};

const api = async (url, method, body) =>
    fetch(`https://api.spotify.com/v1/${url}`, {
        method,
        body: JSON.stringify(body),
        headers: {
            Authorization: `Bearer ${await getAccessToken()}`,
            "Content-Type": "application/json",
        },
    });

const transfer = async () => {
    const { device_id } = player._options;
    if (device_id) {
        const response = await api("me/player", "PUT", {
            device_ids: [device_id],
        });
        if (response.status === 404) {
            const { message } = await response.json();
            if (message === "Device not found") {
                log("Device not found: Try connect first");
            }
        }
    } else {
        log("No Device ID: Try connect first");
    }
    return device_id;
};

const me = async () => await (await api("me", "GET")).json();

const playerState = async () => {
    const playerResponse = await api("me/player", "GET");
    if (playerResponse.status == 204) {
        return "Nothing playing right now";
    }
    return await playerResponse.json();
};

const drawDOM = async () => {
    const autoConnectCheckbox = document.getElementById("autoConnectCheckbox");
    autoConnectCheckbox.checked = JSON.parse(
        localStorage.getItem("autoConnectCheckbox")
    );
    addEvent(autoConnectCheckbox, "click", (e) => {
        localStorage.setItem(
            "autoConnectCheckbox",
            JSON.stringify(e.target.checked)
        );
    })

    const settingsResponse = await fetch("/settings");
    const { client_id, client_secret, redirect_uri } = await settingsResponse.json();
    token = JSON.parse(localStorage.getItem("token"));
    const values = {
        client_id,
        client_secret,
        redirect_uri,
        access_token: token?.access_token ? token.access_token : "",
        refresh_token: token?.refresh_token ? token.refresh_token : "",
        url_input: "",
    }

    const hasClient = client_id.length > 0 && client_secret.length > 0
    const hasToken = (token?.access_token && token.access_token.length > 0)

    const contentElement = document.getElementById("content");
    for (const { id, label, buttonLabel, action } of inputs) {
        const labelElement = create("label", { for: id }, label);
        const inputElement = create("input", { id, placeholder: label, value: values[id] });
        const button = create("button", { id: `${id}${buttonLabel}` }, buttonLabel);
        const msgElement = create("span", { id: `${id}msg` })
        addEvent(inputElement, "change", () => inputActions[action](id, inputElement.value, msgElement));
        addEvent(button, "click", () => inputActions[action](id, inputElement.value, msgElement));
        contentElement.append(labelElement, inputElement, button, msgElement, create("br"));
    }

    const actionElement = document.getElementById("actions");
    const base = { newToken, refreshToken, me, transfer, playerState }
    for (const { action, type, parameter, requires } of actions) {
        const display = ((type == "player" || requires == "token") && hasToken) || (requires == "client" && hasClient)
        const button = create("button", { style: `display:${display ? 'show' : 'none'};` }, action + (parameter ? `(${parameter})` : ""));
        addEvent(button, "click", async () => log({
            [action]: type === 'base' ? await base[action]() : await player[action](parameter),
        }))
        actionElement.append(button, " ");
    }

    const logDiv = document.getElementById("log");
    logDiv.addEventListener("click", () => {
        if (logDiv.scrollTop === logDiv.scrollHeight) {
            setTimeout(() => { logDiv.scrollTop = logDiv.scrollHeight; }, 400);
        }
    });

    log("DOM Initialised");

    const { origin, pathname, searchParams } = new URL(document.location);

    if (searchParams.get("code")) {
        // have been redirected from spotify callback
        const redirect_uri = `${origin}${pathname}`;
        const response = await requestToken({
            code: searchParams.get("code"),
            state: searchParams.get("state"),
            grant_type: "authorization_code",
            redirect_uri,
        });
        const redirect_uri_invalid =
            response.statusCode == 400 &&
            response.body?.error_description == "Invalid redirect URI";
        location.href = `${pathname}?request_result=${redirect_uri_invalid ? "invalid_redirect_uri" : "success"
            }`;
        return;
    }

    if (searchParams.get("request_result") == "invalid_redirect_uri") {
        // have been redirected from spotify callback
        log(`ERROR: Redirect URI ${origin}${pathname} has not been registered.`);
    }

    if (searchParams.get("request_result") == "success") {
        // have been redirected from spotify callback
        log(`New token created.`);
    }
}

drawDOM();

let player, settings

window.onSpotifyWebPlaybackSDKReady = async () => {
    player = new Spotify.Player({
        name: PLAYER_NAME,
        getOAuthToken: async (fn) => fn(await getAccessToken()),
    });
    log(`Player created with name ${PLAYER_NAME}`);

    for (const event of events) {
        player.addListener(`${event}`, (body) => {
            if (event === "ready") {
                log({ body });
                player._options.device_id = body.device_id;
                log("Auto transferring...");
                transfer();
            }
            if (
                event === "playback_error" &&
                body.message === "Cannot perform operation; no list was loaded."
            ) {
                log("Try transfer to transfer playback to this client first.");
            }
            log({
                [event]: body,
            });
        });
    }

    if (JSON.parse(localStorage.getItem("autoConnectCheckbox"))) {
        log("Auto connecting...");
        player.connect();
    }
};

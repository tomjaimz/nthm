/* Importing required modules */
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

/* Basic Settings */
const PORT = 8888;
const SETTINGS_FILENAME = ".settings.json";
const BODY_HTML = "index.html";
const SCRIPT_FILENAME = "client.js";

/* Spotify Settings */
const HOSTNAME = "https://accounts.spotify.com/";
const AUTHORIZE_URL = `${HOSTNAME}authorize`;
const API_TOKEN_URL = `${HOSTNAME}api/token`;

const SCOPE = ["streaming", "user-read-email", "user-read-private"];
const SPOTIFY_PLAYER_URL = "//sdk.scdn.co/spotify-player.js";
const JSON_FORMATTER_URL =
  "//cdn.jsdelivr.net/npm/json-formatter-js/dist/json-formatter.umd.min.js";

const FAVICON_BASE64 =
  "AAABAAEAEBAQAAAAAAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAEhEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP7/AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA";

/* Settings passed to client */
const PLAYER_NAME = "Web Playback SDK [" + new Date().toISOString() + "]";
const ACTIONS = [
  "newToken",
  "refreshToken",
  "me",
  "playerState",
  "connect",
  "disconnect",
  "transfer",
  "getCurrentState",
  "getVolume",
  "setVolume#0",
  "setVolume#0.5",
  "setVolume#1",
  "pause",
  "resume",
  "togglePlay",
  "previousTrack",
  "nextTrack",
  "seek#0",
  "seek#10000",
];
const EVENTS = [
  "initialization_error",
  "authentication_error",
  "account_error",
  "playback_error",
  "player_state_changed",
  "ready",
  "not_ready",
];

let settings;

const getSettings = async () => {
  const fileContents = getFile(SETTINGS_FILENAME);
  if (fileContents) {
    settings = JSON.parse(fileContents);
  } else {
    setData({ client: { id: "", secret: "", redirect_uri: "" } });
  }
};

const setData = (input) => {
  if (input.client?.redirect_uri === "" || !input.client?.redirect_uri) {
    input.client.redirect_uri = `http://localhost:${PORT}/`;
  }
  settings = { ...settings, ...input };
  fs.writeFileSync(SETTINGS_FILENAME, JSON.stringify(settings));
};

const getFile = (filename) =>
  fs.existsSync(filename) && fs.readFileSync(filename);

const indexHTML = `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="${SPOTIFY_PLAYER_URL}"></script>
    <script src="${JSON_FORMATTER_URL}"></script>
  </head>
  <body>
  ${getFile(BODY_HTML) || ""}
    <script>
const { PLAYER_NAME, ACTIONS, EVENTS } = ${JSON.stringify({
  PLAYER_NAME,
  ACTIONS,
  EVENTS,
})}
    </script>
    <script src="script.js"></script>
  </body>
</html>`;

const getAuthorizeURL = () => {
  for (const state in verifications) {
    console.log(
      `${state} ${verifications[state].expiry - new Date().getTime()}`
    );
    if (verifications[state].expiry < new Date().getTime()) {
      delete verifications[state];
    }
  }

  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(64).toString("hex");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  verifications[state] = {
    codeVerifier,
    codeChallenge,
    expiry: new Date().getTime() + 10 * 60 * 1000,
  };

  const Location = new URL(AUTHORIZE_URL);
  Location.searchParams.set("response_type", "code");
  Location.searchParams.set("client_id", settings.client.id);
  Location.searchParams.set("redirect_uri", settings.client.redirect_uri);
  Location.searchParams.set("scope", SCOPE);
  Location.searchParams.set("state", state);
  Location.searchParams.set("code_challenge_method", "S256");
  Location.searchParams.set("code_challenge", codeChallenge);
  return Location;
};

const verifications = {};

const createLocalhost = () => {
  http
    .createServer(async (req, res) => {
      try {
        const { pathname } = new URL(req.url, `https://${req.headers.host}`);
        // console.log(pathname)
        if (pathname === "/favicon.ico") {
          res
            .writeHead(200, { "Content-Type": "image/x-icon" })
            .write(Buffer.from(FAVICON_BASE64, "base64"));
          res.end();
          return;
        }
        if (pathname === "/settings") {
          if (req.method === "PUT") {
            let body = "";
            req
              .on("data", (c) => {
                body += c;
              })
              .on("end", async () => {
                try {
                  settings = JSON.parse(body);
                  setData(settings);
                  res.writeHead(200, { "Content-Type": "application/json" });
                } catch (e) {
                  console.log(e);
                  res
                    .writeHead(400, { "Content-Type": "application/json" })
                    .end(JSON.stringify(e));
                }
              });
            return;
          }
          if (req.method === "GET") {
            settings = JSON.parse(getFile(SETTINGS_FILENAME) || "{}");

            res
              .writeHead(200, { "Content-Type": "application/json" })
              .end(JSON.stringify(settings));
            return;
          }
        }
        if (pathname === "/requestToken") {
          let data = "";
          req
            .on("data", (c) => {
              data += c;
            })
            .on("end", async () => {
              try {
                const parsedData = JSON.parse(data);
                let params;
                if (parsedData.grant_type === "authorization_code") {
                  const { code, state, grant_type, redirect_uri } = parsedData;
                  const code_verifier = verifications[state].codeVerifier;
                  params = {
                    code,
                    grant_type,
                    redirect_uri,
                    code_verifier,
                  };
                }
                if (parsedData.grant_type === "refresh_token") {
                  const { refresh_token, grant_type } = parsedData;
                  params = { refresh_token, grant_type };
                }
                const response = await fetch(API_TOKEN_URL, {
                  method: "POST",
                  body: new URLSearchParams(params).toString(),
                  headers: {
                    Authorization: `Basic ${Buffer.from(
                      `${settings.client.id}:${settings.client.secret}`
                    ).toString("base64")}`,
                    "Content-Type":
                      "application/x-www-form-urlencoded;charset=UTF-8",
                  },
                });
                if (response.ok) {
                  const token = await response.json();
                  if (token.refresh_token) {
                    console.log(
                      token.refresh_token ? "Token aquired" : "Token refreshed"
                    );
                  }
                  console.log(`Access token: ${token.access_token}`);
                  if (token.refresh_token) {
                    console.log(`Refresh token: ${token.refresh_token}`);
                  }
                  res
                    .writeHead(200, { "Content-Type": "application/json" })
                    .end(JSON.stringify(token));
                } else {
                  const text = await response.text();
                  console.log(`Error: ${response.status} ${text}`);
                  res
                    .writeHead(response.status, {
                      "Content-Type": "application/json",
                    })
                    .end(JSON.stringify(text));
                }
              } catch (e) {
                console.log({ e });
                if (e.body?.error == "invalid_client") {
                  console.log(`Client ID ${settings.client.id} is not valid.`);
                }
                console.log("Authorization error.");
                if (e.body.error == "invalid_grant") {
                  if (
                    e.body.error_description == "Invalid authorization code"
                  ) {
                    console.log(`code paramater incorrect`);
                  }
                  if (e.body.error_description == "Invalid redirect URI") {
                    console.log(
                      `Redirect URI ${settings.client.redirect_uri} has not been registered.`
                    );
                  }
                }
                if (e.body.error_description == "Refresh token revoked") {
                  console.log("Token has been revoked.  Delete token.");
                }
                res
                  .writeHead(e.statusCode, {
                    "Content-Type": "application/json",
                  })
                  .end(JSON.stringify(e));
              }
            });
          return;
        }
        if (pathname === "/authorizeUrl") {
          console.log("Redirecting to Authorize URL");
          console.log(
            'Reminder: If this says "INVALID_CLIENT: Invalid redirect URI" you need to add the redirect URI to your Spotify app settings.'
          );
          console.log(
            `App settings: https://developer.spotify.com/dashboard/${settings.client.id}/settings`
          );
          console.log(`Redirect URI: ${settings.client.redirect_uri}`);
          console.log("Remember to hit Add and also Save");
          res.writeHead(302, { Location: getAuthorizeURL() }).end();
          return;
        }
        if (pathname === "/script.js") {
          res
            .writeHead(200, { "Content-Type": "application/javascript" })
            .end(getFile(SCRIPT_FILENAME) || "");
          return;
        }
        if (pathname === "/") {
          res.writeHead(200, { "Content-Type": "text/html" }).end(indexHTML);
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" }).end();
      } catch (e) {
        console.error(e);
      }
    })
    .listen(PORT);
};

const main = async () => {
  await getSettings();
  createLocalhost();

  console.log(`Open ${settings.client.redirect_uri}`);
};

main();

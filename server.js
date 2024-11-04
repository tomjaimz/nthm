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

const FAVICON_BASE64 =
    "AAABAAEAEBAQAAAAAAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAEhEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP7/AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA";

let settings;

const verifications = {};

const setData = (input) => {
    settings = { ...settings, ...input };
    fs.writeFileSync(SETTINGS_FILENAME, JSON.stringify(settings));
};

const getSettings = async () => {
    const fileContents = getFile(SETTINGS_FILENAME);
    if (fileContents) {
        settings = JSON.parse(fileContents);
    } else {
        setData({ client_id: "", client_secret: "", redirect_uri: "" });
    }
};

const getFile = (filename) =>
    fs.existsSync(filename) && fs.readFileSync(filename);

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
    Location.searchParams.set("client_id", settings.client_id);
    Location.searchParams.set("redirect_uri", settings.redirect_uri);
    Location.searchParams.set("scope", SCOPE);
    Location.searchParams.set("state", state);
    Location.searchParams.set("code_challenge_method", "S256");
    Location.searchParams.set("code_challenge", codeChallenge);
    return Location;
};

const CT_IX = { "Content-Type": "image/x-icon" };
const CT_AJ = { "Content-Type": "application/json" };
const CT_TH = { "Content-Type": "text/html" };
const CT_TP = { "Content-Type": "text/plain" };
const CT_AX = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };

const createLocalhost = () => {
    http.createServer(async (req, res) => {
        try {
            const { pathname } = new URL(req.url, `https://${req.headers.host}`);
            if (pathname === "/") {
                res.writeHead(200, CT_TH).end(getFile(BODY_HTML));
                return;
            }
            if (pathname === "/script.js") {
                res.writeHead(200, CT_AJ).end(getFile(SCRIPT_FILENAME));
                return;
            }
            if (pathname === "/favicon.ico") {
                res.writeHead(200, CT_IX).write(Buffer.from(FAVICON_BASE64, "base64"));
                res.end();
                return;
            }
            if (pathname === "/authorizeUrl") {
                res.writeHead(302, { Location: getAuthorizeURL() }).end();
                return;
            }
            if (pathname === "/settings" && req.method === "GET") {
                res.writeHead(200, CT_AJ).end(JSON.stringify(settings));
                return;
            }
            if (pathname === "/settings" && req.method === "PUT") {
                let data = "";
                req
                    .on("data", (c) => { data += c; })
                    .on("end", async () => {
                        try {
                            setData(JSON.parse(data));
                            res.writeHead(200);
                        } catch (e) {
                            res.writeHead(400, CT_AJ).end(JSON.stringify(e));
                        }
                    });
                return;
            }
            if (pathname === "/requestToken") {
                let data = "";
                req
                    .on("data", (c) => { data += c; })
                    .on("end", async () => {
                        try {
                            const parsedData = JSON.parse(data);
                            const params = { grant_type: parsedData.grant_type };
                            if (params.grant_type === "authorization_code") {
                                params.code = parsedData.code
                                params.redirect_uri = parsedData.redirect_uri
                                params.code_verifier = verifications[parsedData.state].codeVerifier
                            }
                            if (params.grant_type === "refresh_token") {
                                params.refresh_token = parsedData.refresh_token;
                            }
                            const response = await fetch(API_TOKEN_URL, {
                                method: "POST",
                                body: new URLSearchParams(params).toString(),
                                headers: {
                                    ...CT_AX,
                                    Authorization: `Basic ${Buffer.from(`${settings.client_id}:${settings.client_secret}`).toString("base64")}`,
                                },
                            });
                            if (response.ok) {
                                res.writeHead(200, CT_AJ).end(JSON.stringify(await response.json()));
                            } else {
                                res.writeHead(response.status, CT_AJ).end(JSON.stringify(await response.text()));
                            }
                        } catch (e) {
                            console.error(e);
                            res.writeHead(e.statusCode, CT_AJ).end(JSON.stringify(e));
                        }
                    });
                return;
            }
            res.writeHead(404, CT_TP).end();
        } catch (e) {
            console.error(e);
        }
    })
        .listen(PORT);
};

const main = async () => {
    await getSettings();
    createLocalhost();

    console.log(`Open ${settings.redirect_uri}`);
};

main();

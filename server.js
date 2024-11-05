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

const getFile = (filename) =>
    fs.existsSync(filename) && fs.readFileSync(filename);

const getSettings = async () => {
    const fileContents = getFile(SETTINGS_FILENAME);
    if (fileContents) {
        settings = JSON.parse(fileContents);
    } else {
        setData({ client_id: "", client_secret: "", redirect_uri: `http://localhost:${PORT}/` });
    }
};

const getAuthorizeURL = () => {
    for (const state in verifications) {
        // delete old verifications
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

// Just to be tidier
const CT = "Content-Type"
const AJ = "application/json";
const AX = "application/x-www-form-urlencoded;charset=UTF-8";
const IX = "image/x-icon";
const TH = "text/html";
const TP = "text/plain";

const readReq = (req) => new Promise(resolve => {
    let d = "";
    req.on("data", (c) => { d += c }).on("end", () => resolve(d))
})

const server = async (req, res) => {
    try {
        const { pathname } = new URL(req.url, `https://${req.headers.host}`);
        if (pathname === "/") {
            return res.writeHead(200, { CT: TH }).end(getFile(BODY_HTML));
        }
        if (pathname === "/script.js") {
            return res.writeHead(200, { CT: AJ }).end(getFile(SCRIPT_FILENAME));
        }
        if (pathname === "/favicon.ico") {
            return res.writeHead(200, { CT: IX }).write(Buffer.from(FAVICON_BASE64, "base64"))
        }
        if (pathname === "/authorizeUrl") {
            return res.writeHead(302, { Location: getAuthorizeURL() }).end();
        }
        if (pathname === "/settings" && req.method === "GET") {
            return res.writeHead(200, { CT: AJ }).end(JSON.stringify(settings));
        }
        if (pathname === "/settings" && req.method === "PUT") {
            const data = await readReq(req);
            try {
                setData(JSON.parse(data));
                return res.writeHead(200).end();
            } catch (e) {
                return res.writeHead(400, { CT: AJ }).end(JSON.stringify(e));
            }
        }
        if (pathname === "/requestToken") {
            const data = await readReq(req);
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
                        [CT]: AX,
                        Authorization: `Basic ${Buffer.from(`${settings.client_id}:${settings.client_secret}`).toString("base64")}`,
                    },
                });
                if (response.ok) {
                    return res.writeHead(200, { CT: AJ }).end(JSON.stringify(await response.json()));
                } else {
                    return res.writeHead(response.status, { CT: AJ }).end(JSON.stringify(await response.text()));
                }
            } catch (e) {
                console.error(e);
                return res.writeHead(e.statusCode, { CT: AJ }).end(JSON.stringify(e));
            }
        }
        return res.writeHead(404, { CT: TP }).end();
    } catch (e) {
        console.error(e);
    }
}

const main = async () => {
    await getSettings();
    http.createServer(server).listen(PORT);

    console.log(`Open ${settings.redirect_uri}`);
};

main();

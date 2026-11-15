# Boomerang Bites 🪃🍕

A snack-sized top-down boomerang brawler. Throw, catch, slash, dash: one hit and you're out, last snack standing scores.
It's a web app you can **Add to Home Screen** in Safari, it works offline against CPUs, and it has **online multiplayer** run by a server that holds the real game state.

## Play

- **Move**: drag on the left half of the screen
- **Throw**: hold on the right half, drag to aim, let go (hold longer for more range; a target ring shows where it turns around)
- **Get it back**: it bounces off walls and returns, but can get stuck and drop. Walk over it, or **hold throw to call it back** (it hits anyone in the way)
- **Slash**: red button. Deadly with your boomerang, a shove without it, and it parries boomerangs
- **Dash**: blue button. Dodges, and hops over hot-sauce pits
- **Power-ups** (hold up to 3): Explosive, Fire trail, Ice trail, Triple, Telekinesis, Teleport, Ghost, Speedy Feet, Shield
- Keyboard: WASD + J (throw) / L (slash) / K (dash). Controllers: A throw, X slash, B dash, right stick aims

Full rules, and how they compare to Boomerang Fu: [`docs/mechanics.md`](docs/mechanics.md).

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The app shell and menus |
| `sim.js` | **The game rules.** Shared by the browser (offline play) and the server (online play) |
| `game.js` | Drawing, touch controls, sound, menus, and the online client |
| `server.js` | Node server: hosts the files **and** runs online matches |
| `config.js` | Optional default server address |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen / offline support |
| `sprites/` | Twemoji graphics (CC‑BY 4.0, see below) |

## Online multiplayer: how it works

The **server is the source of truth**. Phones only send their stick and button inputs; the server runs the match at
60 ticks/second and sends everyone compact snapshots 30 times a second (~300 bytes each).

To keep it smooth on real internet connections:
- **Your own fighter is predicted.** Your phone moves you right away, then checks against the server and replays any
  inputs the server hasn't processed yet. In testing at 160 ms ping the correction was under 0.1 px, so nothing jumps.
- **Everyone else is interpolated.** They're drawn 100 ms behind, blending between snapshots, so they move smoothly
  even if packets arrive unevenly.
- Inputs go into a small jitter buffer, and slow connections skip snapshots instead of building up lag.
- If someone disconnects mid-match, a CPU takes over their snack.

### Big screen + phones (party mode)

Open **`http://localhost:8080/?tv`** on the computer running the server (or tap **Play online → Big screen** on any device).
That screen shows the **whole arena** and doesn't take a fighter. It shows a room code and a join link in big text.
Everyone else joins from their phone, and **each phone's camera follows its own snack, zoomed in**, with edge arrows
pointing to enemies who are off-screen. When you're knocked out, your phone zooms out to the whole arena.
Any seated player can add CPUs and start the match from their phone, and the big screen can too.

You can switch the phone camera between **Follow me** and **Whole arena** in the main menu.

### Option A: run it on your laptop (easiest)

```bash
npm install
```

```bash
npm start
```

It prints addresses like `http://192.168.1.20:8080`. On phones **on the same Wi‑Fi**, open that address in Safari,
tap **Play online → Host a game**, and friends tap **Join** with the 4-letter code. Leave the Server box blank, since the page came from your laptop.

To play with friends **who aren't on your Wi‑Fi**, give your laptop a public HTTPS address with a free Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

Share the `https://….trycloudflare.com` link it prints. (The address changes each time you restart the tunnel.)

### Option B: free cloud server (always the same address)

1. Make a free account at [render.com](https://render.com) and choose **New → Blueprint**, then pick this repo (it reads `render.yaml`).
2. You get an address like `boomerang-bites.onrender.com`. Open it on your phone and Add to Home Screen.
3. Optionally put that address in `config.js` so the GitHub Pages version connects to it automatically.

Free Render servers go to sleep after ~15 minutes of no use, and the first connection after that takes about 30 seconds to wake it.

### Option C: GitHub Pages for the app, plus a server

GitHub Pages can host the app (offline/CPU play works right away) but can't run the server. Turn on Pages for the
repo, then either set `config.js` to your server or type the server address under **Play online → Change server**.
The server must be HTTPS (Render or a Cloudflare tunnel), because Safari blocks insecure connections from HTTPS pages.

## Add to Home Screen (iPhone/iPad)

Open the game in Safari → Share → **Add to Home Screen**. It launches full-screen like an app. Play sideways.

## Credits

Graphics: [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X and contributors, licensed
[CC‑BY 4.0](https://creativecommons.org/licenses/by/4.0/) (copy in `sprites/LICENSE-GRAPHICS.txt`).
Sounds are generated in code.

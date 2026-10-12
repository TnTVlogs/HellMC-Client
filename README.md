<p align="center"><img src="./app/assets/images/SealCircle.png" width="150px" height="150px" alt="aventium softworks"></p>

<h1 align="center">HellMC Client</h1>

<em><h5 align="center">by TnTVlogs</h5></em>
[![Build](https://github.com/TnTVlogs/HellMC-Client/actions/workflows/build.yml/badge.svg)](https://github.com/TnTVlogs/HellMC-Client/actions/workflows/build.yml)
<p align="center">Join modded servers without worrying about installing Java, Forge, Fabric or other mods. We'll handle that for you.</p>

**HellMC Client** is a Minecraft launcher for the HellMC network. It is a fork of [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher)
by Daniel D. Scalzi ([MIT](LICENSE.txt)) with a new interface, a new distribution format and an in-game runtime.
It uses [HellMC-Core](https://github.com/TnTVlogs/HellMC-Core), a modified fork of [helios-core](https://github.com/dscalzi/helios-core) (LGPL-3.0),
and [HellMC-Distribution-Types](https://github.com/TnTVlogs/HellMC-Distribution-Types) (MIT). See [`NOTICE`](NOTICE) for the full list.

![Screenshot 1](https://i.imgur.com/6o7SmH6.png)
![Screenshot 2](https://i.imgur.com/x3B34n1.png)

> **Status: alpha.** The launcher is usable every day; the cosmetics, emotes and in-game menu are new and still growing.

## Features

* 🔒 **Accounts.**
  * Add several accounts and switch between them.
  * Microsoft sign-in (OAuth 2.0) or an offline account (just a username).
  * You sign in on Microsoft's own page; HellMC Client never sees your password. It stores the session tokens locally so you stay signed in.
* 🖥️ **Servers and versions.**
  * Pick a server and a version, or play any version without a server. Several games can run at the same time.
  * Live player count, per-version install, verify and uninstall.
  * Optional mods with dependency groups; Java and memory settings per version.
* ☕ **Automatic Java.** You do not need Java installed: the right JDK is detected or downloaded.
* 📂 **Safe downloads.** Everything is verified before launch (hashes); corrupt files are downloaded again. The distribution (`distribution-v2.json`) is signed with Ed25519 and the client checks the signature.
* 🧍 **Appearance.** Skins and capes with a 3D viewer: your skin library, import by player name or from your account, apply to your Microsoft account. Offline accounts keep the skin locally.
* 👕 **Wardrobe (cosmetics and emotes).**
  * 3D cosmetics (hats, wings, …) in five slots and an 8-sector emote wheel. Everything is published by the HellMC team in the panel; the client downloads it on its own, you only choose what to wear.
  * Cards show a still image of every cosmetic. The camera frames the player and the cosmetic, so tall hats or wide wings always fit.
  * Changes appear in the game within a second, without restarting.
* 🎮 **HellMC Runtime (in-game).** A small Java agent, delivered by the distribution (no client update needed), that adds to the game:
  * the HellMC window title and icon, an emote wheel (default key `B`), emotes, 3D cosmetics and your local skin;
  * a wardrobe menu (default key `N`) with cards, a preview of your player and the settings;
  * Discord Rich Presence while you play.
  It works with vanilla and Fabric today (Forge and NeoForge are still pending). Modules are loaded per Minecraft version and skipped on versions they do not support, so the game always starts.
* 📰 **News** (global and per server) with an in-app reader and an offline cache.
* 🌐 English, Spanish and Catalan; dark, light and system themes.
* ⬆️ Silent automatic updates (Discord-style).
* 🛡️ **Privacy.** Usage statistics are opt-in, anonymous and off by default. See the in-app terms and privacy notice.

## How the pieces fit

| Repository | What it is |
| --- | --- |
| **HellMC-Client** (this) | The launcher: Electron main process (`index.js`) and interface (`renderer/`, Preact + Vite + TypeScript). |
| [HellMC-Core](https://github.com/TnTVlogs/HellMC-Core) | Download, repair and launch library (fork of helios-core). |
| [HellMC-Distribution-Types](https://github.com/TnTVlogs/HellMC-Distribution-Types) | TypeScript types of the distribution format. |
| HellMC-Client-Panel | Web panel for the team: versions, servers, mods, publishing, cosmetics catalog (administrators only). |
| NeoNebula-HellMC | Generates the `distribution.json` (fork of Nebula with Fabric, Forge and NeoForge). |
| HellMC-Runtime (private) | The in-game runtime and its modules (`cosmetics`, `presence`). |

The panel publishes the distribution and the runtime; the client downloads the runtime into each instance (`<instance>/hellmc-runtime/`), verifies it like any other file and starts the game with `-javaagent`.
The cosmetics and emotes catalog is a separate public endpoint of the panel; the client downloads it into its wardrobe cache and shows it in the launcher and in the game.

## Development

* [Node.js](https://nodejs.org/) v22
* `npm install`
* `npm run dev` — Vite + Electron with hot reload for the interface (`renderer/`).
* `npm start` — builds the interface and runs the app. `npm run dist` builds the installer.
* `npm run lint` — Biome.
* `npm test` — interface tests (Vitest) and the main-process tests (`test/*.test.js`: configuration, security, skins, wardrobe, catalog sync, PNG validation, runtime arguments, …).

The interface lives in `renderer/`; the main process is `index.js` and the bridge exposed to the interface is `src-node/preload.js` (`window.hellmc`).
The interface never touches the network or the disk: it asks the main process through that bridge.

To try the runtime in development, build it in `HellMC-Runtime` with `tools/build.sh --install-client`; it copies the jars to `runtime/` here, which the client uses when it is not packaged.

### Security notes

* Images (skins, cosmetic textures, previews) go through a strict PNG validator (`app/assets/js/pngutil.js`): every chunk and CRC is checked, sizes are limited, the compressed data must expand to exactly the size in the header, and the file is rewritten without metadata or trailing data before it is saved, shown, sent to Mojang or read by the game.
* Cosmetic models are rebuilt by the panel with only the fields the game reads, and checked again by the client before they are stored. Downloads are verified against a SHA-256 and never follow redirects or server-provided hosts.
* The distribution is signed; the runtime refuses to start unless it is launched by a compatible client.


#### Need help? [Contact us on Discord](https://discord.gg/yScnSw7cFt)

#### Like the project? Leave a ⭐ star!

## Downloads

You can download from [GitHub Releases](https://github.com/TnTVlogs/HellMC-Client/releases).

**Supported platforms**

Select the installer for your system in the [Releases](https://github.com/TnTVlogs/HellMC-Client/releases) tab.

| Platform | File |
| -------- | ---- |
| Windows x64 | `HellMC-Client-Setup.exe` |
| macOS x64 | Coming soon |
| macOS arm64 | Coming soon |
| Linux x64 | Coming soon |

[discord]: https://discord.gg/yScnSw7cFt 'Discord'

<p align="center"><img src="./app/assets/images/SealCircle.png" width="150px" height="150px" alt="aventium softworks"></p>

<h1 align="center">HellMC Client</h1>

<em><h5 align="center">by TnTVlogs</h5></em>
[![Build](https://github.com/TnTVlogs/HellMC-Client/actions/workflows/build.yml/badge.svg)](https://github.com/TnTVlogs/HellMC-Client/actions/workflows/build.yml)
<p align="center">Join modded servers without worrying about installing Java, Forge, or other mods. We'll handle that for you.</p>

**HellMC Client** is a fork of [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher) by Daniel D. Scalzi ([MIT](LICENSE.txt)).
Uses [HellMC-Core](https://github.com/TnTVlogs/HellMC-Core), a modified fork of [helios-core](https://github.com/dscalzi/helios-core) (LGPL-3.0),
and [HellMC-Distribution-Types](https://github.com/TnTVlogs/HellMC-Distribution-Types) (MIT). See [`NOTICE`](NOTICE) for the full list.

![Screenshot 1](https://i.imgur.com/6o7SmH6.png)
![Screenshot 2](https://i.imgur.com/x3B34n1.png)

## Features

* 🔒 Account management.
  * Add multiple accounts and easily switch between them.
  * Microsoft (OAuth 2.0) sign-in, or an offline account (just a username) to play without a connection.
  * You sign in on Microsoft's own page; HellMC Client never sees your password. It does store the session tokens locally (in `config.json`) so you stay signed in.
* 🖥️ Servers and versions.
  * Pick a server and a version, or play any version without a server.
  * Live player count (direct ping), per-version install, verify and uninstall.
  * Optional mods with dependency groups, per-version Java and memory settings.
* 📂 Efficient asset management.
  * Files are validated before launch. Corrupt or incorrect files will be redownloaded.
* ☕ **Automatic Java detection and download.**
  * You do not need to have Java installed to run the launcher.
* 📰 News feed (global and per server), with an in-app reader and offline cache.
* 🌐 English, Spanish and Catalan; dark, light and system themes.
* Silent automatic updates (Discord-style).

This is not an exhaustive list. Download and install the launcher to gauge all it can do!

## Development

* [Node.js](https://nodejs.org/) v22
* `npm install`
* `npm run dev` — Vite + Electron with hot reload for the interface (`renderer/`).
* `npm start` — builds the interface and runs the app. `npm run dist` builds the installer.
* `npm run lint` — Biome.

The interface lives in `renderer/` (Preact + Vite + TypeScript); the main process is `index.js` and the
bridge exposed to the interface is `src-node/preload.js` (`window.hellmc`).

#### Necesitas ayuda? [Contáctanos en discord](https://discord.gg/yScnSw7cFt)

#### Te gusta el proyecto? Deja tu ⭐ estrella!

## Descargas

You can download from [GitHub Releases](https://github.com/TnTVlogs/HellMC-Client/releases)

**Plataformas acetadas**

If you download from the [Releases](https://github.com/TnTVlogs/HellMC-Client/releases) tab, select the installer for your system.

| Plataforma | Archivo |
| ---------- | ------- |
| Windows x64 | `HellMC-Client-Setup.exe` |
| macOS x64 | `Proximamente` |
| macOS arm64 | `Proximamente` |
| Linux x64 | `Proximamente` |

[discord]: https://discord.gg/yScnSw7cFt 'Discord'

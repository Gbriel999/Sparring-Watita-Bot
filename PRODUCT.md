# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The owner asked for "tecnologías modernas" and left the exact choice open. Delegated: Vite, React and TypeScript for the control panel, built to static files and served by the bot's own Node process (`bot.js`). Live state goes out by Server-Sent Events and commands come in over HTTP, with no extra server dependency. The bot itself is Node.js with mineflayer.

## Users

One primary user: the owner of a Minecraft network (Spanish speaker) who builds an anticheat and records labeled PvP samples.
- **Desktop:** while playing, they control a sparring bot that joins their test server as a second account. They use the panel on the same Windows PC, in another tab or on a second monitor.
- **Phone:** over the same Wi-Fi, they give orders without leaving the game.

## Product Purpose

The panel replaces typing commands in a terminal or in game chat. From one place the owner can:
- connect and disconnect the bot;
- pick what it does: stay still, move around the owner without hitting (a moving target for aim samples), or fight;
- set its difficulty and tactics: shield, totems, golden apples;
- manage its equipment;
- watch its live state: connection, ping, distance to the owner, health, fight stats, knockback received;
- read its log;
- edit its configuration.

Success: the owner never needs the terminal or chat commands to run a test session.

## Positioning

A control surface for one specific sparring bot, which is a real client playing human-like 1.9+ sword PvP. It is not a generic bot manager. Its job is to set up repeatable fights quickly while the owner records samples with the anticheat's lab.

## Operating Context

- The bot runs on the owner's Windows PC. Its window comes from `iniciar.bat`.
- It connects through a Velocity proxy with nLogin to a whitelisted test server. After each reconnect the owner moves it with `/send WatitaBot <server>`.
- The panel is open while the owner is in a fight, so state must read at a glance and controls must act in one tap.
- It is reachable on the local network for the phone, so access needs a token.

## Capabilities and Constraints

**Bot features:**
- modes: quieto, muevete, pelea;
- levels: facil, normal, dificil, experto;
- toggles: escudo, totem, gapple;
- actions: equipar, kit (server kit command from config), inventario, donde, diag;
- automatic upkeep: armor, totem re-equip after a pop, golden apples at low health.

**Diagnostics** are measured every 10 s:
- ping and ticks per second;
- server teleports;
- hits, crits, sprint hits and swings at air;
- weapon held;
- knockbacks received and their real strength.

**Config** (`config.json`): host, port, cuenta, auth, version, dueno, clave (login plugin password, entered only by the owner), nivel, escudo, totem, gapple, avisosPorMensaje, comandoKit, reconectar. The password is never displayed back.

**Language:** all user-facing text is in Spanish.

**Open decision:** the tool's final name. The bot account is called WatitaBot, but the owner wants the panel to be a separate tool, not Watita AC branded.

## Brand Commitments

A separate tool with its own identity. It does not reuse Watita AC branding.

## Evidence on Hand

Real bot telemetry: the log lines in `bot.log` and the diagnostics format above. No screenshots, testimonials or other assets exist. Nothing should be invented.

## Product Principles

- One glance tells whether the bot is connected, near the owner, and what it is doing.
- Every frequent action is one tap: change mode, change level, equip.
- Live numbers come from the bot as measured, never estimated or decorative.
- Safe on the local network: a token is required, and the password is never shown.
- Works the same on a desktop monitor and on a phone held during a fight.

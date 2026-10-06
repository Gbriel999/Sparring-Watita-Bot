---
version: 1
slug: "panel"
primary_target: "panel"
related_targets: []
---

# Panel de control del bot de combate

**Scope:** the bot's local web control panel (`tools/sparring-bot/panel`), served by `bot.js`.
**Visitor mode:** Operate.

**Audience and job:** the network owner, mid-fight on the PC or on a phone over Wi-Fi. They set what the sparring dummy does and watch it do it, without the terminal or chat commands.

**Priorities:** first, connection, current action, and one-tap action buttons; stats come after.

**Avoid:**
- a generic hosting dashboard (cards and sidebar);
- an exaggerated "gamer" look (RGB, glow).

**Constraints:**
- all text in Spanish;
- token-protected;
- the password is never shown;
- every number is live bot data.

## Direction contract

**THESIS:** The bot as the training dummy of a fighting game's practice mode. Its behavior is a list of dummy settings and its live inputs show in an input display. It refuses the dark admin-card dashboard.

**OWN-WORLD:**
- Training-mode overlay in a dim room: near-black ink ground #0b0d17, one translucent panel tone, white text.
- Amber #ffb000 owns selection and the active value. Mint #3ddc97 marks live and positive. A red #ff4d5e marks damage only.
- Condensed bold uppercase labels set in a self-hosted condensed sans. Rows have a slanted selection bar.
- Key caps for the input display. A frame-meter strip draws attack charge as tick segments.

**STORY:** In one glance the owner understands whether the bot is connected, near him, and doing what he asked. He changes its action or level in one tap and sees its keys and hits react live.

**FIRST VIEWPORT:**
- Top strip: connection, server, ping, distance and health.
- Left, large: the "DUMMY" settings list. The ACCIÓN row shows Quieto / Moverse / Pelear inline, each one tap, with the active one on the amber bar. Below it: NIVEL, ESCUDO, TÓTEMS and MANZANAS.
- Right: the live input display (W A S D, salto, sprint, clic, escudo) with input history.
- Under both: the frame meter of the sword charge and hits, and the combat counters.
- Phone: one column in the same order.

**FORM:** "Modo entrenamiento", a fighting-game dummy settings menu with an input display. Position 1 on the ordered list, taken as IMPECCABLE'S PICK. Seed key 4d0c77c5. Signature interaction: the input display and the frame meter light up from the bot's real control states and attack ticks as they happen.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The tool's final name. The working title is "Sparring".

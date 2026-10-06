# Watita Sparring Link

Mod de cliente (Fabric, Minecraft 26.2, Java 25) que envía tus controles al bot de sparring de WatitaAC (`tools/sparring-bot`). Así el bot aprende tus hábitos de combate con datos exactos. El bot solo aprende: nunca reacciona a tus teclas en el momento.

- Se conecta solo a `127.0.0.1` (puerto 3211, configurable en `config/watita-sparring-link.json`).
- Solo envía mientras el bot está en `!pelea` contigo, y nunca con un menú abierto.
- Por cada tick envía:
  - los controles del juego (W, A, S, D, salto, agacharse, sprint, ataque, usar);
  - si estás en el suelo, tu velocidad vertical y si te acaban de golpear;
  - la distancia al bot y si lo tienes en la mira;
  - tus clics de ataque con la carga que tenían.
- El protocolo está en [PROTOCOLO.md](PROTOCOLO.md).

## Instalar

Copia `WatitaSparringLink-26.2.jar` a la carpeta de mods de Fabric 26.2, junto a Fabric API:
- **Lunar Client:** `%USERPROFILE%\.lunarclient\profiles\<tu perfil>\mods\fabric-26.2`.
- **Launcher oficial con Fabric:** `.minecraft/mods`.

## Compilar

Sin conexión, con la caché de Fabric 26.2 que ya usa Watita:

```
gradlew.bat --offline build
```

El jar sale en `build/libs/WatitaSparringLink-1.0.0.jar`.

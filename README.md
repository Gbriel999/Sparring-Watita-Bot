# Bot de combate para el laboratorio de WatitaAC

Tu **cuenta secundaria** se conecta al servidor como un jugador de verdad y pelea contigo, o se mueve a tu alrededor sin pegar. Mientras tanto, el **Laboratorio** de Watita graba cada pelea en tu cuenta principal.

Usa [mineflayer](https://github.com/PrismarineJS/mineflayer) con un **motor de combate propio** (`combat.js`) que pelea como una persona en 1.9+:
- **Puntería humana**: reacciona a tu posición de hace 110–320 ms (según el nivel), gira suavizado y con temblor, a veces se pasa y corrige, y apunta a un punto de tu cuerpo que va cambiando.
- **Solo pega si te está apuntando de verdad**, a menos de 3 bloques y con el arma cargada (cooldown 1.9+ con algo de variación).
- **Ciclos de crítico**: salta 5–7 ticks antes de que la espada cargue para pegar justo al caer, sin sprint (en vanilla un golpe con sprint nunca es crítico).
- **Ciclos de sprint** (más knockback) con **w-tap** para recuperar el sprint del siguiente golpe, sobre todo cuando te persigue.
- **Spacing**: mientras carga se queda justo fuera de tu alcance (3–3,6 bloques), entra a pegar cuando está listo y sale con **s-tap**.
- **Strafes en círculo** que cambian de lado, esquiva cuando haces swing, **jump reset** al recibir knockback, y puntería que se adelanta a tu movimiento.
- Si no tiene espada ni hacha te avisa en vez de pegar a puño (que parece 1.8).
- **Escudo** entre golpes cuando le vas a pegar, y **hacha** si te cubres con el tuyo.
- Arregla un fallo de mineflayer con 1.21.9+: el knockback le llegaba 8000 veces más pequeño.
- Arregla otro fallo de mineflayer: nunca actualiza si el rival está en el suelo. El bot lo lee de los paquetes de movimiento del servidor (`rival-ground.js`), y así ve tus saltos, tus caídas y tu knockback.

## 1. Instalar (una sola vez)

1. Instala **Node.js LTS** desde la web oficial: https://nodejs.org (botón "LTS").
2. Abre una terminal en esta carpeta (`tools/sparring-bot`) y ejecuta:
   ```
   npm install
   ```
3. Copia `config.example.json` como `config.json` y rellénalo:

| Campo | Qué poner |
|---|---|
| `host` / `port` | IP y puerto de tu servidor |
| `cuenta` | Nombre del bot (servidor no premium) o correo de la cuenta (premium) |
| `auth` | `offline` para servidores no premium, `microsoft` para cuentas premium |
| `dueno` | **Tu** nombre en Minecraft: el bot solo te obedece a ti |
| `clave` | Si el servidor tiene plugin de login (AuthMe…), la clave del bot: se registra la primera vez y luego entra solo. Vacío si no hay login |
| `version` | `1.21.11`, la de tu servidor. Si no conecta, prueba `1.21.4` |
| `nivel` | `facil`, `normal`, `dificil` o `experto` |
| `escudo` | `true` para que use escudo si lo tiene |
| `avisosPorMensaje` | `true` para que te responda por mensaje privado además de en la terminal |
| `comandosAlEntrar` | Comandos al conectarse, por ejemplo `["/login tu-clave"]` si tu servidor pide login (queda guardado en texto plano) |

## 2. Arrancar

```
npm start
```

La primera vez aparece un **código de Microsoft**. Abre https://www.microsoft.com/link, inicia sesión con la **cuenta secundaria** y escribe el código. El inicio de sesión queda guardado en `.auth/` y no se vuelve a pedir.

### Panel web (PC y móvil)

Al arrancar, la ventana del bot muestra dos enlaces:

- **Panel en este PC:** `http://localhost:3210/?t=...`
- **Panel en el móvil (misma Wi-Fi):** `http://192.168.x.x:3210/?t=...`

Ábrelo y lo controlas todo sin comandos: acción (quieto / moverse / pelear), nivel, escudo, tótems y manzanas con un toque. El bloque **Combate** muestra al bot en 3D (con su skin del servidor o un muñeco de entrenamiento) imitando lo que hace, y debajo sus golpes dados, recibidos y fallados y su % de acierto, contados con el daño que confirma el servidor. Desde ahí también ves sus teclas en vivo, el medidor de frames (carga del arma, golpes, críticos y golpes recibidos), los contadores de la sesión, el equipo, el registro y la configuración.

- El `?t=...` es la **clave del panel**. Se genera sola y se guarda en `config.json` como `panelToken`. No la compartas: con ella cualquiera de tu red puede manejar el bot. Para cambiarla, bórrala de `config.json` y reinicia el bot.
- La **clave de login** del bot (`clave`) se puede cambiar desde el panel, pero el panel **nunca la muestra**.
- El puerto se cambia con `"panelPuerto": 3210` en `config.json`.
- `iniciar.bat` compila el panel la primera vez (`panel/`, Vite + React). Si tocas su código, vuelve a compilarlo con `npm run build` dentro de `panel/`.

## 3. Dale equipo

El bot pelea con lo que tenga en el inventario. Dáselo dentro del juego (o con un kit): espada o hacha, armadura, escudo, comida y tótems si vas a probar AutoTotem.

## 4. Comandos

Escríbelos en el chat del juego o en la terminal del bot:

| Comando | Qué hace |
|---|---|
| `!pelea` | Te ataca: críticos, strafes, w-tap y escudo |
| `!muevete` | Se mueve a tu alrededor (strafes y saltos) **sin pegarte**: objetivo móvil para probar aim |
| `!para` | Se detiene |
| `!nivel facil` / `normal` / `dificil` / `experto` | Cuatro niveles. En todos pega con la espada cargada (cooldown de 1.9+: como mucho un golpe cada 13 ticks, unos 1,5 por segundo); el nivel cambia cuánto espera de más tras la recarga (`facil` 1–4 ticks, `normal` 0–2, `dificil` 0–1, `experto` ninguno), lo rápido que reacciona y lo poco que falla. `experto` reacciona en 90-130 ms, casi no falla y se apoya del todo en lo que aprendió de ti |
| `!escudo on` / `off` | Usa o no el escudo |
| `!donde` | Dice en qué mundo y coordenadas está y a cuántos bloques te ve |
| `!equipar` | Se pone la mejor armadura, la mejor espada (o hacha) y el tótem o el escudo en la mano izquierda |
| `!kit` | Ejecuta el comando de kit de `config.json` (`"comandoKit": "/kit pvp"`) y se equipa |
| `!inventario` | Te dice qué lleva puesto y cuántos tótems y manzanas tiene |
| `!totem on` / `off` | Con tótems: siempre uno en la mano izquierda; cuando explota uno, se pone otro en 0,3–0,7 s |
| `!gapple on` / `off` | Con poca vida (5 corazones) se come una manzana dorada y vuelve a pelear |
| `!olvidar` | Borra todo lo que el bot aprendió de ti (funciona también desconectado) |
| `!reiniciar` | Pone a cero los contadores de la sesión del panel |
| `!ayuda` | Lista de comandos |

**El bot aprende.** Mientras pelea te mide: a qué distancia te alcanza, cuántos de tus golpes son críticos (con el efecto de crítico que manda el servidor), el ritmo de tus golpes, si saltas al recibir (jump reset), cuánto retrocedes, si te vas justo después de pegar, hacia qué lado giras, qué tal te cubres con el escudo y a qué distancia te gusta pelear. Si te vas tras pegar, te pega en el aire sin esperar al crítico. Con eso decide cómo jugarte (más cerca, más lejos, cuándo esquivar), y cuanto más nivel, más caso le hace a lo aprendido. Todo se guarda por jugador en `rivales.json` (no se sube a git), así que la próxima sesión ya te conoce; el panel muestra qué sabe de ti y qué plan sigue. `!olvidar` lo borra. Para ver cómo juega sin entrar al servidor, `npm run arena` enfrenta al bot contra rivales simulados (con el lag de un servidor; `--sin-lag` lo quita). Uno de ellos, `presionador`, imita cómo peleas tú: siempre encima con sprint, w-tap, algún crítico y jump reset, y 3,3 bloques de alcance efectivo por el ping.

Además, solo y sin comandos, el bot:
- se equipa al entrar, al reaparecer y al cambiar de servidor;
- cada 3 s revisa si le diste algo mejor o si le falta el tótem;
- mientras pelea no toca su mano principal, para poder cambiar al hacha contra tu escudo.

## 4b. Tus teclas (mod opcional)

Con el mod **Watita Sparring Link**, tu Minecraft le cuenta al bot lo que haces en cada tick mientras peleáis, y el bot aprende tus hábitos con datos exactos en vez de adivinarlos por tus movimientos con lag. Aprende:
- en qué momento de la carga pegas (si spameas o haces hit select);
- tus w-tap y s-tap;
- cuánto duran tus strafes;
- tu jump reset y cuánto tardas en hacerlo;
- cuántos de tus golpes intentan ser críticos.

En el panel, esos rasgos salen marcados como **tus teclas**.

- **Solo aprende.** El bot nunca reacciona a tus teclas en el momento: para pelear solo usa lo que le muestra el servidor, como un rival de verdad.
- **Solo en tu PC.** El mod se conecta a `127.0.0.1` y solo envía mientras el bot está en `!pelea`. Nunca envía con un menú abierto, y solo manda los controles del juego (movimiento, salto, sprint, ataque, usar), nunca lo que escribes.

**Instalar:**
1. Copia `mod/WatitaSparringLink-26.2.jar` a la carpeta de mods de Fabric 26.2. Es para Minecraft 26.2 con Fabric API, y necesita Java 25.
   - **Lunar Client:** `%USERPROFILE%\.lunarclient\profiles\<tu perfil>\mods\fabric-26.2`, junto a tu Fabric API.
   - **Launcher oficial con Fabric:** `.minecraft/mods`.
2. Arranca el bot y entra al servidor con tu cuenta. Al hacer `!pelea` verás en pantalla "Watita: el bot está aprendiendo de tus teclas", y el panel dirá **Tus teclas: conectado**.

El puerto es el 3211 en los dos lados. Si lo cambias, cámbialo a la vez en `config.json` del bot (`"inputsPuerto": 3211`; `0` lo apaga) y en `watita-sparring-link.json`, dentro de la carpeta `config` de tu juego (el mod lo crea la primera vez).

## 5. Con el laboratorio

1. En tu cuenta principal: **menú Watita → Laboratorio**, eliges el tipo y escribes en el chat el cheat y sus ajustes (o `nada`).
2. Al bot: `!pelea` (o `!muevete` para aim).
3. Pelea. Cada pelea se guarda sola cuando pasan 5 s sin golpes, y el chat te confirma la muestra.
4. Al terminar: **Laboratorio → Empaquetar muestras**. Descarga el `.zip` de `plugins/WatitaAC/captures/lab/envios/` desde el panel del host y déjalo en la carpeta `muestras/` del proyecto.


### Saber cómo estaba el bot en cada muestra

El servidor no ve el nivel ni los ajustes del bot, así que el bot los anota en `peleas.jsonl` cada vez que cambian (modo, nivel, escudo, tótems, manzanas y conexión). En las muestras, las peleas contra el bot salen con `rival: bot · WatitaBot (...)` (la lista de bots está en `laboratorio.bots` del config de Watita).

Cuando tengas un paquete de muestras en `muestras/`:

```
node cruzar-muestras.js muestras/muestras-2026-10-05.zip --desfase-horas -4
```

Crea `cruce.csv` con cada muestra y la configuración del bot al empezar esa pelea. `--desfase-horas` es la zona horaria del servidor respecto a UTC (tu servidor va en UTC-4, así que usa -4); sin él usa la de este PC, que va una hora por delante.

### Resumen de cada muestra

```
node analizar-muestras.js muestras/<paquete>.zip
```

Muestra por pelea: acierto, golpes cargados, críticos, con sprint, golpes justo a la recarga (13 ticks), mira sobre el rival, error de puntería, distancia y los flags de Watita.

## Notas

- Watita revisa al bot como a cualquier jugador. Es normal que le salga alguna alerta: sus giros son de programa, no de una persona. No le afecta.
- Para que no te moleste, puedes desactivar las alertas para su cuenta.
- Si no conecta, revisa que ViaVersion acepte la versión del campo `version` y que el servidor no bloquee bots por su IP.

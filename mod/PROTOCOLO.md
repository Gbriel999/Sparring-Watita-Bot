# Protocolo del enlace (versión 1)

El mod y el bot se hablan por TCP en `127.0.0.1` (puerto 3211 por defecto). Cada mensaje es un objeto JSON en una línea (UTF-8, terminado en `\n`, de 4096 bytes como máximo).

## Del mod al bot

Al conectar:

```json
{"t":"hello","v":1,"player":"gvvbriel","mc":"26.2"}
```

En cada tick de pelea:

```json
{"t":"tick","seq":812,"tick":40211,"ms":1759770000123,"k":37,"spr":true,"gnd":true,"vy":0,"hurt":false,"dist":2.84,"aim":true,"atk":[{"c":0.97,"gnd":false,"vy":-0.15,"spr":false,"aim":true,"dist":2.9}]}
```

| Campo | Qué es |
|---|---|
| `seq` | Contador de ticks del cliente. Sube en cada tick aunque no se envíe nada, así que un hueco significa un menú abierto o una pausa. |
| `k` | Teclas pulsadas. W=1, S=2, A=4, D=8, salto=16, agacharse=32, sprint=64, ataque=128, usar=256. |
| `spr`, `gnd`, `vy` | Con sprint, en el suelo y velocidad vertical, al final del tick. |
| `hurt` | Te golpearon en este tick (tu `hurtTime` acaba de subir). |
| `dist`, `aim` | Distancia de tu ojo a la caja del bot (`null` si no lo ves) y si lo tienes en la mira. |
| `atk` | Cada clic de ataque del tick, con la carga `c` (de 0 a 1) antes de que el juego la reinicie y tu estado en ese momento. |

## Del bot al mod

```json
{"t":"hello","v":1,"bot":"WatitaBot","fight":false}
{"t":"fight","on":true}
```

## Reglas

- El bot cierra la conexión si `player` no es su dueño, si `v` no es 1 o si llega una línea demasiado larga.
- Solo hay una conexión a la vez.
- El mod solo envía `tick` mientras `fight` está activo y no tienes ningún menú abierto.
- El bot ignora los ticks que lleguen fuera de una pelea.
- El bot solo aprende de estos datos: no reacciona a tus teclas en el momento.

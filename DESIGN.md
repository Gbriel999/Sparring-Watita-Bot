---
name: Sparring
description: Panel de control del bot de combate, como el modo entrenamiento de un juego de lucha.
colors:
  ink: "#0b0d17"
  ink-raised: "#121528"
  panel: "rgb(242 242 255 / 0.045)"
  panel-hover: "rgb(242 242 255 / 0.075)"
  line: "rgb(242 242 255 / 0.1)"
  line-strong: "rgb(242 242 255 / 0.24)"
  text: "#f2f2f2"
  text-dim: "#a3a9c2"
  text-faint: "#7d84a3"
  amber: "#ffb000"
  amber-soft: "rgb(255 176 0 / 0.16)"
  mint: "#3ddc97"
  red: "#ff4d5e"
typography:
  display:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
  numeral:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.05em"
  tab:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.08em"
  option:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.06em"
  button:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "0.06em"
  label:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  meta:
    fontFamily: "'Saira Condensed', 'Arial Narrow', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.06em"
  body:
    fontFamily: "'Saira Variable', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  hint:
    fontFamily: "'Saira Variable', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.55
rounded:
  hairline: "1px"
  tag: "3px"
  control: "4px"
  block: "6px"
  card: "8px"
  pill: "34px"
spacing:
  xs: "4px"
  sm: "8px"
  row: "14px"
  md: "16px"
  block: "20px"
  lg: "24px"
  gutter: "clamp(16px, 2.4vw, 28px)"
components:
  action:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  action-hover:
    backgroundColor: "{colors.panel-hover}"
  action-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  action-primary-hover:
    backgroundColor: "#ffffff"
  action-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text-dim}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  menu-option:
    backgroundColor: "transparent"
    textColor: "{colors.text-dim}"
    typography: "{typography.option}"
    padding: "0 16px"
    height: "44px"
  menu-option-selected:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
  menu-option-pending:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
  menu-option-blocked:
    textColor: "{colors.text-faint}"
  field:
    backgroundColor: "rgb(11 13 23 / 0.6)"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "42px"
  block:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.block}"
    padding: "0 20px 20px"
  cap:
    backgroundColor: "rgb(242 242 255 / 0.03)"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.block}"
    height: "52px"
  cap-pressed:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink}"
  cap-pressed-hit:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
  switch:
    backgroundColor: "transparent"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.pill}"
    width: "74px"
    height: "34px"
  switch-on:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.ink}"
  input-tag:
    backgroundColor: "transparent"
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "1px 7px"
  input-tag-attack:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
  notice:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.block}"
    padding: "12px 18px"
---

# Design System: Sparring

## Overview

**Creative North Star: "La sala de entrenamiento"**

El panel es el menú de práctica de un juego de lucha, superpuesto sobre una sala en penumbra: el bot es el muñeco de entrenamiento, su comportamiento es una lista de ajustes del muñeco y sus controles reales aparecen en un visor de entradas y en un medidor de frames. El suelo es tinta casi negra con una rejilla tenue de escenario de práctica; encima flota un único tono de panel translúcido, texto blanco y etiquetas condensadas en mayúsculas.

La densidad es de interfaz de juego, no de panel de hosting: bloques con pestaña inclinada en lugar de tarjetas con título, filas de menú con cursor en lugar de formularios, números grandes y tabulares. El color es escaso y semántico: tres acentos, cada uno con una sola tarea, sobre neutros fríos. Nada brilla: no hay glow, ni degradados de color, ni RGB.

La inclinación de -12deg es la firma: la llevan la barra de selección, la barra de cursor de cada fila, la barra de vida, la entrada más reciente del historial y el sello de los avisos de combate. Todo el texto visible está en español.

**Key Characteristics:**
- Tinta casi negra con rejilla de 48px al 3,5 % como suelo de escenario.
- Un solo tono de panel translúcido; la profundidad sale de líneas finas, no de sombras.
- Ámbar = selección y valor activo; menta = vivo y listo; rojo = daño recibido.
- Etiquetas Saira Condensed en mayúsculas; cuerpo Saira; JetBrains Mono solo para datos.
- Inclinación -12deg en barras, cursores y sellos.
- Iconos lucide-react, trazo 2.25, 14-16px, siempre junto a texto.

## Colors

Neutros fríos de tinta azulada, con tres acentos saturados que nunca intercambian su tarea.

### Primary
- **Ámbar de selección** (`amber`): la opción elegida en cada fila del menú (barra rellena), el valor ACCIÓN en la franja superior, el estado pendiente (barra discontinua con relleno `amber-soft`), el marcador triangular del cursor del menú, el anillo de foco, el cursor de texto y la selección de texto. En el combate marca el valor activo del bot: el golpe que conecta (casilla de golpe y crítico en el medidor, etiqueta de ataque en el historial, tecla de clic al acertar, sello «¡Crítico!»).

### Secondary
- **Menta en vivo** (`mint`): lo que está vivo, listo o es positivo: el punto de conexión, el relleno de la barra de vida, la carga del arma al 100 % y sus casillas listas, los interruptores en «Sí», las líneas buenas del registro y el sello «¡Tótem!».

### Tertiary
- **Rojo de daño** (`red`): solo daño realmente recibido: el rastro de vida perdida, las casillas «Recibe golpe», el contador Knockbacks cuando es mayor que 0 y el sello «Recibe KB». Un contador a cero no es rojo.

### Neutral
- **Tinta de sala** (`ink`): fondo de página y texto sobre ámbar, menta y blanco.
- **Tinta elevada** (`ink-raised`): avisos flotantes y opciones de `select`.
- **Panel translúcido** (`panel`, `panel-hover`): el único tono de superficie de los bloques y el hover de botones.
- **Línea** (`line`, `line-strong`): divisores entre filas y bloques; borde de controles, teclas y etiquetas.
- **Texto** (`text`): texto principal y relleno del botón primario y de la tecla pulsada.
- **Texto atenuado** (`text-dim`): pistas de fila, unidades, opciones no elegidas.
- **Texto tenue** (`text-faint`): etiquetas de datos, metadatos, valores vacíos, opciones bloqueadas.

### Named Rules
**The Una Tarea Por Color Rule.** Ámbar selecciona, menta confirma que algo vive, rojo dice que hubo daño. Ningún acento cambia de tarea, y ninguno decora.

**The Avisos Sin Color Rule.** Los errores y advertencias son texto normal más un icono lucide o un borde neutro discontinuo (`line-strong`, 1.5px dashed). Nunca ámbar ni rojo: el ámbar es selección y el rojo es daño.

## Typography

**Display Font:** Saira Condensed 600/700/800 (con 'Arial Narrow', sans-serif)
**Body Font:** Saira Variable (con system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono 500 (con ui-monospace, monospace)

**Character:** La condensada en mayúsculas con tracking abierto es la voz del menú de un juego de lucha; Saira variable da un cuerpo legible de la misma familia; la mono aparece solo donde hay datos de máquina. Todo número lleva cifras tabulares.

### Hierarchy
- **Display** (800, 34px, 1): titular de la pantalla de bloqueo y lecturas grandes del medidor (CARGA, RECARGA).
- **Numeral** (800, 30px, 1, tabular): valores secundarios de Combate (24px) y existencias; las cuatro cifras grandes de Combate van a 46px (40px en móvil).
- **Title** (800, 21px, 1.1, 0.05em, mayúsculas): nombre de cada fila de ajustes del muñeco.
- **Tab** (800, 17px, 0.08em, mayúsculas): pestaña inclinada de cada bloque (16px en móvil).
- **Option** (700, 17px, 0.06em, mayúsculas): opciones del menú y el valor ACCIÓN de la franja.
- **Button** (700, 15px, 0.06em, mayúsculas): botones de acción y leyendas de grupo.
- **Label** (700, 12px, 0.08em, mayúsculas, `text-faint`): rótulos de datos (dt de la franja, contadores, medidor, equipo) y etiquetas de entrada. Los rótulos de campo usan 14px.
- **Meta** (600, 13px, 0.06em, mayúsculas, `text-faint`): metadato a la derecha de la cabecera del bloque.
- **Body** (400, 15px, 1.5): texto corrido; pistas de fila en 14px/1.4 con máximo 52ch, pistas de campo en 13px.
- **Data** (JetBrains Mono 500, 12.5px, 1.55): registro, recuento de frames del historial (13px), dirección del servidor (13px), comandos al entrar.

### Named Rules
**The Mono Es Dato Rule.** JetBrains Mono solo para lo que escupe la máquina: registro, frames, dirección del servidor, comandos. Nunca para rótulos ni títulos.

**The Rótulo Condensado Rule.** Todo rótulo, pestaña, opción y botón va en Saira Condensed en mayúsculas con tracking 0.04-0.08em; el texto en minúscula es siempre Saira Variable.

## Layout

Escenario en rejilla de dos columnas 7fr / 5fr, máximo 1480px, centrado, con margen lateral `gutter` y separación de 20px entre bloques. El orden de áreas es fijo: ajustes del muñeco | combate; medidor de frames | entradas; lectura del rival a todo el ancho; equipo | registro; configuración a todo el ancho (`grid-template-areas: 'menu combat' 'meter inputs' 'rival rival' 'gear log' 'config config'`). Encima, una franja pegajosa (sticky) con marca, estado del bot, ACCIÓN, servidor, ping, ticks/s, distancia al dueño y vida, y la acción de conectar a la derecha.

Por debajo de 1180px la franja se parte en dos líneas y los datos bajan a su propia fila. Por debajo de 900px, una sola columna con 16px de separación y la lectura del rival justo después del combate: menú, combate, rival, entradas, medidor, equipo, registro, configuración. Por debajo de 600px la franja deja de ser sticky, sus datos pasan a dos columnas (estado y vida a todo el ancho), los bloques usan 14px de relleno, las opciones de cada fila ocupan columnas iguales a lo ancho, los botones de formulario van a ancho completo y la pista de flechas del teclado se oculta en punteros táctiles.

El ritmo vertical es de filas: 14px de relleno en filas del menú, 8px en filas de equipo, 4px entre opciones, 8px entre botones.

## Elevation & Depth

Plano por capas tonales. Los bloques son el mismo panel translúcido sobre la tinta, separados por líneas de 1px; la cabecera de la franja usa tinta al 88 % con desenfoque de 12px. No hay sombras de elevación salvo en el aviso flotante. Las teclas del visor de entradas tienen un labio inferior inset que desaparece al pulsarlas, como una tecla física.

### Shadow Vocabulary
- **Aviso flotante** (`box-shadow: 0 12px 32px rgb(0 0 0 / 0.45)`): solo el aviso temporal anclado abajo.
- **Labio de tecla** (`box-shadow: inset 0 -3px 0 line-strong`): tecla en reposo; al pulsar se quita y la tecla baja 2.5px.
- **Filo de crítico** (`box-shadow: inset 0 3px 0 text`): casilla de crítico en el medidor y su muestra en la leyenda.

### Named Rules
**The Suelo De Escenario Rule.** El fondo lleva una rejilla de 48px con líneas al 3,5 % (`rgb(242 242 255 / 0.035)`), fija al viewport. Es deliberada: es el suelo de la sala de práctica. No subirla de opacidad ni sustituirla por degradados.

## Shapes

Esquinas casi rectas: 4px en controles, 6px en bloques y teclas, 8px en la tarjeta de bloqueo, 3px en etiquetas, 1px en casillas de frame; píldora solo en el interruptor y círculo solo en el punto de estado. La forma propia es el paralelogramo: barras de opción, cursor de fila y barra de vida con `skewX(-12deg)`; pestañas de bloque recortadas con 12px de chaflán a la derecha; la marca es un paralelogramo ámbar. El estado de conexión es una forma, no solo un color: punto relleno (conectado), hueco pulsante (conectando), hueco tachado (desconectado), discontinuo (sin enlace).

## Components

### Buttons
Rectos y firmes, como los de un menú de pausa.
- **Shape:** esquinas casi rectas (4px), altura mínima 40px, borde 1.5px `line-strong`.
- **Primary:** relleno `text` con texto `ink`; hover a blanco puro. Para la acción principal de cada momento (Conectar, Entrar, Guardar).
- **Default:** transparente con borde; hover `panel-hover` y borde al 40 %; al pulsar baja 1px.
- **Quiet:** como el normal con texto `text-dim` (Desconectar, Cancelar).
- **Disabled:** opacidad 0.4.
- **Iconos:** lucide 16px, trazo 2.25, delante del texto.

### Cards / Containers (bloques)
- **Corner Style:** 6px.
- **Background:** `panel` con borde 1px `line`.
- **Shadow Strategy:** ninguna (ver Elevation & Depth).
- **Cabecera:** fila de 44px con línea inferior; a la izquierda la pestaña inclinada con el título del bloque, a la derecha el metadato en Meta.
- **Internal Padding:** 20px (14px en móvil).

### Inputs / Fields
- **Style:** fondo tinta al 60 %, borde 1.5px `line-strong`, 4px, altura 42px; cursor de texto ámbar.
- **Focus:** el borde pasa a ámbar, sin halo.
- **Select:** flecha dibujada con degradados en `text-dim`, sin glifo.
- **Error:** bloque con borde 1.5px discontinuo `line-strong` y texto normal; el aviso de reinicio usa el mismo marco.
- **Contraseña:** el campo de la clave del bot es de solo escritura: nunca muestra la guardada, solo un placeholder «•••••••• guardada».

### Navigation (franja superior)
Pares rótulo/valor en una fila: rótulo Label en `text-faint`, valor 15px peso 560. ACCIÓN es el único valor ámbar. Un problema (dueño lejos, ticks bajos) se muestra en texto normal con icono lucide, nunca coloreado.

### Menú de ajustes del muñeco (componente firma)
Cada fila: nombre en Title, pista debajo, opciones a la derecha. La fila activa o con foco recibe la barra de cursor inclinada (blanco al 6 %) y el marcador triangular ámbar a la izquierda. Las opciones son barras inclinadas con borde 1.5px `line`; la elegida se rellena de ámbar y crece al 104 %. Pendiente (enviada, sin confirmar por el bot): barra discontinua ámbar con relleno `amber-soft`, latiendo. Bloqueada (necesita al dueño cerca): barra discontinua neutra con texto tenue; la razón va en la pista de la fila. El foco de teclado dibuja un contorno blanco de 2px alrededor de la barra. Flechas del teclado mueven fila y valor. La fila Nivel tiene cuatro opciones, de menos a más: Fácil, Normal, Difícil y Experto (el que se apoya del todo en lo que aprendió del dueño).

### Visor de entradas
Teclas de 52px de alto (W A S D, salto, sprint, agachar, clic, escudo) con labio inferior; pulsada, se rellena de `text` y baja; si el clic conecta, se rellena de ámbar. Debajo, el historial: frames en mono a la derecha, flecha lucide de dirección y etiquetas Label con borde; el ataque que conecta es una etiqueta ámbar y el fallo una etiqueta con borde discontinuo. La entrada más reciente lleva la barra inclinada; el historial se desvanece hacia abajo.

### Medidor de frames
60 casillas de un tick: tenue vacía, gris al cargar, menta lista, ámbar al golpear (86 %), ámbar con filo blanco en crítico (100 %), contorno blanco al fallar, rojo al recibir golpe. Leyenda con muestras 8×14px debajo.

### Combate (el bot en 3D sobre sus estadísticas)
Escenario tipo selección de personaje: el modelo de jugador del bot (skinview3d, cargado bajo demanda) en vista de tres cuartos sobre un anillo del suelo dibujado en la escena 3D a la altura de los pies (menta si está conectado, gris si no; el anillo no salta con el modelo). Usa la skin que el servidor da al bot; sin skin, un muñeco de entrenamiento acolchado generado en canvas con los tonos del panel, y una línea bajo el escenario lo dice. La animación sale solo del estado real: marcha y carrera por sus teclas, inclinación al hacer strafe, salto al dejar el suelo, brazo en cada golpe, escudo arriba, comer, cabeza según su pitch y destello rojo al recibir daño. Se pausa fuera de pantalla. Imitar al bot es el dato que muestra, así que se mueve siempre; con movimiento reducido solo pierde lo decorativo (la respiración en reposo). Debajo, cuatro cifras grandes separadas por líneas: Dados, Recibidos (rojo solo si hay alguno), Fallados y Acierto con una barra inclinada de 20 segmentos en menta; y una rejilla de seis secundarios (críticos, con sprint, combo y máximo, vida perdida, tótems, muertes). Los golpes se cuentan con daño confirmado por el servidor.

### Lectura del rival
Bloque a todo el ancho con lo que el bot sabe del dueño y el plan que sigue. Es una lectura, no una selección ni un daño: no lleva ámbar ni rojo, solo neutros.
- **Cabecera:** pestaña «Lectura del rival»; el metadato dice «nombre · N peleas» (sin nombre, solo las peleas) o «aprendiendo…» mientras no hay muestras. Fuera de una pelea muestra el rival recordado tal como está guardado.
- **Filas:** rejilla de hasta tres columnas (mínimo 220px cada una), una fila por rasgo (alcance, ritmo, jump reset, KB que recibe, strafe, lado débil, críticos, escudo, agresividad) con línea inferior `line`. Rótulo en Label `text-faint`; valor en 16px peso 520, con coma decimal. Sin datos suficientes el valor es «Aprendiendo…» en 15px `text-faint`. El lado débil se escribe desde el lado del dueño: «cuando me muevo a tu derecha».
- **Barra de confianza:** cinco segmentos de 10×6px separados 2px e inclinados con `--slant`; encendidos en `text-dim`, apagados en blanco al 10 %. Neutra siempre: cuánta seguridad tiene el bot no es ni bueno ni malo. Lleva `aria-label` «confianza N de 5». La agresividad no tiene barra propia.
- **Plan del bot:** columna derecha de 260-340px separada por una línea `line` (debajo de las filas en móvil, sin línea). Título en Label 13px `text-dim`; lista ordenada de hasta cuatro razones en cuerpo 15px, con el número en mono `text-faint`. Sin plan: «Esperando la pelea…» en `text-faint`.

### Interruptor
Píldora de 74×34px con el texto «Sí»/«No» dentro; encendido se rellena de menta con la bola en tinta.

### Sello de combate
El único momento animado con autoría: un crítico, un knockback recibido o un tótem estampan una etiqueta inclinada sobre el escenario de Combate (ámbar para un crítico que conecta, menta para un tótem) que entra con escala y desenfoque y sale recortándose en 1400ms. Con movimiento reducido no aparece animado.

### Movimiento
Curva `cubic-bezier(0.16, 1, 0.3, 1)`. Cambios de estado en 120-140ms; teclas en 50ms; rastro de vida en 260ms tras 700ms de espera; latido de 0.9-1.1s para lo pendiente y lo que conecta. `prefers-reduced-motion` reduce todo a 1ms.

## Do's and Don'ts

### Do:
- **Do** usar ámbar solo para la opción elegida, el valor activo, lo pendiente, el cursor del menú, el foco y el golpe que conecta.
- **Do** reservar el rojo para el daño realmente recibido (knockbacks > 0, casillas de golpe recibido, rastro de vida).
- **Do** marcar bloqueos con barra discontinua y explicar el motivo en la pista de la fila.
- **Do** mostrar errores y advertencias como texto normal más un icono lucide o un borde neutro discontinuo.
- **Do** inclinar barras, cursores y sellos a -12deg con la variable `--slant`.
- **Do** usar iconos de lucide-react (14-16px, trazo 2.25) junto a texto.
- **Do** enmascarar la clave del panel en el registro visible (`?t=••••`) y tratar la contraseña del bot como solo escritura.
- **Do** escribir toda la interfaz en español.

### Don't:
- **Don't** usar ámbar ni rojo para errores o advertencias.
- **Don't** tachar opciones bloqueadas: no han desaparecido, solo esperan.
- **Don't** usar glifos unicode como iconos; usa lucide-react.
- **Don't** usar JetBrains Mono fuera de los datos.
- **Don't** añadir glow, degradados de color ni sombras de elevación a los bloques.
- **Don't** pintar de rojo un contador a cero.

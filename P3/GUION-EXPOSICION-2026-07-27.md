# Guion de exposición — Fase 4 (red de semáforos)

> Fecha: 2026-07-27 · Duración objetivo: ~6 min (5–8) · Presenta: Omar
> Enfoque: qué trabajamos, los retos y cómo los resolvimos. Sin tecnicismos.

## [0:00–0:45] Apertura — de un semáforo a una ciudad

"En las entregas anteriores teníamos *un* semáforo inteligente en una
intersección. En esta fase dimos el salto grande: pasamos a una **red de
intersecciones que se coordinan entre sí**. Ahora no hay un cerebro central
mandando a todos —cada semáforo decide por su cuenta con lo que ve y con lo que
le avisan sus vecinos—, y aun así, juntos logran que el tráfico fluya. La meta
de esta fase era esa: que ante un problema en un punto de la ciudad, la red se
entere y **desvíe el tráfico sola**."

## [0:45–2:30] Qué construimos

"Armamos una cuadrícula de nueve intersecciones. Los autos ya no son de adorno:
cada uno **entra con un origen y un destino** y calcula su ruta, como lo haría
un GPS.

Sobre eso metimos dos tipos de evento que puede sufrir la ciudad:
- **Congestión**: una vía se satura de autos.
- **Colisión**: un accidente que **bloquea físicamente** una calle.

Cuando pasa cualquiera de los dos, el semáforo lo detecta y **avisa al resto de
la red**. Y acá está lo interesante: el semáforo que está antes del accidente
**cierra el paso hacia la calle bloqueada y abre los giros** —lo mostramos con
flechas en pantalla—, así que los autos toman otro camino y rodean el problema.
Cuando el accidente se despeja, todo vuelve a la normalidad solo.

Además conectamos todo a un **semáforo físico simulado en Wokwi** —una placa con
botones y luces— que se comunica con nuestra simulación en tiempo real; y
dejamos una comparación en vivo entre la red **inteligente** y una de **tiempo
fijo** para poder medir si de verdad sirve."

## [2:30–5:00] Los retos (el corazón de la presentación)

"Ahora, lo más honesto e interesante: lo que se nos complicó y cómo lo
resolvimos.

**Uno — un malentendido de arranque.** Empezamos entendiendo mal una palabra del
requerimiento: creímos que el evento era una 'cola de autos', y en realidad era
una 'colisión'. En vez de tirar el trabajo, lo **separamos en dos funciones**
—congestión y colisión— y quedaron las dos. Un recordatorio de lo importante que
es aclarar el requerimiento.

**Dos — los autos se encimaban al girar.** Al principio, en las curvas los autos
parecían atravesarse. Lo tentador era adivinar la causa; en cambio
**construimos un medidor** que registraba cada choque y bajo qué circunstancias.
Los datos nos sorprendieron: la causa no era la que suponíamos. Con eso
corregido, los choques bajaron de casi **uno de cada dos autos a uno de cada
veinte**. La lección: medir antes de arreglar.

**Tres — un giro imposible.** Notamos que a veces, al reencaminar, un auto daba
**media vuelta en plena calle**, algo que en la realidad no se permite. Lo
ajustamos para que en ese caso **dé la vuelta a la cuadra**, como corresponde.

**Cuatro — una decisión de diseño de fondo:** ¿quién desvía el tráfico, el auto
o el semáforo? Lo alineamos con lo que pedía el enunciado: que sea **el
semáforo** el que dirige, cerrando el paso al accidente y mandando por otro lado.

**Cinco — una métrica que nos engañaba.** Al comparar la red inteligente contra
la fija, un número nos daba raro: la red 'tonta' parecía tener *menos* espera.
Investigando, descubrimos que era una **trampa estadística** —se trababa tanto
que casi ningún auto terminaba, y los pocos que sí, habían esperado poco—.
Cambiamos a medir **cuántos autos realmente logra mover la red**, que es lo
honesto. Ahí se ve claro: **cuando el tráfico aprieta, la red inteligente mueve
muchos más autos mientras la fija se colapsa.**"

## [5:00–5:45] Demo (guía de lo que van a ver)

"Para que no quede en palabras, se los muestro: elijo una intersección,
**provoco un accidente**, y van a ver las flechas del semáforo cerrando el paso
y los autos rodeando la cuadra. Puedo **seguir un auto concreto** para comprobar
que de verdad cambia su ruta. Y si cambio a modo 'semáforo fijo', van a ver cómo,
sin coordinación, todo se traba."

## [5:45–6:15] Cierre

"En resumen: pasamos de un semáforo a una red que se comunica, detecta problemas
y desvía el tráfico sola, con un gemelo físico y evidencia medible de que la
coordinación ayuda. Y quizá lo más valioso no fueron las funciones en sí, sino
**cómo llegamos**: aclarar requerimientos, medir en vez de suponer y desconfiar
de los números fáciles. Lo que sigue es guardar el histórico de las corridas y
los tableros de la última fase."

---

## Notas de presentación

- Tener la simulación ya corriendo antes de empezar.
- Para la demo, **pausar justo después de provocar el accidente** para que las
  flechas y el desvío se vean con calma.
- Si el tiempo se acorta, el bloque de **retos** es el que más suma; se puede
  recortar "qué construimos".
- Modo **Manual** de accidentes: útil para dejar el bloqueo fijo mientras se
  explica, sin que se despeje solo.

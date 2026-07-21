# Guion de exposición — Fase 3 y puente Wokwi (Fase 3.5)

> Duración estimada: 3–4 minutos. Las fases 1 y 2 ya fueron expuestas;
> este guion arranca desde la Fase 3. Lenguaje llano, para audiencia universitaria.

## Intro (enganche)

"En la entrega pasada les mostramos el semáforo tradicional: tiempos fijos,
sin importar lo que pase en la calle. Hoy el semáforo aprendió a *pensar*...
y de paso, le dimos un cuerpo físico."

## Fase 3 — El semáforo inteligente

"Ahora el semáforo ya no es ciego: tiene sensores. Detecta cuántos carros
esperan, si hay un peatón queriendo cruzar, si viene una ambulancia y qué hora
es. Con esa información toma decisiones siguiendo reglas con prioridades,
igual que un policía de tránsito:

- Primero, lo más urgente: si viene una **ambulancia**, le da verde de inmediato.
- Si un **peatón** pide cruzar, le prioriza el paso al terminar el ciclo.
- Si una vía tiene **mucha cola**, le alarga el verde.
- Y de **madrugada**, cuando no hay nadie, se pone en amarillo intermitente
  para no hacer esperar a la calle vacía.

Lo importante: se puede cambiar entre modo tradicional e inteligente con un
botón, sobre la misma simulación. Eso nos va a permitir, en la siguiente
entrega, comparar los dos con números y demostrar cuál funciona mejor."

## Fase 3.5 — El semáforo con cuerpo físico

"Hasta aquí, todos los sensores eran botones en la pantalla. Entonces nos
preguntamos: ¿y si las señales vinieran de hardware de verdad? Usamos
**Wokwi**, un simulador de circuitos electrónicos, y armamos una placa
**ESP32** —un chip real que se usa en dispositivos inteligentes— con botones
y luces LED.

La placa y nuestra simulación 3D no se conocen entre sí: se comunican por
internet a través de un servicio de mensajería, como un chat de grupo. La
placa publica '¡pasó una ambulancia!' y la simulación, que está suscrita a ese
chat, reacciona. Y funciona en ambos sentidos: cuando el semáforo 3D cambia de
color, la placa lo escucha y enciende sus LEDs. Es decir, tenemos un **gemelo
físico**: lo que pasa en el mundo 3D se refleja en el circuito, y lo que pasa
en el circuito afecta al mundo 3D."

## Demo en vivo (mientras se habla)

1. Mostrar las dos pantallas lado a lado: la ciudad 3D y el circuito en Wokwi.
2. Presionar el botón físico de **peatón** → aparecen peatones en el cruce 3D.
3. La jugada estrella: presionar el botón de **ambulancia** → "miren la vía:
   se pone verde *en el mismo segundo*"... y los LEDs del circuito cambian con ella.
4. Cerrar mostrando que si presionan los botones de la pantalla pasa
   exactamente lo mismo: para el semáforo no importa de dónde venga la señal.

## Cierre

"¿Qué sigue? Guardar el historial de cada corrida en una base de datos y
ponerle números a la inteligencia: cuánto tiempo ahorra la gente con el
semáforo inteligente comparado con el tradicional. Eso es la Fase 4."

---

## Notas de puesta en escena

- Tener el circuito de Wokwi corriendo **antes** de empezar a hablar.
- La pestaña de la app siempre **visible**: si se minimiza, la simulación
  (y la comunicación con la placa) se pausa.
- Probar el broker ~30 minutos antes de la expo; si fallara, los botones de
  la pantalla hacen exactamente lo mismo (fallback natural de la demo).
- Tener a mano la captura del log donde el botón de ambulancia pone el verde
  en el mismo segundo (evidencia para preguntas).

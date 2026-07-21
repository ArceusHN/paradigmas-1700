# Semaforo Inteligente 3D - Fase 3.5: gemelo fisico (ESP32 en Wokwi)
#
# - Botones = sensores fisicos: publican eventos JSON al topic de eventos.
# - LEDs = semaforo fisico: reflejan el estado que la app publica (retained).
# El ESP32 y la app nunca se ven: ambos hablan con el broker publico.

import network
import time
import json
from machine import Pin
from umqtt.simple import MQTTClient

PREFIJO = "smart-traffic-light-group-4"
TOPIC_EVENTOS = PREFIJO + "/eventos"
TOPIC_ESTADO = PREFIJO + "/estado"
BROKER = "broker.hivemq.com"

# LEDs por grupo (rojo / amarillo / verde), mismos estados que shared/types.ts
LEDS = {
    "ns": {"ROJO": Pin(25, Pin.OUT), "AMARILLO": Pin(26, Pin.OUT), "VERDE": Pin(27, Pin.OUT)},
    "ew": {"ROJO": Pin(33, Pin.OUT), "AMARILLO": Pin(32, Pin.OUT), "VERDE": Pin(21, Pin.OUT)},
}

# Botones de sensores (PULL_UP: presionado = 0) -> mensaje que publica cada uno
BOTONES = [
    (Pin(4, Pin.IN, Pin.PULL_UP), {"tipo": "carro", "dir": "N"}, "carro N-S"),
    (Pin(5, Pin.IN, Pin.PULL_UP), {"tipo": "carro", "dir": "E"}, "carro E-O"),
    (Pin(18, Pin.IN, Pin.PULL_UP), {"tipo": "peaton"}, "peaton"),
    (Pin(19, Pin.IN, Pin.PULL_UP), {"tipo": "ambulancia", "dir": "N"}, "ambulancia N-S"),
]

estado = {"ns": "ROJO", "ew": "ROJO"}


def aplicar_leds(blink_on):
    for grupo, leds in LEDS.items():
        fase = estado[grupo]
        for color, led in leds.items():
            if fase == "INTERMITENTE":
                led.value(1 if (color == "AMARILLO" and blink_on) else 0)
            else:
                led.value(1 if color == fase else 0)


def on_msg(_topic, payload):
    try:
        msg = json.loads(payload)
    except ValueError:
        return
    estado["ns"] = msg.get("ns", estado["ns"])
    estado["ew"] = msg.get("ew", estado["ew"])
    print("Estado recibido:", estado)


print("Conectando a WiFi...")
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("Wokwi-GUEST", "")
while not wlan.isconnected():
    time.sleep(0.2)
print("WiFi OK:", wlan.ifconfig()[0])

print("Conectando al broker MQTT...")
client = MQTTClient("esp32-semaforo-g4", BROKER, port=1883, keepalive=60)
client.set_callback(on_msg)
client.connect()
client.subscribe(TOPIC_ESTADO)  # retained: llega el estado actual de inmediato
print("MQTT OK - eventos:", TOPIC_EVENTOS)

ultimo_disparo = [0] * len(BOTONES)
blink = False
t_blink = time.ticks_ms()
t_ping = time.ticks_ms()

while True:
    client.check_msg()  # no bloqueante: atiende mensajes de estado
    ahora = time.ticks_ms()

    # keepalive: ping cada 30 s para que el broker no cierre la conexion
    if time.ticks_diff(ahora, t_ping) >= 30000:
        client.ping()
        t_ping = ahora

    # parpadeo del modo INTERMITENTE (500 ms)
    if time.ticks_diff(ahora, t_blink) >= 500:
        blink = not blink
        t_blink = ahora

    # botones con antirrebote de 400 ms
    for i, (pin, msg, nombre) in enumerate(BOTONES):
        if pin.value() == 0 and time.ticks_diff(ahora, ultimo_disparo[i]) > 400:
            ultimo_disparo[i] = ahora
            client.publish(TOPIC_EVENTOS, json.dumps(msg))
            print("Evento enviado:", nombre)

    aplicar_leds(blink)
    time.sleep_ms(20)

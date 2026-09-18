# -*- coding: utf-8 -*-
"""Genera los iconos de Carreteo.

El icono repite la identidad de la app: fondo oscuro (#17131f) y una "C"
grande rellena con el degradado rosado -> mango -> violeta, igual que el
logo de la portada. Se hace enmascarando el degradado con el texto, que es
la unica forma de rellenar letras con un degradado en Pillow.

    python tools/make_icons.py
"""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Falta Pillow. Instalalo con:  pip install pillow")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "icons")

FONDO = (23, 19, 31)                      # --bg
PARADAS = [(0.00, (255, 61, 127)),        # --pink
           (0.50, (255, 178, 77)),        # --mango
           (1.00, (139, 108, 255))]       # --violet

FUENTES = [
    r"C:\Windows\Fonts\impact.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def cargar_fuente(px):
    for ruta in FUENTES:
        if os.path.exists(ruta):
            try:
                return ImageFont.truetype(ruta, px)
            except OSError:
                continue
    return ImageFont.load_default()


def color_en(t):
    """Interpola el degradado en la posicion t (0 a 1)."""
    for i in range(len(PARADAS) - 1):
        t0, c0 = PARADAS[i]
        t1, c1 = PARADAS[i + 1]
        if t0 <= t <= t1:
            f = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return tuple(round(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
    return PARADAS[-1][1]


def degradado(lado, caja):
    """Degradado diagonal mapeado SOBRE LA LETRA, no sobre el lienzo.

    Si se mapea sobre el lienzo completo, la letra cae en el medio de la
    diagonal y sale toda naranja: el rosado y el violeta quedan fuera.
    """
    x0, y0, x1, y1 = caja
    lo, hi = x0 + y0, x1 + y1
    span = max(1, hi - lo)
    img = Image.new("RGB", (lado, lado))
    px = img.load()
    for y in range(lado):
        for x in range(lado):
            t = (x + y - lo) / span
            px[x, y] = color_en(min(1.0, max(0.0, t)))
    return img


def mascara_letra(lado, ocupacion):
    """Mascara en blanco y negro con la C centrada.

    `ocupacion` es que fraccion del lado ocupa la letra: los iconos
    maskable se recortan en los bordes, asi que ahi va mas chica.
    """
    m = Image.new("L", (lado, lado), 0)
    d = ImageDraw.Draw(m)
    objetivo = lado * ocupacion

    # busca el tamano de fuente que deja la letra del alto pedido
    px = int(objetivo)
    for _ in range(40):
        f = cargar_fuente(px)
        x0, y0, x1, y1 = d.textbbox((0, 0), "C", font=f)
        alto = y1 - y0
        if alto <= 0:
            break
        if abs(alto - objetivo) <= 2:
            break
        px = max(8, int(px * objetivo / alto))

    f = cargar_fuente(px)
    x0, y0, x1, y1 = d.textbbox((0, 0), "C", font=f)
    x = (lado - (x1 - x0)) / 2 - x0
    y = (lado - (y1 - y0)) / 2 - y0
    d.text((x, y), "C", font=f, fill=255)
    return m, m.getbbox()


def generar(nombre, lado, ocupacion):
    fondo = Image.new("RGB", (lado, lado), FONDO)
    mascara, caja = mascara_letra(lado, ocupacion)
    letra = Image.composite(degradado(lado, caja), fondo, mascara)
    ruta = os.path.join(DESTINO, nombre)
    letra.save(ruta, "PNG", optimize=True)
    print("  %-20s %dx%d  %.1f KB" % (nombre, lado, lado, os.path.getsize(ruta) / 1024))


def main():
    os.makedirs(DESTINO, exist_ok=True)
    print("Generando iconos en %s" % DESTINO)
    generar("icon-192.png", 192, 0.64)
    generar("icon-512.png", 512, 0.64)
    # maskable: el sistema recorta hasta un 20% por lado, la letra va mas chica
    generar("maskable-512.png", 512, 0.42)
    print("Listo.")


if __name__ == "__main__":
    main()

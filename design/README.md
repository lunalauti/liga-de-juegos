# Diseño de UI

El diseño vive en Claude Design y es la **fuente de verdad de la interfaz**:

- Proyecto: `6789cec9-c5e4-4872-9b7b-aacb0d193ba3`
- Archivo principal: `Liga de Juegos.dc.html` (importa `support.js`)
- https://claude.ai/design/p/6789cec9-c5e4-4872-9b7b-aacb0d193ba3

## Regla de trabajo

Igual que con las specs: **primero el diseño, después el código.** Si una pantalla necesita cambiar, se cambia en el canvas y recién ahí se implementa. Un cambio de UI que no pasó por el diseño es deuda, no una mejora.

## Qué va en esta carpeta

Una copia local exportada de los artboards, para que el repo sea autocontenido y para poder comparar la implementación contra la referencia sin depender de tener sesión abierta:

```
design/
├── Liga de Juegos.dc.html   # export del canvas
├── support.js               # el que importa el .dc.html
└── tokens.md                # colores, tipografía y espaciado extraídos del diseño
```

`tokens.md` se traduce después a `apps/web/src/styles/_variables.scss` (las variables de Bootstrap), que es lo que consume el código. Nadie debería estar sacando colores a ojo del canvas: salen de ahí.

## Cómo actualizar la copia local

Desde una terminal interactiva de Claude Code en esta máquina:

```bash
claude
```

y adentro `/design-login` una vez. Después, esta sesión (y las headless) pueden leer el proyecto con la herramienta DesignSync.

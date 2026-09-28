# Estimador de software

Aplicación web para estimar esfuerzo, tiempo y costo de un proyecto de software con tres métodos:

- **COCOMO** (básico e intermedio con los 15 cost drivers)
- **COSMIC** (movimientos de datos E, R, W, X)
- **Puntos de Función** (IFPUG, con VAF)

Actividad de TC3005B · Modelos de Estimación.

## Cómo usarla

No necesita instalar nada: abre `index.html` en el navegador. Para publicarla, activa GitHub Pages sobre la rama principal.

Cada pestaña tiene su calculadora y un botón para descargar el reporte en Markdown. La pestaña **Comparar** pone los tres resultados en persona-mes y la pestaña **Ejercicios de clase** revisa los ejemplos del material contra lo que calcula la app.

Se puede pasar de un método a otro: en Puntos de Función, "Enviar a COCOMO" convierte los PF a KLOC según el lenguaje elegido.

## Estimación pedida en la actividad

La estimación por COCOMO de un proyecto (RoomBook, reservas de salas) está en [ESTIMACION_COCOMO.md](ESTIMACION_COCOMO.md).

## Pruebas

Requiere Node 18 o superior:

```
npm test
```

Las pruebas revisan la lógica de `js/estimation.js` contra los ejemplos de la clase (30 KLOC orgánico, "Iniciar sesión" = 4 CFP, sistema de 53 PF) y los ejercicios propuestos.

## Estructura

```
index.html          interfaz
css/style.css       estilos
js/estimation.js    fórmulas (sin DOM)
js/app.js           interfaz y eventos
test/               pruebas de la lógica
```

## Fórmulas

- COCOMO básico: `E = a·KLOC^b`, `D = c·E^d`, `P = E/D`
- COCOMO intermedio: `E = a′·KLOC^b·EAF`, con EAF el producto de los 15 multiplicadores
- COSMIC: `CFP = ΣE + ΣX + ΣR + ΣW`
- Puntos de Función: `UFP = Σ(cantidad × peso)`, `VAF = 0.65 + 0.01·TDI`, `PFA = UFP × VAF`

Los factores de LOC por punto de función son valores aproximados de la industria y solo sirven para pasar de PF a KLOC.

## Referencias

- Boehm, B. W. (1981). *Software Engineering Economics*. Prentice-Hall.
- IFPUG. *Counting Practices Manual*, release 4.3.1.
- ISO/IEC 19761 — COSMIC.

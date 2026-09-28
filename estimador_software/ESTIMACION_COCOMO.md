# Estimación COCOMO — RoomBook

Estimación de esfuerzo, tiempo y personal para un proyecto cualquiera usando COCOMO (Boehm, 1981). Los números se pueden reproducir en la app con el botón **"Proyecto de ejemplo (RoomBook)"** de la pestaña COCOMO.

## El proyecto

**RoomBook** es una aplicación web para reservar salas y laboratorios de un campus. Los alumnos y profesores buscan una sala, ven su disponibilidad en un calendario y la reservan; un administrador aprueba o rechaza las reservas especiales y consulta reportes de uso.

## Tamaño estimado

El tamaño se estimó por módulos, en miles de líneas de código (KLOC), con base en proyectos web parecidos:

| Módulo | KLOC |
|---|---|
| Autenticación y roles (SSO) | 1.5 |
| Catálogo de salas y laboratorios | 2.0 |
| Reservas y calendario | 4.5 |
| Notificaciones por correo | 1.2 |
| Aprobaciones y administración | 2.3 |
| Reportes y estadísticas | 2.0 |
| API REST e integraciones | 2.5 |
| Interfaz web (frontend) | 4.0 |
| **Total** | **20.0** |

## Modo de desarrollo

**Semi-acoplado.** El equipo mezcla gente con y sin experiencia, el problema es de complejidad media (reglas de disponibilidad, roles, integración con el inicio de sesión institucional) y no hay restricciones de hardware ni de tiempo real.

Constantes del modo semi-acoplado: a = 3.0, b = 1.12, c = 2.5, d = 0.35.

## COCOMO básico

Solo con el tamaño:

- E = 3.0 × 20^1.12 = **85.96 persona-mes**
- D = 2.5 × 85.96^0.35 = **11.88 meses**
- P = E / D = 85.96 / 11.88 = **7.2 personas**

## COCOMO intermedio

Se ajusta el esfuerzo con los cost drivers. Los que no aparecen están en nivel nominal (1.00).

| Driver | Nivel | Multiplicador | Justificación |
|---|---|---|---|
| DATA — tamaño de la base de datos | Bajo | 0.94 | La base de datos es chica frente al tamaño del programa |
| ACAP — capacidad de los analistas | Alto | 0.86 | Analistas con buena experiencia en requisitos |
| VEXP — experiencia con la plataforma | Alto | 0.90 | El equipo ya conoce el navegador y el servidor de aplicaciones |
| MODP — prácticas modernas | Alto | 0.91 | Git, revisión de código e integración continua |
| TOOL — herramientas | Alto | 0.91 | Frameworks y editores modernos |
| SCED — calendario | Bajo | 1.08 | El calendario es corto (un semestre) y está comprimido |

**EAF** = 0.94 × 0.86 × 0.90 × 0.91 × 0.91 × 1.08 = **0.651**

Con a′ = 3.0 (semi-acoplado, intermedio):

- E nominal = 3.0 × 20^1.12 = 85.96 PM
- E = 85.96 × 0.651 = **55.93 persona-mes**
- D = 2.5 × 55.93^0.35 = **10.22 meses**
- P = 55.93 / 10.22 = **5.5 personas**

## Costo

Con un costo de 25,000 MXN por persona-mes:

| Modelo | Esfuerzo | Costo |
|---|---|---|
| Básico | 85.96 PM | 2,148,893 MXN |
| Intermedio | 55.93 PM | 1,398,267 MXN |

## Sensibilidad al modo

Con los mismos 20 KLOC y los mismos cost drivers, cambiar el modo mueve bastante el resultado:

| Modo | Esfuerzo (PM) | Tiempo (meses) | Personal |
|---|---|---|---|
| Orgánico | 48.4 | 10.9 | 4.4 |
| Semi-acoplado | 55.9 | 10.2 | 5.5 |
| Empotrado | 66.3 | 9.6 | 6.9 |

## Conclusión

RoomBook necesitaría alrededor de **56 persona-mes**, unos **10 meses** con un equipo promedio de **5 a 6 personas**, y un costo cercano a **1.4 millones de MXN**. La mayor incertidumbre está en el tamaño en KLOC: un error de 20 % en el tamaño mueve el esfuerzo casi 25 %, porque el exponente es 1.12.

## Validación con los ejercicios de la clase

La app y las pruebas automáticas (`npm test`) verifican los ejemplos del material:

| Caso | Esperado | Calculado |
|---|---|---|
| Orgánico 30 KLOC — esfuerzo | 85.4 PM | 85.3 PM |
| Orgánico 30 KLOC — tiempo | 13.6 meses | 13.5 meses |
| Orgánico 30 KLOC — personal | ≈ 6 | 6.3 |
| Ejercicio 1 (semi-acoplado 50 KLOC) | — | 239.9 PM, 17.0 meses, 14.1 personas |

La diferencia de 0.1 con la diapositiva se debe a que ella redondea a 85.4 antes de calcular el tiempo.

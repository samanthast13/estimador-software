/*
 * Motor de estimación: COCOMO (básico e intermedio), COSMIC y Puntos de Función.
 * Lógica pura, sin DOM. Funciona en el navegador (window.Estimation) y en Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Estimation = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HOURS_PER_PM = 152; // horas por persona-mes (convención de Boehm)

  /* ---------------------------------------------------------------- COCOMO */

  // Constantes del modelo básico (Boehm, 1981). "aInter" es el coeficiente del modelo intermedio.
  const COCOMO_MODES = {
    organic: { name: "Orgánico", a: 2.4, b: 1.05, c: 2.5, d: 0.38, aInter: 3.2,
      desc: "Equipo pequeño, problema conocido, poca innovación." },
    semidetached: { name: "Semi-acoplado", a: 3.0, b: 1.12, c: 2.5, d: 0.35, aInter: 3.0,
      desc: "Equipo con experiencia mixta, complejidad media." },
    embedded: { name: "Empotrado", a: 3.6, b: 1.2, c: 2.5, d: 0.32, aInter: 2.8,
      desc: "Restricciones fuertes: hardware, tiempo real o normativas." },
  };

  const RATING_LABELS = { VL: "Muy bajo", L: "Bajo", N: "Nominal", H: "Alto", VH: "Muy alto", XH: "Extra alto" };
  const RATING_ORDER = ["VL", "L", "N", "H", "VH", "XH"];

  // 15 cost drivers del COCOMO intermedio (tabla de multiplicadores de Boehm, 1981).
  const COST_DRIVERS = [
    { id: "RELY", group: "Producto", name: "Fiabilidad requerida",
      desc: "Consecuencias de un fallo del software.",
      m: { VL: 0.75, L: 0.88, N: 1.0, H: 1.15, VH: 1.4 } },
    { id: "DATA", group: "Producto", name: "Tamaño de la base de datos",
      desc: "Relación entre el tamaño de los datos y el del programa.",
      m: { L: 0.94, N: 1.0, H: 1.08, VH: 1.16 } },
    { id: "CPLX", group: "Producto", name: "Complejidad del producto",
      desc: "Complejidad de control, cálculo, E/S y gestión de datos.",
      m: { VL: 0.7, L: 0.85, N: 1.0, H: 1.15, VH: 1.3, XH: 1.65 } },
    { id: "TIME", group: "Computadora", name: "Restricción de tiempo de ejecución",
      desc: "Porcentaje del tiempo de CPU disponible que se consumirá.",
      m: { N: 1.0, H: 1.11, VH: 1.3, XH: 1.66 } },
    { id: "STOR", group: "Computadora", name: "Restricción de memoria",
      desc: "Porcentaje de memoria principal que se consumirá.",
      m: { N: 1.0, H: 1.06, VH: 1.21, XH: 1.56 } },
    { id: "VIRT", group: "Computadora", name: "Volatilidad de la máquina virtual",
      desc: "Frecuencia de cambios en hardware/sistema operativo base.",
      m: { L: 0.87, N: 1.0, H: 1.15, VH: 1.3 } },
    { id: "TURN", group: "Computadora", name: "Tiempo de respuesta del entorno",
      desc: "Tiempo de espera entre enviar un trabajo y recibir resultados.",
      m: { L: 0.87, N: 1.0, H: 1.07, VH: 1.15 } },
    { id: "ACAP", group: "Personal", name: "Capacidad de los analistas",
      desc: "Habilidad de análisis, eficiencia y comunicación.",
      m: { VL: 1.46, L: 1.19, N: 1.0, H: 0.86, VH: 0.71 } },
    { id: "AEXP", group: "Personal", name: "Experiencia en la aplicación",
      desc: "Años de experiencia con este tipo de aplicación.",
      m: { VL: 1.29, L: 1.13, N: 1.0, H: 0.91, VH: 0.82 } },
    { id: "PCAP", group: "Personal", name: "Capacidad de los programadores",
      desc: "Habilidad, eficiencia y trabajo en equipo del equipo de desarrollo.",
      m: { VL: 1.42, L: 1.17, N: 1.0, H: 0.86, VH: 0.7 } },
    { id: "VEXP", group: "Personal", name: "Experiencia con la máquina virtual",
      desc: "Experiencia con el sistema operativo / plataforma.",
      m: { VL: 1.21, L: 1.1, N: 1.0, H: 0.9 } },
    { id: "LEXP", group: "Personal", name: "Experiencia con el lenguaje",
      desc: "Experiencia con el lenguaje de programación usado.",
      m: { VL: 1.14, L: 1.07, N: 1.0, H: 0.95 } },
    { id: "MODP", group: "Proyecto", name: "Prácticas modernas de programación",
      desc: "Uso de programación estructurada, revisiones, etc.",
      m: { VL: 1.24, L: 1.1, N: 1.0, H: 0.91, VH: 0.82 } },
    { id: "TOOL", group: "Proyecto", name: "Uso de herramientas de software",
      desc: "Calidad y cobertura de las herramientas de desarrollo.",
      m: { VL: 1.24, L: 1.1, N: 1.0, H: 0.91, VH: 0.83 } },
    { id: "SCED", group: "Proyecto", name: "Calendario requerido",
      desc: "Compresión o alargamiento del calendario respecto al nominal.",
      m: { VL: 1.23, L: 1.08, N: 1.0, H: 1.04, VH: 1.1 } },
  ];

  function assertPositive(value, label) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new RangeError(label + " debe ser un número mayor que 0");
    }
  }

  function modeOf(mode) {
    const m = COCOMO_MODES[mode];
    if (!m) throw new RangeError("Modo COCOMO desconocido: " + mode);
    return m;
  }

  /** Multiplicador de esfuerzo (EAF): producto de los multiplicadores de los cost drivers. */
  function effortAdjustmentFactor(ratings) {
    ratings = ratings || {};
    const detail = COST_DRIVERS.map((drv) => {
      const level = ratings[drv.id] || "N";
      if (!(level in drv.m)) throw new RangeError(drv.id + " no admite el nivel " + level);
      return { id: drv.id, level, multiplier: drv.m[level] };
    });
    const eaf = detail.reduce((acc, x) => acc * x.multiplier, 1);
    return { eaf, detail };
  }

  function finishCocomo(mode, kloc, effort, a, eaf) {
    const m = modeOf(mode);
    const time = m.c * Math.pow(effort, m.d);
    return {
      mode, kloc, a, b: m.b, c: m.c, d: m.d, eaf,
      effort,                      // persona-mes
      time,                        // meses
      staff: effort / time,        // personas promedio
      hours: effort * HOURS_PER_PM,
      productivity: (kloc * 1000) / effort, // LOC por persona-mes
    };
  }

  /** COCOMO básico: E = a·KLOC^b ; D = c·E^d ; P = E/D */
  function cocomoBasic(kloc, mode) {
    assertPositive(kloc, "El tamaño (KLOC)");
    const m = modeOf(mode);
    return finishCocomo(mode, kloc, m.a * Math.pow(kloc, m.b), m.a, 1);
  }

  /** COCOMO intermedio: E = a'·KLOC^b · EAF ; D = c·E^d */
  function cocomoIntermediate(kloc, mode, ratings) {
    assertPositive(kloc, "El tamaño (KLOC)");
    const m = modeOf(mode);
    const { eaf, detail } = effortAdjustmentFactor(ratings);
    const nominal = m.aInter * Math.pow(kloc, m.b);
    const res = finishCocomo(mode, kloc, nominal * eaf, m.aInter, eaf);
    res.nominalEffort = nominal;
    res.drivers = detail;
    return res;
  }

  function projectCost(effortPM, costPerPM) {
    return effortPM * costPerPM;
  }

  /* ---------------------------------------------------------------- COSMIC */

  const COSMIC_TYPES = {
    E: { name: "Entrada", desc: "Un dato entra al software desde un usuario o dispositivo." },
    R: { name: "Lectura", desc: "El software lee un dato desde almacenamiento persistente." },
    W: { name: "Escritura", desc: "El software escribe un dato en almacenamiento persistente." },
    X: { name: "Salida", desc: "Un dato sale del software hacia un usuario o dispositivo." },
  };

  /**
   * processes: [{ name, movements: [{ type: 'E'|'R'|'W'|'X', desc }] }]
   * Cada movimiento de datos = 1 CFP.
   */
  function cosmic(processes, hoursPerCfp) {
    const hpc = hoursPerCfp === undefined ? 8 : hoursPerCfp;
    if (typeof hpc !== "number" || !isFinite(hpc) || hpc < 0) throw new RangeError("Horas por CFP inválidas");
    const byType = { E: 0, R: 0, W: 0, X: 0 };
    const warnings = [];
    const perProcess = processes.map((p) => {
      let cfp = 0;
      for (const mv of p.movements) {
        if (!(mv.type in byType)) throw new RangeError("Tipo de movimiento inválido: " + mv.type);
        byType[mv.type]++;
        cfp++;
      }
      const hasEntry = p.movements.some((mv) => mv.type === "E");
      if (p.movements.length > 0 && !hasEntry) {
        warnings.push(`"${p.name}": todo proceso funcional debe tener al menos una Entrada (E) que lo dispare.`);
      }
      if (p.movements.length === 1) {
        warnings.push(`"${p.name}": COSMIC exige mínimo 2 movimientos por proceso (una Entrada y una Escritura o Salida).`);
      }
      return { name: p.name, cfp };
    });
    const total = perProcess.reduce((a, p) => a + p.cfp, 0);
    return {
      total, byType, perProcess, warnings,
      hoursPerCfp: hpc,
      hours: total * hpc,
      personMonths: (total * hpc) / HOURS_PER_PM,
    };
  }

  /* ------------------------------------------------------ Puntos de Función */

  // Pesos IFPUG por componente y complejidad [baja, media, alta].
  const FP_COMPONENTS = {
    EI: { name: "Entrada externa (EI)", desc: "Datos que entran y modifican datos internos.", w: [3, 4, 6] },
    EO: { name: "Salida externa (EO)", desc: "Datos que salen con cálculo o derivación.", w: [4, 5, 7] },
    EQ: { name: "Consulta externa (EQ)", desc: "Datos que salen sin cálculo (consulta directa).", w: [3, 4, 6] },
    ILF: { name: "Archivo lógico interno (ILF)", desc: "Grupo de datos mantenido por el sistema.", w: [7, 10, 15] },
    EIF: { name: "Archivo de interfaz externa (EIF)", desc: "Datos usados, mantenidos por otro sistema.", w: [5, 7, 10] },
  };

  const GSC = [
    "Comunicación de datos", "Procesamiento distribuido", "Rendimiento", "Configuración muy utilizada",
    "Tasa de transacciones", "Entrada de datos en línea", "Eficiencia del usuario final",
    "Actualización en línea", "Procesamiento complejo", "Reusabilidad", "Facilidad de instalación",
    "Facilidad de operación", "Múltiples sitios", "Facilidad de cambio",
  ];

  /**
   * counts: { EI:[baja,media,alta], EO:[...], ... }
   * gsc: arreglo de 14 valores 0..5 (por defecto todos 0 => TDI 0)
   */
  function functionPoints(counts, gsc, hoursPerFp) {
    const hpf = hoursPerFp === undefined ? 8 : hoursPerFp;
    if (typeof hpf !== "number" || !isFinite(hpf) || hpf < 0) throw new RangeError("Horas por PF inválidas");
    const g = gsc || new Array(GSC.length).fill(0);
    if (g.length !== GSC.length) throw new RangeError("Se requieren " + GSC.length + " características generales");
    g.forEach((v) => {
      if (!Number.isInteger(v) || v < 0 || v > 5) throw new RangeError("Cada característica debe ser un entero de 0 a 5");
    });
    const rows = Object.keys(FP_COMPONENTS).map((key) => {
      const c = (counts && counts[key]) || [0, 0, 0];
      const w = FP_COMPONENTS[key].w;
      c.forEach((n) => {
        if (!Number.isInteger(n) || n < 0) throw new RangeError("Las cantidades deben ser enteros >= 0");
      });
      const subtotal = c[0] * w[0] + c[1] * w[1] + c[2] * w[2];
      return { key, counts: c, weights: w, subtotal };
    });
    const ufp = rows.reduce((a, r) => a + r.subtotal, 0);
    const tdi = g.reduce((a, v) => a + v, 0);
    const vaf = 0.65 + 0.01 * tdi;
    const afp = ufp * vaf;
    return { rows, ufp, tdi, vaf, afp, hoursPerFp: hpf, hours: afp * hpf, personMonths: (afp * hpf) / HOURS_PER_PM };
  }

  // LOC por punto de función (valores aproximados de la industria; sirven para "backfiring").
  const LOC_PER_FP = {
    "Python": 24, "JavaScript": 47, "TypeScript": 40, "Java": 53, "C#": 54,
    "PHP": 40, "C++": 55, "C": 128, "SQL": 13, "Ensamblador": 119,
  };

  /** Convierte PF a KLOC según el lenguaje (aproximación). */
  function fpToKloc(fp, language) {
    assertPositive(fp, "Los puntos de función");
    const loc = LOC_PER_FP[language];
    if (!loc) throw new RangeError("Lenguaje desconocido: " + language);
    return (fp * loc) / 1000;
  }

  return {
    HOURS_PER_PM, COCOMO_MODES, COST_DRIVERS, RATING_LABELS, RATING_ORDER,
    cocomoBasic, cocomoIntermediate, effortAdjustmentFactor, projectCost,
    COSMIC_TYPES, cosmic,
    FP_COMPONENTS, GSC, functionPoints, LOC_PER_FP, fpToKloc,
  };
});

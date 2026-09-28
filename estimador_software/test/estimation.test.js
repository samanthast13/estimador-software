const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../js/estimation.js");

const near = (actual, expected, tol = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= tol, `esperado ≈ ${expected}, obtenido ${actual}`);

/* ---- COCOMO: ejemplo de la diapositiva "proyecto orgánico de 30 KLOC" ---- */
test("COCOMO básico — ejemplo de clase (orgánico, 30 KLOC)", () => {
  const r = E.cocomoBasic(30, "organic");
  near(r.effort, 85.4, 0.1);   // 85.4 PM
  near(r.time, 13.6, 0.1);     // 13.6 meses
  near(r.staff, 6.3, 0.1);     // ≈ 6 personas
});

test("COCOMO básico — ejercicio 1 (semi-acoplado, 50 KLOC) contra fórmula directa", () => {
  const r = E.cocomoBasic(50, "semidetached");
  const effort = 3.0 * Math.pow(50, 1.12);
  const time = 2.5 * Math.pow(effort, 0.35);
  near(r.effort, effort, 1e-9);
  near(r.time, time, 1e-9);
  near(r.staff, effort / time, 1e-9);
  near(r.effort, 239.9, 0.1);
  near(r.time, 17.0, 0.1);
  near(r.staff, 14.1, 0.1);
});

test("COCOMO básico — modo empotrado", () => {
  const r = E.cocomoBasic(10, "embedded");
  near(r.effort, 3.6 * Math.pow(10, 1.2), 1e-9);
});

test("COCOMO intermedio — todo nominal usa a' y EAF = 1", () => {
  const r = E.cocomoIntermediate(30, "organic", {});
  assert.equal(r.eaf, 1);
  near(r.effort, 3.2 * Math.pow(30, 1.05), 1e-9);
});

test("COCOMO intermedio — EAF es el producto de los multiplicadores", () => {
  const r = E.cocomoIntermediate(32, "semidetached", { RELY: "H", CPLX: "VH", ACAP: "H" });
  near(r.eaf, 1.15 * 1.3 * 0.86, 1e-9);
  near(r.effort, 3.0 * Math.pow(32, 1.12) * r.eaf, 1e-9);
});

test("COCOMO — rechaza entradas inválidas", () => {
  assert.throws(() => E.cocomoBasic(0, "organic"), RangeError);
  assert.throws(() => E.cocomoBasic(-5, "organic"), RangeError);
  assert.throws(() => E.cocomoBasic(NaN, "organic"), RangeError);
  assert.throws(() => E.cocomoBasic(10, "otro"), RangeError);
  assert.throws(() => E.cocomoIntermediate(10, "organic", { DATA: "VL" }), RangeError); // nivel no válido para DATA
});

test("COCOMO — hay 15 cost drivers y el nivel nominal vale 1.00", () => {
  assert.equal(E.COST_DRIVERS.length, 15);
  for (const d of E.COST_DRIVERS) assert.equal(d.m.N, 1.0, d.id);
});

/* ---- COSMIC ---- */
test("COSMIC — ejemplo de clase 'Iniciar sesión' = 4 CFP y 32 horas", () => {
  const r = E.cosmic(
    [{ name: "Iniciar sesión", movements: [{ type: "E" }, { type: "R" }, { type: "W" }, { type: "X" }] }],
    8
  );
  assert.equal(r.total, 4);
  assert.equal(r.hours, 32);
  assert.deepEqual(r.byType, { E: 1, R: 1, W: 1, X: 1 });
  assert.equal(r.warnings.length, 0);
});

test("COSMIC — suma de varios procesos y advertencias", () => {
  const r = E.cosmic([
    { name: "A", movements: [{ type: "E" }, { type: "W" }] },
    { name: "B", movements: [{ type: "R" }] },
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.warnings.length, 2); // B sin Entrada y con un solo movimiento
});

test("COSMIC — tipo de movimiento inválido", () => {
  assert.throws(() => E.cosmic([{ name: "A", movements: [{ type: "Z" }] }]), RangeError);
});

/* ---- Puntos de función ---- */
test("PF — ejemplo de clase (complejidad media) = 53 UFP, VAF 1.00, 53 PF", () => {
  const counts = { EI: [0, 3, 0], EO: [0, 2, 0], EQ: [0, 1, 0], ILF: [0, 2, 0], EIF: [0, 1, 0] };
  const gsc = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1]; // suma 35
  const r = E.functionPoints(counts, gsc);
  assert.equal(r.tdi, 35);
  assert.equal(r.ufp, 53);
  near(r.vaf, 1.0, 1e-9);
  near(r.afp, 53, 1e-9);
});

test("PF — ejercicio 3 (4 EI, 3 EO, 2 EQ, 3 ILF, 1 EIF medios) = 76 UFP", () => {
  const counts = { EI: [0, 4, 0], EO: [0, 3, 0], EQ: [0, 2, 0], ILF: [0, 3, 0], EIF: [0, 1, 0] };
  const r = E.functionPoints(counts);
  assert.equal(r.ufp, 4 * 4 + 3 * 5 + 2 * 4 + 3 * 10 + 1 * 7);
  assert.equal(r.ufp, 76);
});

test("PF — pesos de baja/alta y límites del VAF", () => {
  const r = E.functionPoints({ EI: [1, 0, 1], ILF: [0, 0, 1] }, new Array(14).fill(5));
  assert.equal(r.ufp, 3 + 6 + 15);
  near(r.vaf, 1.35, 1e-9); // TDI máximo = 70
  const r0 = E.functionPoints({}, new Array(14).fill(0));
  near(r0.vaf, 0.65, 1e-9);
});

test("PF — valida cantidades y características", () => {
  assert.throws(() => E.functionPoints({ EI: [-1, 0, 0] }), RangeError);
  assert.throws(() => E.functionPoints({ EI: [1.5, 0, 0] }), RangeError);
  assert.throws(() => E.functionPoints({}, [6, ...new Array(13).fill(0)]), RangeError);
  assert.throws(() => E.functionPoints({}, [1, 2]), RangeError);
});

test("PF → KLOC según lenguaje", () => {
  near(E.fpToKloc(100, "Java"), 5.3, 1e-9);
  assert.throws(() => E.fpToKloc(100, "Cobol2000"), RangeError);
  assert.throws(() => E.fpToKloc(0, "Java"), RangeError);
});

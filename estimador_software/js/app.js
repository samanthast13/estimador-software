/* Interfaz de la app. Toda la matemática vive en estimation.js (window.Estimation). */
(function () {
  "use strict";
  const E = window.Estimation;
  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ------------------------------------------------------------ utilidades */
  const nf = (d) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (n, d) => nf(d === undefined ? 2 : d).format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (input) => {
    const v = parseFloat(String(input.value).replace(",", "."));
    return isFinite(v) ? v : NaN;
  };
  const int0 = (input) => {
    const v = parseInt(input.value, 10);
    return isFinite(v) && v > 0 ? v : 0;
  };

  function download(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const slug = (s) => (s || "proyecto").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto";

  /* ------------------------------------------------------------ pestañas */
  const tabs = document.querySelectorAll(".tabs [role=tab]");
  function showTab(name) {
    if (!$("#tab-" + name)) name = "cocomo";
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
    if (name === "compare") renderCompare();
    if (name === "exercises") renderExercises();
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  /* ============================================================== COCOMO */
  const cs = {
    name: "Mi proyecto", level: "basic", mode: "organic", ratings: {}, modules: [],
  };
  let cLast = null; // último resultado válido

  const cEl = {
    name: $("#c-name"), kloc: $("#c-kloc"), pm: $("#c-pmcost"), cur: $("#c-currency"),
    error: $("#c-error"), kpis: $("#c-kpis"), formulas: $("#c-formulas"), chart: $("#c-chart"),
    driversCard: $("#c-drivers-card"), drivers: $("#c-drivers"), eaf: $("#c-eaf"),
    fp: $("#c-fp"), lang: $("#c-lang"), fpOut: $("#c-fp-out"),
  };

  // Modos
  const modesBox = $("#c-mode");
  Object.entries(E.COCOMO_MODES).forEach(([key, m]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "mode"; b.setAttribute("role", "radio"); b.dataset.v = key;
    b.innerHTML = `<strong>${m.name}</strong><span>${m.desc}</span>`;
    b.addEventListener("click", () => { cs.mode = key; cocomoUpdate(); });
    modesBox.appendChild(b);
  });

  // Nivel
  document.querySelectorAll("#c-level button").forEach((b) =>
    b.addEventListener("click", () => { cs.level = b.dataset.v; cocomoUpdate(); }));

  // Lenguajes (dos selects: COCOMO y PF)
  function fillLanguages(select, selected) {
    Object.entries(E.LOC_PER_FP).forEach(([lang, loc]) => {
      const o = document.createElement("option");
      o.value = lang; o.textContent = `${lang} (${loc} LOC/PF)`;
      if (lang === selected) o.selected = true;
      select.appendChild(o);
    });
  }
  fillLanguages(cEl.lang, "JavaScript");

  // Cost drivers
  (function buildDrivers() {
    let group = "";
    E.COST_DRIVERS.forEach((d) => {
      if (d.group !== group) {
        group = d.group;
        const h = document.createElement("div");
        h.className = "driver-group"; h.textContent = group;
        cEl.drivers.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "driver";
      const opts = E.RATING_ORDER.filter((r) => r in d.m)
        .map((r) => `<option value="${r}"${r === "N" ? " selected" : ""}>${E.RATING_LABELS[r]} (${d.m[r].toFixed(2)})</option>`).join("");
      row.innerHTML = `<div><b>${d.id} · ${d.name}</b><small>${d.desc}</small></div>
        <select data-id="${d.id}" aria-label="${d.name}">${opts}</select>`;
      row.querySelector("select").addEventListener("change", (e) => {
        cs.ratings[d.id] = e.target.value; cocomoUpdate();
      });
      cEl.drivers.appendChild(row);
    });
  })();
  $("#c-drivers-reset").addEventListener("click", () => { cs.ratings = {}; syncDriverSelects(); cocomoUpdate(); });
  function syncDriverSelects() {
    cEl.drivers.querySelectorAll("select").forEach((s) => (s.value = cs.ratings[s.dataset.id] || "N"));
  }

  // FP → KLOC
  function updateFpToKloc() {
    const fp = num(cEl.fp);
    try {
      const k = E.fpToKloc(fp, cEl.lang.value);
      cEl.fpOut.textContent = `≈ ${fmt(k, 2)} KLOC`;
      return k;
    } catch (e) { cEl.fpOut.textContent = "—"; return NaN; }
  }
  cEl.fp.addEventListener("input", updateFpToKloc);
  cEl.lang.addEventListener("change", updateFpToKloc);
  $("#c-fp-apply").addEventListener("click", () => {
    const k = updateFpToKloc();
    if (isFinite(k)) { cEl.kloc.value = String(Math.round(k * 100) / 100); cocomoUpdate(); }
  });

  [cEl.name, cEl.kloc, cEl.pm, cEl.cur].forEach((i) => i.addEventListener("input", cocomoUpdate));

  function cocomoCompute() {
    const kloc = num(cEl.kloc);
    if (!(kloc > 0)) throw new RangeError("Ingresa un tamaño (KLOC) mayor que 0.");
    return cs.level === "basic" ? E.cocomoBasic(kloc, cs.mode) : E.cocomoIntermediate(kloc, cs.mode, cs.ratings);
  }

  function kpi(value, label, unit) {
    return `<div class="kpi"><div class="v">${value}</div><div class="u">${unit || ""}</div><div class="l">${label}</div></div>`;
  }

  function cocomoUpdate() {
    cs.name = cEl.name.value;
    // controles
    document.querySelectorAll("#c-level button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === cs.level)));
    modesBox.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === cs.mode)));
    cEl.driversCard.hidden = cs.level !== "intermediate";
    $("#c-level-help").textContent = cs.level === "basic"
      ? "Usa solo el tamaño en KLOC. Estimación rápida y temprana."
      : "Suma 15 cost drivers (producto, computadora, personal y proyecto) que multiplican el esfuerzo.";
    cEl.kloc.setAttribute("aria-invalid", String(!(num(cEl.kloc) > 0)));

    let r;
    try {
      r = cocomoCompute();
      cEl.error.hidden = true;
    } catch (e) {
      cLast = null;
      cEl.error.textContent = e.message; cEl.error.hidden = false;
      cEl.kpis.innerHTML = ""; cEl.formulas.innerHTML = ""; cEl.chart.innerHTML = "";
      renderCompareIfVisible();
      return;
    }
    cLast = r;
    const pm = Math.max(0, num(cEl.pm) || 0);
    const cost = E.projectCost(r.effort, pm);
    const cur = esc(cEl.cur.value.trim());
    cEl.eaf.textContent = (r.eaf).toFixed(2);

    cEl.kpis.innerHTML =
      kpi(fmt(r.effort, 1), "Esfuerzo", "persona-mes") +
      kpi(fmt(r.time, 1), "Tiempo de desarrollo", "meses") +
      kpi(fmt(r.staff, 1), "Personal promedio", "personas") +
      kpi(fmt(cost, 0), "Costo estimado", cur) +
      kpi(fmt(r.productivity, 0), "Productividad", "LOC / persona-mes") +
      kpi(fmt(r.hours, 0), "Horas-persona", "h (152 h/PM)");

    const m = E.COCOMO_MODES[r.mode];
    const lines = [];
    if (cs.level === "basic") {
      lines.push(`<div><b>E</b> = a × KLOC<sup>b</sup> = ${r.a} × ${fmt(r.kloc, 2)}<sup>${r.b}</sup> = <b>${fmt(r.effort, 2)} PM</b></div>`);
    } else {
      lines.push(`<div><b>E<sub>nominal</sub></b> = a′ × KLOC<sup>b</sup> = ${r.a} × ${fmt(r.kloc, 2)}<sup>${r.b}</sup> = ${fmt(r.nominalEffort, 2)} PM</div>`);
      lines.push(`<div><b>E</b> = E<sub>nominal</sub> × EAF = ${fmt(r.nominalEffort, 2)} × ${fmt(r.eaf, 3)} = <b>${fmt(r.effort, 2)} PM</b></div>`);
    }
    lines.push(`<div><b>D</b> = c × E<sup>d</sup> = ${r.c} × ${fmt(r.effort, 2)}<sup>${r.d}</sup> = <b>${fmt(r.time, 2)} meses</b></div>`);
    lines.push(`<div><b>P</b> = E / D = ${fmt(r.effort, 2)} / ${fmt(r.time, 2)} = <b>${fmt(r.staff, 2)} personas</b></div>`);
    lines.push(`<div><b>Costo</b> = E × costo/PM = ${fmt(r.effort, 2)} × ${fmt(pm, 0)} = <b>${fmt(cost, 0)} ${cur}</b></div>`);
    cEl.formulas.innerHTML = lines.join("");
    cEl.formulas.title = `Modo ${m.name}, modelo ${cs.level === "basic" ? "básico" : "intermedio"}`;

    drawCocomoChart(r);
    renderCompareIfVisible();
  }

  function drawCocomoChart(r) {
    const W = 560, H = 260, ml = 48, mr = 14, mt = 14, mb = 34;
    const xmax = niceMax(Math.max(r.kloc * 1.4, 20));
    const eaf = cs.level === "basic" ? null : r.eaf;
    const effortAt = (mode, k) => {
      const m = E.COCOMO_MODES[mode];
      return eaf === null ? m.a * Math.pow(k, m.b) : m.aInter * Math.pow(k, m.b) * eaf;
    };
    const ymax = niceMax(Math.max(effortAt("embedded", xmax), r.effort * 1.1));
    const X = (k) => ml + (k / xmax) * (W - ml - mr);
    const Y = (v) => H - mb - (v / ymax) * (H - mt - mb);
    const colors = { organic: "var(--c-e)", semidetached: "var(--c-w)", embedded: "var(--c-r)" };
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Esfuerzo en persona-mes contra tamaño en KLOC para los tres modos">`;
    for (let i = 0; i <= 4; i++) {
      const v = (ymax / 4) * i, k = (xmax / 4) * i;
      svg += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      svg += `<text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
      svg += `<text x="${X(k)}" y="${H - mb + 16}" text-anchor="middle">${fmt(k, 0)}</text>`;
    }
    svg += `<text x="${W / 2}" y="${H - 4}" text-anchor="middle">KLOC</text>`;
    svg += `<text x="12" y="${mt + 4}" >PM</text>`;
    Object.keys(colors).forEach((mode) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const k = (xmax / 40) * i; pts.push(`${X(k).toFixed(1)},${Y(effortAt(mode, k)).toFixed(1)}`); }
      const sel = mode === r.mode;
      svg += `<polyline fill="none" stroke="${colors[mode]}" stroke-width="${sel ? 3 : 1.6}" opacity="${sel ? 1 : .55}" points="${pts.join(" ")}"/>`;
    });
    svg += `<circle cx="${X(r.kloc)}" cy="${Y(r.effort)}" r="6" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>`;
    let lx = ml + 6;
    Object.keys(colors).forEach((mode) => {
      svg += `<rect x="${lx}" y="${mt}" width="12" height="4" fill="${colors[mode]}"/><text class="legend-line" x="${lx + 16}" y="${mt + 6}">${E.COCOMO_MODES[mode].name}</text>`;
      lx += 120;
    });
    svg += "</svg>";
    cEl.chart.innerHTML = svg;
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  $("#c-export").addEventListener("click", () => {
    if (!cLast) return;
    download(`cocomo-${slug(cs.name)}.md`, cocomoReport(cLast));
  });

  function cocomoReport(r) {
    const m = E.COCOMO_MODES[r.mode];
    const pm = Math.max(0, num(cEl.pm) || 0);
    const cur = cEl.cur.value.trim();
    let md = `# Estimación COCOMO ${cs.level === "basic" ? "básico" : "intermedio"} — ${cs.name}\n\n`;
    md += `- **Modo:** ${m.name}\n- **Tamaño:** ${fmt(r.kloc, 2)} KLOC\n`;
    md += `- **Constantes:** a${cs.level === "basic" ? "" : "′"} = ${r.a}, b = ${r.b}, c = ${r.c}, d = ${r.d}\n`;
    if (cs.level === "intermediate") md += `- **EAF:** ${fmt(r.eaf, 3)}\n`;
    md += `\n## Resultados\n\n| Métrica | Valor |\n|---|---|\n`;
    md += `| Esfuerzo | ${fmt(r.effort, 2)} persona-mes |\n| Tiempo | ${fmt(r.time, 2)} meses |\n| Personal promedio | ${fmt(r.staff, 2)} personas |\n`;
    md += `| Costo (${fmt(pm, 0)} ${cur}/PM) | ${fmt(E.projectCost(r.effort, pm), 0)} ${cur} |\n`;
    if (cs.level === "intermediate") {
      md += `\n## Cost drivers\n\n| Driver | Nivel | Multiplicador |\n|---|---|---|\n`;
      r.drivers.forEach((d) => {
        const drv = E.COST_DRIVERS.find((x) => x.id === d.id);
        md += `| ${d.id} — ${drv.name} | ${E.RATING_LABELS[d.level]} | ${d.multiplier.toFixed(2)} |\n`;
      });
      md += `\n**EAF = ${fmt(r.eaf, 4)}**\n`;
    }
    return md;
  }

  const PROJECT_EXAMPLE = {
    name: "RoomBook — reservas de salas del campus",
    mode: "semidetached", level: "intermediate", pm: 25000, currency: "MXN",
    // Tamaño estimado por módulo (KLOC). Total = 20.0 KLOC.
    modules: [
      ["Autenticación y roles (SSO)", 1.5], ["Catálogo de salas y laboratorios", 2.0],
      ["Reservas y calendario", 4.5], ["Notificaciones por correo", 1.2],
      ["Aprobaciones y administración", 2.3], ["Reportes y estadísticas", 2.0],
      ["API REST e integraciones", 2.5], ["Interfaz web (frontend)", 4.0],
    ],
    ratings: { DATA: "L", ACAP: "H", VEXP: "H", MODP: "H", TOOL: "H", SCED: "L" },
  };

  $("#cocomo-load-class").addEventListener("click", () => loadCocomo({
    name: "Ejemplo de clase — orgánico 30 KLOC", mode: "organic", level: "basic", kloc: 30, pm: 25000, currency: "MXN", ratings: {},
  }));
  $("#cocomo-load-project").addEventListener("click", () => loadCocomo({
    name: PROJECT_EXAMPLE.name, mode: PROJECT_EXAMPLE.mode, level: PROJECT_EXAMPLE.level,
    kloc: PROJECT_EXAMPLE.modules.reduce((a, m) => a + m[1], 0), pm: PROJECT_EXAMPLE.pm,
    currency: PROJECT_EXAMPLE.currency, ratings: PROJECT_EXAMPLE.ratings,
  }));
  function loadCocomo(p) {
    cEl.name.value = p.name; cs.mode = p.mode; cs.level = p.level;
    cEl.kloc.value = String(p.kloc); cEl.pm.value = String(p.pm); cEl.cur.value = p.currency;
    cs.ratings = Object.assign({}, p.ratings); syncDriverSelects();
    cocomoUpdate();
  }

  /* ============================================================== COSMIC */
  const ss = { processes: [], nextId: 1, hpc: 8 };
  const sEl = {
    list: $("#s-processes"), kpis: $("#s-kpis"), bars: $("#s-bars"), warn: $("#s-warnings"),
    per: $("#s-perprocess"), hpc: $("#s-hpc"), legend: $("#s-legend"),
  };
  sEl.legend.innerHTML = Object.entries(E.COSMIC_TYPES).map(([k, t]) =>
    `<span class="chip t-${k}" title="${esc(t.desc)}"><i class="dot"></i><b>${k}</b> ${t.name}</span>`).join("");

  function newProcess(name, movements) {
    return { id: ss.nextId++, name, movements: movements || [{ type: "E", desc: "" }, { type: "W", desc: "" }] };
  }
  $("#s-add-process").addEventListener("click", () => {
    ss.processes.push(newProcess("Nuevo proceso funcional"));
    renderProcesses();
  });
  sEl.hpc.addEventListener("input", cosmicUpdate);

  function renderProcesses() {
    sEl.list.innerHTML = "";
    ss.processes.forEach((p) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<div class="process-head">
          <input type="text" class="p-name" value="${esc(p.name)}" maxlength="80" aria-label="Nombre del proceso funcional">
          <span class="badge p-badge"></span>
          <button class="btn ghost icon p-del" type="button" title="Eliminar proceso" aria-label="Eliminar proceso">×</button>
        </div><div class="p-moves"></div>
        <button class="btn ghost small p-add" type="button">+ Movimiento de datos</button>`;
      const moves = card.querySelector(".p-moves");
      const badge = card.querySelector(".p-badge");
      const updBadge = () => (badge.textContent = p.movements.length + " CFP");

      const addRow = (mv) => {
        const row = document.createElement("div");
        row.className = `movement t-${mv.type}`;
        row.innerHTML = `<select aria-label="Tipo de movimiento">${Object.entries(E.COSMIC_TYPES).map(([k, t]) =>
          `<option value="${k}"${k === mv.type ? " selected" : ""}>${k} · ${t.name}</option>`).join("")}</select>
          <input type="text" value="${esc(mv.desc)}" placeholder="Descripción (p. ej. el usuario ingresa su contraseña)" maxlength="140" aria-label="Descripción del movimiento">
          <button class="btn ghost icon" type="button" title="Quitar" aria-label="Quitar movimiento">×</button>`;
        const sel = row.querySelector("select");
        sel.addEventListener("change", () => { mv.type = sel.value; row.className = `movement t-${mv.type}`; cosmicUpdate(); });
        row.querySelector("input").addEventListener("input", (e) => { mv.desc = e.target.value; });
        row.querySelector("button").addEventListener("click", () => {
          p.movements.splice(p.movements.indexOf(mv), 1); row.remove(); updBadge(); cosmicUpdate();
        });
        moves.appendChild(row);
      };
      p.movements.forEach(addRow);
      updBadge();
      card.querySelector(".p-add").addEventListener("click", () => {
        const mv = { type: "X", desc: "" }; p.movements.push(mv); addRow(mv); updBadge(); cosmicUpdate();
      });
      card.querySelector(".p-name").addEventListener("input", (e) => { p.name = e.target.value; cosmicUpdate(); });
      card.querySelector(".p-del").addEventListener("click", () => {
        ss.processes.splice(ss.processes.indexOf(p), 1); renderProcesses();
      });
      card._badge = updBadge;
      sEl.list.appendChild(card);
    });
    cosmicUpdate();
  }

  let sLast = null;
  function cosmicUpdate() {
    const hpc = num(sEl.hpc);
    const r = E.cosmic(ss.processes.map((p) => ({ name: p.name || "(sin nombre)", movements: p.movements })), isFinite(hpc) && hpc >= 0 ? hpc : 0);
    sLast = r;
    sEl.list.querySelectorAll(".card").forEach((c, i) => { const p = ss.processes[i]; if (p) c.querySelector(".p-badge").textContent = p.movements.length + " CFP"; });
    sEl.kpis.innerHTML =
      kpi(r.total, "Tamaño funcional", "CFP") +
      kpi(fmt(r.hours, 0), "Esfuerzo", "horas-persona") +
      kpi(fmt(r.personMonths, 2), "Equivalente", "persona-mes");
    const max = Math.max(1, ...Object.values(r.byType));
    sEl.bars.innerHTML = Object.entries(E.COSMIC_TYPES).map(([k, t]) =>
      `<div class="bar t-${k}"><span>${k} · ${t.name}</span><div class="track"><div class="fill" style="width:${(r.byType[k] / max) * 100}%"></div></div><span class="n">${r.byType[k]}</span></div>`).join("");
    sEl.warn.innerHTML = r.warnings.map((w) => `<div>${esc(w)}</div>`).join("");
    sEl.per.innerHTML = r.perProcess.length
      ? `<table class="plain"><tbody>${r.perProcess.map((p) => `<tr><td>${esc(p.name)}</td><td style="text-align:right">${p.cfp} CFP</td></tr>`).join("")}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${r.total} CFP</b></td></tr></tbody></table>`
      : `<p class="hint">Agrega un proceso funcional para comenzar.</p>`;
    renderCompareIfVisible();
  }

  const LOGIN = () => newProcess("Iniciar sesión", [
    { type: "E", desc: "El usuario ingresa usuario y contraseña" },
    { type: "R", desc: "El sistema lee las credenciales en la base de datos" },
    { type: "W", desc: "El sistema registra el intento en el log de acceso" },
    { type: "X", desc: "El sistema muestra el resultado al usuario" },
  ]);
  const GRADE = () => newProcess("Registrar una nueva calificación", [
    { type: "E", desc: "El profesor captura matrícula, materia y calificación" },
    { type: "R", desc: "El sistema lee la inscripción del alumno para validar que cursa la materia" },
    { type: "W", desc: "El sistema guarda la calificación" },
    { type: "X", desc: "El sistema muestra la confirmación (o el mensaje de error)" },
  ]);
  $("#s-load-class").addEventListener("click", () => { ss.processes = [LOGIN()]; renderProcesses(); });
  $("#s-load-ex2").addEventListener("click", () => { ss.processes = [GRADE()]; renderProcesses(); });

  $("#s-export").addEventListener("click", () => {
    if (!sLast) return;
    let md = `# Estimación COSMIC\n\n- **Tamaño:** ${sLast.total} CFP\n- **Tasa:** ${sLast.hoursPerCfp} h-persona/CFP\n- **Esfuerzo:** ${fmt(sLast.hours, 1)} h-persona (${fmt(sLast.personMonths, 2)} persona-mes)\n\n`;
    md += `## Procesos funcionales\n\n`;
    ss.processes.forEach((p) => {
      md += `### ${p.name || "(sin nombre)"} — ${p.movements.length} CFP\n\n| Tipo | Descripción |\n|---|---|\n`;
      p.movements.forEach((m) => (md += `| ${m.type} (${E.COSMIC_TYPES[m.type].name}) | ${m.desc.replace(/\|/g, "\\|") || "—"} |\n`));
      md += "\n";
    });
    md += `## Resumen por tipo\n\n| E | R | W | X | Total |\n|---|---|---|---|---|\n| ${sLast.byType.E} | ${sLast.byType.R} | ${sLast.byType.W} | ${sLast.byType.X} | ${sLast.total} |\n`;
    download("cosmic.md", md);
  });

  /* ======================================================== PUNTOS DE FUNCIÓN */
  const fs = { counts: {}, gsc: new Array(14).fill(0) };
  Object.keys(E.FP_COMPONENTS).forEach((k) => (fs.counts[k] = [0, 0, 0]));
  const fEl = {
    table: $("#f-table"), gsc: $("#f-gsc"), tdi: $("#f-tdi"), kpis: $("#f-kpis"), formulas: $("#f-formulas"),
    hpf: $("#f-hpf"), lang: $("#f-lang"), kloc: $("#f-kloc"),
  };
  fillLanguages(fEl.lang, "JavaScript");

  (function buildFpTable() {
    let html = `<thead><tr><th>Componente</th><th class="num">Baja</th><th class="num">Media</th><th class="num">Alta</th><th class="num">Subtotal</th></tr></thead><tbody>`;
    Object.entries(E.FP_COMPONENTS).forEach(([k, c]) => {
      html += `<tr data-k="${k}"><td><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></td>` +
        [0, 1, 2].map((i) => `<td class="num"><input type="number" min="0" step="1" value="0" data-i="${i}" aria-label="${esc(c.name)} complejidad ${["baja", "media", "alta"][i]}"><small>× ${c.w[i]}</small></td>`).join("") +
        `<td class="num sub">0</td></tr>`;
    });
    html += `</tbody><tfoot><tr><td>UFP total</td><td></td><td></td><td></td><td class="num" id="f-ufp">0</td></tr></tfoot>`;
    fEl.table.innerHTML = html;
    fEl.table.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.closest("tr").dataset.k;
      fs.counts[k][+inp.dataset.i] = int0(inp);
      fpUpdate();
    }));
  })();

  (function buildGsc() {
    fEl.gsc.innerHTML = E.GSC.map((name, i) =>
      `<label><span>${i + 1}. ${esc(name)}</span><select data-i="${i}">${[0, 1, 2, 3, 4, 5].map((v) => `<option>${v}</option>`).join("")}</select></label>`).join("");
    fEl.gsc.querySelectorAll("select").forEach((s) => s.addEventListener("change", () => { fs.gsc[+s.dataset.i] = +s.value; fpUpdate(); }));
  })();
  $("#f-gsc-mid").addEventListener("click", () => { fs.gsc = new Array(14).fill(3); syncFp(); fpUpdate(); });
  [fEl.hpf].forEach((i) => i.addEventListener("input", fpUpdate));
  fEl.lang.addEventListener("change", fpUpdate);

  function syncFp() {
    fEl.table.querySelectorAll("tr[data-k]").forEach((tr) => {
      tr.querySelectorAll("input").forEach((inp) => (inp.value = fs.counts[tr.dataset.k][+inp.dataset.i]));
    });
    fEl.gsc.querySelectorAll("select").forEach((s) => (s.value = fs.gsc[+s.dataset.i]));
  }

  let fLast = null;
  function fpUpdate() {
    const hpf = num(fEl.hpf);
    const r = E.functionPoints(fs.counts, fs.gsc, isFinite(hpf) && hpf >= 0 ? hpf : 0);
    fLast = r;
    fEl.table.querySelectorAll("tr[data-k]").forEach((tr, i) => (tr.querySelector(".sub").textContent = r.rows[i].subtotal));
    $("#f-ufp").textContent = r.ufp;
    fEl.tdi.textContent = r.tdi;
    fEl.kpis.innerHTML =
      kpi(r.ufp, "PF sin ajustar", "UFP") +
      kpi(fmt(r.vaf, 2), "Factor de ajuste", "VAF") +
      kpi(fmt(r.afp, 1), "PF ajustados", "PFA") +
      kpi(fmt(r.hours, 0), "Esfuerzo", "horas-persona") +
      kpi(fmt(r.personMonths, 2), "Equivalente", "persona-mes");
    fEl.formulas.innerHTML =
      `<div><b>UFP</b> = Σ (cantidad × peso) = <b>${r.ufp}</b></div>` +
      `<div><b>VAF</b> = 0.65 + 0.01 × TDI = 0.65 + 0.01 × ${r.tdi} = <b>${fmt(r.vaf, 2)}</b></div>` +
      `<div><b>PFA</b> = UFP × VAF = ${r.ufp} × ${fmt(r.vaf, 2)} = <b>${fmt(r.afp, 2)} PF</b></div>`;
    try {
      fEl.kloc.textContent = r.afp > 0 ? `≈ ${fmt(E.fpToKloc(r.afp, fEl.lang.value), 2)} KLOC en ${fEl.lang.value}` : "";
    } catch (e) { fEl.kloc.textContent = ""; }
    renderCompareIfVisible();
  }
  $("#f-to-cocomo").addEventListener("click", () => {
    if (!fLast || !(fLast.afp > 0)) return;
    cEl.fp.value = String(Math.round(fLast.afp * 100) / 100);
    cEl.lang.value = fEl.lang.value;
    const k = updateFpToKloc();
    if (isFinite(k)) cEl.kloc.value = String(Math.round(k * 100) / 100);
    cocomoUpdate();
    showTab("cocomo");
  });

  function loadFp(counts, gsc) {
    Object.keys(fs.counts).forEach((k) => (fs.counts[k] = (counts[k] || [0, 0, 0]).slice()));
    fs.gsc = gsc.slice();
    syncFp(); fpUpdate();
  }
  const CLASS_FP = { EI: [0, 3, 0], EO: [0, 2, 0], EQ: [0, 1, 0], ILF: [0, 2, 0], EIF: [0, 1, 0] };
  const CLASS_GSC = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1]; // TDI = 35 → VAF 1.00
  const EX3_FP = { EI: [0, 4, 0], EO: [0, 3, 0], EQ: [0, 2, 0], ILF: [0, 3, 0], EIF: [0, 1, 0] };
  $("#f-load-class").addEventListener("click", () => loadFp(CLASS_FP, CLASS_GSC));
  $("#f-load-ex3").addEventListener("click", () => loadFp(EX3_FP, new Array(14).fill(3)));

  $("#f-export").addEventListener("click", () => {
    if (!fLast) return;
    const r = fLast;
    let md = `# Estimación por Puntos de Función (IFPUG)\n\n| Componente | Baja | Media | Alta | Subtotal |\n|---|---|---|---|---|\n`;
    r.rows.forEach((row) => (md += `| ${E.FP_COMPONENTS[row.key].name} | ${row.counts.map((c, i) => `${c}×${row.weights[i]}`).join(" | ")} | ${row.subtotal} |\n`));
    md += `\n- **UFP:** ${r.ufp}\n- **TDI:** ${r.tdi} → **VAF:** ${fmt(r.vaf, 2)}\n- **PFA:** ${fmt(r.afp, 2)} PF\n`;
    md += `- **Esfuerzo:** ${fmt(r.hours, 1)} h-persona a ${r.hoursPerFp} h/PF (${fmt(r.personMonths, 2)} persona-mes)\n`;
    md += `\n## Características generales (0–5)\n\n${E.GSC.map((n, i) => `- ${n}: ${fs.gsc[i]}`).join("\n")}\n`;
    download("puntos-de-funcion.md", md);
  });

  /* ============================================================== COMPARAR */
  function renderCompareIfVisible() {
    if (!$("#tab-compare").hidden) renderCompare();
  }
  function renderCompare() {
    const rows = [];
    rows.push({ name: "COCOMO", pm: cLast ? cLast.effort : null, basis: cLast ? `${fmt(cLast.kloc, 1)} KLOC (${cs.level === "basic" ? "básico" : "intermedio"})` : "Sin datos válidos", color: "var(--primary)" });
    rows.push({ name: "COSMIC", pm: sLast && sLast.total ? sLast.personMonths : null, basis: sLast && sLast.total ? `${sLast.total} CFP × ${sLast.hoursPerCfp} h` : "Sin procesos", color: "var(--c-e)" });
    rows.push({ name: "Puntos de Función", pm: fLast && fLast.afp ? fLast.personMonths : null, basis: fLast && fLast.afp ? `${fmt(fLast.afp, 1)} PF × ${fLast.hoursPerFp} h` : "Sin componentes", color: "var(--c-r)" });
    const max = Math.max(0.0001, ...rows.map((r) => r.pm || 0));
    $("#m-bars").innerHTML = rows.map((r) =>
      `<div class="bar" style="--tc:${r.color}"><span>${r.name}</span><div class="track"><div class="fill" style="width:${r.pm ? (r.pm / max) * 100 : 0}%"></div></div><span class="n">${r.pm === null ? "—" : fmt(r.pm, 1) + " PM"}</span></div>`).join("");
    $("#m-table").innerHTML = `<thead><tr><th>Método</th><th>Base de la estimación</th><th>Persona-mes</th><th>Horas-persona</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${r.name}</td><td>${esc(r.basis)}</td><td>${r.pm === null ? "—" : fmt(r.pm, 2)}</td><td>${r.pm === null ? "—" : fmt(r.pm * E.HOURS_PER_PM, 0)}</td></tr>`).join("") + `</tbody>`;
  }

  /* ============================================================== EJERCICIOS */
  function classChecks() {
    const c30 = E.cocomoBasic(30, "organic");
    const ex1 = E.cocomoBasic(50, "semidetached");
    const login = E.cosmic([LOGIN()].map((p) => ({ name: p.name, movements: p.movements })), 8);
    const grade = E.cosmic([GRADE()].map((p) => ({ name: p.name, movements: p.movements })), 8);
    const fpc = E.functionPoints(CLASS_FP, CLASS_GSC);
    const ex3 = E.functionPoints(EX3_FP);
    const A = "Diapositiva";
    return [
      {
        title: "Ejemplo COCOMO — proyecto orgánico de 30 KLOC",
        text: "Modo orgánico (a = 2.4, b = 1.05, c = 2.5, d = 0.38), tamaño 30 KLOC.",
        checks: [
          { label: "Esfuerzo E (PM)", exp: 85.4, got: c30.effort, tol: 0.1, d: 1 },
          { label: "Tiempo D (meses)", exp: 13.6, got: c30.time, tol: 0.1, d: 1 },
          { label: "Personal P", exp: 6, got: c30.staff, tol: 0.5, d: 1 },
        ],
        note: `${A} redondea a mitad del cálculo (usa E = 85.4); sin redondeos intermedios E = ${fmt(c30.effort, 2)} y D = ${fmt(c30.time, 2)}. Coincide dentro de la tolerancia.`,
        open: () => { loadCocomo({ name: "Ejemplo de clase — orgánico 30 KLOC", mode: "organic", level: "basic", kloc: 30, pm: 25000, currency: "MXN", ratings: {} }); showTab("cocomo"); },
      },
      {
        title: "Ejemplo COSMIC — proceso “Iniciar sesión”",
        text: "Entrada (credenciales), Lectura (base de datos), Escritura (log de acceso) y Salida (resultado). Tasa: 8 h-persona por CFP.",
        checks: [
          { label: "Tamaño (CFP)", exp: 4, got: login.total, tol: 0, d: 0 },
          { label: "Esfuerzo (h-persona)", exp: 32, got: login.hours, tol: 0, d: 0 },
        ],
        open: () => { ss.processes = [LOGIN()]; renderProcesses(); showTab("cosmic"); },
      },
      {
        title: "Ejemplo Puntos de Función — sistema de complejidad media",
        text: "3 EI, 2 EO, 1 EQ, 2 ILF y 1 EIF (todos medios) con TDI = 35.",
        checks: [
          { label: "UFP", exp: 53, got: fpc.ufp, tol: 0, d: 0 },
          { label: "VAF", exp: 1.0, got: fpc.vaf, tol: 0.001, d: 2 },
          { label: "PFA (PF)", exp: 53, got: fpc.afp, tol: 0.001, d: 0 },
        ],
        open: () => { loadFp(CLASS_FP, CLASS_GSC); showTab("fp"); },
      },
      {
        title: "Ejercicio 1 — COCOMO básico, semi-acoplado de 50 KLOC",
        text: "Calcula esfuerzo (E), tiempo de desarrollo (D) y número de personas (P). Constantes: a = 3.0, b = 1.12, c = 2.5, d = 0.35.",
        checks: [
          { label: "Esfuerzo E = 3.0 × 50^1.12 (PM)", got: ex1.effort, d: 1 },
          { label: "Tiempo D = 2.5 × E^0.35 (meses)", got: ex1.time, d: 1 },
          { label: "Personal P = E / D", got: ex1.staff, d: 1 },
        ],
        note: `Respuesta: ≈ ${fmt(ex1.effort, 1)} persona-mes, ≈ ${fmt(ex1.time, 1)} meses y ≈ ${Math.round(ex1.staff)} personas.`,
        open: () => { loadCocomo({ name: "Ejercicio 1 — semi-acoplado 50 KLOC", mode: "semidetached", level: "basic", kloc: 50, pm: 25000, currency: "MXN", ratings: {} }); showTab("cocomo"); },
      },
      {
        title: "Ejercicio 2 — COSMIC: “Registrar una nueva calificación”",
        text: "Movimientos: E (el profesor captura matrícula, materia y calificación), R (lee la inscripción para validar), W (guarda la calificación) y X (confirmación o mensaje de error — todos los mensajes de un proceso cuentan como una sola salida).",
        checks: [
          { label: "Tamaño (CFP)", got: grade.total, d: 0 },
          { label: "Esfuerzo a 8 h/CFP (h-persona)", got: grade.hours, d: 0 },
        ],
        open: () => { ss.processes = [GRADE()]; renderProcesses(); showTab("cosmic"); },
      },
      {
        title: "Ejercicio 3 — Puntos de Función no ajustados",
        text: "4 EI, 3 EO, 2 EQ, 3 ILF y 1 EIF, todos de complejidad media: 4×4 + 3×5 + 2×4 + 3×10 + 1×7.",
        checks: [{ label: "UFP", got: ex3.ufp, d: 0 }],
        open: () => { loadFp(EX3_FP, new Array(14).fill(3)); showTab("fp"); },
      },
      {
        title: "Ejercicio 4 — ¿Qué modelo fue más fácil de aplicar?",
        text: "Con la información de los ejercicios, COCOMO básico fue el más directo: solo necesita el tamaño (KLOC) y una tabla de constantes, y entrega esfuerzo, tiempo y personal de una vez. Su límite es que el KLOC casi nunca se conoce al inicio; hay que estimarlo (por ejemplo, convirtiendo desde PF). COSMIC y Puntos de Función exigen describir el sistema (procesos y movimientos, o componentes y complejidad), pero se pueden aplicar desde los requisitos y no dependen del lenguaje. COSMIC resultó más fácil de aplicar que PF cuando el sistema se describe por procesos, porque no hay que clasificar complejidad baja/media/alta ni calcular el VAF.",
        checks: [],
      },
    ];
  }

  function renderExercises() {
    const list = $("#x-list");
    list.innerHTML = "";
    classChecks().forEach((ex, i) => {
      const card = document.createElement("div");
      card.className = "card ex";
      const checks = ex.checks.map((c) => {
        const has = c.exp !== undefined;
        const ok = has && Math.abs(c.got - c.exp) <= c.tol;
        return `<div class="check"><span class="${has ? (ok ? "ok" : "bad") : ""}">${has ? (ok ? "✓" : "✗") : "•"}</span>
          <span>${esc(c.label)}</span>
          <span class="exp note">${has ? "clase: " + fmt(c.exp, c.d) : ""}</span>
          <code class="got">${fmt(c.got, c.d)}</code></div>`;
      }).join("");
      card.innerHTML = `<div class="ex-head"><span class="ex-num">${i + 1}</span><div><h3 style="margin:0 0 4px">${esc(ex.title)}</h3><p class="ex-body">${esc(ex.text)}</p></div></div>
        ${checks ? `<div class="checks">${checks}</div>` : ""}
        ${ex.note ? `<p class="note">${esc(ex.note)}</p>` : ""}
        ${ex.open ? `<div><button class="btn ghost small" type="button">Abrir en la calculadora →</button></div>` : ""}`;
      if (ex.open) card.querySelector("button").addEventListener("click", ex.open);
      list.appendChild(card);
    });
  }

  /* ============================================================== ARRANQUE */
  ss.processes = [LOGIN()];
  renderProcesses();
  syncFp(); fpUpdate();
  updateFpToKloc();
  cocomoUpdate();
  showTab((location.hash || "#cocomo").slice(1));
  window.addEventListener("hashchange", () => showTab((location.hash || "#cocomo").slice(1)));
})();

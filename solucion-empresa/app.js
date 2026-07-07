const fields = [
  "companyName",
  "location",
  "monthlyConsumption",
  "monthlyBill",
  "tariffEscalation",
  "dayConsumptionPercent",
  "nightDiscountRate",
  "terranovaNightMargin",
  "systemSize",
  "peakSunHours",
  "coverageObjective",
  "systemLosses",
  "selfConsumption",
  "degradation",
  "emissionsFactor",
  "capexUsd",
  "exchangeRate",
  "solarDeliveredRate",
  "opexPercent",
  "taxableIncome",
  "incomeGrowth",
  "incomeTaxRate",
  "maxDeductionPercent",
  "deductionYears",
  "carbonPriceUsd",
  "carbonCertificationCostUsd",
  "carbonYears",
  "includeCarbonRevenue",
  "analysisYears",
  "discountRate",
];

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const compactNumber = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const copPerKwh = (value) => `${cop.format(value)}/kWh`;
const compactCop = (value) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${compactNumber.format(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}$${compactNumber.format(abs / 1_000_000)}M`;
  return cop.format(value);
};

const getValue = (id) => {
  const input = document.getElementById(id);
  return input.type === "number" ? Number(input.value || 0) : input.value;
};

function npv(rate, cashflows) {
  return cashflows.reduce((total, cashflow, index) => {
    return total + cashflow / Math.pow(1 + rate, index);
  }, 0);
}

function irr(cashflows) {
  let low = -0.9;
  let high = 2.5;
  for (let i = 0; i < 90; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid, cashflows);
    if (value > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function calculate() {
  const data = Object.fromEntries(fields.map((field) => [field, getValue(field)]));
  const currentRate = data.monthlyConsumption > 0 ? data.monthlyBill / data.monthlyConsumption : 0;
  const annualConsumption = data.monthlyConsumption * 12;
  const nightConsumptionPercent = Math.max(100 - data.dayConsumptionPercent, 0);
  const monthlyNightConsumption = data.monthlyConsumption * (nightConsumptionPercent / 100);
  const annualNightConsumption = monthlyNightConsumption * 12;
  const monthlyNightSavings = monthlyNightConsumption * data.nightDiscountRate;
  const annualNightSavings = monthlyNightSavings * 12;
  const monthlyTerranovaNightMargin = monthlyNightConsumption * data.terranovaNightMargin;
  const annualTerranovaNightMargin = monthlyTerranovaNightMargin * 12;
  const monthlyMwh = data.monthlyConsumption / 1000;
  const netSolarFactor = Math.max(1 - data.systemLosses / 100, 0.01);
  const targetMonthlyKwh = data.monthlyConsumption * (data.coverageObjective / 100);
  const recommendedMwp = targetMonthlyKwh / (30 * data.peakSunHours * 1000 * netSolarFactor);
  const terranovaMinimumMwp = 1;
  const terranovaRequiredMwp = Math.max(recommendedMwp, terranovaMinimumMwp);
  const nonRegulatedMinimumMwh = 55;
  const qualifiesAsNonRegulated = monthlyMwh >= nonRegulatedMinimumMwh;
  const meetsTerranovaMinimum = data.systemSize >= terranovaMinimumMwp;
  const dailyProduction = data.systemSize * 1000 * data.peakSunHours;
  const yearOneProduction = dailyProduction * 365;
  const capexUsdTotal = data.capexUsd * data.systemSize;
  const capexCop = capexUsdTotal * data.exchangeRate;
  const opexYearOne = capexCop * (data.opexPercent / 100);
  const deductibleBase = capexCop * 0.5;
  const ivaReference = capexCop * 0.19;
  const depreciationReference = capexCop * 0.3333;
  const projectCashflows = [-capexCop];
  const rows = [];
  const taxRows = [];
  const fiscalYears = Math.min(data.deductionYears, data.analysisYears);
  let remainingDeduction = deductibleBase;
  let cumulative = -capexCop;
  let lifetimeEnergySavings = 0;
  let lifetimeFiscalBenefits = 0;
  let lifetimeProduction = 0;
  let payback = null;

  for (let year = 1; year <= data.analysisYears; year += 1) {
    const production = yearOneProduction * Math.pow(1 - data.degradation / 100, year - 1);
    const solarUsed = Math.min(production * (data.selfConsumption / 100), annualConsumption);
    const gridRate = currentRate * Math.pow(1 + data.tariffEscalation / 100, year - 1);
    const solarRate = data.solarDeliveredRate;
    const energySavings = Math.max(gridRate - solarRate, 0) * solarUsed;
    const solarServiceCost = solarRate * solarUsed;
    const opex = opexYearOne * Math.pow(1 + 0.04, year - 1);
    const taxableIncome = data.taxableIncome * Math.pow(1 + data.incomeGrowth / 100, year - 1);
    const maxDeduction = year <= fiscalYears ? taxableIncome * (data.maxDeductionPercent / 100) : 0;
    const usedDeduction = Math.min(remainingDeduction, maxDeduction);
    const fiscalBenefit = usedDeduction * (data.incomeTaxRate / 100);
    const nightSavings = annualNightSavings * Math.pow(1 + data.tariffEscalation / 100, year - 1);
    const carbonRevenue = data.includeCarbonRevenue === 1 && year <= data.carbonYears
      ? ((solarUsed * data.emissionsFactor) / 1000) * data.carbonPriceUsd * data.exchangeRate
      : 0;
    const netCashflow = energySavings + fiscalBenefit + nightSavings + carbonRevenue - opex;

    remainingDeduction = Math.max(remainingDeduction - usedDeduction, 0);
    cumulative += netCashflow;
    lifetimeEnergySavings += energySavings;
    lifetimeEnergySavings += nightSavings;
    lifetimeFiscalBenefits += fiscalBenefit;
    lifetimeProduction += production;
    projectCashflows.push(netCashflow);

    if (payback === null && cumulative >= 0) {
      const previousCumulative = cumulative - netCashflow;
      const fraction = netCashflow > 0 ? Math.abs(previousCumulative) / netCashflow : 0;
      payback = year - 1 + fraction;
    }

    rows.push({
      year,
      production,
      solarUsed,
      gridRate,
      energySavings,
      nightSavings,
      solarServiceCost,
      opex,
      fiscalBenefit,
      carbonRevenue,
      netCashflow,
      cumulative,
    });

    taxRows.push({
      year,
      taxableIncome,
      maxDeduction,
      usedDeduction,
      fiscalBenefit,
      remainingDeduction,
    });
  }

  const yearOne = rows[0];
  const solarUsedYearOne = yearOne?.solarUsed || 0;
  const coverage = annualConsumption > 0 ? solarUsedYearOne / annualConsumption : 0;
  const lcoe = lifetimeProduction > 0 ? (capexCop + opexYearOne * data.analysisYears) / lifetimeProduction : 0;
  const discountRate = data.discountRate / 100;
  const projectNpv = npv(discountRate, projectCashflows);
  const projectIrr = irr(projectCashflows);
  const co2Tons = (solarUsedYearOne * data.emissionsFactor) / 1000;
  const carbonGrossYearOneUsd = co2Tons * data.carbonPriceUsd;
  const carbonGrossPeriodUsd = carbonGrossYearOneUsd * data.carbonYears;
  const carbonNetPeriodUsd = Math.max(carbonGrossPeriodUsd - data.carbonCertificationCostUsd, 0);
  const carbonNetPeriodCop = carbonNetPeriodUsd * data.exchangeRate;

  return {
    data,
    currentRate,
    annualConsumption,
    nightConsumptionPercent,
    monthlyNightConsumption,
    annualNightConsumption,
    monthlyNightSavings,
    annualNightSavings,
    monthlyTerranovaNightMargin,
    annualTerranovaNightMargin,
    monthlyMwh,
    recommendedMwp,
    terranovaRequiredMwp,
    nonRegulatedMinimumMwh,
    qualifiesAsNonRegulated,
    meetsTerranovaMinimum,
    dailyProduction,
    yearOneProduction,
    capexUsdTotal,
    capexCop,
    opexYearOne,
    deductibleBase,
    ivaReference,
    depreciationReference,
    rows,
    taxRows,
    yearOne,
    coverage,
    lcoe,
    projectNpv,
    projectIrr,
    co2Tons,
    carbonGrossYearOneUsd,
    carbonGrossPeriodUsd,
    carbonNetPeriodUsd,
    carbonNetPeriodCop,
    solarUsedYearOne,
    lifetimeEnergySavings,
    lifetimeFiscalBenefits,
    lifetimeGrossSavings: lifetimeEnergySavings + lifetimeFiscalBenefits,
    payback,
  };
}

function renderBarChart(result) {
  const container = document.getElementById("barChart");
  const baseline = result.data.monthlyBill * 12;
  const withSolar = result.yearOne.solarServiceCost + result.yearOne.opex;
  const savings = result.yearOne.energySavings + result.yearOne.nightSavings + result.yearOne.fiscalBenefit - result.yearOne.opex;
  const maxValue = Math.max(baseline, withSolar, savings, 1);
  const bars = [
    ["Costo red actual", baseline, "grid-cost"],
    ["Costo solar", withSolar, "solar-cost"],
    ["Ahorro neto", savings, "savings"],
  ];

  container.innerHTML = bars.map(([label, value, className]) => {
    const width = Math.max((value / maxValue) * 100, 2);
    return `
      <div class="bar-row">
        <span>${label}</span>
        <div class="track"><div class="fill ${className}" style="width:${width}%"></div></div>
        <span class="bar-value">${compactCop(value)}</span>
      </div>
    `;
  }).join("");
}

function renderCashflow(result) {
  const svg = document.getElementById("cashflowChart");
  const width = 760;
  const height = 240;
  const pad = 28;
  const values = [-result.capexCop, ...result.rows.map((row) => row.cumulative)];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const zeroY = height - pad - ((0 - min) / range) * (height - pad * 2);
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = `${path} L ${points[points.length - 1][0]} ${zeroY} L ${points[0][0]} ${zeroY} Z`;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="#dce4df" stroke-width="2" />
    <path d="${area}" fill="rgba(31, 122, 79, 0.12)"></path>
    <path d="${path}" fill="none" stroke="#1f7a4f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${points.map(([x, y], index) => `
      <circle cx="${x}" cy="${y}" r="${index === points.length - 1 ? 5 : 3}" fill="${index === points.length - 1 ? "#f4c84a" : "#1f7a4f"}"></circle>
    `).join("")}
    <text x="${pad}" y="18" fill="#66736d" font-size="13">${compactCop(max)}</text>
    <text x="${pad}" y="${height - 8}" fill="#66736d" font-size="13">${compactCop(min)}</text>
  `;
}

function renderTable(result) {
  const rows = result.rows;
  document.getElementById("projectionRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${number.format(row.production)} kWh</td>
      <td>${compactCop(row.energySavings + row.nightSavings + row.fiscalBenefit + row.carbonRevenue)}</td>
      <td>${compactCop(row.solarServiceCost + row.opex)}</td>
      <td>${compactCop(row.netCashflow)}</td>
    </tr>
  `).join("");
}

function renderNightTable(result) {
  const rows = [
    [
      "Consumo fuera de horas solares",
      `${number.format(result.monthlyNightConsumption)} kWh`,
      `${number.format(result.annualNightConsumption)} kWh`,
      `${result.nightConsumptionPercent}% del consumo informado`,
    ],
    [
      "Ahorro cliente por descuento nocturno",
      compactCop(result.monthlyNightSavings),
      compactCop(result.annualNightSavings),
      `${cop.format(result.data.nightDiscountRate)} menos por kWh nocturno`,
    ],
  ];

  document.getElementById("nightRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
      <td>${row[2]}</td>
      <td>${row[3]}</td>
    </tr>
  `).join("");
}

function renderTaxTable(result) {
  const rows = result.taxRows.slice(0, result.data.deductionYears);
  document.getElementById("taxRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${compactCop(row.taxableIncome)}</td>
      <td>${compactCop(row.maxDeduction)}</td>
      <td>${compactCop(row.usedDeduction)}</td>
      <td>${compactCop(row.fiscalBenefit)}</td>
      <td>${compactCop(row.remainingDeduction)}</td>
    </tr>
  `).join("");
}

function renderCarbonTable(result) {
  const rows = [
    [
      "CO2 evitado",
      `${number.format(result.co2Tons)} tCO2`,
      `${number.format(result.co2Tons * result.data.carbonYears)} tCO2`,
      "Calculado con energia solar usada por cliente.",
    ],
    [
      "Ingreso bruto potencial",
      usd.format(result.carbonGrossYearOneUsd),
      usd.format(result.carbonGrossPeriodUsd),
      `${usd.format(result.data.carbonPriceUsd)} por tonelada de CO2.`,
    ],
    [
      "Ingreso neto potencial",
      "N/D",
      `${usd.format(result.carbonNetPeriodUsd)} / ${compactCop(result.carbonNetPeriodCop)}`,
      "Descuenta costo estimado de certificacion.",
    ],
  ];

  document.getElementById("carbonRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
      <td>${row[2]}</td>
      <td>${row[3]}</td>
    </tr>
  `).join("");
}

function updateDashboard() {
  const result = calculate();
  const paybackText = result.payback ? `${result.payback.toFixed(1)} anos` : "No recupera";

  document.getElementById("headline").textContent = result.data.companyName || "Proyecto solar";
  document.getElementById("subheadline").textContent = result.data.location || "Ubicacion pendiente";
  document.getElementById("currentMonthlyBill").textContent = compactCop(result.data.monthlyBill);
  document.getElementById("yearOneSavings").textContent = compactCop(
    result.yearOne.energySavings + result.yearOne.nightSavings + result.yearOne.fiscalBenefit + result.yearOne.carbonRevenue,
  );
  document.getElementById("payback").textContent = paybackText;
  document.getElementById("lifetimeSavings").textContent = compactCop(result.lifetimeGrossSavings);
  document.getElementById("coverageBadge").textContent = `${Math.round(result.coverage * 100)}% cubierto`;
  document.getElementById("equityBadge").textContent = `Inversion: ${compactCop(result.capexCop)} COP`;
  document.getElementById("currentRate").textContent = copPerKwh(result.currentRate);
  document.getElementById("solarLcoe").textContent = copPerKwh(result.data.solarDeliveredRate);
  document.getElementById("projectNpv").textContent = compactCop(result.projectNpv);
  document.getElementById("projectIrr").textContent = Number.isFinite(result.projectIrr)
    ? `${(result.projectIrr * 100).toFixed(1)}%`
    : "N/D";
  document.getElementById("productionMetric").textContent = `${number.format(result.yearOneProduction)} kWh`;
  document.getElementById("dailyProductionMetric").textContent = `${number.format(result.dailyProduction)} kWh/dia`;
  document.getElementById("monthlyMwhMetric").textContent = `${number.format(result.monthlyMwh)} MWh`;
  document.getElementById("nonRegulatedMetric").textContent = result.qualifiesAsNonRegulated
    ? `Cumple >= ${result.nonRegulatedMinimumMwh} MWh/mes`
    : `No cumple < ${result.nonRegulatedMinimumMwh} MWh/mes`;
  document.getElementById("recommendedMwpMetric").textContent = `${result.recommendedMwp.toFixed(2)} MWp`;
  document.getElementById("terranovaMinimumMetric").textContent = result.meetsTerranovaMinimum
    ? "Cumple >= 1 MWp"
    : `Subir a ${result.terranovaRequiredMwp.toFixed(2)} MWp`;
  document.getElementById("productionMwhMetric").textContent = `${number.format(result.yearOneProduction / 1000)} MWh`;
  document.getElementById("usedSolarMetric").textContent = `${number.format(result.solarUsedYearOne)} kWh`;
  document.getElementById("lossesMetric").textContent = `${result.data.systemLosses}%`;
  document.getElementById("co2Metric").textContent = `${number.format(result.co2Tons)} t`;
  document.getElementById("capexCopMetric").textContent = `${compactCop(result.capexCop)} COP`;
  document.getElementById("installedCostMetric").textContent = `${usd.format(result.data.capexUsd / 1000)}/kWp`;
  document.getElementById("nightBadge").textContent = `${result.nightConsumptionPercent}% nocturno`;
  document.getElementById("carbonBadge").textContent = result.data.includeCarbonRevenue === 1
    ? "Incluido en retorno"
    : "No incluido en retorno";

  const spread = result.currentRate - result.data.solarDeliveredRate;
  const isAttractive = result.projectNpv > 0 && result.payback && result.payback <= 8 && spread > 0 && result.qualifiesAsNonRegulated && result.meetsTerranovaMinimum;
  document.getElementById("decisionTitle").textContent = isAttractive
    ? "La tarifa solar mejora el costo real pagado por la empresa."
    : "La propuesta necesita revisar elegibilidad, tarifa, produccion o inversion.";
  document.getElementById("decisionCopy").textContent = isAttractive
    ? `La factura muestra una tarifa real de ${copPerKwh(result.currentRate)} frente a una energia solar entregada de ${copPerKwh(result.data.solarDeliveredRate)}. Ademas, el consumo nocturno puede recibir un descuento comercializado por Terranova.`
    : "Antes de presentar, valida que el consumo alcance el umbral de cliente no regulado, que el proyecto sea minimo 1 MWp y que la tarifa real supere suficientemente el costo solar entregado.";

  renderBarChart(result);
  renderCashflow(result);
  renderNightTable(result);
  renderTaxTable(result);
  renderCarbonTable(result);
  renderTable(result);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".form-section").forEach((section) => section.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`[data-section="${tab.dataset.target}"]`).classList.add("active");
    });
  });

  const form = document.getElementById("project-form");
  ["input", "change", "keyup"].forEach((eventName) => {
    form.addEventListener(eventName, updateDashboard);
  });

  document.getElementById("printButton").addEventListener("click", () => window.print());
}

bindEvents();
updateDashboard();

(function initializeAdminAnalyticsDashboard() {
  const RANGE_OPTIONS = [
    { value: "7d", label: "7 天" },
    { value: "30d", label: "30 天" },
    { value: "90d", label: "90 天" }
  ];

  const state = {
    mounted: false,
    panel: null,
    request: null,
    escapeHtml: null,
    formatCurrency: null,
    onInventoryOpen: null,
    range: "30d",
    analytics: null,
    operations: null,
    requestId: 0,
    controller: null
  };

  function formatNumber(value, digits = 0) {
    return Number(value || 0).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatAnalyticsCurrency(value) {
    const numericValue = Number(value) || 0;
    const rawValue = String(numericValue);
    const formattedValue = formatNumber(numericValue, Number.isInteger(numericValue) ? 0 : 2);
    const currencyValue = String(state.formatCurrency(numericValue));
    return currencyValue.includes(rawValue)
      ? currencyValue.replace(rawValue, formattedValue)
      : currencyValue;
  }

  function formatComparison(value, unit = "%") {
    if (value === null || value === undefined) {
      return '<span class="analytics-comparison">上期无数据</span>';
    }
    const numericValue = Number(value) || 0;
    const direction = numericValue > 0 ? "上升" : numericValue < 0 ? "下降" : "持平";
    return `<span class="analytics-comparison" data-direction="${numericValue > 0 ? "up" : numericValue < 0 ? "down" : "flat"}">较上期${direction} ${formatNumber(Math.abs(numericValue), 1)}${unit}</span>`;
  }

  function createKpiMarkup(summary) {
    const cards = [
      {
        key: "net-sales",
        label: "净销售额",
        value: formatAnalyticsCurrency(summary.netSales),
        comparison: formatComparison(summary.netSalesComparison)
      },
      {
        key: "conversion",
        label: "转化率",
        value: `${formatNumber(summary.conversionRate, 1)}%`,
        ratio: `${formatNumber(summary.paidOrderCount)} / ${formatNumber(summary.uniqueVisitors)}`,
        comparison: formatComparison(summary.conversionRateDelta, " 个百分点")
      },
      {
        key: "refund-rate",
        label: "退款率",
        value: `${formatNumber(summary.refundRate, 1)}%`,
        ratio: `${formatNumber(summary.refundedOrderCount)} / ${formatNumber(summary.paidOrderCount)}`,
        comparison: formatComparison(summary.refundRateDelta, " 个百分点")
      },
      {
        key: "low-stock",
        label: "低库存 SKU",
        value: formatNumber(summary.lowStockSkuCount),
        comparison: '<span class="analytics-comparison">当前库存快照</span>'
      },
      {
        key: "out-of-stock",
        label: "缺货 SKU",
        value: formatNumber(summary.outOfStockSkuCount),
        comparison: '<span class="analytics-comparison">当前库存快照</span>'
      }
    ];

    return `<section class="analytics-kpis" aria-label="经营指标">${cards.map((card) => `
      <article class="analytics-kpi" data-admin-kpi data-analytics-kpi="${card.key}">
        <span class="analytics-kpi__label">${card.label}</span>
        <strong>${state.escapeHtml(card.value)}</strong>
        ${card.ratio ? `<small data-analytics-ratio="${card.key}">${state.escapeHtml(card.ratio)}</small>` : ""}
        ${card.comparison}
      </article>
    `).join("")}</section>`;
  }

  function createSalesChartMarkup(trend) {
    const rows = Array.isArray(trend) ? trend : [];
    const width = 640;
    const height = 250;
    const values = rows.map((row) => Number(row.netSales) || 0);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const span = Math.max(1, maximum - minimum);
    const points = rows.map((row, index) => ({
      x: rows.length === 1 ? width / 2 : 42 + index * (width - 84) / Math.max(1, rows.length - 1),
      y: 24 + (maximum - (Number(row.netSales) || 0)) * (height - 70) / span,
      row
    }));
    const summary = rows.length
      ? `本期 ${rows.length} 个时间桶，净销售额 ${formatAnalyticsCurrency(values.reduce((sum, value) => sum + value, 0))}`
      : "当前周期暂无成交";

    return `<section class="analytics-panel analytics-panel--chart" data-analytics-sales-chart aria-label="净销售额趋势：${state.escapeHtml(summary)}">
      <div class="analytics-panel__heading"><div><span>销售趋势</span><h3>净销售额</h3></div><strong>${formatAnalyticsCurrency(values.reduce((sum, value) => sum + value, 0))}</strong></div>
      <span class="visually-hidden" data-analytics-chart-summary>${state.escapeHtml(summary)}</span>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
        <line class="analytics-chart__axis" x1="42" y1="204" x2="598" y2="204"></line>
        ${rows.length ? `<polyline class="analytics-chart__line" points="${points.map(({ x, y }) => `${x},${y}`).join(" ")}"></polyline>
          ${points.map(({ x, y, row }) => `<circle class="analytics-chart__point" cx="${x}" cy="${y}" r="4" tabindex="0" aria-label="${state.escapeHtml(row.label)}，净销售额 ${formatAnalyticsCurrency(row.netSales)}，${formatNumber(row.paidOrderCount)} 个支付订单"></circle>`).join("")}`
          : '<text class="analytics-chart__empty" x="320" y="126" text-anchor="middle">当前周期暂无成交</text>'}
      </svg>
    </section>`;
  }

  function createFunnelMarkup(funnel) {
    const stages = [
      ["独立访客", Number(funnel.uniqueVisitors) || 0],
      ["加购会话", Number(funnel.cartAddSessions) || 0],
      ["发起结算", Number(funnel.checkoutSessions) || 0],
      ["支付订单", Number(funnel.paidOrderCount) || 0]
    ];
    const maximum = Math.max(1, ...stages.map(([, value]) => value));
    const summary = stages.map(([label, value]) => `${label} ${value}`).join("，");
    return `<section class="analytics-panel" data-analytics-funnel aria-label="转化漏斗">
      <div class="analytics-panel__heading"><div><span>转化路径</span><h3>访问到支付</h3></div></div>
      <span class="visually-hidden" data-analytics-funnel-summary>${summary}</span>
      <div class="analytics-funnel">${stages.map(([label, value]) => `
        <div class="analytics-funnel__row">
          <div><span>${label}</span><strong>${formatNumber(value)}</strong></div>
          <span class="analytics-funnel__track"><i style="--funnel-scale:${Math.max(4, value * 100 / maximum)}%"></i></span>
        </div>
      `).join("")}</div>
    </section>`;
  }

  function createTopProductsMarkup(products) {
    const rows = Array.isArray(products) ? products : [];
    return `<section class="analytics-panel" data-analytics-top-products>
      <div class="analytics-panel__heading"><div><span>商品表现</span><h3>热销商品</h3></div><small>按支付成功件数</small></div>
      <div class="analytics-table">${rows.length ? rows.map((product, index) => `
        <article class="analytics-table__row" data-analytics-product-row>
          <span class="analytics-table__rank">${String(index + 1).padStart(2, "0")}</span>
          <img src="${state.escapeHtml(product.image || "")}" alt="" width="48" height="48" loading="lazy">
          <div><strong>${state.escapeHtml(product.title)}</strong><small>${state.escapeHtml(product.productId)}</small></div>
          <span><small>售出</small>${formatNumber(product.unitsSold)} 件</span>
          <span><small>销售额</small>${formatAnalyticsCurrency(product.sales)}</span>
          <span><small>退款</small>${formatNumber(product.refundedUnits)} 件</span>
        </article>
      `).join("") : '<p class="analytics-empty">当前周期暂无热销商品。</p>'}</div>
    </section>`;
  }

  function getSeverityLabel(severity) {
    if (severity === "out_of_stock") return "缺货";
    if (severity === "critical") return "紧急";
    return "低库存";
  }

  function createInventoryMarkup(alerts) {
    const rows = Array.isArray(alerts) ? alerts : [];
    return `<section class="analytics-panel" data-analytics-inventory>
      <div class="analytics-panel__heading"><div><span>库存健康</span><h3>SKU 库存预警</h3></div><small>${formatNumber(rows.length)} 个待处理</small></div>
      <div class="analytics-table">${rows.length ? rows.map((item) => `
        <article class="analytics-table__row analytics-table__row--inventory" data-analytics-inventory-card>
          <div><strong>${state.escapeHtml(item.title)} / ${state.escapeHtml(item.size)}</strong><small>${state.escapeHtml(item.skuId)}</small></div>
          <span><small>剩余 / 阈值</small>${formatNumber(item.stockQuantity)} / ${formatNumber(item.lowStockThreshold)}</span>
          <span class="inventory-severity inventory-severity--${item.severity}">${getSeverityLabel(item.severity)}</span>
          <button type="button" data-analytics-inventory-link data-sku-id="${state.escapeHtml(item.skuId)}">管理库存</button>
        </article>
      `).join("") : '<p class="analytics-empty">当前没有库存预警。</p>'}</div>
    </section>`;
  }

  function createOperationsMarkup(operations) {
    const queue = Array.isArray(operations?.workQueue) ? operations.workQueue : [];
    const orders = Array.isArray(operations?.recentOrders) ? operations.recentOrders : [];
    return `<section class="analytics-operations" aria-label="待处理工作与最近订单">
      <div class="analytics-panel"><div class="analytics-panel__heading"><div><span>运营队列</span><h3>待处理工作</h3></div></div>
        <div class="analytics-table">${queue.map((item) => `<article class="analytics-table__row analytics-table__row--compact" data-admin-work-queue><span>${state.escapeHtml(item.label)}</span><strong>${formatNumber(item.count)}</strong></article>`).join("") || '<p class="analytics-empty">暂无待处理工作。</p>'}</div>
      </div>
      <div class="analytics-panel"><div class="analytics-panel__heading"><div><span>交易动态</span><h3>最近订单</h3></div></div>
        <div class="analytics-table">${orders.map((order) => `<article class="analytics-table__row analytics-table__row--compact" data-admin-recent-order><span>${state.escapeHtml(order.id)}</span><span>${state.escapeHtml(order.status)}</span><strong>${formatAnalyticsCurrency(order.total)}</strong></article>`).join("") || '<p class="analytics-empty">暂无最近订单。</p>'}</div>
      </div>
    </section>`;
  }

  function createRangeMarkup({ loading = false } = {}) {
    return `<div class="analytics-ranges" aria-label="数据时间范围">${RANGE_OPTIONS.map((option) => `
      <button type="button" data-analytics-range="${option.value}" aria-pressed="${state.range === option.value}"${loading && state.range === option.value ? " disabled" : ""}>${option.label}</button>
    `).join("")}</div>`;
  }

  function createDataNotice(analytics) {
    const summary = analytics.summary || {};
    const hasVisitors = Number(summary.uniqueVisitors) > 0;
    const hasCommerce = Number(summary.netSales) > 0 || Number(summary.paidOrderCount) > 0;
    if (!hasVisitors && !hasCommerce) {
      return '<aside class="analytics-notice analytics-notice--empty" data-analytics-empty role="status"><strong>当前周期暂无成交/访问</strong><span>指标保持为零，产生访问或支付后会自动更新。</span></aside>';
    }
    if (!hasVisitors && hasCommerce) {
      return '<aside class="analytics-notice analytics-notice--partial" data-analytics-partial role="status"><strong>访问采集尚无数据</strong><span>成交与订单来自交易事实，转化率将在访问数据到达后计算。</span></aside>';
    }
    return "";
  }

  function createDashboardMarkup(analytics, operations) {
    return `<div class="analytics-dashboard">
      <header class="analytics-dashboard__header">
        <div><p>经营总览</p><h2 data-analytics-period-label>近 ${state.escapeHtml(analytics.period.range.replace("d", ""))} 天</h2><span>数据更新于 ${new Date().toLocaleString("zh-CN", { hour12: false })}</span></div>
        ${createRangeMarkup()}
      </header>
      ${createDataNotice(analytics)}
      ${createKpiMarkup(analytics.summary)}
      <div class="analytics-chart-grid">${createSalesChartMarkup(analytics.trend)}${createFunnelMarkup(analytics.funnel)}</div>
      <div class="analytics-table-grid">${createTopProductsMarkup(analytics.topProducts)}${createInventoryMarkup(analytics.inventoryAlerts)}</div>
      ${createOperationsMarkup(operations)}
    </div>`;
  }

  function createLoadingMarkup() {
    return `<div class="analytics-dashboard" data-analytics-loading aria-busy="true"><header class="analytics-dashboard__header"><div><p>经营总览</p><h2>正在载入经营数据</h2></div>${createRangeMarkup({ loading: true })}</header><div class="analytics-skeleton" aria-label="正在加载经营数据"></div></div>`;
  }

  function createErrorMarkup() {
    return `<div class="analytics-error" data-analytics-error role="alert">
      ${createRangeMarkup()}
      <div><strong>经营数据加载失败</strong><p>请检查网络连接后重试，已选择的时间范围不会改变。</p></div>
      <button type="button" data-analytics-retry>重新加载</button>
    </div>`;
  }

  function showRetainedLoadingState() {
    const dashboard = state.panel.querySelector(".analytics-dashboard");
    if (!dashboard || !state.analytics) {
      state.panel.innerHTML = createLoadingMarkup();
      return;
    }
    dashboard.setAttribute("data-analytics-loading", "");
    dashboard.setAttribute("aria-busy", "true");
    dashboard.querySelectorAll("[data-analytics-range]").forEach((button) => {
      const selected = button.dataset.analyticsRange === state.range;
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = selected;
    });
  }

  function handlePanelClick(event) {
    const retryButton = event.target.closest("[data-analytics-retry]");
    if (retryButton) {
      render();
      return;
    }
    const rangeButton = event.target.closest("[data-analytics-range]");
    if (rangeButton && rangeButton.dataset.analyticsRange !== state.range) {
      state.range = rangeButton.dataset.analyticsRange;
      render();
      return;
    }
    const inventoryButton = event.target.closest("[data-analytics-inventory-link]");
    if (inventoryButton) state.onInventoryOpen(inventoryButton.dataset.skuId);
  }

  async function render() {
    if (!state.mounted) return;
    const requestId = ++state.requestId;
    state.controller?.abort();
    state.controller = new AbortController();
    showRetainedLoadingState();
    try {
      const [analytics, operations] = await Promise.all([
        state.request(`/api/admin/analytics?range=${state.range}`, { signal: state.controller.signal }),
        state.request("/api/admin/summary", { signal: state.controller.signal })
      ]);
      if (!state.mounted || requestId !== state.requestId) return;
      state.analytics = analytics;
      state.operations = operations;
      state.panel.innerHTML = createDashboardMarkup(analytics, operations);
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== state.requestId) return;
      state.panel.innerHTML = createErrorMarkup();
    }
  }

  function mount({ panel, request, escapeHtml, formatCurrency, onInventoryOpen }) {
    state.panel?.removeEventListener("click", handlePanelClick);
    Object.assign(state, {
      mounted: true,
      panel,
      request,
      escapeHtml,
      formatCurrency,
      onInventoryOpen
    });
    state.panel.addEventListener("click", handlePanelClick);
    return render();
  }

  function destroy() {
    state.controller?.abort();
    state.panel?.removeEventListener("click", handlePanelClick);
    Object.assign(state, {
      mounted: false,
      panel: null,
      analytics: null,
      operations: null,
      controller: null
    });
  }

  window.StorefrontAdminAnalytics = { mount, render, destroy };
})();

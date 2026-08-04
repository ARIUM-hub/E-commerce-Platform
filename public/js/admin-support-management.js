(function createAdminSupportManagement(global) {
  "use strict";

  const state = {
    mounted: false,
    panel: null,
    drawer: null,
    drawerBody: null,
    drawerTitle: null,
    drawerClose: null,
    backdrop: null,
    request: null,
    createOperationId: null,
    escapeHtml: null,
    adminUserId: null,
    filters: { q: "", status: "", priority: "", topic: "" },
    payload: { tickets: [], summary: {} },
    activeTicket: null,
    trigger: null
  };

  function escapeHtml(value) {
    return state.escapeHtml(value);
  }

  function operationId(prefix) {
    return state.createOperationId(prefix);
  }

  const statusLabels = {
    open: "待处理",
    in_progress: "处理中",
    waiting_customer: "等待客户",
    resolved: "已解决",
    closed: "已关闭"
  };
  const priorityLabels = { low: "低", normal: "普通", high: "高", urgent: "紧急" };

  function queryPath() {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return `/api/admin/support/tickets${query ? `?${query}` : ""}`;
  }

  function summaryMarkup(summary) {
    const cards = [
      ["待处理", summary.open || 0],
      ["处理中", summary.inProgress || 0],
      ["等待客户", summary.waitingCustomer || 0],
      ["紧急", summary.urgent || 0],
      ["未分配", summary.unassigned || 0]
    ];
    return `<div class="admin-grid">${cards.map(([label, value]) => `
      <article class="admin-card" data-admin-support-kpi>
        <strong>${escapeHtml(value)}</strong><span>${label}</span>
      </article>
    `).join("")}</div>`;
  }

  function filtersMarkup() {
    return `
      <form class="admin-review-filters admin-support-filters" data-admin-support-filters>
        <label><span>搜索工单</span><input name="q" value="${escapeHtml(state.filters.q)}" placeholder="编号、客户、联系方式或内容"></label>
        <label><span>状态</span><select name="status">
          <option value="">全部状态</option>
          ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}"${state.filters.status === value ? " selected" : ""}>${label}</option>`).join("")}
        </select></label>
        <label><span>优先级</span><select name="priority">
          <option value="">全部优先级</option>
          ${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}"${state.filters.priority === value ? " selected" : ""}>${label}</option>`).join("")}
        </select></label>
        <label><span>主题</span><select name="topic">
          <option value="">全部主题</option>
          ${["orders", "returns", "delivery", "account", "product", "other"].map((value) => `<option value="${value}"${state.filters.topic === value ? " selected" : ""}>${value}</option>`).join("")}
        </select></label>
        <div class="admin-review-filters__actions">
          <button class="order-button order-button--primary" type="submit">应用筛选</button>
          <button class="order-button order-button--secondary" type="button" data-admin-support-reset>重置</button>
        </div>
      </form>
    `;
  }

  function rowsMarkup(tickets) {
    if (!tickets.length) return '<div class="empty-state" data-admin-support-empty>暂无符合条件的客服工单。</div>';
    return tickets.map((ticket) => `
      <article class="admin-row admin-support-row" data-admin-ticket-row data-ticket-id="${escapeHtml(ticket.id)}">
        <div class="admin-review-row__identity">
          <strong>${escapeHtml(ticket.ticketNumber)}</strong>
          <span>${escapeHtml(ticket.name)} · ${escapeHtml(ticket.contact)}</span>
        </div>
        <span>${escapeHtml(ticket.topic)}</span>
        <span class="admin-review-status" data-status="${escapeHtml(ticket.status)}">${escapeHtml(statusLabels[ticket.status] || ticket.status)}</span>
        <strong data-admin-ticket-priority-label>${escapeHtml(priorityLabels[ticket.priority] || ticket.priority)}</strong>
        <p class="admin-review-row__body">${escapeHtml(ticket.message)}</p>
        <span>${escapeHtml(String(ticket.lastMessageAt || ticket.createdAt || "").slice(0, 10))}</span>
        <button class="order-button order-button--secondary" type="button" data-admin-ticket-open>处理</button>
      </article>
    `).join("");
  }

  function renderWorkspace() {
    const tickets = state.payload.tickets || [];
    state.panel.innerHTML = `
      <section class="admin-review-workspace" data-admin-support-workspace>
        <header class="admin-review-workspace__header">
          <div><p class="hero__eyebrow">Customer support</p><h2>客服工单</h2></div>
          <span>${tickets.length} 条结果</span>
        </header>
        ${summaryMarkup(state.payload.summary || {})}
        ${filtersMarkup()}
        <p class="admin-review-error" data-admin-support-error role="alert"></p>
        <div class="admin-table">${rowsMarkup(tickets)}</div>
      </section>
    `;
  }

  function timelineMarkup(messages) {
    return messages.map((message) => `
      <article class="admin-support-message${message.visibility === "internal" ? " is-internal" : ""}" data-admin-support-message>
        <div><strong>${message.authorType === "customer" ? "客户" : "客服"}</strong><span>${escapeHtml(String(message.createdAt || "").replace("T", " ").slice(0, 16))}</span></div>
        ${message.visibility === "internal" ? "<em>客户不可见</em>" : ""}
        <p>${escapeHtml(message.body)}</p>
      </article>
    `).join("");
  }

  function statusOptions(ticket) {
    const allowed = {
      open: ["open", "in_progress", "closed"],
      in_progress: ["in_progress", "waiting_customer", "resolved", "closed"],
      waiting_customer: ["waiting_customer", "in_progress", "resolved", "closed"],
      resolved: ["resolved", "in_progress", "closed"],
      closed: ["closed"]
    }[ticket.status] || [ticket.status];
    return allowed.map((value) => `<option value="${value}"${ticket.status === value ? " selected" : ""}>${statusLabels[value]}</option>`).join("");
  }

  function renderDrawer() {
    const ticket = state.activeTicket;
    if (!ticket) {
      state.drawerBody.innerHTML = "<p>正在加载工单...</p>";
      return;
    }
    const closed = ticket.status === "closed";
    state.drawerTitle.textContent = `处理工单 ${ticket.ticketNumber}`;
    state.drawerBody.innerHTML = `
      <section class="admin-review-detail">
        <div class="admin-review-detail__meta">
          <span class="admin-review-status" data-status="${escapeHtml(ticket.status)}">${escapeHtml(statusLabels[ticket.status] || ticket.status)}</span>
          <strong>${escapeHtml(priorityLabels[ticket.priority] || ticket.priority)}</strong>
          <span>版本 ${escapeHtml(ticket.version)}</span>
        </div>
        <h3>${escapeHtml(ticket.name)} · ${escapeHtml(ticket.topic)}</h3>
        <p>${escapeHtml(ticket.contact)}${ticket.orderId ? ` · ${escapeHtml(ticket.orderId)}` : ""}</p>
      </section>
      <section class="admin-operation-section">
        <h3>工单设置</h3>
        <div class="admin-support-settings">
          <label>优先级<select data-admin-ticket-priority>
            ${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}"${ticket.priority === value ? " selected" : ""}>${label}</option>`).join("")}
          </select></label>
          <button class="order-button order-button--secondary" type="button" data-admin-ticket-update>更新优先级</button>
          <label>状态<select data-admin-ticket-status>${statusOptions(ticket)}</select></label>
          <button class="order-button order-button--secondary" type="button" data-admin-ticket-status-update${closed ? " disabled" : ""}>更新状态</button>
          <label>处理人<select data-admin-ticket-assignee>
            <option value="">未分配</option>
            ${state.adminUserId ? `<option value="${escapeHtml(state.adminUserId)}"${ticket.assignedAdminUserId === state.adminUserId ? " selected" : ""}>分配给我</option>` : ""}
          </select></label>
          <button class="order-button order-button--secondary" type="button" data-admin-ticket-assignee-update>更新处理人</button>
        </div>
        <p class="admin-operation-form__error" data-admin-ticket-error role="alert"></p>
      </section>
      <section class="admin-operation-section admin-support-timeline">
        <h3>沟通时间线</h3>
        ${timelineMarkup(ticket.messages || [])}
      </section>
      ${closed ? "<p>工单已关闭，不能继续添加消息。</p>" : `
        <section class="admin-operation-section admin-support-composer">
          <form class="admin-operation-form" data-admin-ticket-public-form>
            <label>公开回复<textarea rows="4" maxlength="2000" data-admin-ticket-public-message></textarea></label>
            <button class="order-button order-button--primary" type="submit" data-admin-ticket-public-submit>发送给客户</button>
          </form>
          <form class="admin-operation-form admin-support-internal-form" data-admin-ticket-internal-form>
            <strong>内部备注 · 客户不可见</strong>
            <label>备注内容<textarea rows="3" maxlength="2000" data-admin-ticket-internal-message></textarea></label>
            <button class="order-button order-button--secondary" type="submit" data-admin-ticket-internal-submit>保存内部备注</button>
          </form>
        </section>
      `}
    `;
  }

  function setDrawerOpen(open) {
    state.drawer.dataset.open = open ? "true" : "false";
    state.drawer.setAttribute("aria-hidden", open ? "false" : "true");
    state.backdrop.hidden = !open;
    document.body.classList.toggle("is-admin-drawer-open", open);
  }

  function closeDrawer() {
    if (state.drawer?.dataset.open !== "true") return;
    setDrawerOpen(false);
    const trigger = state.trigger;
    state.trigger = null;
    trigger?.focus();
  }

  async function refreshTicket(ticketId) {
    const payload = await state.request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}`);
    state.activeTicket = payload.ticket;
    renderDrawer();
  }

  async function openDrawer(ticketId, trigger) {
    state.trigger = trigger;
    state.activeTicket = null;
    renderDrawer();
    setDrawerOpen(true);
    await refreshTicket(ticketId);
    state.drawerTitle.focus();
  }

  async function updateTicket(action, values, button) {
    const errorNode = state.drawerBody.querySelector("[data-admin-ticket-error]");
    button.disabled = true;
    errorNode.textContent = "";
    try {
      await state.request(`/api/admin/support/tickets/${encodeURIComponent(state.activeTicket.id)}/actions/update`, {
        method: "POST",
        body: {
          operationId: operationId(`admin-support-${action}`),
          action,
          expectedVersion: state.activeTicket.version,
          ...values
        }
      });
      await refreshTicket(state.activeTicket.id);
      await render();
    } catch (error) {
      errorNode.textContent = error.code === "SUPPORT_VERSION_CONFLICT"
        ? "工单已被其他操作更新，正在刷新。"
        : error.message;
      if (error.code === "SUPPORT_VERSION_CONFLICT") await refreshTicket(state.activeTicket.id);
      button.disabled = false;
    }
  }

  async function addMessage(visibility, message, button) {
    const errorNode = state.drawerBody.querySelector("[data-admin-ticket-error]");
    button.disabled = true;
    try {
      await state.request(`/api/admin/support/tickets/${encodeURIComponent(state.activeTicket.id)}/actions/message`, {
        method: "POST",
        body: { operationId: operationId(`admin-support-${visibility}`), visibility, message }
      });
      await refreshTicket(state.activeTicket.id);
      await render();
    } catch (error) {
      errorNode.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handlePanelClick(event) {
    const reset = event.target.closest("[data-admin-support-reset]");
    if (reset) {
      state.filters = { q: "", status: "", priority: "", topic: "" };
      await render();
      return;
    }
    const open = event.target.closest("[data-admin-ticket-open]");
    if (open) await openDrawer(open.closest("[data-admin-ticket-row]").dataset.ticketId, open);
  }

  async function handlePanelSubmit(event) {
    const form = event.target.closest("[data-admin-support-filters]");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    state.filters = Object.fromEntries(["q", "status", "priority", "topic"].map((key) => [key, String(data.get(key) || "").trim()]));
    await render();
  }

  async function handleDrawerClick(event) {
    if (!state.activeTicket) return;
    const priority = event.target.closest("[data-admin-ticket-update]");
    if (priority) await updateTicket("priority", { priority: state.drawerBody.querySelector("[data-admin-ticket-priority]").value }, priority);
    const status = event.target.closest("[data-admin-ticket-status-update]");
    if (status) await updateTicket("status", { status: state.drawerBody.querySelector("[data-admin-ticket-status]").value }, status);
    const assignee = event.target.closest("[data-admin-ticket-assignee-update]");
    if (assignee) await updateTicket("assign", { assignedAdminUserId: state.drawerBody.querySelector("[data-admin-ticket-assignee]").value || null }, assignee);
  }

  async function handleDrawerSubmit(event) {
    const publicForm = event.target.closest("[data-admin-ticket-public-form]");
    const internalForm = event.target.closest("[data-admin-ticket-internal-form]");
    if (!publicForm && !internalForm) return;
    event.preventDefault();
    const visibility = publicForm ? "public" : "internal";
    const form = publicForm || internalForm;
    const message = form.querySelector(visibility === "public" ? "[data-admin-ticket-public-message]" : "[data-admin-ticket-internal-message]").value.trim();
    const button = form.querySelector("button[type='submit']");
    await addMessage(visibility, message, button);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") closeDrawer();
  }

  async function render() {
    if (!state.mounted) return;
    state.panel.innerHTML = "<p>正在加载客服工单...</p>";
    try {
      state.payload = await state.request(queryPath());
      renderWorkspace();
    } catch (error) {
      state.panel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function mount(options = {}) {
    if (state.mounted) {
      Object.assign(state, { adminUserId: options.adminUserId || state.adminUserId });
      return api;
    }
    Object.assign(state, options);
    state.panel.addEventListener("click", handlePanelClick);
    state.panel.addEventListener("submit", handlePanelSubmit);
    state.drawer.addEventListener("click", handleDrawerClick);
    state.drawer.addEventListener("submit", handleDrawerSubmit);
    state.drawerClose.addEventListener("click", closeDrawer);
    state.backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", handleKeydown);
    state.mounted = true;
    return api;
  }

  function destroy() {
    if (!state.mounted) return;
    closeDrawer();
    state.panel.removeEventListener("click", handlePanelClick);
    state.panel.removeEventListener("submit", handlePanelSubmit);
    state.drawer.removeEventListener("click", handleDrawerClick);
    state.drawer.removeEventListener("submit", handleDrawerSubmit);
    state.drawerClose.removeEventListener("click", closeDrawer);
    state.backdrop.removeEventListener("click", closeDrawer);
    document.removeEventListener("keydown", handleKeydown);
    state.mounted = false;
  }

  const api = { mount, render, destroy };
  global.StorefrontAdminSupport = api;
})(window);

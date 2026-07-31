(function createCustomerSupportTickets(global) {
  "use strict";

  const state = {
    mounted: false,
    root: null,
    user: null,
    request: null,
    escapeHtml: null,
    locale: null,
    tickets: [],
    activeTicket: null
  };

  function escapeHtml(value) {
    return state.escapeHtml(value);
  }

  function isEnglish() {
    return (typeof state.locale === "function" ? state.locale() : state.locale) === "en-US";
  }

  function labels() {
    return isEnglish()
      ? {
          title: "Support tickets",
          copy: "Track requests, review public replies, and add more information.",
          history: "Your tickets",
          guest: "Track a guest ticket",
          number: "Ticket number",
          contact: "Contact",
          lookup: "Find ticket",
          open: "Open",
          reply: "Add a reply",
          send: "Send reply",
          empty: "No support tickets yet.",
          notFound: "Support ticket not found."
        }
      : {
          title: "客服工单",
          copy: "追踪咨询进度、查看公开回复，并继续补充信息。",
          history: "我的工单",
          guest: "查询匿名工单",
          number: "工单号",
          contact: "联系方式",
          lookup: "查询工单",
          open: "查看详情",
          reply: "补充回复",
          send: "发送回复",
          empty: "暂时没有客服工单。",
          notFound: "未找到客服工单。"
        };
  }

  function statusLabel(status) {
    const values = isEnglish()
      ? { open: "Open", in_progress: "In progress", waiting_customer: "Waiting for you", resolved: "Resolved", closed: "Closed" }
      : { open: "待处理", in_progress: "处理中", waiting_customer: "等待你回复", resolved: "已解决", closed: "已关闭" };
    return values[status] || status;
  }

  function listMarkup() {
    const copy = labels();
    if (!state.tickets.length) return `<div class="empty-state">${copy.empty}</div>`;
    return `<div class="support-ticket-history">${state.tickets.map((ticket) => `
      <article class="support-ticket-card" data-support-ticket-row data-ticket-id="${escapeHtml(ticket.id)}">
        <div><strong>${escapeHtml(ticket.ticketNumber)}</strong><span>${escapeHtml(statusLabel(ticket.status))}</span></div>
        <h3>${escapeHtml(ticket.message)}</h3>
        <p>${escapeHtml(ticket.topic)} · ${escapeHtml(String(ticket.lastMessageAt || ticket.createdAt || "").slice(0, 10))}</p>
        <button class="order-button order-button--secondary" type="button" data-support-ticket-open>${copy.open}</button>
      </article>
    `).join("")}</div>`;
  }

  function lookupMarkup() {
    const copy = labels();
    return `
      <form class="support-ticket-lookup" data-support-ticket-lookup-form>
        <h2>${copy.guest}</h2>
        <label>${copy.number}<input autocomplete="off" data-support-ticket-number></label>
        <label>${copy.contact}<input autocomplete="email" data-support-ticket-contact></label>
        <button class="order-button order-button--primary" type="submit" data-support-ticket-lookup>${copy.lookup}</button>
        <p class="support-ticket-page__error" data-support-ticket-error aria-live="polite"></p>
      </form>
    `;
  }

  function detailMarkup() {
    const ticket = state.activeTicket;
    if (!ticket) return "";
    const copy = labels();
    const canReply = ticket.status !== "closed";
    return `
      <article class="support-ticket-detail" data-support-ticket-detail>
        <header>
          <div><p class="hero__eyebrow">${escapeHtml(ticket.ticketNumber)}</p><h2>${escapeHtml(statusLabel(ticket.status))}</h2></div>
          <span>${escapeHtml(ticket.topic)}</span>
        </header>
        <div class="support-ticket-timeline">
          ${(ticket.messages || []).map((message) => `
            <section class="support-ticket-message">
              <div><strong>${message.authorType === "customer" ? (isEnglish() ? "You" : "你") : (isEnglish() ? "Support" : "客服")}</strong><time>${escapeHtml(String(message.createdAt || "").replace("T", " ").slice(0, 16))}</time></div>
              <p>${escapeHtml(message.body)}</p>
            </section>
          `).join("")}
        </div>
        ${canReply ? `
          <form class="support-ticket-reply" data-support-ticket-reply-form>
            <label>${copy.reply}<textarea rows="4" maxlength="1000" data-support-ticket-reply></textarea></label>
            <button class="order-button order-button--primary" type="submit" data-support-ticket-reply-submit>${copy.send}</button>
            <p class="support-ticket-page__error" data-support-ticket-reply-error aria-live="polite"></p>
          </form>
        ` : ""}
      </article>
    `;
  }

  function shellMarkup(content) {
    const copy = labels();
    return `
      <section class="support-ticket-page">
        <header class="support-hero">
          <p class="support-hero__eyebrow">Customer care</p>
          <h1 class="support-hero__title">${copy.title}</h1>
          <p class="support-hero__copy">${copy.copy}</p>
          <a class="order-button order-button--secondary" href="/socks-product-list.html?view=support&section=contact">${isEnglish() ? "Contact support" : "新建工单"}</a>
        </header>
        ${content}
      </section>
    `;
  }

  function renderCurrent() {
    const copy = labels();
    if (state.user) {
      state.root.innerHTML = shellMarkup(`
        <section class="support-ticket-page__layout">
          <div><h2>${copy.history}</h2>${listMarkup()}</div>
          ${detailMarkup()}
        </section>
      `);
      return;
    }
    state.root.innerHTML = shellMarkup(`
      <section class="support-ticket-page__layout support-ticket-page__layout--guest">
        ${lookupMarkup()}
        ${detailMarkup()}
      </section>
    `);
  }

  async function fetchAccountTickets() {
    const payload = await state.request("/api/me/support/tickets");
    state.tickets = payload.tickets || [];
  }

  async function openAccountTicket(ticketId) {
    const payload = await state.request(`/api/me/support/tickets/${encodeURIComponent(ticketId)}`);
    state.activeTicket = payload.ticket;
    renderCurrent();
  }

  async function lookupGuestTicket(form) {
    const errorNode = form.querySelector("[data-support-ticket-error]");
    errorNode.textContent = "";
    try {
      const payload = await state.request("/api/support/tickets/lookup", {
        method: "POST",
        body: {
          ticketNumber: form.querySelector("[data-support-ticket-number]").value.trim(),
          contact: form.querySelector("[data-support-ticket-contact]").value.trim()
        }
      });
      state.activeTicket = payload.ticket;
      renderCurrent();
    } catch (error) {
      errorNode.textContent = error.code === "SUPPORT_LOOKUP_RATE_LIMITED"
        ? (isEnglish() ? "Too many attempts. Try again later." : "查询次数过多，请稍后再试。")
        : labels().notFound;
    }
  }

  async function submitReply(form) {
    const errorNode = form.querySelector("[data-support-ticket-reply-error]");
    const message = form.querySelector("[data-support-ticket-reply]").value.trim();
    const path = state.user
      ? `/api/me/support/tickets/${encodeURIComponent(state.activeTicket.id)}/messages`
      : `/api/support/tickets/${encodeURIComponent(state.activeTicket.ticketNumber)}/messages`;
    try {
      const payload = await state.request(path, { method: "POST", body: { message } });
      state.activeTicket = payload.ticket;
      if (state.user) await fetchAccountTickets();
      renderCurrent();
    } catch (error) {
      errorNode.textContent = error.message;
    }
  }

  async function handleClick(event) {
    const open = event.target.closest("[data-support-ticket-open]");
    if (open) await openAccountTicket(open.closest("[data-support-ticket-row]").dataset.ticketId);
  }

  async function handleSubmit(event) {
    const lookupForm = event.target.closest("[data-support-ticket-lookup-form]");
    const replyForm = event.target.closest("[data-support-ticket-reply-form]");
    if (!lookupForm && !replyForm) return;
    event.preventDefault();
    if (lookupForm) await lookupGuestTicket(lookupForm);
    if (replyForm) await submitReply(replyForm);
  }

  async function render() {
    if (!state.mounted) return;
    state.root.innerHTML = shellMarkup("<p>正在加载工单...</p>");
    if (state.user) await fetchAccountTickets();
    renderCurrent();
  }

  function setUser(user) {
    state.user = user || null;
  }

  function mount(options = {}) {
    if (state.mounted) {
      state.user = options.currentUser || state.user;
      return api;
    }
    Object.assign(state, options, { user: options.currentUser || null });
    state.root.addEventListener("click", handleClick);
    state.root.addEventListener("submit", handleSubmit);
    state.mounted = true;
    return api;
  }

  function destroy() {
    if (!state.mounted) return;
    state.root.removeEventListener("click", handleClick);
    state.root.removeEventListener("submit", handleSubmit);
    state.mounted = false;
  }

  const api = { mount, render, setUser, destroy };
  global.StorefrontCustomerSupport = api;
})(window);

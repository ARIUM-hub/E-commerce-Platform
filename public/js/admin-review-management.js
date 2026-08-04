(function createAdminReviewManagement(global) {
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
    locale: null,
    onSummaryChange: null,
    filters: { q: "", status: "", rating: "", replied: "" },
    payload: { reviews: [], summary: {} },
    activeReview: null,
    drawerTrigger: null
  };

  function isEnglish() {
    const locale = typeof state.locale === "function" ? state.locale() : state.locale;
    return locale === "en-US";
  }

  function escapeHtml(value) {
    if (typeof state.escapeHtml === "function") {
      return state.escapeHtml(value);
    }
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function operationId(prefix) {
    if (typeof state.createOperationId === "function") {
      return state.createOperationId(prefix);
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function statusLabel(status) {
    const labels = isEnglish()
      ? { pending: "Pending", published: "Published", hidden: "Hidden", rejected: "Rejected" }
      : { pending: "待审核", published: "已发布", hidden: "已隐藏", rejected: "已拒绝" };
    return labels[status] || status;
  }

  function activeReply(review) {
    return review?.reply && !review.reply.withdrawnAt ? review.reply : null;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return `/api/admin/reviews${query ? `?${query}` : ""}`;
  }

  function createSummaryMarkup(summary = {}) {
    const cards = isEnglish()
      ? [
          ["Pending", summary.pending || 0],
          ["Published", summary.published || 0],
          ["Hidden", summary.hidden || 0],
          ["Low rating", summary.lowRating || 0]
        ]
      : [
          ["待审核", summary.pending || 0],
          ["已发布", summary.published || 0],
          ["已隐藏", summary.hidden || 0],
          ["低评分", summary.lowRating || 0]
        ];
    return `<div class="admin-grid">${cards.map(([label, value]) => `
      <article class="admin-card" data-admin-review-kpi>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </article>
    `).join("")}</div>`;
  }

  function createFiltersMarkup() {
    const statusOptions = ["", "pending", "published", "hidden", "rejected"];
    const ratingOptions = ["", "5", "4", "3", "2", "1"];
    return `
      <form class="admin-review-filters" data-admin-review-filters>
        <label>
          <span>${isEnglish() ? "Search" : "搜索评论"}</span>
          <input name="q" value="${escapeHtml(state.filters.q)}" placeholder="${isEnglish() ? "Author, product or content" : "作者、商品或评论内容"}">
        </label>
        <label>
          <span>${isEnglish() ? "Status" : "审核状态"}</span>
          <select name="status">${statusOptions.map((value) => `
            <option value="${value}"${state.filters.status === value ? " selected" : ""}>${value ? statusLabel(value) : (isEnglish() ? "All statuses" : "全部状态")}</option>
          `).join("")}</select>
        </label>
        <label>
          <span>${isEnglish() ? "Rating" : "评分"}</span>
          <select name="rating">${ratingOptions.map((value) => `
            <option value="${value}"${state.filters.rating === value ? " selected" : ""}>${value ? `${value} ★` : (isEnglish() ? "All ratings" : "全部评分")}</option>
          `).join("")}</select>
        </label>
        <label>
          <span>${isEnglish() ? "Seller response" : "商家回复"}</span>
          <select name="replied">
            <option value=""${state.filters.replied === "" ? " selected" : ""}>${isEnglish() ? "All" : "全部"}</option>
            <option value="yes"${state.filters.replied === "yes" ? " selected" : ""}>${isEnglish() ? "Replied" : "已回复"}</option>
            <option value="no"${state.filters.replied === "no" ? " selected" : ""}>${isEnglish() ? "Not replied" : "未回复"}</option>
          </select>
        </label>
        <div class="admin-review-filters__actions">
          <button class="order-button order-button--primary" type="submit">${isEnglish() ? "Apply" : "应用筛选"}</button>
          <button class="order-button order-button--secondary" type="button" data-admin-review-filter-reset>${isEnglish() ? "Reset" : "重置"}</button>
        </div>
      </form>
    `;
  }

  function createRowsMarkup(reviews) {
    if (!reviews.length) {
      return `<div class="empty-state" data-admin-reviews-empty>${isEnglish() ? "No reviews match these filters." : "没有符合当前筛选条件的评论。"}</div>`;
    }
    return reviews.map((review) => {
      const reply = activeReply(review);
      return `
        <article class="admin-row admin-review-row" data-admin-review-row data-review-id="${escapeHtml(review.id)}">
          <label class="admin-review-row__select">
            <input type="checkbox" value="${escapeHtml(review.id)}" data-admin-review-select aria-label="${isEnglish() ? "Select review" : "选择评论"} ${escapeHtml(review.author)}">
          </label>
          <div class="admin-review-row__identity">
            <strong>${escapeHtml(review.productTitle)}</strong>
            <span>${escapeHtml(review.author)} · ${escapeHtml(String(review.createdAt || "").slice(0, 10))}</span>
          </div>
          <span aria-label="${review.rating} ${isEnglish() ? "stars" : "星"}">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
          <p class="admin-review-row__body">${escapeHtml(review.body)}</p>
          <span class="admin-review-status" data-admin-review-status data-status="${escapeHtml(review.status)}">${escapeHtml(statusLabel(review.status))}</span>
          <span>${reply ? (isEnglish() ? "Replied" : "已回复") : (isEnglish() ? "No response" : "未回复")}</span>
          <button class="order-button order-button--secondary" type="button" data-admin-review-open>${isEnglish() ? "Manage" : "管理"}</button>
        </article>
      `;
    }).join("");
  }

  function renderWorkspace() {
    const reviews = Array.isArray(state.payload.reviews) ? state.payload.reviews : [];
    state.panel.innerHTML = `
      <section class="admin-review-workspace" data-admin-review-workspace>
        <header class="admin-review-workspace__header">
          <div>
            <p class="hero__eyebrow">Review operations</p>
            <h2>${isEnglish() ? "Review management" : "评论管理"}</h2>
          </div>
          <span>${isEnglish() ? `${reviews.length} results` : `${reviews.length} 条结果`}</span>
        </header>
        ${createSummaryMarkup(state.payload.summary)}
        ${createFiltersMarkup()}
        <div class="admin-review-batch" data-admin-review-batch>
          <label>
            <span>${isEnglish() ? "Batch action" : "批量操作"}</span>
            <select data-admin-review-batch-action>
              <option value="publish">${isEnglish() ? "Publish" : "发布"}</option>
              <option value="reject">${isEnglish() ? "Reject" : "拒绝"}</option>
              <option value="hide">${isEnglish() ? "Hide" : "隐藏"}</option>
              <option value="restore">${isEnglish() ? "Restore" : "恢复"}</option>
            </select>
          </label>
          <button class="order-button order-button--primary" type="button" data-admin-review-batch-submit>${isEnglish() ? "Apply to selected" : "应用到已选评论"}</button>
          <p class="admin-review-error" data-admin-review-error role="alert"></p>
        </div>
        <div class="admin-table" data-admin-review-table>${createRowsMarkup(reviews)}</div>
      </section>
    `;
  }

  function moderationActions(review) {
    if (review.status === "pending") return ["publish", "reject"];
    if (review.status === "published") return ["hide"];
    if (review.status === "hidden") return ["restore"];
    return [];
  }

  function actionLabel(action) {
    const labels = isEnglish()
      ? { publish: "Publish", reject: "Reject", hide: "Hide", restore: "Restore" }
      : { publish: "发布", reject: "拒绝", hide: "隐藏", restore: "恢复" };
    return labels[action] || action;
  }

  function renderDrawer() {
    const review = state.activeReview;
    if (!review) {
      state.drawerBody.innerHTML = `<p>${isEnglish() ? "Loading review..." : "正在加载评论..."}</p>`;
      return;
    }
    const reply = activeReply(review);
    const actions = moderationActions(review);
    const riskFlags = Array.isArray(review.riskFlags) ? review.riskFlags : [];
    state.drawerBody.innerHTML = `
      <section class="admin-review-detail">
        <div class="admin-review-detail__meta">
          <span class="admin-review-status" data-status="${escapeHtml(review.status)}">${escapeHtml(statusLabel(review.status))}</span>
          <span>${escapeHtml(review.rating)} ★</span>
          <span>${escapeHtml(String(review.createdAt || "").slice(0, 10))}</span>
        </div>
        <h3>${escapeHtml(review.productTitle)}</h3>
        <p><strong>${escapeHtml(review.author)}</strong></p>
        <blockquote>${escapeHtml(review.body)}</blockquote>
        ${riskFlags.length ? `<p class="admin-review-detail__flags">${isEnglish() ? "Risk flags" : "风险标记"}: ${riskFlags.map(escapeHtml).join(" · ")}</p>` : ""}
      </section>
      ${actions.length ? `
        <section class="admin-operation-section">
          <div class="admin-operation-section__header">
            <h3>${isEnglish() ? "Moderation" : "审核操作"}</h3>
          </div>
          <div class="admin-review-detail__actions">
            ${actions.map((action) => `<button class="order-button order-button--secondary" type="button" data-admin-review-moderate="${action}">${escapeHtml(actionLabel(action))}</button>`).join("")}
          </div>
        </section>
      ` : ""}
      <section class="admin-operation-section">
        <div class="admin-operation-section__header">
          <h3>${isEnglish() ? "Seller response" : "商家回复"}</h3>
          ${reply ? `<span>${isEnglish() ? "Published" : "已发布"}</span>` : ""}
        </div>
        ${review.status === "published" ? `
          <form class="admin-operation-form" data-admin-review-reply-form>
            <label>
              ${isEnglish() ? "Response" : "回复内容"}
              <textarea rows="6" maxlength="1000" data-admin-review-reply>${escapeHtml(reply?.body || "")}</textarea>
            </label>
            <div class="admin-operation-form__actions">
              <button class="order-button order-button--primary" type="submit" data-admin-review-reply-submit>${reply ? (isEnglish() ? "Update response" : "更新回复") : (isEnglish() ? "Publish response" : "发布回复")}</button>
              ${reply ? `<button class="order-button order-button--secondary" type="button" data-admin-review-reply-withdraw>${isEnglish() ? "Withdraw" : "撤回回复"}</button>` : ""}
            </div>
            <p class="admin-operation-form__error" data-admin-review-drawer-error role="alert"></p>
          </form>
        ` : `<p>${isEnglish() ? "Publish this review before adding a seller response." : "评论发布后才能添加商家回复。"}</p>`}
      </section>
    `;
  }

  function setDrawerOpen(open) {
    state.drawer.dataset.open = open ? "true" : "false";
    state.drawer.setAttribute("aria-hidden", open ? "false" : "true");
    state.backdrop.hidden = !open;
    document.body.classList.toggle("is-admin-drawer-open", open);
  }

  async function openDrawer(reviewId, trigger) {
    state.drawerTrigger = trigger;
    state.activeReview = null;
    renderDrawer();
    setDrawerOpen(true);
    try {
      const payload = await state.request(`/api/admin/reviews/${encodeURIComponent(reviewId)}`);
      state.activeReview = payload.review;
      renderDrawer();
      state.drawerTitle.focus();
    } catch (error) {
      state.drawerBody.innerHTML = `<p class="admin-operation-form__error" role="alert">${escapeHtml(error.message)}</p>`;
      state.drawerTitle.focus();
    }
  }

  function closeDrawer() {
    if (!state.drawer || state.drawer.dataset.open !== "true") return;
    setDrawerOpen(false);
    const trigger = state.drawerTrigger;
    state.drawerTrigger = null;
    trigger?.focus();
  }

  async function moderate(reviewIds, action) {
    return state.request("/api/admin/reviews/actions/moderate", {
      method: "POST",
      body: {
        operationId: operationId(`admin-review-${action}`),
        action,
        reviewIds,
        reason: "manual_moderation",
        note: isEnglish() ? "Reviewed in admin workspace" : "后台人工审核"
      }
    });
  }

  async function submitBatch(button) {
    const errorNode = state.panel.querySelector("[data-admin-review-error]");
    const reviewIds = [...state.panel.querySelectorAll("[data-admin-review-select]:checked")]
      .map((checkbox) => checkbox.value);
    const action = state.panel.querySelector("[data-admin-review-batch-action]")?.value || "publish";
    errorNode.textContent = "";
    if (!reviewIds.length) {
      errorNode.textContent = isEnglish() ? "Select at least one review." : "请至少选择一条评论。";
      return;
    }
    button.disabled = true;
    try {
      await moderate(reviewIds, action);
      await render();
    } catch (error) {
      errorNode.textContent = error.message;
      button.disabled = false;
    }
  }

  async function handlePanelClick(event) {
    const reset = event.target.closest("[data-admin-review-filter-reset]");
    if (reset) {
      state.filters = { q: "", status: "", rating: "", replied: "" };
      await render();
      return;
    }
    const batchSubmit = event.target.closest("[data-admin-review-batch-submit]");
    if (batchSubmit) {
      await submitBatch(batchSubmit);
      return;
    }
    const open = event.target.closest("[data-admin-review-open]");
    if (open) {
      const row = open.closest("[data-admin-review-row]");
      await openDrawer(row.dataset.reviewId, open);
    }
  }

  async function handlePanelSubmit(event) {
    const form = event.target.closest("[data-admin-review-filters]");
    if (!form) return;
    event.preventDefault();
    const formData = new FormData(form);
    state.filters = {
      q: String(formData.get("q") || "").trim(),
      status: String(formData.get("status") || ""),
      rating: String(formData.get("rating") || ""),
      replied: String(formData.get("replied") || "")
    };
    await render();
  }

  async function refreshActiveReview(reviewId) {
    const payload = await state.request(`/api/admin/reviews/${encodeURIComponent(reviewId)}`);
    state.activeReview = payload.review;
    renderDrawer();
    await render();
  }

  async function handleDrawerClick(event) {
    const moderationButton = event.target.closest("[data-admin-review-moderate]");
    if (moderationButton && state.activeReview) {
      const errorNode = state.drawerBody.querySelector("[data-admin-review-drawer-error]");
      moderationButton.disabled = true;
      try {
        await moderate([state.activeReview.id], moderationButton.dataset.adminReviewModerate);
        await refreshActiveReview(state.activeReview.id);
      } catch (error) {
        if (errorNode) errorNode.textContent = error.message;
        moderationButton.disabled = false;
      }
      return;
    }
    const withdraw = event.target.closest("[data-admin-review-reply-withdraw]");
    if (withdraw && state.activeReview) {
      withdraw.disabled = true;
      try {
        await state.request(`/api/admin/reviews/${encodeURIComponent(state.activeReview.id)}/actions/withdraw-reply`, {
          method: "POST",
          body: { operationId: operationId("admin-review-reply-withdraw") }
        });
        await refreshActiveReview(state.activeReview.id);
      } catch (error) {
        const errorNode = state.drawerBody.querySelector("[data-admin-review-drawer-error]");
        if (errorNode) errorNode.textContent = error.message;
        withdraw.disabled = false;
      }
    }
  }

  async function handleDrawerSubmit(event) {
    const form = event.target.closest("[data-admin-review-reply-form]");
    if (!form || !state.activeReview) return;
    event.preventDefault();
    const submit = form.querySelector("[data-admin-review-reply-submit]");
    const errorNode = form.querySelector("[data-admin-review-drawer-error]");
    const replyBody = form.querySelector("[data-admin-review-reply]").value.trim();
    errorNode.textContent = "";
    submit.disabled = true;
    try {
      const payload = await state.request(`/api/admin/reviews/${encodeURIComponent(state.activeReview.id)}/actions/reply`, {
        method: "POST",
        body: { operationId: operationId("admin-review-reply"), replyBody }
      });
      state.activeReview = payload.review;
      renderDrawer();
      await render();
    } catch (error) {
      errorNode.textContent = error.message;
      submit.disabled = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && state.drawer?.dataset.open === "true") {
      closeDrawer();
    }
  }

  async function render() {
    if (!state.mounted || !state.panel) return;
    state.panel.innerHTML = `<p>${isEnglish() ? "Loading reviews..." : "正在加载评论..."}</p>`;
    try {
      state.payload = await state.request(buildQuery());
      renderWorkspace();
      state.onSummaryChange?.(state.payload.summary);
    } catch (error) {
      state.panel.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p><button class="order-button order-button--secondary" type="button" data-admin-review-filter-reset>${isEnglish() ? "Retry" : "重试"}</button></div>`;
    }
  }

  function mount(options = {}) {
    if (state.mounted) {
      Object.assign(state, {
        request: options.request || state.request,
        createOperationId: options.createOperationId || state.createOperationId,
        escapeHtml: options.escapeHtml || state.escapeHtml,
        locale: options.locale || state.locale,
        onSummaryChange: options.onSummaryChange || state.onSummaryChange
      });
      return api;
    }
    Object.assign(state, options);
    if (!state.panel || !state.drawer || !state.drawerBody || !state.drawerTitle || !state.drawerClose || !state.backdrop || !state.request) {
      throw new Error("Admin review management mount options are incomplete.");
    }
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
  global.StorefrontAdminReviews = api;
})(window);

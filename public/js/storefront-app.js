const FILTER_KEY = {
      ALL: "all",
      SPORT: "sport",
      DAILY: "daily",
      CREW: "crew",
      NO_SHOW: "no-show"
    };

    const SORT_KEY = {
      RECOMMENDED: "recommended",
      PRICE_ASC: "price-asc",
      PRICE_DESC: "price-desc",
      NEWEST: "newest"
    };

    const STOCK_FILTER_KEY = {
      ALL: "all",
      IN_STOCK: "in-stock",
      LOW_STOCK: "low-stock",
      OUT_OF_STOCK: "out-of-stock"
    };

    const validStockFilters = new Set(Object.values(STOCK_FILTER_KEY));
    const DEFAULT_PAGE_SIZE = 8;

    const LOCALE_KEY = {
      ZH_CN: "zh-CN",
      EN_US: "en-US"
    };

    const STOREFRONT_PATH = "/socks-product-list.html";
    const ORDER_VIEW_PATH = "/socks-product-list.html?view=order";
    const CHECKOUT_VIEW_PATH = "/socks-product-list.html?view=checkout";
    const DETAIL_VIEW_KEY = "detail";
    const CHECKOUT_VIEW_KEY = "checkout";
    const PAYMENT_VIEW_KEY = "payment";
    const ORDER_VIEW_KEY = "order";
    const WISHLIST_VIEW_KEY = "wishlist";
    const RECENT_VIEW_KEY = "recent";
    const AUTH_VIEW_KEY = "auth";
    const ADDRESSES_VIEW_KEY = "addresses";
    const ORDERS_VIEW_KEY = "orders";
    const SUPPORT_VIEW_KEY = "support";
    const SUPPORT_TICKETS_VIEW_KEY = "support-tickets";
    const ADMIN_VIEW_KEY = "admin";
    const RETURN_VIEW_KEY = "return";
    const RETURNS_VIEW_KEY = "returns";
    const SUPPORT_DEFAULT_SECTION = "faq";
    const SUPPORT_SECTION_IDS = ["returns", "delivery", "privacy", "terms", "faq", "contact"];
    const LOCALE_STORAGE_KEY = "socks-storefront-locale";
    const pageRoot = document.querySelector("[data-page]");
    const siteUtilityPromo = document.querySelector("[data-site-utility-promo]");
    const siteUtilityService = document.querySelector("[data-site-utility-service]");
    const siteHelpLink = document.querySelector("[data-site-help-link]");
    const siteReturnsLink = document.querySelector("[data-site-returns-link]");
    const siteWishlistLink = document.querySelector("[data-site-wishlist-link]");
    const siteRecentLink = document.querySelector("[data-site-recent-link]");
    const siteBrandEyebrow = document.querySelector("[data-site-brand-eyebrow]");
    const siteBrandTitle = document.querySelector("[data-site-brand-title]");
    const siteDepartmentLabel = document.querySelector("[data-site-department-label]");
    const siteDepartmentValue = document.querySelector("[data-site-department-value]");
    const siteSearchForm = document.querySelector("[data-site-search-form]");
    const siteSearchLabel = document.querySelector("[data-site-search-label]");
    const siteSearchInput = document.querySelector("[data-site-search-input]");
    const siteSearchSubmit = document.querySelector("[data-site-search-submit]");
    const authShell = document.querySelector("[data-auth-shell]");
    const siteAccountLabel = document.querySelector("[data-site-account-label]");
    const siteAccountValue = document.querySelector("[data-site-account-value]");
    const siteOrdersLink = document.querySelector("[data-site-orders-link]");
    const siteOrdersLabel = document.querySelector("[data-site-orders-label]");
    const siteOrdersValue = document.querySelector("[data-site-orders-value]");
    const siteNavFilterLinks = Array.from(document.querySelectorAll("[data-site-nav-filter]"));
    const siteNavQueryLinks = Array.from(document.querySelectorAll("[data-site-nav-query]"));
    const storefrontEntryFilterLinks = Array.from(document.querySelectorAll("[data-entry-filter]"));
    const storefrontEntryQueryLinks = Array.from(document.querySelectorAll("[data-entry-query]"));
    const siteFooterEyebrow = document.querySelector("[data-site-footer-eyebrow]");
    const siteFooterTitle = document.querySelector("[data-site-footer-title]");
    const siteFooterCopy = document.querySelector("[data-site-footer-copy]");
    const siteFooterHelpTitle = document.querySelector("[data-site-footer-help-title]");
    const siteFooterDeliveryTitle = document.querySelector("[data-site-footer-delivery-title]");
    const siteFooterSupportTitle = document.querySelector("[data-site-footer-support-title]");
    const siteFooterLocaleNote = document.querySelector("[data-site-footer-locale-note]");
    const siteFooterCopyright = document.querySelector("[data-site-footer-copyright]");
    const storefrontTitle = document.querySelector("[data-storefront-title]");
    const storefrontDescription = document.querySelector("[data-storefront-description]");
    const toolbarFilterLabel = document.querySelector("[data-toolbar-filter-label]");
    const toolbarSortLabel = document.querySelector("[data-toolbar-sort-label]");
    const localeButtons = Array.from(document.querySelectorAll("[data-locale-option]"));
    const storefrontView = document.querySelector("[data-storefront-view]");
    const detailView = document.querySelector("[data-detail-view]");
    const wishlistView = document.querySelector("[data-wishlist-view]");
    const recentView = document.querySelector("[data-recent-view]");
    const authView = document.querySelector("[data-auth-view]");
    const addressesView = document.querySelector("[data-addresses-view]");
    const checkoutView = document.querySelector("[data-checkout-view]");
    const paymentView = document.querySelector("[data-payment-view]");
    const ordersView = document.querySelector("[data-orders-view]");
    const orderView = document.querySelector("[data-order-view]");
    const supportView = document.querySelector("[data-support-view]");
    const supportTicketsView = document.querySelector("[data-support-tickets-view]");
    const adminView = document.querySelector("[data-admin-view]");
    const returnView = document.querySelector("[data-return-view]");
    const returnsView = document.querySelector("[data-returns-view]");
    const toolbar = document.querySelector("[data-toolbar]");
    const productGrid = document.querySelector("[data-product-grid]");
    const resultCount = document.querySelector("[data-result-count]");
    const advancedFilters = document.querySelector("[data-advanced-filters]");
    const activeFilterChips = document.querySelector("[data-active-filter-chips]");
    const loadMoreProductsButton = document.querySelector("[data-load-more-products]");
    const detailPagePanel = document.querySelector("[data-detail-page-panel]");
    const detailPageSeries = document.querySelector("[data-detail-page-series]");
    const detailPageTitle = document.querySelector("[data-detail-page-title]");
    const detailPageDescription = document.querySelector("[data-detail-page-description]");
    const detailBackLink = document.querySelector("[data-detail-back-link]");
    const detailCartToggleButton = document.querySelector("[data-detail-cart-toggle]");
    const detailCartCount = document.querySelector("[data-detail-cart-count]");
    const detailCartSummary = document.querySelector("[data-detail-cart-summary]");
    const wishlistHeroEyebrow = document.querySelector("[data-wishlist-hero-eyebrow]");
    const wishlistTitle = document.querySelector("[data-wishlist-title]");
    const wishlistCopy = document.querySelector("[data-wishlist-copy]");
    const wishlistPanel = document.querySelector("[data-wishlist-panel]");
    const recentHeroEyebrow = document.querySelector("[data-recent-hero-eyebrow]");
    const recentTitle = document.querySelector("[data-recent-title]");
    const recentCopy = document.querySelector("[data-recent-copy]");
    const recentPanel = document.querySelector("[data-recent-panel]");
    const orderPagePanel = document.querySelector("[data-order-page-panel]");
    const returnPagePanel = document.querySelector("[data-return-panel]");
    const returnsPagePanel = document.querySelector("[data-returns-panel]");
    const checkoutPagePanel = document.querySelector("[data-checkout-panel]");
    const checkoutHeroEyebrow = document.querySelector("[data-checkout-hero-eyebrow]");
    const checkoutTitle = document.querySelector("[data-checkout-title]");
    const checkoutCopy = document.querySelector("[data-checkout-copy]");
    const paymentPanel = document.querySelector("[data-payment-panel]");
    const paymentHeroEyebrow = document.querySelector("[data-payment-hero-eyebrow]");
    const paymentTitle = document.querySelector("[data-payment-title]");
    const paymentCopy = document.querySelector("[data-payment-copy]");
    const authForm = document.querySelector("[data-auth-form]");
    const authTitle = document.querySelector("[data-auth-title]");
    const authCopy = document.querySelector("[data-auth-copy]");
    const authNameRow = document.querySelector("[data-auth-name-row]");
    const authError = document.querySelector("[data-auth-error]");
    const authSubmit = document.querySelector("[data-auth-submit]");
    const addressForm = document.querySelector("[data-address-form]");
    const addressList = document.querySelector("[data-address-list]");
    const addressError = document.querySelector("[data-address-error]");
    const orderHeroEyebrow = document.querySelector("[data-order-hero-eyebrow]");
    const orderPageTitle = document.querySelector("[data-page-title]");
    const orderPageCopy = document.querySelector("[data-page-copy]");
    const orderHistoryPanel = document.querySelector("[data-order-history-panel]");
    const returnHeroEyebrow = document.querySelector("[data-return-hero-eyebrow]");
    const returnTitle = document.querySelector("[data-return-title]");
    const returnCopy = document.querySelector("[data-return-copy]");
    const returnsHeroEyebrow = document.querySelector("[data-returns-hero-eyebrow]");
    const returnsTitle = document.querySelector("[data-returns-title]");
    const returnsCopy = document.querySelector("[data-returns-copy]");
    const supportTitle = document.querySelector("[data-support-title]");
    const supportCopy = document.querySelector("[data-support-copy]");
    const supportBreadcrumbCurrent = document.querySelector("[data-support-breadcrumb-current]");
    const supportNav = document.querySelector("[data-support-nav]");
    const supportCurrentEyebrow = document.querySelector("[data-support-current-eyebrow]");
    const supportCurrentTitle = document.querySelector("[data-support-current-title]");
    const supportCurrentSummary = document.querySelector("[data-support-current-summary]");
    const supportCurrentBullets = document.querySelector("[data-support-current-bullets]");
    const supportFaq = document.querySelector("[data-support-faq]");
    const supportContactForm = document.querySelector("[data-support-contact-form]");
    const supportTicket = document.querySelector("[data-support-ticket]");
    const adminAuthRequired = document.querySelector("[data-admin-auth-required]");
    const adminForbidden = document.querySelector("[data-admin-forbidden]");
    const adminConsole = document.querySelector("[data-admin-console]");
    const adminTabs = document.querySelector("[data-admin-tabs]");
    const adminPanel = document.querySelector("[data-admin-panel]");
    const adminOrderDrawer = document.querySelector("[data-admin-order-drawer]");
    const adminOrderDrawerBody = document.querySelector("[data-admin-order-drawer-body]");
    const adminOrderDrawerTitle = document.querySelector("[data-admin-order-drawer-title]");
    const adminOrderDrawerClose = document.querySelector("[data-admin-order-drawer-close]");
    const adminOrderBackdrop = document.querySelector("[data-admin-order-backdrop]");
    const adminReturnDrawer = document.querySelector("[data-admin-return-drawer]");
    const adminReturnDrawerBody = document.querySelector("[data-admin-return-drawer-body]");
    const adminReturnDrawerTitle = document.querySelector("[data-admin-return-drawer-title]");
    const adminReturnDrawerClose = document.querySelector("[data-admin-return-drawer-close]");
    const adminReturnBackdrop = document.querySelector("[data-admin-return-backdrop]");
    const adminReviewDrawer = document.querySelector("[data-admin-review-drawer]");
    const adminReviewDrawerBody = document.querySelector("[data-admin-review-drawer-body]");
    const adminReviewDrawerTitle = document.querySelector("[data-admin-review-drawer-title]");
    const adminReviewDrawerClose = document.querySelector("[data-admin-review-drawer-close]");
    const adminReviewBackdrop = document.querySelector("[data-admin-review-backdrop]");
    const adminTicketDrawer = document.querySelector("[data-admin-ticket-drawer]");
    const adminTicketDrawerBody = document.querySelector("[data-admin-ticket-drawer-body]");
    const adminTicketDrawerTitle = document.querySelector("[data-admin-ticket-drawer-title]");
    const adminTicketDrawerClose = document.querySelector("[data-admin-ticket-drawer-close]");
    const adminTicketBackdrop = document.querySelector("[data-admin-ticket-backdrop]");
    const cartToggleButton = document.querySelector("[data-cart-toggle]");
    const cartLabel = document.querySelector("[data-cart-label]");
    const cartCount = document.querySelector("[data-cart-count]");
    const cartSummary = document.querySelector("[data-cart-summary]");
    const cartDrawer = document.querySelector("[data-cart-drawer]");
    const cartDrawerEyebrow = document.querySelector("[data-cart-drawer-eyebrow]");
    const cartDrawerTitle = document.querySelector("[data-cart-drawer-title]");
    const cartDrawerMeta = document.querySelector("[data-cart-drawer-meta]");
    const cartDrawerItems = document.querySelector("[data-cart-drawer-items]");
    const cartSubtotalLabel = document.querySelector("[data-cart-subtotal-label]");
    const cartSubtotal = document.querySelector("[data-cart-subtotal]");
    const cartSavingsLabel = document.querySelector("[data-cart-savings-label]");
    const cartSavings = document.querySelector("[data-cart-savings]");
    const cartShippingLabel = document.querySelector("[data-cart-shipping-label]");
    const cartShipping = document.querySelector("[data-cart-shipping]");
    const cartTotalLabel = document.querySelector("[data-cart-total-label]");
    const cartDrawerTotal = document.querySelector("[data-cart-total]");
    const cartDeliverySummary = document.querySelector("[data-cart-delivery-summary]");
    const cartTrustCopy = document.querySelector("[data-cart-trust-copy]");
    const cartCheckoutButton = document.querySelector("[data-cart-checkout]");
    const cartCloseButton = document.querySelector("[data-cart-close]");
    const cartBackdrop = document.querySelector("[data-cart-backdrop]");
    const clearCartButton = document.querySelector("[data-clear-cart]");
    const detailCartLabel = document.querySelector("[data-detail-cart-label]");
    const cartFooterCopy = document.querySelector("[data-cart-footer-copy]");
    const cartFeedbackCounts = new Map();
    let stockToastTimer;
    const ORDER_DATE_STAMP = "20260717";
    const ORDER_CONFIRMATION_STORAGE_KEY = "demoOrderConfirmation";
    const NAVIGATION_CONTEXT_STORAGE_KEY = "demoNavigationContext";
    let activeFilter = FILTER_KEY.ALL;
    let activeSort = SORT_KEY.RECOMMENDED;
    let activeQuery = "";
    let activeMinPrice = "";
    let activeMaxPrice = "";
    let activeSize = "";
    let activeStock = STOCK_FILTER_KEY.ALL;
    let activeRatingMin = "";
    let activePage = 1;
    let activePageSize = DEFAULT_PAGE_SIZE;
    let activeHasMore = false;
    let activeTotalCount = 0;
    let activeLocale = LOCALE_KEY.ZH_CN;
    let visibleProducts = [];
    let allProductsCache = [];
    let recommendationProducts = [];
    let navigationContext = {
      storefrontHref: STOREFRONT_PATH,
      filter: FILTER_KEY.ALL,
      sort: SORT_KEY.RECOMMENDED,
      query: ""
    };
    const productCatalog = new Map();
    let cartState = { items: [] };
    let marketingState = {
      promotions: [],
      coupons: [],
      bundles: []
    };
    let savedProductIds = new Set();
    let trustCenterState = {
      sections: [],
      faqs: [],
      contactTopics: [],
      updatedAt: ""
    };
    let openFaqId = null;
    let recentlyViewedProducts = [];
    let currentUser = null;
    let activeAdminTab = "dashboard";
    let adminData = {
      summary: null,
      products: [],
      inventory: [],
      orders: [],
      marketing: null,
      orderDetail: null,
      orderDrawerTrigger: null,
      returnRequests: [],
      returnDetail: null,
      returnDrawerTrigger: null,
      returnPendingAction: "",
      productDraft: null,
      productMode: "list",
      selectedSkuIds: new Set()
    };
    let addressBook = [];
    let checkoutShippingEstimateTimer = null;
    let isCartDrawerOpen = false;
    let isCartMutationPending = false;
    let orderConfirmationState = null;
    let orderSequence = 0;
    const cardRemoveDialogState = {
      productId: null,
      selectedSize: "",
      quantity: 1
    };

    const translations = {
      [LOCALE_KEY.ZH_CN]: {
        storefront: {
          title: "袜子专区",
          description: "精选黑白灰日常袜、运动袜与轻量通勤款，延续简约电商风格，专注舒适穿着与基础百搭感。"
        },
        shell: {
          promo: "黑白灰成人袜满 ¥99 包邮",
          service: "袜子频道演示商城",
          help: "帮助中心",
          returns: "退换说明",
          brandEyebrow: "SOCKS DEPOT",
          departmentLabel: "部门",
          departmentValue: "成人袜子",
          searchLabel: "搜索袜子商品",
          searchPlaceholder: "搜索袜子标题、描述或分类",
          searchButton: "搜索",
          accountLabel: "账户",
          accountValue: "匿名访客",
          ordersLabel: "订单",
          ordersValue: "查看记录"
        },
        shellNav: {
          all: "全部袜子",
          sport: "运动训练",
          daily: "日常补货",
          crew: "中筒基础",
          "no-show": "船袜轻装",
          quickDry: "速干训练",
          noShowSearch: "船袜搜索"
        },
        entry: {
          sportEyebrow: "训练导购",
          sportTitle: "快速进入运动袜",
          sportCopy: "压缩支撑与速干面料集中在同一组结果里，适合直接比较训练场景商品。",
          sportCta: "查看运动分类",
          dailyEyebrow: "日常补货",
          dailyTitle: "聚合通勤与基础款",
          dailyCopy: "围绕高频日穿款做快速浏览，适合先看黑白灰基础组合与罗口经典款。",
          dailyCta: "查看日常分类",
          crewEyebrow: "搜索引导",
          crewTitle: "按“中筒”直达相关结果",
          crewCopy: "搜索会真实作用于标题、描述和分类字段，方便模拟商城站内检索体验。",
          crewCta: "执行中筒搜索",
          noShowEyebrow: "轻装专区",
          noShowTitle: "直达船袜与低帮场景",
          noShowCopy: "把更偏夏季和轻量穿着的结果单独收束，做出更像真实频道入口的层级感。",
          noShowCta: "执行船袜搜索"
        },
        footer: {
          eyebrow: "Storefront",
          title: "袜子专区",
          copy: "单一袜子主营类目下的高信息密度商城演示，统一承接列表、详情、购物车和订单流程。",
          helpTitle: "购买帮助",
          deliveryTitle: "配送说明",
          supportTitle: "支持与政策",
          localeNote: "当前页面支持中文与英文商城文案切换。",
          copyright: "© 2026 Socks Depot Demo"
        },
        support: {
          title: "帮助中心",
          copy: "查看退换、配送、隐私、条款和常见问题，也可以提交演示客服工单。",
          breadcrumb: "帮助中心",
          loadFailure: "帮助内容加载失败，请稍后重试。",
          contactName: "姓名",
          contactContact: "联系方式",
          contactTopic: "问题类型",
          contactOrder: "订单号",
          contactMessage: "问题描述",
          submit: "提交工单",
          submitting: "提交中...",
          successTitle: "工单已创建",
          responseTime: "预计 1 个工作日内响应",
          errors: {
            SUPPORT_NAME_REQUIRED: "请填写姓名",
            SUPPORT_CONTACT_REQUIRED: "请填写联系方式",
            SUPPORT_TOPIC_REQUIRED: "请选择问题类型",
            SUPPORT_TOPIC_INVALID: "请选择有效的问题类型",
            SUPPORT_MESSAGE_REQUIRED: "请填写问题描述",
            SUPPORT_MESSAGE_TOO_LONG: "问题描述不能超过 1000 个字符"
          }
        },
        toolbar: {
          filterLabel: "分类",
          sortLabel: "排序"
        },
        filters: {
          all: "全部",
          sport: "运动袜",
          daily: "日常袜",
          crew: "中筒袜",
          "no-show": "船袜"
        },
        filterLabels: {
          all: "全部商品",
          sport: "运动袜",
          daily: "日常袜",
          crew: "中筒袜",
          "no-show": "船袜"
        },
        sorts: {
          recommended: "推荐",
          "price-asc": "价格从低到高",
          "price-desc": "价格从高到低",
          newest: "最新上架"
        },
        common: {
          home: "首页",
          socksHome: "袜子专区",
          backToStorefront: "返回商城",
          orderNumber: "订单号",
          items: "商品数量",
          delivery: "配送",
          estimatedDelivery: "预计送达",
          subtotal: "原价小计",
          savings: "优惠",
          shipping: "配送",
          estimatedTotal: "预计总计",
          itemCount: ({ count }) => `${count} ${count === 1 ? "件商品" : "件商品"}`
        },
        rating: {
          reviewCount: ({ count }) => `${count.toLocaleString("zh-CN")} 条评价`,
          topRated: "高评分"
        },
        commerce: {
          shippingFree: "包邮",
          stockIn: "现货充足",
          stockLow: ({ count }) => `仅剩 ${count} 件`,
          recentlyBought: ({ amount }) => `过去一个月 ${amount} 人购买`,
          deliveryEstimate: ({ label }) => `预计${label}送达`,
          addItemsDelivery: "加入商品后可查看配送时间",
          earliestDelivery: ({ label }) => `最早送达：${label}`,
          trustCopy: "此演示商城使用安全结账流程"
        },
        cart: {
          label: "购物车",
          openAria: "打开购物车",
          detailOpenAria: "打开详情购物车",
          close: "关闭",
          closeAria: "关闭购物车",
          detailsTitle: "购物车明细",
          clear: "清空购物车",
          empty: "购物车还是空的",
          footerCopy: "你可以继续加购，抽屉会同步展示当前匿名购物车状态。",
          summary: ({ count }) => `购物车 ${count} 件`,
          drawerMeta: ({ count }) => `共 ${count} 件商品`,
          orderComplete: "演示订单已完成",
          addToCart: "加入购物车",
          addedToCart: "已加入购物车",
          selectedSizes: ({ items, count }) => `已选 ${items}（+${count}）`,
          selectedSizesSummary: ({ count }) => `已选（+${count}）`,
          outOfStock: "无货",
          removeSelected: "移除",
          removeSelectedAria: "移除已选尺码",
          removeDialogTitle: "选择要移除的尺码",
          removeDialogCopy: "选择一个已加入购物车的尺码，再设置本次要移除的数量。",
          removeDialogDecrease: "减少移除数量",
          removeDialogIncrease: "增加移除数量",
          removeDialogCancel: "取消",
          removeDialogConfirm: "确认移除",
          viewItem: "查看商品",
          itemFallback: "已选商品",
          size: ({ size }) => `尺码 ${size}`,
          increase: ({ title }) => `增加 ${title} 数量`,
          decrease: ({ title }) => `减少 ${title} 数量`,
          remove: ({ title }) => `移除 ${title}`,
          checkout: "去结算",
          continueShopping: "继续逛逛",
          viewOrderPage: "查看订单页",
          confirmationEyebrow: "演示结账",
          confirmationTitle: "订单已确认",
          confirmationCopy: "你的演示订单已经提交，购物车已清空，你可以继续浏览商城。"
        },
        listing: {
          resultCount: ({ count }) => `共 ${count} 件商品`,
          viewDetails: "查看详情",
          empty: "当前分类暂无商品",
          loadFailure: "商品加载失败，请稍后重试",
          recommendedTag: "推荐"
        },
        detail: {
          pageSeries: "商品详情",
          loadingTitle: "正在加载商品",
          loadingCopy: "正在准备所选商品的详情视图。",
          sourceBack: ({ label }) => `返回 ${label} 结果`,
          currentSort: ({ label }) => `当前排序：${label}`,
          continueEyebrow: "继续浏览",
          continueTitle: "看看相邻商品",
          recommendedEyebrow: "推荐",
          recommendedTitle: "你可能也喜欢",
          emptyTitle: "商品不存在",
          emptyCopy: "暂时找不到所选演示商品。",
          noRecommendations: "暂时没有可展示的推荐商品。",
          navNoItemTitle: "暂无商品",
          navNoItemMeta: "当前视图中没有更多商品",
          reviewsEyebrow: "真实反馈",
          reviewsTitle: "用户评论",
          reviewsEmpty: "暂无评论，成为第一个分享体验的人。",
          reviewsCount: ({ count }) => `${count} 条评论`,
          reviewsSummary: ({ rating }) => `${rating} / 5`,
          reviewSort: "评论排序",
          reviewSortNewest: "最新",
          reviewSortHigh: "评分高到低",
          reviewSortLow: "评分低到高",
          reviewFilter: "筛选评分",
          reviewFilterAll: "全部评分",
          reviewAuthor: "昵称",
          reviewRating: "评分",
          reviewBody: "评论内容",
          reviewSubmit: "提交评论",
          reviewSubmitting: "提交中...",
          reviewError: "评论提交失败，请检查昵称、评分和内容。",
          reviewPending: "评论已提交，等待审核。",
          reviewPublished: "评论已发布。",
          verifiedPurchase: "Verified Purchase",
          helpful: ({ count }) => `有帮助 ${count}`,
          helpfulSubmitting: "记录中...",
          saveProduct: "保存到稍后购买",
          savedProduct: "已保存",
          savedProductsCount: ({ count }) => `${count}`,
          questionsEyebrow: "商品问答",
          questionsTitle: "买家问答",
          questionsCount: ({ count }) => `${count} 个问题`,
          questionsEmpty: "暂无问题，成为第一个提问的人。",
          questionAuthor: "昵称",
          questionBody: "问题内容",
          questionSubmit: "提交问题",
          questionSubmitting: "提交中...",
          questionPendingAnswer: "等待答复",
          questionError: "问题提交失败，请检查昵称和问题内容。"
        },
        wishlist: {
          eyebrow: "保存列表",
          title: "心愿单",
          copy: "管理你保存的袜子，稍后继续购买。",
          empty: "还没有保存的商品",
          browse: "去浏览袜子",
          viewDetail: "查看详情",
          addCart: "加入购物车",
          remove: "移除收藏"
        },
        recent: {
          eyebrow: "浏览历史",
          title: "浏览历史",
          copy: "继续查看你最近打开过的袜子商品。",
          empty: "还没有浏览记录",
          clear: "清空浏览历史",
          remove: "移除记录",
          viewDetail: "查看详情",
          addCart: "加入购物车"
        },
        checkout: {
          heroEyebrow: "安全结算",
          heroTitle: "确认订单",
          heroCopy: "填写配送信息后，系统会从当前购物车创建一笔可追踪的演示订单。",
          empty: "购物车为空，请先返回商城加入商品。",
          name: "姓名",
          contact: "联系方式",
          address: "详细地址",
          city: "城市",
          region: "省/州",
          postalCode: "邮编",
          note: "配送备注",
          shippingMethod: "配送方式",
          standardShipping: "标准配送 · 包邮",
          expressShipping: "加急配送 · 楼12",
          submitOrder: "提交订单",
          validationError: "请补全收货信息后再提交。",
          submitError: "订单提交失败，请稍后重试。"
        },
        payment: {
          heroEyebrow: "安全支付",
          heroTitle: "支付订单",
          heroCopy: "选择演示支付方式。系统会记录支付尝试并同步订单状态。",
          method: "支付方式",
          card: "银行卡",
          paypal: "PayPal",
          giftCard: "礼品卡",
          payNow: "立即支付",
          retry: "重试支付",
          failDemo: "模拟失败",
          attempts: "支付记录",
          attemptEmpty: "暂无支付记录",
          succeeded: "支付成功",
          failed: "支付失败，请重试。",
          unavailable: "当前订单不可支付。",
          backToOrder: "返回订单"
        },
        order: {
          heroEyebrow: "演示订单",
          heroTitle: "订单已确认",
          heroCopy: "当前浏览器会话中的演示订单已经记录完成。",
          summaryEyebrow: "订单快照",
          summaryTitle: "订单摘要",
          continueEyebrow: "继续购物",
          continueTitle: "你可能也喜欢",
          sourceTitle: "返回上一轮浏览结果",
          defaultSourceTitle: "继续在商城中浏览",
          emptyTitle: "暂无最近的演示订单",
          emptyCopy: "请先从商城完成一次演示结账。",
          backToStorefront: "返回商城",
          payDemo: "模拟付款",
          cancelDemo: "取消订单",
          processDemo: "模拟处理中",
          shipDemo: "模拟发货",
          deliverDemo: "模拟送达"
        },
        reorder: {
          button: "再次购买",
          partial: "部分商品因库存不足未加入",
          empty: "暂无可再次购买的商品"
        },
        returns: {
          request: "申请售后",
          fromOrders: "从订单发起售后",
          viewHistory: "查看售后进度",
          heroEyebrow: "售后服务",
          heroTitle: "申请售后",
          heroCopy: "选择订单商品、数量和售后原因，提交后会生成可追踪售后单。",
          historyEyebrow: "售后记录",
          historyTitle: "售后进度",
          historyCopy: "查看当前账户已提交的退换货申请。",
          empty: "暂无售后申请",
          signInRequired: "请先登录后查看或提交售后申请。",
          orderNotEligible: "当前订单暂不可申请售后。",
          type: "售后类型",
          reason: "售后原因",
          contact: "联系方式",
          note: "补充说明",
          submit: "提交售后申请",
          submitting: "提交中...",
          returnNumber: "售后单号",
          status: "状态",
          quantity: "申请数量",
          availableQuantity: ({ count }) => `可申请 ${count} 件`,
          itemSummary: ({ count }) => `${count} 件商品`,
          detail: "查看详情",
          cancel: "取消申请",
          types: {
            return_refund: "退货退款",
            exchange: "换货",
            refund_only: "仅退款"
          },
          reasons: {
            size_issue: "尺码不合适",
            quality_issue: "质量问题",
            wrong_item: "错发漏发",
            changed_mind: "不喜欢/改变主意",
            other: "其他"
          },
          statuses: {
            submitted: "已提交",
            reviewing: "审核中",
            approved: "已通过",
            rejected: "已拒绝",
            completed: "已完成",
            cancelled: "已取消"
          },
          errors: {
            itemsRequired: "请选择至少一件商品",
            RETURN_ORDER_NOT_ELIGIBLE: "当前订单暂不可申请售后",
            RETURN_ITEM_NOT_FOUND: "请选择有效的订单商品",
            RETURN_QUANTITY_INVALID: "请填写有效的售后数量",
            RETURN_QUANTITY_EXCEEDED: "售后数量超过可申请数量",
            RETURN_REASON_REQUIRED: "请选择售后原因",
            RETURN_TYPE_INVALID: "请选择售后类型",
            RETURN_CONTACT_REQUIRED: "请填写联系方式"
          }
        }
      },
      [LOCALE_KEY.EN_US]: {
        storefront: {
          title: "Socks Storefront",
          description: "A focused edit of black, white, and gray essentials for daily wear, training, and light commuting."
        },
        shell: {
          promo: "Free shipping on black, white, and gray adult socks over ¥99",
          service: "Demo socks channel storefront",
          help: "Help center",
          returns: "Returns",
          brandEyebrow: "SOCKS DEPOT",
          departmentLabel: "Department",
          departmentValue: "Adult Socks",
          searchLabel: "Search socks products",
          searchPlaceholder: "Search sock titles, descriptions, or categories",
          searchButton: "Search",
          accountLabel: "Account",
          accountValue: "Guest shopper",
          ordersLabel: "Orders",
          ordersValue: "View history"
        },
        shellNav: {
          all: "All socks",
          sport: "Sport training",
          daily: "Daily restock",
          crew: "Crew basics",
          "no-show": "No-show lightwear",
          quickDry: "Quick-dry",
          noShowSearch: "No-show search"
        },
        entry: {
          sportEyebrow: "Training guide",
          sportTitle: "Jump straight into sport socks",
          sportCopy: "Compression support and quick-dry styles stay in one result set so training comparisons feel fast.",
          sportCta: "Browse sport category",
          dailyEyebrow: "Daily restock",
          dailyTitle: "Bundle commuting and basics",
          dailyCopy: "Quickly scan the core black, white, and gray essentials built for high-frequency everyday wear.",
          dailyCta: "Browse daily category",
          crewEyebrow: "Search prompt",
          crewTitle: "Search for crew socks instantly",
          crewCopy: "Search runs against real title, description, and category fields so the storefront behaves like a live mall page.",
          crewCta: "Run crew search",
          noShowEyebrow: "Lightwear focus",
          noShowTitle: "Go straight to no-show results",
          noShowCopy: "Pull lighter low-profile products into a dedicated entry point to create a stronger retail channel hierarchy.",
          noShowCta: "Run no-show search"
        },
        footer: {
          eyebrow: "Storefront",
          title: "Socks Storefront",
          copy: "A high-density storefront demo for a single socks department, shared across listing, detail, cart, and order flows.",
          helpTitle: "Shopping help",
          deliveryTitle: "Delivery notes",
          supportTitle: "Support and policy",
          localeNote: "This page supports both Chinese and English storefront copy.",
          copyright: "© 2026 Socks Depot Demo"
        },
        support: {
          title: "Help Center",
          copy: "Review returns, delivery, privacy, terms, and FAQ content, or submit a demo support ticket.",
          breadcrumb: "Help Center",
          loadFailure: "Help content failed to load. Please try again.",
          contactName: "Name",
          contactContact: "Contact",
          contactTopic: "Topic",
          contactOrder: "Order number",
          contactMessage: "Message",
          submit: "Submit ticket",
          submitting: "Submitting...",
          successTitle: "Ticket created",
          responseTime: "Expected response within 1 business day",
          errors: {
            SUPPORT_NAME_REQUIRED: "Please enter your name",
            SUPPORT_CONTACT_REQUIRED: "Please enter your contact",
            SUPPORT_TOPIC_REQUIRED: "Please select a topic",
            SUPPORT_TOPIC_INVALID: "Please select a valid topic",
            SUPPORT_MESSAGE_REQUIRED: "Please enter your message",
            SUPPORT_MESSAGE_TOO_LONG: "Message must be 1000 characters or fewer"
          }
        },
        toolbar: {
          filterLabel: "Category",
          sortLabel: "Sort"
        },
        filters: {
          all: "All",
          sport: "Sport Socks",
          daily: "Everyday Socks",
          crew: "Crew Socks",
          "no-show": "No-Show Socks"
        },
        filterLabels: {
          all: "All products",
          sport: "Sport Socks",
          daily: "Everyday Socks",
          crew: "Crew Socks",
          "no-show": "No-Show Socks"
        },
        sorts: {
          recommended: "Recommended",
          "price-asc": "Price low to high",
          "price-desc": "Price high to low",
          newest: "Newest arrivals"
        },
        common: {
          home: "Home",
          socksHome: "Socks",
          backToStorefront: "Back to storefront",
          orderNumber: "Order number",
          items: "Items",
          delivery: "Delivery",
          estimatedDelivery: "Estimated delivery",
          subtotal: "Subtotal",
          savings: "Savings",
          shipping: "Shipping",
          estimatedTotal: "Estimated total",
          itemCount: ({ count }) => `${count} ${count === 1 ? "item" : "items"}`
        },
        rating: {
          reviewCount: ({ count }) => `${count.toLocaleString("en-US")} reviews`,
          topRated: "Top rated"
        },
        commerce: {
          shippingFree: "FREE delivery",
          stockIn: "In stock",
          stockLow: ({ count }) => `Only ${count} left in stock`,
          recentlyBought: ({ amount }) => `${amount} bought in past month`,
          deliveryEstimate: ({ label }) => `Get it by ${label}`,
          addItemsDelivery: "Add items to see delivery timing",
          earliestDelivery: ({ label }) => `Earliest delivery: ${label}`,
          trustCopy: "Secure checkout for this demo storefront"
        },
        cart: {
          label: "Cart",
          openAria: "Open cart",
          detailOpenAria: "Open detail cart",
          close: "Close",
          closeAria: "Close cart",
          detailsTitle: "Cart details",
          clear: "Clear cart",
          empty: "Your cart is still empty",
          footerCopy: "Keep browsing and the drawer will stay synced with the current anonymous cart.",
          summary: ({ count }) => `Cart ${count} items`,
          drawerMeta: ({ count }) => `${count} items in cart`,
          orderComplete: "Demo order completed",
          addToCart: "Add to cart",
          addedToCart: "Added to cart",
          selectedSizes: ({ items, count }) => `Selected ${items} (+${count})`,
          selectedSizesSummary: ({ count }) => `Selected (+${count})`,
          outOfStock: "Out of stock",
          removeSelected: "Remove",
          removeSelectedAria: "Remove selected sizes",
          removeDialogTitle: "Choose a size to remove",
          removeDialogCopy: "Choose a size already in your cart, then set how many units to remove.",
          removeDialogDecrease: "Decrease removal quantity",
          removeDialogIncrease: "Increase removal quantity",
          removeDialogCancel: "Cancel",
          removeDialogConfirm: "Confirm removal",
          viewItem: "View product",
          itemFallback: "Selected item",
          size: ({ size }) => `Size ${size}`,
          increase: ({ title }) => `Increase quantity for ${title}`,
          decrease: ({ title }) => `Decrease quantity for ${title}`,
          remove: ({ title }) => `Remove ${title}`,
          checkout: "Proceed to checkout",
          continueShopping: "Continue shopping",
          viewOrderPage: "View order page",
          confirmationEyebrow: "Demo Checkout",
          confirmationTitle: "Order confirmed",
          confirmationCopy: "Your demo order is placed. The cart has been cleared and you can continue browsing the storefront."
        },
        listing: {
          resultCount: ({ count }) => `${count} products`,
          viewDetails: "View details",
          empty: "No products are available in this category yet",
          loadFailure: "Products failed to load. Please try again later.",
          recommendedTag: "Recommended"
        },
        detail: {
          pageSeries: "Product Detail",
          loadingTitle: "Loading product",
          loadingCopy: "Preparing the selected product view.",
          sourceBack: ({ label }) => `Back to results for ${label}`,
          currentSort: ({ label }) => `Current sort: ${label}`,
          continueEyebrow: "Continue Browsing",
          continueTitle: "Explore nearby products",
          recommendedEyebrow: "Recommended",
          recommendedTitle: "You may also like",
          emptyTitle: "Product not found",
          emptyCopy: "We couldn't find the selected demo product.",
          noRecommendations: "No recommendations are available right now.",
          navNoItemTitle: "No item",
          navNoItemMeta: "No more products in this view",
          reviewsEyebrow: "Real feedback",
          reviewsTitle: "Customer reviews",
          reviewsEmpty: "No reviews yet. Be the first to share your experience.",
          reviewsCount: ({ count }) => `${count} ${count === 1 ? "review" : "reviews"}`,
          reviewsSummary: ({ rating }) => `${rating} / 5`,
          reviewSort: "Review sort",
          reviewSortNewest: "Newest",
          reviewSortHigh: "Highest rating",
          reviewSortLow: "Lowest rating",
          reviewFilter: "Filter rating",
          reviewFilterAll: "All ratings",
          reviewAuthor: "Name",
          reviewRating: "Rating",
          reviewBody: "Review",
          reviewSubmit: "Submit review",
          reviewSubmitting: "Submitting...",
          reviewError: "Review submission failed. Check name, rating, and content.",
          reviewPending: "Review submitted and awaiting moderation.",
          reviewPublished: "Review published.",
          verifiedPurchase: "Verified Purchase",
          helpful: ({ count }) => `Helpful ${count}`,
          helpfulSubmitting: "Saving...",
          saveProduct: "Save for later",
          savedProduct: "Saved",
          savedProductsCount: ({ count }) => `${count}`,
          questionsEyebrow: "Product Q&A",
          questionsTitle: "Customer questions",
          questionsCount: ({ count }) => `${count} ${count === 1 ? "question" : "questions"}`,
          questionsEmpty: "No questions yet. Be the first to ask.",
          questionAuthor: "Name",
          questionBody: "Question",
          questionSubmit: "Submit question",
          questionSubmitting: "Submitting...",
          questionPendingAnswer: "Waiting for answer",
          questionError: "Question submission failed. Check name and question."
        },
        wishlist: {
          eyebrow: "Saved list",
          title: "Wishlist",
          copy: "Manage saved socks and continue shopping later.",
          empty: "No saved products yet",
          browse: "Browse socks",
          viewDetail: "View detail",
          addCart: "Add to cart",
          remove: "Remove"
        },
        recent: {
          eyebrow: "Browsing history",
          title: "Browsing history",
          copy: "Continue with socks you viewed recently.",
          empty: "No browsing history yet",
          clear: "Clear history",
          remove: "Remove",
          viewDetail: "View detail",
          addCart: "Add to cart"
        },
        checkout: {
          heroEyebrow: "Secure Checkout",
          heroTitle: "Review your order",
          heroCopy: "Enter delivery details and create a persisted demo order from the live cart.",
          empty: "Your cart is empty. Return to the storefront first.",
          name: "Name",
          contact: "Contact",
          address: "Address",
          city: "City",
          region: "State / Region",
          postalCode: "Postal code",
          note: "Delivery note",
          shippingMethod: "Shipping method",
          standardShipping: "Standard delivery · free",
          expressShipping: "Express delivery · 楼12",
          submitOrder: "Place order",
          validationError: "Complete the shipping information before placing the order.",
          submitError: "Order submission failed. Please try again."
        },
        payment: {
          heroEyebrow: "Secure Payment",
          heroTitle: "Pay your order",
          heroCopy: "Choose a demo payment method. The backend records each attempt and syncs the order status.",
          method: "Payment method",
          card: "Card",
          paypal: "PayPal",
          giftCard: "Gift card",
          payNow: "Pay now",
          retry: "Retry payment",
          failDemo: "Simulate failure",
          attempts: "Payment attempts",
          attemptEmpty: "No payment attempts yet",
          succeeded: "Payment succeeded",
          failed: "Payment failed, please try again.",
          unavailable: "This order cannot be paid.",
          backToOrder: "Back to order"
        },
        order: {
          heroEyebrow: "Demo Order",
          heroTitle: "Order confirmed",
          heroCopy: "Your demo storefront order has been recorded for this browser session.",
          summaryEyebrow: "Order Snapshot",
          summaryTitle: "Order summary",
          continueEyebrow: "Continue Shopping",
          continueTitle: "You may also like",
          sourceTitle: "Go back to your last results",
          defaultSourceTitle: "Continue shopping in storefront",
          emptyTitle: "No recent demo order found",
          emptyCopy: "Complete a demo checkout from the storefront first.",
          backToStorefront: "Back to storefront",
          payDemo: "Simulate payment",
          cancelDemo: "Cancel order",
          processDemo: "Simulate processing",
          shipDemo: "Simulate shipping",
          deliverDemo: "Simulate delivery"
        },
        reorder: {
          button: "Buy again",
          partial: "Some items were skipped because of stock",
          empty: "No items are available to buy again"
        },
        returns: {
          request: "Request return",
          fromOrders: "Start from orders",
          viewHistory: "View return history",
          heroEyebrow: "After-sales",
          heroTitle: "Request after-sales service",
          heroCopy: "Choose order items, quantity, and reason to create a trackable return request.",
          historyEyebrow: "Return history",
          historyTitle: "Return progress",
          historyCopy: "Review return and exchange requests submitted by this account.",
          empty: "No return requests yet",
          signInRequired: "Please sign in to view or submit return requests.",
          orderNotEligible: "This order is not eligible for after-sales service yet.",
          type: "Return type",
          reason: "Reason",
          contact: "Contact",
          note: "Note",
          submit: "Submit return request",
          submitting: "Submitting...",
          returnNumber: "Return number",
          status: "Status",
          quantity: "Request quantity",
          availableQuantity: ({ count }) => `${count} available`,
          itemSummary: ({ count }) => `${count} items`,
          detail: "View detail",
          cancel: "Cancel request",
          types: {
            return_refund: "Return and refund",
            exchange: "Exchange",
            refund_only: "Refund only"
          },
          reasons: {
            size_issue: "Size issue",
            quality_issue: "Quality issue",
            wrong_item: "Wrong item",
            changed_mind: "Changed mind",
            other: "Other"
          },
          statuses: {
            submitted: "Submitted",
            reviewing: "In review",
            approved: "Approved",
            rejected: "Rejected",
            completed: "Completed",
            cancelled: "Cancelled"
          },
          errors: {
            itemsRequired: "Select at least one item",
            RETURN_ORDER_NOT_ELIGIBLE: "This order is not eligible for returns",
            RETURN_ITEM_NOT_FOUND: "Select a valid order item",
            RETURN_QUANTITY_INVALID: "Enter a valid return quantity",
            RETURN_QUANTITY_EXCEEDED: "Return quantity exceeds the available quantity",
            RETURN_REASON_REQUIRED: "Select a return reason",
            RETURN_TYPE_INVALID: "Select a return type",
            RETURN_CONTACT_REQUIRED: "Enter a contact"
          }
        }
      }
    };

    function normalizeLocale(localeValue) {
      return Object.values(LOCALE_KEY).includes(localeValue) ? localeValue : LOCALE_KEY.ZH_CN;
    }

    function readStoredLocale() {
      return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    }

    function readRequestedLocale() {
      const requestedLocale = getSearchParams().get("locale");
      return requestedLocale ? normalizeLocale(requestedLocale) : null;
    }

    function saveLocale(localeValue) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(localeValue));
    }

    function t(key, params = {}) {
      const segments = key.split(".");
      const resolveValue = (localeValue) => {
        return segments.reduce((currentValue, segment) => {
          return currentValue && typeof currentValue === "object" ? currentValue[segment] : undefined;
        }, translations[localeValue]);
      };
      const resolvedValue = resolveValue(activeLocale) ?? resolveValue(LOCALE_KEY.ZH_CN);

      if (typeof resolvedValue === "function") {
        return resolvedValue(params);
      }

      return resolvedValue ?? key;
    }

    function formatShortDeliveryLabel(date) {
      if (activeLocale === LOCALE_KEY.EN_US) {
        return new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric"
        }).format(date);
      }

      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return `${date.getMonth() + 1}月${date.getDate()}日${weekdays[date.getDay()]}`;
    }

    function getLocalizedShippingLabel(label) {
      return label === "FREE delivery" ? t("commerce.shippingFree") : label;
    }

    function getLocalizedDeliveryEstimate(deliveryEstimate) {
      const parsedDelivery = parseDeliveryEstimate(deliveryEstimate);

      if (!parsedDelivery) {
        return deliveryEstimate;
      }

      return t("commerce.deliveryEstimate", {
        label: formatShortDeliveryLabel(parsedDelivery.date)
      });
    }

    function getLocalizedStockLabel(stockLabel) {
      if (stockLabel === "In stock") {
        return t("commerce.stockIn");
      }

      const lowStockMatch = /^Only (\d+) left in stock$/.exec(stockLabel);
      if (lowStockMatch) {
        return t("commerce.stockLow", { count: Number(lowStockMatch[1]) });
      }

      return stockLabel;
    }

    function getLocalizedRecentlyBoughtLabel(recentlyBoughtLabel) {
      const boughtMatch = /^(.+) bought in past month$/.exec(recentlyBoughtLabel);

      if (boughtMatch) {
        return t("commerce.recentlyBought", { amount: boughtMatch[1] });
      }

      return recentlyBoughtLabel;
    }

    function getLocalizedProduct(product) {
      if (!product) {
        return null;
      }

      return {
        ...product,
        title: product.title,
        description: product.description,
        categoryLabel: getFilterLabel(product.categoryKey) || product.categoryLabel,
        shippingLabel: getLocalizedShippingLabel(product.shippingLabel),
        deliveryEstimate: getLocalizedDeliveryEstimate(product.deliveryEstimate),
        stockLabel: getLocalizedStockLabel(product.stockLabel),
        recentlyBoughtLabel: getLocalizedRecentlyBoughtLabel(product.recentlyBoughtLabel)
      };
    }

    function getProductVariants(product) {
      if (Array.isArray(product?.variants) && product.variants.length) {
        return product.variants;
      }

      return Array.isArray(product?.sizes)
        ? product.sizes.map((size) => ({
          skuId: `${product.id}-${size}`,
          size,
          stockQuantity: Number.isInteger(product.stockQuantity) ? product.stockQuantity : null,
          lowStockThreshold: 5,
          isAvailable: true
        }))
        : [];
    }

    function getDefaultSizeForProduct(product) {
      const variants = getProductVariants(product);
      return variants.find(isVariantAvailable)?.size || variants[0]?.size || "";
    }

    function findVariantForSize(product, size) {
      return getProductVariants(product).find((variant) => variant.size === size) || null;
    }

    function isVariantAvailable(variant) {
      if (!variant || variant.isAvailable === false) {
        return false;
      }

      return Number.isInteger(variant.stockQuantity)
        ? variant.stockQuantity > 0
        : true;
    }

    function isVariantLowStock(variant) {
      return isVariantAvailable(variant)
        && Number.isInteger(variant.stockQuantity)
        && Number.isInteger(variant.lowStockThreshold)
        && variant.stockQuantity <= variant.lowStockThreshold;
    }

    function getVariantStockText(variant) {
      if (!variant || !isVariantAvailable(variant)) {
        return activeLocale === LOCALE_KEY.EN_US ? "Sold out" : "售罄";
      }

      if (isVariantLowStock(variant)) {
        return activeLocale === LOCALE_KEY.EN_US
          ? `Only ${variant.stockQuantity} left for size ${variant.size}`
          : `${variant.size} 码仅剩 ${variant.stockQuantity} 件`;
      }

      return activeLocale === LOCALE_KEY.EN_US ? "In stock" : "现货充足";
    }

    function getPrimaryStockVariant(product) {
      const variants = getProductVariants(product);
      return variants.find(isVariantLowStock)
        || variants.find((variant) => !isVariantAvailable(variant))
        || variants.find(isVariantAvailable)
        || variants[0]
        || null;
    }

    function createSockIllustration(product) {
      const patternMarkup = {
        minimal: `
          <path d="M84 46h52" stroke="${product.visualAccent}" stroke-width="5" stroke-linecap="round" opacity="0.6" />
          <path d="M86 60h48" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.4" />
        `,
        sport: `
          <path d="M77 58c16 6 31 7 50 2" stroke="${product.visualAccent}" stroke-width="7" stroke-linecap="round" opacity="0.85" />
          <path d="M87 82c11 5 28 5 39 0" stroke="${product.visualAccent}" stroke-width="6" stroke-linecap="round" opacity="0.55" />
        `,
        soft: `
          <circle cx="101" cy="80" r="5" fill="${product.visualAccent}" opacity="0.45" />
          <circle cx="117" cy="92" r="4" fill="${product.visualAccent}" opacity="0.32" />
          <circle cx="129" cy="76" r="3.5" fill="${product.visualAccent}" opacity="0.25" />
        `,
        mesh: `
          <path d="M82 58l45 50" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.45" />
          <path d="M128 56l-30 42" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.4" />
          <path d="M79 82h52" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.35" />
        `,
        rib: `
          <path d="M92 44v48" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.45" />
          <path d="M106 42v51" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.5" />
          <path d="M120 44v47" stroke="${product.visualAccent}" stroke-width="4" stroke-linecap="round" opacity="0.45" />
        `,
        light: `
          <path d="M82 90c16-8 32-8 48 0" stroke="${product.visualAccent}" stroke-width="5" stroke-linecap="round" opacity="0.4" />
          <path d="M92 59h30" stroke="${product.visualAccent}" stroke-width="3.5" stroke-linecap="round" opacity="0.35" />
        `
      }[product.visualPattern];

      return `
        <svg class="product-card__illustration" viewBox="0 0 220 220" aria-hidden="true" role="presentation">
          <defs>
            <radialGradient id="halo-${product.id}" cx="50%" cy="46%" r="54%">
              <stop offset="0%" stop-color="rgba(255,255,255,0.98)" />
              <stop offset="100%" stop-color="rgba(215,215,215,0.2)" />
            </radialGradient>
            <linearGradient id="sock-${product.id}" x1="50%" y1="20%" x2="50%" y2="100%">
              <stop offset="0%" stop-color="${product.visualTone}" />
              <stop offset="100%" stop-color="${product.visualShadow}" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="112" rx="78" ry="70" fill="url(#halo-${product.id})" />
          <ellipse cx="128" cy="184" rx="48" ry="12" fill="rgba(0, 0, 0, 0.12)" />
          <path d="M86 34h54c6 0 11 5 11 11v61c0 20 10 40 27 52 9 6 13 17 9 28-4 11-15 19-27 19h-38c-15 0-29-8-36-21l-17-29c-4-7-5-15-2-23l10-25c3-7 4-14 4-22V45c0-6 5-11 11-11Z" fill="url(#sock-${product.id})" />
          <path d="M86 49h54" stroke="rgba(255,255,255,0.35)" stroke-width="7" stroke-linecap="round" />
          <path d="M78 137c10 7 20 10 32 10h45c9 0 17 5 20 13" stroke="rgba(255,255,255,0.22)" stroke-width="8" stroke-linecap="round" />
          ${patternMarkup}
          <path d="M87 35h52v20H87z" fill="rgba(255,255,255,0.16)" />
          <path d="M81 103c4 4 10 6 16 6" stroke="rgba(0,0,0,0.12)" stroke-width="4" stroke-linecap="round" />
        </svg>
      `;
    }

    function formatRatingValue(ratingValue) {
      return Number(ratingValue).toFixed(1);
    }

    function formatReviewCount(reviewCount) {
      return t("rating.reviewCount", { count: reviewCount });
    }

    function formatCurrency(amount) {
      return `¥${amount}`;
    }

    function formatSavingsValue(amount) {
      if (amount <= 0) {
        return "¥0";
      }

      return `-¥${amount}`;
    }

    function parseDeliveryEstimate(deliveryEstimate) {
      const match = /^Get it by ([A-Za-z]+), ([A-Za-z]+) (\d{1,2})$/.exec(deliveryEstimate);
      if (!match) {
        return null;
      }

      const [, weekdayLabel, monthLabel, dayLabel] = match;
      const parsedDate = new Date(`${monthLabel} ${dayLabel}, 2026 12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return {
        date: parsedDate,
        weekdayLabel
      };
    }

    function formatAbsoluteDeliveryDate(date) {
      return new Intl.DateTimeFormat(activeLocale === LOCALE_KEY.EN_US ? "en-US" : "zh-CN", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(date);
    }

    function createOrderNumber() {
      orderSequence += 1;
      return `SOCK-${ORDER_DATE_STAMP}-${String(orderSequence).padStart(3, "0")}`;
    }

    function getSearchParams() {
      return new URLSearchParams(window.location.search);
    }

    function normalizeQueryValue(queryValue) {
      return typeof queryValue === "string" ? queryValue.trim() : "";
    }

    function isValidFilter(filterValue) {
      return Object.values(FILTER_KEY).includes(filterValue);
    }

    function isValidSort(sortValue) {
      return Object.values(SORT_KEY).includes(sortValue);
    }

    function getCurrentView() {
      const params = getSearchParams();
      const view = params.get("view");

      if (view === DETAIL_VIEW_KEY) {
        return DETAIL_VIEW_KEY;
      }

      if (view === CHECKOUT_VIEW_KEY) {
        return CHECKOUT_VIEW_KEY;
      }

      if (view === PAYMENT_VIEW_KEY) {
        return PAYMENT_VIEW_KEY;
      }

      if (view === ORDER_VIEW_KEY) {
        return ORDER_VIEW_KEY;
      }

      if (view === WISHLIST_VIEW_KEY) {
        return WISHLIST_VIEW_KEY;
      }

      if (view === RECENT_VIEW_KEY) {
        return RECENT_VIEW_KEY;
      }

      if (view === AUTH_VIEW_KEY) {
        return AUTH_VIEW_KEY;
      }

      if (view === ADDRESSES_VIEW_KEY) {
        return ADDRESSES_VIEW_KEY;
      }

      if (view === ORDERS_VIEW_KEY) {
        return ORDERS_VIEW_KEY;
      }

      if (view === SUPPORT_VIEW_KEY) {
        return SUPPORT_VIEW_KEY;
      }

      if (view === SUPPORT_TICKETS_VIEW_KEY) {
        return SUPPORT_TICKETS_VIEW_KEY;
      }

      if (view === ADMIN_VIEW_KEY) {
        return ADMIN_VIEW_KEY;
      }

      if (view === RETURN_VIEW_KEY) {
        return RETURN_VIEW_KEY;
      }

      if (view === RETURNS_VIEW_KEY) {
        return RETURNS_VIEW_KEY;
      }

      return "storefront";
    }

    function getRequestedFilter() {
      const params = getSearchParams();
      const filterValue = params.get("filter");
      return isValidFilter(filterValue) ? filterValue : FILTER_KEY.ALL;
    }

    function getRequestedSort() {
      const params = getSearchParams();
      const sortValue = params.get("sort");
      return isValidSort(sortValue) ? sortValue : SORT_KEY.RECOMMENDED;
    }

    function getRequestedQuery() {
      return normalizeQueryValue(getSearchParams().get("q"));
    }

    function getRequestedSupportSection() {
      const section = getSearchParams().get("section");
      return SUPPORT_SECTION_IDS.includes(section) ? section : SUPPORT_DEFAULT_SECTION;
    }

    function createSupportPath(sectionId) {
      return `${STOREFRONT_PATH}?view=${SUPPORT_VIEW_KEY}&section=${encodeURIComponent(sectionId)}`;
    }

    function getRequestedNumberParam(name) {
      const value = getSearchParams().get(name);
      if (value == null || value === "") {
        return "";
      }

      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? String(parsed) : "";
    }

    function getRequestedSize() {
      return String(getSearchParams().get("size") || "").trim();
    }

    function getRequestedStock() {
      const stockValue = getSearchParams().get("stock");
      return validStockFilters.has(stockValue) ? stockValue : STOCK_FILTER_KEY.ALL;
    }

    function getRequestedPage() {
      const parsed = Number.parseInt(getSearchParams().get("page"), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }

    function getRequestedPageSize() {
      const parsed = Number.parseInt(getSearchParams().get("pageSize"), 10);
      return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 24) : DEFAULT_PAGE_SIZE;
    }

    function getRequestedDetailProductId() {
      return getSearchParams().get("id") || "";
    }

    function appendStorefrontQueryParams(params, options = {}) {
      if (options.filter && options.filter !== FILTER_KEY.ALL) {
        params.set("filter", options.filter);
      }

      if (options.sort && options.sort !== SORT_KEY.RECOMMENDED) {
        params.set("sort", options.sort);
      }

      if (options.q) {
        params.set("q", options.q);
      }

      return params;
    }

    function getStorefrontHref(
      filterValue = FILTER_KEY.ALL,
      sortValue = SORT_KEY.RECOMMENDED,
      queryValue = ""
    ) {
      const params = appendStorefrontQueryParams(new URLSearchParams(), {
        filter: filterValue,
        sort: sortValue,
        q: normalizeQueryValue(queryValue)
      });

      const search = params.toString();
      return search ? `${STOREFRONT_PATH}?${search}` : STOREFRONT_PATH;
    }

    function appendAdvancedFilterParams(params) {
      params.set("page", String(activePage));
      params.set("pageSize", String(activePageSize));

      if (activeMinPrice) {
        params.set("minPrice", activeMinPrice);
      }

      if (activeMaxPrice) {
        params.set("maxPrice", activeMaxPrice);
      }

      if (activeSize) {
        params.set("size", activeSize);
      }

      if (activeStock !== STOCK_FILTER_KEY.ALL) {
        params.set("stock", activeStock);
      }

      if (activeRatingMin) {
        params.set("ratingMin", activeRatingMin);
      }

      return params;
    }

    function getStorefrontHrefWithAdvancedFilters(overrides = {}) {
      const nextState = {
        q: activeQuery,
        minPrice: activeMinPrice,
        maxPrice: activeMaxPrice,
        size: activeSize,
        stock: activeStock,
        ratingMin: activeRatingMin,
        pageSize: activePageSize,
        ...overrides
      };
      const params = appendStorefrontQueryParams(new URLSearchParams(), {
        filter: activeFilter,
        sort: activeSort,
        q: normalizeQueryValue(nextState.q)
      });

      if (nextState.minPrice) params.set("minPrice", nextState.minPrice);
      if (nextState.maxPrice) params.set("maxPrice", nextState.maxPrice);
      if (nextState.size) params.set("size", nextState.size);
      if (nextState.stock && nextState.stock !== STOCK_FILTER_KEY.ALL) params.set("stock", nextState.stock);
      if (nextState.ratingMin) params.set("ratingMin", nextState.ratingMin);
      if (Number(nextState.pageSize) !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(nextState.pageSize));

      const search = params.toString();
      return search ? `${STOREFRONT_PATH}?${search}` : STOREFRONT_PATH;
    }

    function appendAdvancedContextParams(params, options = {}) {
      const minPrice = options.minPrice ?? activeMinPrice;
      const maxPrice = options.maxPrice ?? activeMaxPrice;
      const size = options.size ?? activeSize;
      const stock = options.stock ?? activeStock;
      const ratingMin = options.ratingMin ?? activeRatingMin;
      const pageSize = options.pageSize ?? activePageSize;

      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (size) params.set("size", size);
      if (stock && stock !== STOCK_FILTER_KEY.ALL) params.set("stock", stock);
      if (ratingMin) params.set("ratingMin", ratingMin);
      if (Number(pageSize) !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));

      return params;
    }

    async function navigateToAdvancedFilterState(overrides = {}) {
      window.history.pushState(null, "", getStorefrontHrefWithAdvancedFilters(overrides));
      syncActiveStateFromUrl();
      activePage = 1;
      try {
        await renderProducts();
      } catch (error) {
        showLoadFailureState();
      }
    }

    function getFilterLabel(filterValue) {
      return t(`filterLabels.${filterValue}`) || t("filterLabels.all");
    }

    function getSortLabel(sortValue) {
      return t(`sorts.${sortValue}`) || t("sorts.recommended");
    }

    function hasStorefrontSourceContext() {
      return navigationContext.filter !== FILTER_KEY.ALL
        || navigationContext.sort !== SORT_KEY.RECOMMENDED
        || normalizeQueryValue(navigationContext.query) !== "";
    }

    function renderShellCopy() {
      siteUtilityPromo.textContent = t("shell.promo");
      siteUtilityService.textContent = t("shell.service");
      siteHelpLink.textContent = t("shell.help");
      siteHelpLink.href = createSupportPath("faq");
      siteReturnsLink.textContent = t("shell.returns");
      siteReturnsLink.href = createSupportPath("returns");
      siteWishlistLink.textContent = t("wishlist.title");
      siteWishlistLink.href = `${STOREFRONT_PATH}?view=${WISHLIST_VIEW_KEY}`;
      siteRecentLink.textContent = t("recent.title");
      siteRecentLink.href = `${STOREFRONT_PATH}?view=${RECENT_VIEW_KEY}`;
      siteBrandEyebrow.textContent = t("shell.brandEyebrow");
      siteBrandTitle.textContent = t("storefront.title");
      siteDepartmentLabel.textContent = t("shell.departmentLabel");
      siteDepartmentValue.textContent = t("shell.departmentValue");
      siteSearchLabel.textContent = t("shell.searchLabel");
      siteSearchInput.placeholder = t("shell.searchPlaceholder");
      siteSearchInput.value = activeQuery;
      siteSearchSubmit.textContent = t("shell.searchButton");
      siteAccountLabel.textContent = t("shell.accountLabel");
      siteAccountValue.textContent = t("shell.accountValue");
      siteOrdersLabel.textContent = t("shell.ordersLabel");
      siteOrdersValue.textContent = t("shell.ordersValue");
      siteFooterEyebrow.textContent = t("footer.eyebrow");
      siteFooterTitle.textContent = t("footer.title");
      siteFooterCopy.textContent = t("footer.copy");
      siteFooterHelpTitle.textContent = t("footer.helpTitle");
      siteFooterDeliveryTitle.textContent = t("footer.deliveryTitle");
      siteFooterSupportTitle.textContent = t("footer.supportTitle");
      siteFooterLocaleNote.textContent = t("footer.localeNote");
      siteFooterCopyright.textContent = t("footer.copyright");

      siteNavFilterLinks.forEach((link) => {
        const filterValue = link.dataset.siteNavFilter;
        link.textContent = t(`shellNav.${filterValue}`);
        link.href = getStorefrontHref(filterValue, activeSort, activeQuery);
        link.classList.toggle("is-active", activeFilter === filterValue);
      });

      if (siteNavQueryLinks[0]) {
        siteNavQueryLinks[0].textContent = t("shellNav.quickDry");
        siteNavQueryLinks[0].href = getStorefrontHref(activeFilter, activeSort, "速干");
      }

      if (siteNavQueryLinks[1]) {
        siteNavQueryLinks[1].textContent = t("shellNav.noShowSearch");
        siteNavQueryLinks[1].href = getStorefrontHref(activeFilter, activeSort, activeLocale === LOCALE_KEY.EN_US ? "no-show" : "船袜");
      }

      storefrontEntryFilterLinks.forEach((link) => {
        const filterValue = link.dataset.entryFilter;
        link.href = getStorefrontHref(filterValue, activeSort, activeQuery);
      });

      storefrontEntryQueryLinks.forEach((link) => {
        const queryValue = link.dataset.entryQuery || "";
        const localizedQuery = activeLocale === LOCALE_KEY.EN_US
          ? (queryValue === "中筒" ? "crew" : "no-show")
          : queryValue;
        link.href = getStorefrontHref(activeFilter, activeSort, localizedQuery);
      });

      const entryCopyMap = {
        sportEyebrow: document.querySelector("[data-entry-sport-eyebrow]"),
        sportTitle: document.querySelector("[data-entry-sport-title]"),
        sportCopy: document.querySelector("[data-entry-sport-copy]"),
        sportCta: document.querySelector("[data-entry-sport-cta]"),
        dailyEyebrow: document.querySelector("[data-entry-daily-eyebrow]"),
        dailyTitle: document.querySelector("[data-entry-daily-title]"),
        dailyCopy: document.querySelector("[data-entry-daily-copy]"),
        dailyCta: document.querySelector("[data-entry-daily-cta]"),
        crewEyebrow: document.querySelector("[data-entry-crew-eyebrow]"),
        crewTitle: document.querySelector("[data-entry-crew-title]"),
        crewCopy: document.querySelector("[data-entry-crew-copy]"),
        crewCta: document.querySelector("[data-entry-crew-cta]"),
        noShowEyebrow: document.querySelector("[data-entry-noshow-eyebrow]"),
        noShowTitle: document.querySelector("[data-entry-noshow-title]"),
        noShowCopy: document.querySelector("[data-entry-noshow-copy]"),
        noShowCta: document.querySelector("[data-entry-noshow-cta]")
      };

      Object.entries(entryCopyMap).forEach(([key, node]) => {
        if (node) {
          node.textContent = t(`entry.${key}`);
        }
      });
    }

    function renderLocaleControls() {
      localeButtons.forEach((button) => {
        const isActive = button.dataset.localeOption === activeLocale;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function renderStaticCopy() {
      document.documentElement.lang = activeLocale;
      document.title = t("storefront.title");
      renderShellCopy();
      storefrontTitle.textContent = t("storefront.title");
      storefrontDescription.textContent = t("storefront.description");
      toolbarFilterLabel.textContent = t("toolbar.filterLabel");
      toolbarSortLabel.textContent = t("toolbar.sortLabel");
      cartLabel.textContent = t("cart.label");
      detailCartLabel.textContent = t("cart.label");
      detailPageSeries.textContent = t("detail.pageSeries");
      detailPageTitle.textContent = t("detail.loadingTitle");
      detailPageDescription.textContent = t("detail.loadingCopy");
      detailBackLink.textContent = t("common.backToStorefront");
      wishlistHeroEyebrow.textContent = t("wishlist.eyebrow");
      wishlistTitle.textContent = t("wishlist.title");
      wishlistCopy.textContent = t("wishlist.copy");
      recentHeroEyebrow.textContent = t("recent.eyebrow");
      recentTitle.textContent = t("recent.title");
      recentCopy.textContent = t("recent.copy");
      checkoutHeroEyebrow.textContent = t("checkout.heroEyebrow");
      checkoutTitle.textContent = t("checkout.heroTitle");
      checkoutCopy.textContent = t("checkout.heroCopy");
      returnHeroEyebrow.textContent = t("returns.heroEyebrow");
      returnTitle.textContent = t("returns.heroTitle");
      returnCopy.textContent = t("returns.heroCopy");
      returnsHeroEyebrow.textContent = t("returns.historyEyebrow");
      returnsTitle.textContent = t("returns.historyTitle");
      returnsCopy.textContent = t("returns.historyCopy");
      supportTitle.textContent = t("support.title");
      supportCopy.textContent = t("support.copy");
      supportBreadcrumbCurrent.textContent = t("support.breadcrumb");
      cartDrawerTitle.textContent = t("cart.detailsTitle");
      cartDrawerEyebrow.textContent = activeLocale === LOCALE_KEY.EN_US ? "Cart State" : "购物车状态";
      cartCloseButton.textContent = t("cart.close");
      cartCloseButton.setAttribute("aria-label", t("cart.closeAria"));
      cartToggleButton.setAttribute("aria-label", t("cart.openAria"));
      detailCartToggleButton.setAttribute("aria-label", t("cart.detailOpenAria"));
      clearCartButton.textContent = t("cart.clear");
      orderHeroEyebrow.textContent = t("order.heroEyebrow");
      orderPageTitle.textContent = t("order.heroTitle");
      orderPageCopy.textContent = t("order.heroCopy");
      cartSubtotalLabel.textContent = t("common.subtotal");
      cartSavingsLabel.textContent = t("common.savings");
      cartShippingLabel.textContent = t("common.shipping");
      cartTotalLabel.textContent = t("common.estimatedTotal");
      cartFooterCopy.textContent = t("cart.footerCopy");
      cartCheckoutButton.textContent = t("cart.checkout");

      Array.from(document.querySelectorAll("[data-filter]")).forEach((button) => {
        button.textContent = t(`filters.${button.dataset.filter}`);
      });

      Array.from(document.querySelectorAll("[data-sort]")).forEach((button) => {
        button.textContent = t(`sorts.${button.dataset.sort}`);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    async function fetchTrustCenter() {
      const response = await fetch(`/api/trust-center?locale=${encodeURIComponent(activeLocale)}`);
      if (!response.ok) {
        throw new Error("Trust center content failed to load");
      }
      trustCenterState = await response.json();
      renderSupportView();
    }

    function renderSupportFaq(isVisible) {
      supportFaq.hidden = !isVisible;
      if (!isVisible) {
        supportFaq.innerHTML = "";
        return;
      }

      if (openFaqId === null && trustCenterState.faqs.length > 0) {
        openFaqId = trustCenterState.faqs[0].id;
      }

      supportFaq.innerHTML = trustCenterState.faqs.map((faq) => {
        const isOpen = faq.id === openFaqId;
        return `
          <section class="support-faq__item">
            <button class="support-faq__question" type="button" data-support-faq-question="${escapeHtml(faq.id)}" aria-expanded="${isOpen}">
              <span>${escapeHtml(faq.question)}</span>
              <span aria-hidden="true">${isOpen ? "-" : "+"}</span>
            </button>
            <p class="support-faq__answer" ${isOpen ? "" : "hidden"}>${escapeHtml(faq.answer)}</p>
          </section>
        `;
      }).join("");
    }

    function renderSupportContact(isVisible) {
      supportContactForm.hidden = !isVisible;
      if (!isVisible) {
        supportTicket.hidden = true;
        return;
      }

      supportContactForm.innerHTML = `
        <label class="support-field">
          <span>${t("support.contactName")}</span>
          <input name="name" data-support-contact-field="name" autocomplete="name">
          <small data-support-contact-error="name"></small>
        </label>
        <label class="support-field">
          <span>${t("support.contactContact")}</span>
          <input name="contact" data-support-contact-field="contact" autocomplete="email">
          <small data-support-contact-error="contact"></small>
        </label>
        <label class="support-field">
          <span>${t("support.contactTopic")}</span>
          <select name="topic" data-support-contact-field="topic">
            ${trustCenterState.contactTopics.map((topic) => `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.label)}</option>`).join("")}
          </select>
          <small data-support-contact-error="topic"></small>
        </label>
        <label class="support-field">
          <span>${t("support.contactOrder")}</span>
          <input name="orderId" data-support-contact-field="orderId" autocomplete="off">
          <small data-support-contact-error="orderId"></small>
        </label>
        <label class="support-field support-field--wide">
          <span>${t("support.contactMessage")}</span>
          <textarea name="message" rows="5" data-support-contact-field="message"></textarea>
          <small data-support-contact-error="message"></small>
        </label>
        <div class="support-contact__error" data-support-contact-error role="alert"></div>
        <button class="support-contact__submit" type="submit" data-support-contact-submit>${t("support.submit")}</button>
        <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=${SUPPORT_TICKETS_VIEW_KEY}">
          ${activeLocale === LOCALE_KEY.EN_US ? "View my tickets" : "查看我的工单"}
        </a>
      `;
    }

    function clearSupportContactErrors() {
      supportContactForm.querySelectorAll("[data-support-contact-error]").forEach((node) => {
        node.textContent = "";
      });
    }

    function showSupportContactError(code) {
      const errorText = t(`support.errors.${code}`);
      const fieldMap = {
        SUPPORT_NAME_REQUIRED: "name",
        SUPPORT_CONTACT_REQUIRED: "contact",
        SUPPORT_TOPIC_REQUIRED: "topic",
        SUPPORT_TOPIC_INVALID: "topic",
        SUPPORT_MESSAGE_REQUIRED: "message",
        SUPPORT_MESSAGE_TOO_LONG: "message"
      };
      const fieldName = fieldMap[code];
      const fieldError = fieldName ? supportContactForm.querySelector(`[data-support-contact-error='${fieldName}']`) : null;
      if (fieldError) {
        fieldError.textContent = errorText;
      } else {
        const formError = supportContactForm.querySelector("[data-support-contact-error][role='alert']");
        formError.textContent = errorText;
      }
    }

    supportFaq.addEventListener("click", (event) => {
      const button = event.target.closest("[data-support-faq-question]");
      if (!button) return;

      const faqId = button.dataset.supportFaqQuestion;
      openFaqId = openFaqId === faqId ? "" : faqId;
      renderSupportFaq(true);
    });

    supportContactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearSupportContactErrors();
      const submitButton = supportContactForm.querySelector("[data-support-contact-submit]");
      const formData = new FormData(supportContactForm);
      submitButton.disabled = true;
      submitButton.textContent = t("support.submitting");

      try {
        const response = await fetch("/api/support/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name"),
            contact: formData.get("contact"),
            topic: formData.get("topic"),
            orderId: formData.get("orderId"),
            message: formData.get("message"),
            locale: activeLocale
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          showSupportContactError(payload.error?.code || "SUPPORT_MESSAGE_REQUIRED");
          return;
        }

        supportTicket.hidden = false;
        supportTicket.innerHTML = `
          <strong>${t("support.successTitle")}</strong>
          <p>${escapeHtml(payload.ticket.ticketNumber)}</p>
          <p>${t("support.responseTime")}</p>
          <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=${SUPPORT_TICKETS_VIEW_KEY}">
            ${activeLocale === LOCALE_KEY.EN_US ? "Track this ticket" : "追踪此工单"}
          </a>
        `;
        supportContactForm.reset();
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = t("support.submit");
      }
    });

    adminTabs.addEventListener("click", async (event) => {
      const tab = event.target.closest("[data-admin-tab]");
      if (!tab) return;

      activeAdminTab = tab.dataset.adminTab;
      await renderAdminPanel();
    });

    adminPanel.addEventListener("click", async (event) => {
      const productNew = event.target.closest("[data-admin-product-new]");
      if (productNew) {
        adminData.productDraft = createEmptyAdminProductDraft();
        adminData.productMode = "create";
        await renderAdminProducts();
        return;
      }

      const productEdit = event.target.closest("[data-admin-product-edit]");
      if (productEdit) {
        const row = productEdit.closest("[data-admin-product-row]");
        adminData.productDraft = await fetchAdminProduct(row.dataset.productId);
        adminData.productMode = "edit";
        await renderAdminProducts();
        return;
      }

      const skuGenerate = event.target.closest("[data-admin-sku-generate]");
      if (skuGenerate) {
        generateAdminSkuRowsFromTemplate(skuGenerate.closest("[data-admin-product-form]"));
        await renderAdminProducts();
        return;
      }

      const skuBulkApply = event.target.closest("[data-admin-sku-bulk-apply]");
      if (skuBulkApply) {
        applyAdminSkuBulkEdit(skuBulkApply.closest("[data-admin-product-form]"));
        await renderAdminProducts();
        return;
      }

      const productCancel = event.target.closest("[data-admin-product-cancel]");
      if (productCancel) {
        adminData.productDraft = null;
        adminData.productMode = "list";
        await renderAdminProducts();
        return;
      }

      const inventorySave = event.target.closest("[data-admin-inventory-save]");
      if (inventorySave) {
        const row = inventorySave.closest("[data-admin-inventory-row]");
        inventorySave.disabled = true;
        await patchAdminJson(`/api/admin/inventory/${encodeURIComponent(row.dataset.skuId)}`, {
          stockQuantity: Number(row.querySelector("[data-admin-stock-input]").value),
          lowStockThreshold: Number(row.querySelector("[data-admin-low-stock-input]").value),
          isAvailable: row.querySelector("[data-admin-available-input]").checked
        });
        await renderAdminInventory();
        return;
      }

      const orderOpen = event.target.closest("[data-admin-order-open]");
      if (orderOpen) {
        const row = orderOpen.closest("[data-admin-order-row]");
        await openAdminOrderDrawer(row.dataset.orderId, orderOpen);
        return;
      }

      const returnOpen = event.target.closest("[data-admin-return-open]");
      if (returnOpen) {
        const row = returnOpen.closest("[data-admin-return-row]");
        await openAdminReturnDrawer(row.dataset.returnId, returnOpen);
        return;
      }

      const orderAction = event.target.closest("[data-admin-order-action]");
      if (orderAction) {
        const row = orderAction.closest("[data-admin-order-row]");
        orderAction.disabled = true;
        await patchAdminJson(`/api/admin/orders/${encodeURIComponent(row.dataset.orderId)}/status`, {
          status: orderAction.dataset.adminOrderAction,
          locale: activeLocale
        });
        await renderAdminOrders();
        return;
      }

      const fulfillmentAction = event.target.closest("[data-admin-order-fulfillment]");
      if (fulfillmentAction) {
        const row = fulfillmentAction.closest("[data-admin-order-row]");
        fulfillmentAction.disabled = true;
        await adminAdvanceFulfillment(row.dataset.orderId, fulfillmentAction.dataset.nextFulfillmentStatus);
        await renderAdminOrders();
        return;
      }

      const refundAction = event.target.closest("[data-admin-refund-status]");
      if (refundAction) {
        refundAction.disabled = true;
        await adminAdvanceRefund(refundAction.dataset.refundId, refundAction.dataset.nextRefundStatus);
        await renderAdminOrders();
        return;
      }

      const marketingToggle = event.target.closest("[data-admin-marketing-toggle]");
      if (marketingToggle) {
        const row = marketingToggle.closest("[data-admin-marketing-row]");
        marketingToggle.disabled = true;
        await patchAdminJson(
          `/api/admin/marketing/${encodeURIComponent(row.dataset.marketingType)}/${encodeURIComponent(row.dataset.marketingId)}/status`,
          { status: row.dataset.marketingStatus === "active" ? "inactive" : "active" }
        );
        await renderAdminMarketing();
        return;
      }

      const paymentToggle = event.target.closest("[data-admin-payment-toggle]");
      if (paymentToggle) {
        const row = paymentToggle.closest("[data-admin-payment-method]");
        paymentToggle.disabled = true;
        await patchAdminJson(`/api/admin/payment-methods/${encodeURIComponent(row.dataset.methodId)}`, {
          status: row.dataset.status === "active" ? "inactive" : "active",
          locale: activeLocale
        });
        await renderAdminPayments();
      }
    });

    adminPanel.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-admin-product-form]");
      if (!form) return;

      event.preventDefault();
      const error = form.querySelector("[data-admin-product-error]");
      try {
        const draft = syncAdminDraftFromForm(form);
        await saveAdminProduct(draft, adminData.productMode);
        adminData.productDraft = null;
        adminData.productMode = "list";
        adminData.products = [];
        adminData.inventory = [];
        await renderAdminProducts();
      } catch (saveError) {
        error.textContent = saveError.message;
      }
    });

    adminPanel.addEventListener("change", async (event) => {
      const upload = event.target.closest("[data-admin-product-image-upload]");
      if (!upload) return;

      const file = upload.files?.[0];
      if (!file) return;

      const form = upload.closest("[data-admin-product-form]");
      const draft = syncAdminDraftFromForm(form);
      const error = form.querySelector("[data-admin-product-error]");
      try {
        const payload = await uploadAdminProductImage(draft.id, file);
        draft.gallery = [...(draft.gallery || []), payload.image];
        await renderAdminProducts();
      } catch (uploadError) {
        error.textContent = uploadError.message;
      }
    });

    adminOrderDrawerClose.addEventListener("click", closeAdminOrderDrawer);
    adminOrderBackdrop.addEventListener("click", closeAdminOrderDrawer);
    adminReturnDrawerClose.addEventListener("click", closeAdminReturnDrawer);
    adminReturnBackdrop.addEventListener("click", closeAdminReturnDrawer);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && adminOrderDrawer.dataset.open === "true") {
        closeAdminOrderDrawer();
      } else if (event.key === "Escape" && adminReturnDrawer.dataset.open === "true") {
        closeAdminReturnDrawer();
      }
    });

    adminOrderDrawer.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-admin-order-action-form]");
      if (!form) return;

      event.preventDefault();
      const action = form.dataset.adminOrderActionForm;
      const orderId = form.dataset.orderId;
      const error = form.querySelector("[data-admin-action-error]");
      const submitButton = form.querySelector("button[type='submit']");
      error.textContent = "";
      submitButton.disabled = true;

      try {
        let body;
        if (action === "ship") {
          body = {
            operationId: form.dataset.operationId,
            carrier: form.querySelector("[data-admin-carrier]").value,
            trackingNumber: form.querySelector("[data-admin-tracking-number]").value.trim(),
            note: form.querySelector("[data-admin-action-note]").value.trim(),
            locale: activeLocale
          };
        } else if (action === "cancel") {
          body = {
            operationId: form.dataset.operationId,
            reason: form.querySelector("[data-admin-cancel-reason]").value,
            note: form.querySelector("[data-admin-action-note]").value.trim(),
            locale: activeLocale
          };
        } else {
          const items = [...form.querySelectorAll("[data-admin-refund-row]")].map((row) => ({
            skuId: row.dataset.skuId,
            quantity: Number(row.querySelector("[data-admin-refund-quantity]").value),
            refundAmount: yuanInputToCents(row.querySelector("[data-admin-refund-amount]").value)
          })).filter((item) => item.quantity > 0 && item.refundAmount > 0);
          body = {
            operationId: form.dataset.operationId,
            reason: form.querySelector("[data-admin-refund-reason]").value,
            note: form.querySelector("[data-admin-action-note]").value.trim(),
            items,
            locale: activeLocale
          };
        }

        await postAdminOrderAction(orderId, action, body);
        await renderAdminOrders();
        await refreshAdminOrderDrawer(orderId);
      } catch (actionError) {
        error.textContent = actionError.message;
        submitButton.disabled = false;
      }
    });

    adminReturnDrawer.addEventListener("click", async (event) => {
      const cancel = event.target.closest("[data-admin-return-form-cancel]");
      if (cancel) {
        adminData.returnPendingAction = "";
        renderAdminReturnDrawer(adminData.returnDetail);
        return;
      }

      const actionButton = event.target.closest("[data-admin-return-action]");
      if (!actionButton) return;

      const action = actionButton.dataset.adminReturnAction;
      if (["approve", "reject"].includes(action)) {
        adminData.returnPendingAction = action;
        renderAdminReturnDrawer(adminData.returnDetail);
        adminReturnDrawer.querySelector("[data-admin-return-review-form] input:not([type='hidden']), [data-admin-return-review-form] select, [data-admin-return-review-form] textarea")?.focus();
        return;
      }

      const error = adminReturnDrawer.querySelector("[data-admin-return-error]");
      actionButton.disabled = true;
      try {
        await postAdminReturnAction(adminData.returnDetail.id, {
          operationId: createAdminOperationId("return"),
          action,
          reason: action === "start_review" ? "review_started" : "item_received",
          locale: activeLocale
        });
        adminData.returnPendingAction = "";
        await renderAdminReturns();
        await refreshAdminReturnDrawer(adminData.returnDetail.id);
      } catch (reviewError) {
        error.textContent = reviewError.message;
        actionButton.disabled = false;
      }
    });

    adminReturnDrawer.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-admin-return-review-form]");
      if (!form) return;

      event.preventDefault();
      const action = form.dataset.returnAction;
      const error = form.querySelector("[data-admin-return-error]");
      const submitButton = form.querySelector("[data-admin-return-confirm]");
      error.textContent = "";
      submitButton.disabled = true;

      const refundItems = [...form.querySelectorAll("[data-admin-return-refund-row]")].map((row) => ({
        skuId: row.dataset.skuId,
        quantity: Number(row.querySelector("[data-admin-return-refund-quantity]").value),
        refundAmount: yuanInputToCents(row.querySelector("[data-admin-return-refund-amount]").value)
      }));

      try {
        await postAdminReturnAction(form.dataset.returnId, {
          operationId: form.dataset.operationId,
          action,
          reason: form.querySelector("[data-admin-return-reason]").value,
          note: form.querySelector("[data-admin-return-note]").value.trim(),
          refundItems,
          locale: activeLocale
        });
        adminData.returnPendingAction = "";
        await renderAdminReturns();
        await refreshAdminReturnDrawer(form.dataset.returnId);
      } catch (reviewError) {
        error.textContent = reviewError.message;
        submitButton.disabled = false;
      }
    });

    function renderSupportView() {
      if (getCurrentView() !== SUPPORT_VIEW_KEY || trustCenterState.sections.length === 0) {
        return;
      }

      const activeSectionId = getRequestedSupportSection();
      const activeSection = trustCenterState.sections.find((section) => section.id === activeSectionId)
        || trustCenterState.sections.find((section) => section.id === SUPPORT_DEFAULT_SECTION)
        || trustCenterState.sections[0];

      supportTitle.textContent = t("support.title");
      supportCopy.textContent = t("support.copy");
      supportBreadcrumbCurrent.textContent = t("support.breadcrumb");
      supportNav.innerHTML = trustCenterState.sections.map((section) => {
        const isActive = section.id === activeSection.id;
        return `
          <a class="support-nav__button${isActive ? " is-active" : ""}"
            href="${createSupportPath(section.id)}"
            data-support-section="${escapeHtml(section.id)}"
            ${isActive ? "aria-current=\"page\"" : ""}>
            ${escapeHtml(section.title)}
          </a>
        `;
      }).join("");
      supportCurrentEyebrow.textContent = activeSection.eyebrow;
      supportCurrentTitle.textContent = activeSection.title;
      supportCurrentSummary.textContent = activeSection.summary;
      supportCurrentBullets.innerHTML = activeSection.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");

      renderSupportFaq(activeSection.id === "faq");
      renderSupportContact(activeSection.id === "contact");

      if (activeSection.id === "returns") {
        supportTicket.hidden = false;
        supportTicket.innerHTML = `
          <div class="return-actions">
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}?view=orders" data-support-return-orders-link>${t("returns.fromOrders")}</a>
            <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=returns" data-support-return-history-link>${t("returns.viewHistory")}</a>
          </div>
        `;
      }
    }

    async function fetchAdminJson(path) {
      const response = await fetch(path);
      if (!response.ok) {
        throw await createCartRequestError(response, "Admin request failed");
      }
      return response.json();
    }

    async function patchAdminJson(path, payload) {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Admin update failed");
      }
      return response.json();
    }

    async function requestAdminReviewJson(path, options = {}) {
      const headers = { ...(options.headers || {}), "x-demo-admin": "true" };
      const requestOptions = { method: options.method || "GET", headers };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        requestOptions.body = JSON.stringify(options.body);
      }
      const response = await fetch(path, requestOptions);
      if (!response.ok) {
        throw await createCartRequestError(response, "Review management request failed");
      }
      return response.json();
    }

    async function requestCustomerSupportJson(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      const requestOptions = { method: options.method || "GET", headers };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        requestOptions.body = JSON.stringify(options.body);
      }
      const response = await fetch(path, requestOptions);
      if (!response.ok) {
        throw await createCartRequestError(response, "Support ticket request failed");
      }
      return response.json();
    }

    function mountCustomerSupportTickets() {
      const supportModule = window.StorefrontCustomerSupport;
      if (!supportModule) return null;
      supportModule.mount({
        root: supportTicketsView,
        currentUser,
        locale: () => activeLocale,
        request: requestCustomerSupportJson,
        escapeHtml
      });
      supportModule.setUser(currentUser);
      return supportModule;
    }

    function createAdminOperationId(prefix) {
      const suffix = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `${prefix}-${suffix}`;
    }

    function mountAdminReviewManagement() {
      const reviewModule = window.StorefrontAdminReviews;
      if (!reviewModule) return null;
      reviewModule.mount({
        panel: adminPanel,
        drawer: adminReviewDrawer,
        drawerBody: adminReviewDrawerBody,
        drawerTitle: adminReviewDrawerTitle,
        drawerClose: adminReviewDrawerClose,
        backdrop: adminReviewBackdrop,
        locale: () => activeLocale,
        request: requestAdminReviewJson,
        createOperationId: createAdminOperationId,
        escapeHtml,
        onSummaryChange(summary) {
          adminData.reviewSummary = summary;
        }
      });
      return reviewModule;
    }

    function mountAdminSupportManagement() {
      const supportModule = window.StorefrontAdminSupport;
      if (!supportModule) return null;
      supportModule.mount({
        panel: adminPanel,
        drawer: adminTicketDrawer,
        drawerBody: adminTicketDrawerBody,
        drawerTitle: adminTicketDrawerTitle,
        drawerClose: adminTicketDrawerClose,
        backdrop: adminTicketBackdrop,
        request: requestAdminReviewJson,
        createOperationId: createAdminOperationId,
        escapeHtml,
        adminUserId: currentUser?.id || null
      });
      return supportModule;
    }

    function yuanInputToCents(value) {
      return Math.round(Number(value || 0) * 100);
    }

    async function postAdminOrderAction(orderId, action, body) {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/actions/${encodeURIComponent(action)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        throw await createCartRequestError(response, "Order action failed");
      }
      return response.json();
    }

    function createAdminShipmentForm(order) {
      if (order.status !== "processing") return "";
      return `
        <section class="admin-operation-section">
          <div class="admin-operation-section__header">
            <div>
              <p class="hero__eyebrow">Fulfillment</p>
              <h3>确认发货</h3>
            </div>
          </div>
          <form class="admin-operation-form" data-admin-order-action-form="ship"
            data-order-id="${escapeHtml(order.id)}" data-operation-id="${escapeHtml(createAdminOperationId("ship"))}">
            <label>承运商
              <select data-admin-carrier required>
                <option value="">请选择承运商</option>
                <option value="ups">UPS</option>
                <option value="usps">USPS</option>
                <option value="fedex">FedEx</option>
                <option value="dhl">DHL</option>
              </select>
            </label>
            <label>运单号
              <input data-admin-tracking-number autocomplete="off" required>
            </label>
            <label>操作备注
              <textarea rows="2" data-admin-action-note></textarea>
            </label>
            <p class="admin-operation-form__error" data-admin-action-error aria-live="polite"></p>
            <button class="order-button order-button--primary" type="submit" data-admin-ship-submit>确认发货</button>
          </form>
        </section>
      `;
    }

    function createAdminCancelForm(order) {
      if (!["pending_payment", "paid", "processing"].includes(order.status)) return "";
      const createsRefund = order.status !== "pending_payment";
      return `
        <section class="admin-operation-section">
          <p class="hero__eyebrow">Cancellation</p>
          <h3>取消订单</h3>
          <p>${createsRefund ? "取消后将创建整单退款并回补库存。" : "取消后将回补库存，不创建退款。"}</p>
          <form class="admin-operation-form" data-admin-order-action-form="cancel"
            data-order-id="${escapeHtml(order.id)}" data-operation-id="${escapeHtml(createAdminOperationId("cancel"))}">
            <label>取消原因
              <select data-admin-cancel-reason required>
                <option value="">请选择原因</option>
                <option value="customer_request">客户要求取消</option>
                <option value="inventory_issue">库存异常</option>
                <option value="payment_risk">支付风险</option>
              </select>
            </label>
            <label>操作备注
              <textarea rows="2" data-admin-action-note></textarea>
            </label>
            <label><input type="checkbox" required data-admin-cancel-confirm> 我已确认取消影响</label>
            <p class="admin-operation-form__error" data-admin-action-error aria-live="polite"></p>
            <button class="order-button order-button--secondary" type="submit" data-admin-cancel-submit>确认取消</button>
          </form>
        </section>
      `;
    }

    function createAdminRefundForm(detail) {
      const order = detail.order;
      const refundableItems = (detail.refundable?.items || []).filter((item) => {
        return item.remainingQuantity > 0 && item.refundableAmountCents > 0;
      });
      if (!["paid", "processing", "shipped", "delivered"].includes(order.status) || !refundableItems.length) {
        return "";
      }

      return `
        <section class="admin-operation-section">
          <p class="hero__eyebrow">Refund</p>
          <h3>部分退款</h3>
          <form class="admin-operation-form" data-admin-order-action-form="refund"
            data-order-id="${escapeHtml(order.id)}" data-operation-id="${escapeHtml(createAdminOperationId("refund"))}">
            <div class="admin-operation-list">
              ${refundableItems.map((item) => `
                <div class="admin-refund-row" data-admin-refund-row data-sku-id="${escapeHtml(item.skuId)}">
                  <div>
                    <strong>${escapeHtml(item.title)} · ${escapeHtml(item.size)}</strong>
                    <small>剩余 ${item.remainingQuantity} 件，可退 ${formatCurrency(item.refundableAmountCents / 100)}</small>
                  </div>
                  <label>数量
                    <input type="number" min="0" max="${item.remainingQuantity}" value="0" data-admin-refund-quantity>
                  </label>
                  <label>金额
                    <input type="number" min="0" max="${item.refundableAmountCents / 100}" step="0.01" value="0" data-admin-refund-amount>
                  </label>
                </div>
              `).join("")}
            </div>
            <label>退款原因
              <select data-admin-refund-reason required>
                <option value="">请选择原因</option>
                <option value="quality_issue">质量问题</option>
                <option value="wrong_item">错发漏发</option>
                <option value="customer_service">客服补偿</option>
              </select>
            </label>
            <label>操作备注
              <textarea rows="2" data-admin-action-note></textarea>
            </label>
            <p class="admin-operation-form__error" data-admin-action-error aria-live="polite"></p>
            <button class="order-button order-button--primary" type="submit" data-admin-refund-submit>创建退款</button>
          </form>
        </section>
      `;
    }

    function renderAdminOrderDrawer(detail) {
      const order = detail.order;
      adminOrderDrawerTitle.textContent = `处理订单 ${order.id}`;
      adminOrderDrawerBody.innerHTML = `
        <section class="admin-operation-section">
          <p><strong>订单状态</strong> ${escapeHtml(order.status)}</p>
          <p><strong>客户</strong> ${escapeHtml(order.customer?.name || "-")} · ${escapeHtml(order.customer?.contact || "-")}</p>
          <p><strong>实付金额</strong> ${formatCurrency(order.totals?.total || 0)}</p>
          <p><strong>物流</strong> ${escapeHtml(order.fulfillment?.carrier || "待处理")} · ${escapeHtml(order.fulfillment?.trackingNumber || "暂无运单号")}</p>
        </section>
        <section class="admin-operation-section">
          <h3>订单商品</h3>
          <div class="admin-operation-list">
            ${(order.items || []).map((item) => `
              <p><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.size)} · ×${item.quantity}</p>
            `).join("")}
          </div>
        </section>
        <section class="admin-operation-section" data-admin-order-refunds>
          <h3>退款记录</h3>
          ${(detail.refunds || []).length ? (detail.refunds || []).map((refund) => `
            <p>${escapeHtml(refund.status)} · ${formatCurrency(refund.amount || 0)} · ${escapeHtml(refund.reason)}</p>
          `).join("") : "<p>暂无退款记录</p>"}
        </section>
        ${createAdminShipmentForm(order)}
        ${createAdminCancelForm(order)}
        ${createAdminRefundForm(detail)}
        <section class="admin-operation-section">
          <h3>操作记录</h3>
          ${(detail.adminActions || []).length ? (detail.adminActions || []).map((action) => `
            <p>${escapeHtml(action.action)} · ${escapeHtml(action.beforeStatus)} → ${escapeHtml(action.afterStatus)}</p>
          `).join("") : "<p>暂无后台操作</p>"}
        </section>
      `;
    }

    async function refreshAdminOrderDrawer(orderId) {
      const detail = await fetchAdminJson(`/api/admin/orders/${encodeURIComponent(orderId)}`);
      adminData.orderDetail = detail;
      renderAdminOrderDrawer(detail);
    }

    async function openAdminOrderDrawer(orderId, trigger) {
      adminData.orderDrawerTrigger = trigger;
      adminOrderDrawerBody.innerHTML = "<p>正在加载订单...</p>";
      adminOrderDrawer.dataset.open = "true";
      adminOrderDrawer.setAttribute("aria-hidden", "false");
      adminOrderBackdrop.hidden = false;
      document.body.classList.add("is-admin-drawer-open");
      await refreshAdminOrderDrawer(orderId);
      adminOrderDrawerTitle.focus();
    }

    function closeAdminOrderDrawer() {
      adminOrderDrawer.dataset.open = "false";
      adminOrderDrawer.setAttribute("aria-hidden", "true");
      adminOrderBackdrop.hidden = true;
      document.body.classList.remove("is-admin-drawer-open");
      adminData.orderDrawerTrigger?.focus();
    }

    async function postAdminReturnAction(returnRequestId, body) {
      const response = await fetch(
        `/api/admin/returns/${encodeURIComponent(returnRequestId)}/actions/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        throw await createCartRequestError(response, "Return review failed");
      }
      return response.json();
    }

    function getAdminReturnActions(status) {
      if (status === "submitted") return ["start_review"];
      if (status === "reviewing") return ["approve", "reject"];
      if (status === "approved") return ["complete"];
      return [];
    }

    function getAdminReturnActionLabel(action) {
      return {
        start_review: "开始审核",
        approve: "通过申请",
        reject: "拒绝申请",
        complete: "完成售后"
      }[action] || action;
    }

    function createAdminReturnReviewForm(returnRequest, action) {
      if (!action) return "";
      const requiresRefund = action === "approve"
        && ["return_refund", "refund_only"].includes(returnRequest.type);
      return `
        <form class="admin-operation-form" data-admin-return-review-form
          data-return-id="${escapeHtml(returnRequest.id)}"
          data-return-action="${escapeHtml(action)}"
          data-operation-id="${escapeHtml(createAdminOperationId("return"))}">
          ${requiresRefund ? `
            <div class="admin-operation-list">
              ${(returnRequest.items || []).map((item) => `
                <div class="admin-refund-row" data-admin-return-refund-row data-sku-id="${escapeHtml(item.skuId)}">
                  <div>
                    <strong>${escapeHtml(item.title)} · ${escapeHtml(item.size)}</strong>
                    <small>申请 ${item.quantity} 件</small>
                  </div>
                  <label>数量
                    <input type="number" min="1" max="${item.quantity}" value="${item.quantity}" data-admin-return-refund-quantity>
                  </label>
                  <label>退款金额
                    <input type="number" min="0.01" step="0.01" value="0" data-admin-return-refund-amount>
                  </label>
                </div>
              `).join("")}
            </div>
          ` : ""}
          ${action === "reject" ? `
            <label>拒绝原因
              <select data-admin-return-reason required>
                <option value="">请选择原因</option>
                <option value="evidence_insufficient">凭证不足</option>
                <option value="outside_policy">不符合售后政策</option>
                <option value="item_condition">商品状态不符合要求</option>
              </select>
            </label>
          ` : `
            <input type="hidden" value="${action === "approve" ? "evidence_confirmed" : "item_received"}" data-admin-return-reason>
          `}
          <label>审核备注
            <textarea rows="2" data-admin-return-note></textarea>
          </label>
          <p class="admin-operation-form__error" data-admin-return-error aria-live="polite"></p>
          <div class="admin-operation-form__actions">
            <button class="order-button order-button--secondary" type="button" data-admin-return-form-cancel>返回</button>
            <button class="order-button order-button--primary" type="submit" data-admin-return-confirm>${escapeHtml(getAdminReturnActionLabel(action))}</button>
          </div>
        </form>
      `;
    }

    function renderAdminReturnDrawer(returnRequest) {
      adminReturnDrawerTitle.textContent = `审核售后 ${returnRequest.returnNumber}`;
      const actions = getAdminReturnActions(returnRequest.status);
      adminReturnDrawerBody.innerHTML = `
        <section class="admin-operation-section">
          <p><strong>申请状态</strong> ${escapeHtml(returnRequest.statusLabel || returnRequest.status)}</p>
          <p><strong>订单号</strong> ${escapeHtml(returnRequest.orderId)}</p>
          <p><strong>售后类型</strong> ${escapeHtml(returnRequest.type)}</p>
          <p><strong>申请原因</strong> ${escapeHtml(returnRequest.reason)}</p>
          <p><strong>联系方式</strong> ${escapeHtml(returnRequest.contact)}</p>
        </section>
        <section class="admin-operation-section">
          <h3>申请商品</h3>
          <div class="admin-operation-list">
            ${(returnRequest.items || []).map((item) => `
              <p><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.size)} · ×${item.quantity}</p>
            `).join("")}
          </div>
        </section>
        <section class="admin-operation-section">
          <h3>退款记录</h3>
          ${(returnRequest.refunds || []).length ? returnRequest.refunds.map((refund) => `
            <p>${escapeHtml(refund.status)} · ${formatCurrency(refund.amount || 0)}</p>
          `).join("") : "<p>暂无退款记录</p>"}
        </section>
        ${actions.length ? `
          <section class="admin-operation-section">
            <h3>可执行操作</h3>
            <div class="admin-operation-form__actions">
              ${actions.map((action) => `
                <button class="order-button ${action === "reject" ? "order-button--secondary" : "order-button--primary"}"
                  type="button" data-admin-return-action="${escapeHtml(action)}">
                  ${escapeHtml(getAdminReturnActionLabel(action))}
                </button>
              `).join("")}
            </div>
            <p class="admin-operation-form__error" data-admin-return-error aria-live="polite"></p>
          </section>
        ` : ""}
        ${createAdminReturnReviewForm(returnRequest, adminData.returnPendingAction)}
        <section class="admin-operation-section">
          <h3>状态记录</h3>
          <div class="admin-operation-list">
            ${(returnRequest.timeline || []).map((event) => `
              <p>${escapeHtml(event.label || event.status)} · ${escapeHtml(event.at)}</p>
            `).join("")}
          </div>
        </section>
      `;
    }

    async function refreshAdminReturnDrawer(returnRequestId) {
      const payload = await fetchAdminJson("/api/admin/returns");
      adminData.returnRequests = payload.returnRequests || [];
      const returnRequest = adminData.returnRequests.find((item) => item.id === returnRequestId);
      if (!returnRequest) throw new Error("售后申请不存在");
      adminData.returnDetail = returnRequest;
      renderAdminReturnDrawer(returnRequest);
    }

    async function openAdminReturnDrawer(returnRequestId, trigger) {
      adminData.returnDrawerTrigger = trigger;
      adminData.returnPendingAction = "";
      adminReturnDrawerBody.innerHTML = "<p>正在加载售后申请...</p>";
      adminReturnDrawer.dataset.open = "true";
      adminReturnDrawer.setAttribute("aria-hidden", "false");
      adminReturnBackdrop.hidden = false;
      document.body.classList.add("is-admin-drawer-open");
      await refreshAdminReturnDrawer(returnRequestId);
      adminReturnDrawerTitle.focus();
    }

    function closeAdminReturnDrawer() {
      adminReturnDrawer.dataset.open = "false";
      adminReturnDrawer.setAttribute("aria-hidden", "true");
      adminReturnBackdrop.hidden = true;
      document.body.classList.remove("is-admin-drawer-open");
      adminData.returnPendingAction = "";
      adminData.returnDrawerTrigger?.focus();
    }

    async function fetchAdminProduct(productId) {
      const payload = await fetchAdminJson(`/api/admin/products/${encodeURIComponent(productId)}`);
      return payload.product;
    }

    async function saveAdminProduct(product, mode) {
      const url = mode === "edit"
        ? `/api/admin/products/${encodeURIComponent(product.id)}`
        : "/api/admin/products";
      const response = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
        body: JSON.stringify({ product })
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Product save failed");
      }
      return response.json();
    }

    async function uploadAdminProductImage(productId, file) {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
        method: "POST",
        headers: { "x-demo-admin": "true" },
        body: formData
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Image upload failed");
      }
      return response.json();
    }

    async function adminAdvanceFulfillment(orderId, status) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
        body: JSON.stringify({ status, locale: activeLocale })
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Fulfillment update failed");
      }
      return response.json();
    }

    async function adminAdvanceRefund(refundId, status) {
      const response = await fetch(`/api/refunds/${encodeURIComponent(refundId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
        body: JSON.stringify({ status, locale: activeLocale })
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Refund update failed");
      }
      return response.json();
    }

    function getAdminOrderActions(status) {
      if (status === "pending_payment") return ["paid", "cancelled"];
      if (status === "paid") return ["processing"];
      if (status === "processing") return ["shipped"];
      if (status === "shipped") return ["delivered"];
      return [];
    }

    function getNextAdminFulfillmentStatus(status) {
      if (status === "not_started") return "preparing";
      if (status === "preparing") return "label_created";
      if (status === "label_created") return "in_transit";
      if (status === "in_transit") return "out_for_delivery";
      if (status === "out_for_delivery") return "delivered";
      return "";
    }

    function getNextAdminRefundStatus(status) {
      if (status === "requested") return "processing";
      if (status === "processing") return "succeeded";
      return "";
    }

    function isCurrentUserAdmin() {
      return String(currentUser?.email || "").toLowerCase() === "admin@socks.test";
    }

    function setAdminAccessState(state) {
      adminAuthRequired.hidden = state !== "auth";
      adminForbidden.hidden = state !== "forbidden";
      adminConsole.hidden = state !== "ready";
      if (state !== "ready") {
        window.StorefrontAdminReviews?.destroy();
        window.StorefrontAdminSupport?.destroy();
      }
    }

    function renderAdminTabs() {
      adminTabs.querySelectorAll("[data-admin-tab]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.adminTab === activeAdminTab);
        button.setAttribute("aria-selected", button.dataset.adminTab === activeAdminTab ? "true" : "false");
      });
    }

    function createKpiMarkup(summary) {
      const cards = [
        ["Orders", summary.ordersTotal],
        ["Sales", formatCurrency(summary.grossSales)],
        ["Low stock", summary.lowStockSkuCount],
        ["Open tickets", summary.openTicketCount]
      ];

      return `<div class="admin-grid">${cards.map(([label, value]) => `
        <article class="admin-card" data-admin-kpi>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `).join("")}</div>`;
    }

    async function renderAdminDashboard() {
      const payload = await fetchAdminJson("/api/admin/summary");
      adminData.summary = payload;
      const recentOrders = Array.isArray(payload.recentOrders) ? payload.recentOrders : [];
      adminPanel.innerHTML = `
        ${createKpiMarkup(payload.summary)}
        <div class="admin-table">
          ${recentOrders.length ? recentOrders.map((order) => `
            <article class="admin-row" data-admin-recent-order>
              <span>${escapeHtml(order.id)}</span>
              <span>${escapeHtml(order.status)}</span>
              <span>${formatCurrency(order.total)}</span>
            </article>
          `).join("") : `<div class="empty-state">No recent orders yet.</div>`}
        </div>
      `;
    }

    function createEmptyAdminProductDraft() {
      return {
        id: "",
        series: "",
        title: "",
        localizedContent: { "en-US": { title: "", categoryLabel: "", description: "" } },
        categoryKey: "crew",
        categoryLabel: "中筒袜",
        price: 39,
        originalPrice: 59,
        discount: "",
        description: "",
        isRecommended: false,
        isTopRated: false,
        isBestSeller: false,
        ratingValue: 4.8,
        reviewCount: 0,
        recentlyBoughtLabel: "",
        shippingLabel: "满 $35 免配送费",
        deliveryEstimate: "预计 3-5 日送达",
        visualTone: "#f7f7f7",
        visualShadow: "soft",
        visualAccent: "#111111",
        visualPattern: "minimal",
        colors: ["Black"],
        materials: ["Cotton blend"],
        sizeChart: [],
        gallery: [],
        variants: []
      };
    }

    function parseAdminListInput(value) {
      return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    }

    function parseAdminSizeTemplate(value) {
      const sizes = new Set();
      String(value || "").split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => {
        if (item.includes("-")) {
          const [start, end] = item.split("-").map((part) => Number(part.trim()));
          if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
            for (let size = start; size <= end; size += 1) {
              sizes.add(String(size));
            }
          }
          return;
        }
        sizes.add(item);
      });
      return [...sizes];
    }

    function syncAdminDraftFromForm(form) {
      const draft = adminData.productDraft || createEmptyAdminProductDraft();
      const english = draft.localizedContent?.["en-US"] || {};
      draft.id = form.querySelector("[data-admin-product-id]").value.trim();
      draft.title = form.querySelector("[data-admin-product-title]").value.trim();
      draft.categoryKey = form.querySelector("[data-admin-product-category]").value;
      draft.category = draft.categoryKey;
      draft.categoryLabel = form.querySelector("[data-admin-product-category-label]").value.trim();
      draft.price = Number(form.querySelector("[data-admin-product-price]").value);
      draft.originalPrice = Number(form.querySelector("[data-admin-product-original-price]").value);
      draft.description = form.querySelector("[data-admin-product-description]").value.trim();
      draft.colors = parseAdminListInput(form.querySelector("[data-admin-product-colors]").value);
      draft.materials = parseAdminListInput(form.querySelector("[data-admin-product-materials]").value);
      draft.localizedContent = {
        ...draft.localizedContent,
        "en-US": {
          ...english,
          title: form.querySelector("[data-admin-product-title-en]").value.trim(),
          categoryLabel: form.querySelector("[data-admin-product-category-label-en]").value.trim(),
          description: form.querySelector("[data-admin-product-description-en]").value.trim()
        }
      };
      adminData.productDraft = draft;
      return draft;
    }

    function generateAdminSkuRowsFromTemplate(form) {
      const draft = syncAdminDraftFromForm(form);
      const template = form.querySelector("[data-admin-sku-template-input]").value;
      const stockQuantity = Number(form.querySelector("[data-admin-sku-template-stock]").value || 10);
      const lowStockThreshold = Number(form.querySelector("[data-admin-sku-template-threshold]").value || 5);
      const color = draft.colors[0] || "";
      const material = draft.materials[0] || "";
      const existingBySize = new Map((draft.variants || []).map((variant) => [variant.size, variant]));
      const generated = parseAdminSizeTemplate(template).map((size) => ({
        ...(existingBySize.get(size) || {}),
        skuId: existingBySize.get(size)?.skuId || `${draft.id}-${size}`,
        productId: draft.id,
        size,
        color: existingBySize.get(size)?.color || color,
        material: existingBySize.get(size)?.material || material,
        stockQuantity: existingBySize.get(size)?.stockQuantity ?? stockQuantity,
        lowStockThreshold: existingBySize.get(size)?.lowStockThreshold ?? lowStockThreshold,
        isAvailable: existingBySize.get(size)?.isAvailable ?? true
      }));
      draft.variants = generated;
      draft.sizeChart = generated.map((variant) => ({
        size: variant.size,
        footLength: "",
        usMen: "",
        usWomen: ""
      }));
    }

    function applyAdminSkuBulkEdit(form) {
      const draft = syncAdminDraftFromForm(form);
      const selected = new Set([...form.querySelectorAll("[data-admin-sku-select]:checked")].map((input) => input.value));
      const stockValue = form.querySelector("[data-admin-sku-bulk-stock]").value;
      const thresholdValue = form.querySelector("[data-admin-sku-bulk-threshold]").value;
      draft.variants = draft.variants.map((variant) => selected.has(variant.skuId) ? {
        ...variant,
        stockQuantity: stockValue === "" ? variant.stockQuantity : Number(stockValue),
        lowStockThreshold: thresholdValue === "" ? variant.lowStockThreshold : Number(thresholdValue)
      } : variant);
    }

    function createAdminProductFormMarkup() {
      const draft = adminData.productDraft;
      if (!draft) return "";

      const english = draft.localizedContent?.["en-US"] || {};
      return `
        <form class="admin-product-form" data-admin-product-form>
          <div class="checkout-form__error" data-admin-product-error role="alert"></div>
          <label class="checkout-field">商品 ID <input data-admin-product-id value="${escapeHtml(draft.id)}" ${adminData.productMode === "edit" ? "readonly" : ""}></label>
          <label class="checkout-field">中文标题 <input data-admin-product-title value="${escapeHtml(draft.title)}"></label>
          <label class="checkout-field">英文标题 <input data-admin-product-title-en value="${escapeHtml(english.title || "")}"></label>
          <label class="checkout-field">分类
            <select data-admin-product-category>
              ${["sport", "daily", "crew", "no-show"].map((key) => `<option value="${key}" ${draft.categoryKey === key ? "selected" : ""}>${key}</option>`).join("")}
            </select>
          </label>
          <label class="checkout-field">中文分类 <input data-admin-product-category-label value="${escapeHtml(draft.categoryLabel || "")}"></label>
          <label class="checkout-field">英文分类 <input data-admin-product-category-label-en value="${escapeHtml(english.categoryLabel || "")}"></label>
          <label class="checkout-field">价格 <input type="number" min="0" data-admin-product-price value="${escapeHtml(draft.price)}"></label>
          <label class="checkout-field">原价 <input type="number" min="0" data-admin-product-original-price value="${escapeHtml(draft.originalPrice)}"></label>
          <label class="checkout-field checkout-field--wide">中文描述 <textarea data-admin-product-description>${escapeHtml(draft.description || "")}</textarea></label>
          <label class="checkout-field checkout-field--wide">英文描述 <textarea data-admin-product-description-en>${escapeHtml(english.description || "")}</textarea></label>
          <label class="checkout-field">颜色，逗号分隔 <input data-admin-product-colors value="${escapeHtml((draft.colors || []).join(", "))}"></label>
          <label class="checkout-field">材质，逗号分隔 <input data-admin-product-materials value="${escapeHtml((draft.materials || []).join(", "))}"></label>
          <div class="order-source admin-gallery">
            <input type="file" accept="image/*" data-admin-product-image-upload>
            ${(draft.gallery || []).map((image) => `
              <figure data-admin-product-gallery-item>
                <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || "")}">
                <figcaption>${escapeHtml(image.alt || "")}</figcaption>
              </figure>
            `).join("")}
          </div>
          <div class="order-source" data-admin-sku-bulk-toolbar>
            <input class="advanced-filters__input" placeholder="39-45" data-admin-sku-template-input>
            <input class="advanced-filters__input" type="number" value="10" data-admin-sku-template-stock>
            <input class="advanced-filters__input" type="number" value="5" data-admin-sku-template-threshold>
            <button class="order-button order-button--secondary" type="button" data-admin-sku-generate>生成 SKU</button>
            <input class="advanced-filters__input" type="number" placeholder="批量库存" data-admin-sku-bulk-stock>
            <input class="advanced-filters__input" type="number" placeholder="批量阈值" data-admin-sku-bulk-threshold>
            <button class="order-button order-button--secondary" type="button" data-admin-sku-bulk-apply>批量应用</button>
          </div>
          <div class="admin-table">
            ${(draft.variants || []).map((variant) => `
              <article class="admin-row" data-admin-sku-row data-sku-id="${escapeHtml(variant.skuId)}">
                <input type="checkbox" value="${escapeHtml(variant.skuId)}" data-admin-sku-select>
                <strong>${escapeHtml(variant.size)}</strong>
                <span>${escapeHtml(variant.skuId)}</span>
                <span>${escapeHtml(variant.color)}</span>
                <span>${escapeHtml(variant.material)}</span>
                <span>${escapeHtml(variant.stockQuantity)}</span>
                <span>${escapeHtml(variant.lowStockThreshold)}</span>
              </article>
            `).join("")}
          </div>
          <button class="order-button" type="submit" data-admin-product-save>保存商品</button>
          <button class="order-button order-button--secondary" type="button" data-admin-product-cancel>取消</button>
        </form>
      `;
    }

    async function renderAdminProducts() {
      const payload = await fetchAdminJson("/api/admin/products");
      adminData.products = payload.products;
      adminPanel.innerHTML = `
        <div class="admin-toolbar">
          <button class="order-button" type="button" data-admin-product-new>新增商品</button>
        </div>
        <div class="admin-table">${payload.products.map((product) => `
        <article class="admin-row" data-admin-product-row data-product-id="${escapeHtml(product.id)}">
          <span>${escapeHtml(product.id)}</span>
          <strong>${escapeHtml(product.title)}</strong>
          <span>${escapeHtml(product.category)}</span>
          <span>${formatCurrency(product.price)}</span>
          <span>${product.variantCount} SKU</span>
          <span>${product.totalStock}</span>
          <button class="order-button order-button--secondary" type="button" data-admin-product-edit>编辑</button>
        </article>
      `).join("")}</div>
        ${createAdminProductFormMarkup()}
      `;
    }

    async function renderAdminInventory() {
      const payload = await fetchAdminJson("/api/admin/inventory");
      adminData.inventory = payload.items;
      adminPanel.innerHTML = `<div class="admin-table">${payload.items.map((item) => `
        <article class="admin-row" data-admin-inventory-row data-sku-id="${escapeHtml(item.skuId)}">
          <span>${escapeHtml(item.skuId)}</span>
          <strong>${escapeHtml(item.productTitle)}</strong>
          <span>${escapeHtml(item.size)}</span>
          <input class="advanced-filters__input" type="number" min="0" max="9999" value="${item.stockQuantity}" aria-label="Stock quantity" data-admin-stock-input>
          <input class="advanced-filters__input" type="number" min="0" max="999" value="${item.lowStockThreshold}" aria-label="Low stock threshold" data-admin-low-stock-input>
          <label><input type="checkbox" data-admin-available-input ${item.isAvailable ? "checked" : ""}> Available</label>
          <span>${escapeHtml(item.stockState)}</span>
          <button class="order-button order-button--secondary" type="button" data-admin-inventory-save>Save</button>
        </article>
      `).join("")}</div>`;
    }

    async function renderAdminOrders() {
      const payload = await fetchAdminJson("/api/admin/orders");
      adminData.orders = payload.orders;
      adminPanel.innerHTML = payload.orders.length
        ? `<div class="admin-table">${payload.orders.map((order) => {
          const nextFulfillmentStatus = getNextAdminFulfillmentStatus(order.fulfillmentStatus);
          const nextRefundStatus = getNextAdminRefundStatus(order.refundStatus);
          return `
            <article class="admin-row" data-admin-order-row data-order-id="${escapeHtml(order.id)}">
              <span>${escapeHtml(order.id)}</span>
              <span>${escapeHtml(order.status)}</span>
              <span>${escapeHtml(order.fulfillmentStatus || "not_started")}</span>
              <span>${escapeHtml(order.refundStatus || "none")}</span>
              <span>${formatCurrency(order.total)}</span>
              <span>
                <button class="order-button order-button--primary" type="button" data-admin-order-open>处理订单</button>
                ${getAdminOrderActions(order.status).map((status) => `
                  <button class="order-button order-button--secondary" type="button" data-admin-order-action="${status}">${escapeHtml(status)}</button>
                `).join("")}
                ${nextFulfillmentStatus ? `
                  <button class="order-button order-button--secondary" type="button" data-admin-order-fulfillment data-next-fulfillment-status="${escapeHtml(nextFulfillmentStatus)}">推进物流</button>
                ` : ""}
                ${nextRefundStatus && order.refundId ? `
                  <button class="order-button order-button--secondary" type="button" data-admin-refund-status data-refund-id="${escapeHtml(order.refundId)}" data-next-refund-status="${escapeHtml(nextRefundStatus)}">推进退款</button>
                ` : ""}
              </span>
            </article>
          `;
        }).join("")}</div>`
        : `<div class="empty-state" data-admin-orders-empty>No orders yet.</div>`;
    }

    async function renderAdminReturns() {
      const payload = await fetchAdminJson("/api/admin/returns");
      adminData.returnRequests = payload.returnRequests || [];
      adminPanel.innerHTML = adminData.returnRequests.length
        ? `<div class="admin-table">${adminData.returnRequests.map((returnRequest) => `
          <article class="admin-row" data-admin-return-row data-return-id="${escapeHtml(returnRequest.id)}">
            <strong>${escapeHtml(returnRequest.returnNumber)}</strong>
            <span>${escapeHtml(returnRequest.orderId)}</span>
            <span>${escapeHtml(returnRequest.type)}</span>
            <span>${escapeHtml(returnRequest.statusLabel || returnRequest.status)}</span>
            <span>${escapeHtml(new Date(returnRequest.createdAt).toLocaleString(activeLocale))}</span>
            <button class="order-button order-button--primary" type="button" data-admin-return-open>审核售后</button>
          </article>
        `).join("")}</div>`
        : `<div class="empty-state" data-admin-returns-empty>暂无售后申请。</div>`;
    }

    async function renderAdminMarketing() {
      const payload = await fetchAdminJson("/api/admin/marketing");
      adminData.marketing = payload;
      const rows = [
        ...payload.coupons.map((item) => ({ type: "coupon", id: item.code, status: item.status })),
        ...payload.promotions.map((item) => ({ type: "promotion", id: item.id, status: item.status })),
        ...payload.bundles.map((item) => ({ type: "bundle", id: item.id, status: item.status }))
      ];
      adminPanel.innerHTML = `<div class="admin-table">${rows.map((row) => `
        <article class="admin-row" data-admin-marketing-row data-marketing-type="${row.type}" data-marketing-id="${escapeHtml(row.id)}" data-marketing-status="${escapeHtml(row.status)}">
          <span>${escapeHtml(row.type)}</span>
          <strong>${escapeHtml(row.id)}</strong>
          <span>${escapeHtml(row.status)}</span>
          <button class="order-button order-button--secondary" type="button" data-admin-marketing-toggle>
            ${row.status === "active" ? "Disable" : "Enable"}
          </button>
        </article>
      `).join("")}</div>`;
    }

    async function renderAdminPayments() {
      const payload = await fetchAdminJson("/api/admin/payment-methods");
      adminData.payments = payload.methods;
      adminPanel.innerHTML = `<div class="admin-table">${payload.methods.map((method) => `
        <article class="admin-row" data-admin-payment-method data-method-id="${escapeHtml(method.id)}" data-status="${escapeHtml(method.status)}">
          <span>${escapeHtml(method.id)}</span>
          <strong>${escapeHtml(method.label)}</strong>
          <span>${escapeHtml(method.status)}</span>
          <span>${formatCurrency(method.fee || 0)}</span>
          <button class="order-button order-button--secondary" type="button" data-admin-payment-toggle>
            ${method.status === "active" ? "Disable" : "Enable"}
          </button>
        </article>
      `).join("")}</div>`;
    }

    async function renderAdminPanel() {
      renderAdminTabs();
      if (activeAdminTab === "products") return renderAdminProducts();
      if (activeAdminTab === "inventory") return renderAdminInventory();
      if (activeAdminTab === "orders") return renderAdminOrders();
      if (activeAdminTab === "returns") return renderAdminReturns();
      if (activeAdminTab === "reviews") {
        const reviewModule = mountAdminReviewManagement();
        if (!reviewModule) {
          adminPanel.innerHTML = '<div class="empty-state">评论管理模块加载失败。</div>';
          return;
        }
        return reviewModule.render();
      }
      if (activeAdminTab === "support") {
        const supportModule = mountAdminSupportManagement();
        if (!supportModule) {
          adminPanel.innerHTML = '<div class="empty-state">客服工单模块加载失败。</div>';
          return;
        }
        return supportModule.render();
      }
      if (activeAdminTab === "marketing") return renderAdminMarketing();
      if (activeAdminTab === "payments") return renderAdminPayments();
      return renderAdminDashboard();
    }

    async function renderAdminView() {
      if (!currentUser) {
        setAdminAccessState("auth");
        return;
      }

      if (!isCurrentUserAdmin()) {
        setAdminAccessState("forbidden");
        return;
      }

      setAdminAccessState("ready");
      await renderAdminPanel();
    }

    function getAuthMode() {
      return getSearchParams().get("mode") === "register" ? "register" : "login";
    }

    function renderAuthShell() {
      const isAuthenticated = Boolean(currentUser);
      siteOrdersLink.hidden = !isAuthenticated;

      if (isAuthenticated) {
        authShell.innerHTML = `
          <span class="site-action__eyebrow">${activeLocale === LOCALE_KEY.EN_US ? "Account" : "账户"}</span>
          <span class="site-action__value" data-auth-user-name>${escapeHtml(currentUser.name)}</span>
          <a class="site-action__eyebrow" href="/socks-product-list.html?view=addresses" data-auth-addresses-link>Addresses</a>
          <button class="site-action__eyebrow" type="button" data-auth-logout>Logout</button>
        `;
        return;
      }

      authShell.innerHTML = `
        <span class="site-action__eyebrow" data-site-account-label>${t("shell.accountLabel")}</span>
        <a class="site-action__value" href="/socks-product-list.html?view=auth&mode=login" data-site-account-value data-auth-login-link>Login</a>
        <a class="site-action__eyebrow" href="/socks-product-list.html?view=auth&mode=register" data-auth-register-link>Register</a>
      `;
    }

    function renderAuthView() {
      const mode = getAuthMode();
      authTitle.textContent = mode === "register" ? "Create account" : "Sign in";
      authCopy.textContent = mode === "register"
        ? "Create a demo account to keep your socks cart and orders together."
        : "Sign in to restore your cart, addresses, and order history.";
      authNameRow.hidden = mode !== "register";
      authSubmit.textContent = mode === "register" ? "Create account" : "Sign in";
      authError.textContent = "";
    }

    async function fetchSession() {
      const response = await fetch("/api/session");
      if (!response.ok) {
        currentUser = null;
        window.StorefrontCustomerSupport?.setUser(null);
        renderAuthShell();
        return null;
      }

      const payload = await response.json();
      currentUser = payload.authenticated ? payload.user : null;
      window.StorefrontCustomerSupport?.setUser(currentUser);
      renderAuthShell();
      return payload;
    }

    async function submitAuthForm(form) {
      const mode = getAuthMode();
      const formData = new FormData(form);
      const payload = {
        email: formData.get("email"),
        password: formData.get("password")
      };

      if (mode === "register") {
        payload.name = formData.get("name");
      }

      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Authentication failed");
      }

      return response.json();
    }

    async function logoutUser() {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout failed");
      }

      currentUser = null;
      window.StorefrontAdminReviews?.destroy();
      window.StorefrontAdminSupport?.destroy();
      window.StorefrontCustomerSupport?.setUser(null);
      renderAuthShell();
    }

    async function fetchAddresses() {
      const response = await fetch("/api/me/addresses");
      if (!response.ok) {
        addressBook = [];
        return [];
      }

      const payload = await response.json();
      addressBook = Array.isArray(payload.addresses) ? payload.addresses : [];
      return addressBook;
    }

    function getAddressFormPayload(form) {
      const formData = new FormData(form);
      return {
        name: formData.get("name"),
        contact: formData.get("contact"),
        address: formData.get("address"),
        city: formData.get("city"),
        region: formData.get("region"),
        postalCode: formData.get("postalCode"),
        note: formData.get("note")
      };
    }

    function renderAddressList() {
      if (!addressBook.length) {
        addressList.innerHTML = `<div class="empty-state" data-address-empty-state>No saved addresses yet.</div>`;
        return;
      }

      addressList.innerHTML = addressBook.map((address) => `
        <article class="checkout-summary__item" data-address-card data-address-id="${escapeHtml(address.id)}">
          <span>${escapeHtml(address.name)}</span>
          <span>${escapeHtml(address.address)} ${escapeHtml(address.city)} ${escapeHtml(address.region)} ${escapeHtml(address.postalCode)}</span>
          ${address.isDefault ? `<span data-address-default-badge>Default</span>` : `<button type="button" data-address-default="${escapeHtml(address.id)}">Set default</button>`}
          <button type="button" data-address-delete="${escapeHtml(address.id)}">Delete</button>
        </article>
      `).join("");
    }

    async function renderAddressesView() {
      if (!currentUser) {
        addressList.innerHTML = `<div class="empty-state" data-auth-required>Please sign in to manage addresses.</div>`;
        return;
      }

      await fetchAddresses();
      renderAddressList();
    }

    async function createAddress(payload) {
      const response = await fetch("/api/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to save address");
      }
      return response.json();
    }

    async function fetchUserOrders() {
      const response = await fetch("/api/me/orders");
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to load order history");
      }
      return response.json();
    }

    function renderOrderHistory(orders) {
      if (!currentUser) {
        orderHistoryPanel.innerHTML = `<div class="empty-state" data-auth-required>Please sign in to view order history.</div>`;
        return;
      }

      if (!orders.length) {
        orderHistoryPanel.innerHTML = `<div class="empty-state" data-order-history-empty>No orders yet.</div>`;
        return;
      }

      orderHistoryPanel.innerHTML = `
        <div class="checkout-summary">
          ${orders.map((order) => `
            <article class="checkout-summary__item" data-order-history-card>
              <span>${escapeHtml(order.id)}</span>
              <span>${order.items.map((item) => escapeHtml(item.title)).join(", ")}</span>
              <span>${escapeHtml(order.timeline[order.timeline.length - 1].label)}</span>
              <span>${formatCurrency(order.totals.total)}</span>
              <span class="order-actions">
                <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(order.id)}">${t("returns.detail")}</a>
                <button class="order-button order-button--primary" type="button" data-order-reorder data-order-id="${escapeHtml(order.id)}">${t("reorder.button")}</button>
              </span>
            </article>
          `).join("")}
        </div>
      `;
      bindReorderButtons(orderHistoryPanel);
    }

    async function renderOrdersView() {
      if (!currentUser) {
        renderOrderHistory([]);
        return;
      }

      const payload = await fetchUserOrders();
      renderOrderHistory(Array.isArray(payload.orders) ? payload.orders : []);
    }

    function bindReorderButtons(root = document) {
      root.querySelectorAll("[data-order-reorder], [data-order-detail-reorder]").forEach((button) => {
        button.addEventListener("click", async () => {
          const orderId = button.dataset.orderId;
          if (!orderId || button.disabled) {
            return;
          }

          button.disabled = true;
          try {
            const payload = await reorderOrder(orderId);
            if (Array.isArray(payload.skippedItems) && payload.skippedItems.length) {
              showOutOfStockToast();
            }
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });
    }

    const customerReturnableOrderStatuses = new Set(["paid", "processing", "shipped", "delivered"]);
    const countedReturnStatuses = new Set(["submitted", "reviewing", "approved", "completed"]);

    function isCustomerReturnableOrder(order) {
      return order && customerReturnableOrderStatuses.has(order.status);
    }

    function getReturnStatusText(status) {
      return t(`returns.statuses.${status}`);
    }

    function getReturnTypeOptionsMarkup() {
      return ["return_refund", "exchange", "refund_only"].map((type) => {
        return `<option value="${type}">${t(`returns.types.${type}`)}</option>`;
      }).join("");
    }

    function getReturnReasonOptionsMarkup() {
      return ["size_issue", "quality_issue", "wrong_item", "changed_mind", "other"].map((reason) => {
        return `<option value="${reason}">${t(`returns.reasons.${reason}`)}</option>`;
      }).join("");
    }

    async function fetchReturns() {
      const response = await fetch("/api/me/returns");
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to load returns");
      }
      return response.json();
    }

    async function fetchReturnRequest(returnRequestId) {
      const response = await fetch(`/api/returns/${encodeURIComponent(returnRequestId)}`);
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to load return request");
      }
      return response.json();
    }

    async function submitReturnRequest(payload) {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale: activeLocale })
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error?.message || "Failed to submit return");
        error.code = result.error?.code;
        throw error;
      }
      return result;
    }

    async function cancelReturnRequest(returnRequestId) {
      const response = await fetch(`/api/returns/${encodeURIComponent(returnRequestId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", locale: activeLocale })
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to cancel return");
      }
      return response.json();
    }

    function getReturnedQuantityBySku(returnRequests, orderId) {
      return returnRequests.reduce((summary, returnRequest) => {
        if (returnRequest.orderId !== orderId || !countedReturnStatuses.has(returnRequest.status)) {
          return summary;
        }

        returnRequest.items.forEach((item) => {
          summary.set(item.skuId, (summary.get(item.skuId) || 0) + item.quantity);
        });
        return summary;
      }, new Map());
    }

    function getRequestedReturnMode() {
      return getSearchParams().get("mode") || "";
    }

    function renderReturnAuthRequired(panel) {
      panel.innerHTML = `
        <div class="empty-state" data-auth-required>
          <p>${t("returns.signInRequired")}</p>
          <a class="order-button order-button--primary" href="${STOREFRONT_PATH}?view=auth&mode=login">${t("shell.accountLabel")}</a>
        </div>
      `;
    }

    function createReturnFormMarkup(order, returnRequests) {
      const returnedBySku = getReturnedQuantityBySku(returnRequests, order.id);
      const returnableItems = order.items.map((item) => {
        const returnedQuantity = returnedBySku.get(item.skuId) || 0;
        return {
          ...item,
          returnableQuantity: Math.max(0, item.quantity - returnedQuantity)
        };
      }).filter((item) => item.returnableQuantity > 0);

      if (!isCustomerReturnableOrder(order) || !returnableItems.length) {
        return `<div class="empty-state" data-return-empty>${t("returns.orderNotEligible")}</div>`;
      }

      return `
        <form class="return-form" data-return-form novalidate>
          <div class="checkout-summary" data-return-items>
            ${returnableItems.map((item) => `
              <label class="return-line-item" data-return-line-item data-sku-id="${escapeHtml(item.skuId)}">
                <input type="checkbox" data-return-item-checkbox>
                <span>
                  <strong class="return-line-item__title">${escapeHtml(item.title)}</strong>
                  <span class="return-line-item__meta">${escapeHtml(item.size)} · ${t("returns.availableQuantity", { count: item.returnableQuantity })}</span>
                </span>
                <input class="return-quantity" type="number" min="1" max="${item.returnableQuantity}" value="1" data-return-quantity aria-label="${t("returns.quantity")}">
              </label>
            `).join("")}
          </div>
          <div class="return-form__grid">
            <label class="return-field">
              <span>${t("returns.type")}</span>
              <select data-return-type>${getReturnTypeOptionsMarkup()}</select>
            </label>
            <label class="return-field">
              <span>${t("returns.reason")}</span>
              <select data-return-reason>${getReturnReasonOptionsMarkup()}</select>
            </label>
            <label class="return-field">
              <span>${t("returns.contact")}</span>
              <input data-return-contact value="${escapeHtml(order.customer?.contact || currentUser?.email || "")}">
            </label>
            <label class="return-field return-field--wide">
              <span>${t("returns.note")}</span>
              <textarea rows="4" data-return-note></textarea>
            </label>
            <div class="return-error" data-return-form-error role="alert"></div>
            <div class="return-actions">
              <button class="order-button order-button--primary" type="submit" data-return-submit>${t("returns.submit")}</button>
              <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(order.id)}">${t("common.orderNumber")}</a>
            </div>
          </div>
        </form>
      `;
    }

    function createReturnDetailMarkup(returnRequest) {
      return `
        <section class="order-stack return-detail" data-return-detail>
          <div class="order-summary">
            <div class="order-summary__row"><span>${t("returns.returnNumber")}</span><span class="order-summary__value">${escapeHtml(returnRequest.returnNumber)}</span></div>
            <div class="order-summary__row"><span>${t("common.orderNumber")}</span><span class="order-summary__value">${escapeHtml(returnRequest.orderId)}</span></div>
            <div class="order-summary__row"><span>${t("returns.status")}</span><span class="order-summary__value">${getReturnStatusText(returnRequest.status)}</span></div>
          </div>
          <div class="checkout-summary" data-return-detail-items>
            ${returnRequest.items.map((item) => `
              <article class="checkout-summary__item">
                <span>${escapeHtml(item.title)}</span>
                <span>${escapeHtml(item.size)}</span>
                <span>x${item.quantity}</span>
              </article>
            `).join("")}
          </div>
          <div class="order-source" data-return-detail-timeline>
            ${returnRequest.timeline.map((entry) => `<p>${escapeHtml(entry.label)}</p>`).join("")}
          </div>
          <div class="return-actions">
            <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=returns">${t("returns.viewHistory")}</a>
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(returnRequest.orderId)}">${t("common.orderNumber")}</a>
          </div>
        </section>
      `;
    }

    async function renderReturnView() {
      if (!currentUser) {
        renderReturnAuthRequired(returnPagePanel);
        return;
      }

      const requestedId = getRequestedOrderId();
      if (getRequestedReturnMode() === "detail") {
        if (!requestedId) {
          returnPagePanel.innerHTML = `<div class="empty-state" data-return-empty>${t("returns.empty")}</div>`;
          return;
        }

        const payload = await fetchReturnRequest(requestedId);
        returnPagePanel.innerHTML = createReturnDetailMarkup(payload.returnRequest);
        return;
      }

      const orderId = requestedId;
      if (!orderId) {
        returnPagePanel.innerHTML = `<div class="empty-state" data-return-empty>${t("returns.orderNotEligible")}</div>`;
        return;
      }

      const [orderPayload, returnsPayload] = await Promise.all([
        fetchOrder(orderId),
        fetchReturns()
      ]);
      returnPagePanel.innerHTML = createReturnFormMarkup(
        orderPayload.order,
        Array.isArray(returnsPayload.returnRequests) ? returnsPayload.returnRequests : []
      );
    }

    function createReturnHistoryMarkup(returnRequests) {
      if (!currentUser) {
        return `<div class="empty-state" data-auth-required>${t("returns.signInRequired")}</div>`;
      }

      if (!returnRequests.length) {
        return `<div class="empty-state" data-return-history-empty>${t("returns.empty")}</div>`;
      }

      return `
        <div class="return-history">
          ${returnRequests.map((returnRequest) => {
            const itemCount = returnRequest.items.reduce((total, item) => total + item.quantity, 0);
            const itemTitles = returnRequest.items.map((item) => `${escapeHtml(item.title)} / ${escapeHtml(item.size)} x${item.quantity}`).join(", ");
            return `
              <article class="return-status-card" data-return-history-card data-return-id="${escapeHtml(returnRequest.id)}">
                <p class="return-status-card__title">${escapeHtml(returnRequest.returnNumber)}</p>
                <p class="return-status-card__meta">${escapeHtml(returnRequest.orderId)} · ${getReturnStatusText(returnRequest.status)} · ${t("returns.itemSummary", { count: itemCount })}</p>
                <p class="return-status-card__meta">${itemTitles}</p>
                <div class="return-actions">
                  <a class="order-button order-button--primary" href="${STOREFRONT_PATH}?view=return&id=${encodeURIComponent(returnRequest.id)}&mode=detail" data-return-history-detail-link>${t("returns.detail")}</a>
                  <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(returnRequest.orderId)}">${t("common.orderNumber")}</a>
                  ${returnRequest.canCancel ? `<button class="order-button order-button--secondary" type="button" data-return-cancel="${escapeHtml(returnRequest.id)}">${t("returns.cancel")}</button>` : ""}
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    async function renderReturnsView() {
      if (!currentUser) {
        returnsPagePanel.innerHTML = createReturnHistoryMarkup([]);
        return;
      }

      const payload = await fetchReturns();
      returnsPagePanel.innerHTML = createReturnHistoryMarkup(Array.isArray(payload.returnRequests) ? payload.returnRequests : []);
    }

    async function rerenderActiveViewForLocale() {
      renderLocaleControls();
      renderStaticCopy();
      renderAuthShell();

      if (getCurrentView() === ORDER_VIEW_KEY) {
        await renderOrderPage();
        renderCartState();
        return;
      }

      if (getCurrentView() === CHECKOUT_VIEW_KEY) {
        renderCheckoutPage();
        renderCartState();
        return;
      }

      if (getCurrentView() === PAYMENT_VIEW_KEY) {
        await renderPaymentPage();
        renderCartState();
        return;
      }

      if (getCurrentView() === AUTH_VIEW_KEY) {
        renderAuthView();
        renderCartState();
        return;
      }

      if (getCurrentView() === ADDRESSES_VIEW_KEY) {
        await renderAddressesView();
        renderCartState();
        return;
      }

      if (getCurrentView() === ORDERS_VIEW_KEY) {
        await renderOrdersView();
        renderCartState();
        return;
      }

      if (getCurrentView() === SUPPORT_VIEW_KEY) {
        await fetchTrustCenter();
        renderCartState();
        return;
      }

      if (getCurrentView() === SUPPORT_TICKETS_VIEW_KEY) {
        await mountCustomerSupportTickets()?.render();
        renderCartState();
        return;
      }

      if (getCurrentView() === ADMIN_VIEW_KEY) {
        await renderAdminView();
        renderCartState();
        return;
      }

      if (getCurrentView() === RETURN_VIEW_KEY) {
        await renderReturnView();
        renderCartState();
        return;
      }

      if (getCurrentView() === RETURNS_VIEW_KEY) {
        await renderReturnsView();
        renderCartState();
        return;
      }

      if (getCurrentView() === DETAIL_VIEW_KEY) {
        await renderDetailPage();
        renderCartState();
        return;
      }

      try {
        await renderProducts();
        renderCartState();
      } catch (error) {
        showLoadFailureState();
        renderCartState();
      }
    }

    function createNavigationContextSnapshot(
      filterValue = FILTER_KEY.ALL,
      sortValue = SORT_KEY.RECOMMENDED,
      queryValue = ""
    ) {
      const normalizedFilter = isValidFilter(filterValue) ? filterValue : FILTER_KEY.ALL;
      const normalizedSort = isValidSort(sortValue) ? sortValue : SORT_KEY.RECOMMENDED;
      const normalizedQuery = normalizeQueryValue(queryValue);

      return {
        storefrontHref: getStorefrontHref(normalizedFilter, normalizedSort, normalizedQuery),
        filter: normalizedFilter,
        sort: normalizedSort,
        query: normalizedQuery
      };
    }

    function readStoredNavigationContext() {
      const rawValue = window.sessionStorage.getItem(NAVIGATION_CONTEXT_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== "object") {
          return null;
        }

        return createNavigationContextSnapshot(parsed.filter, parsed.sort, parsed.query);
      } catch (error) {
        return null;
      }
    }

    function saveNavigationContext(snapshot) {
      window.sessionStorage.setItem(
        NAVIGATION_CONTEXT_STORAGE_KEY,
        JSON.stringify(snapshot)
      );
    }

    function hasExplicitStorefrontContextInUrl() {
      const params = getSearchParams();
      const hasValidFilter = isValidFilter(params.get("filter"));
      const hasValidSort = isValidSort(params.get("sort"));
      const hasQuery = normalizeQueryValue(params.get("q")) !== "";
      return hasValidFilter || hasValidSort || hasQuery;
    }

    function syncNavigationContext(
      filterValue = activeFilter,
      sortValue = activeSort,
      queryValue = activeQuery
    ) {
      navigationContext = createNavigationContextSnapshot(filterValue, sortValue, queryValue);
      saveNavigationContext(navigationContext);
    }

    function initializeNavigationContext() {
      navigationContext = readStoredNavigationContext()
        || createNavigationContextSnapshot(FILTER_KEY.ALL, SORT_KEY.RECOMMENDED, "");
    }

    function getContextualDetailHref(productId, options = {}) {
      const params = new URLSearchParams({
        view: DETAIL_VIEW_KEY,
        id: productId
      });

      const filterValue = isValidFilter(options.filter)
        ? options.filter
        : navigationContext.filter;
      const sortValue = isValidSort(options.sort)
        ? options.sort
        : navigationContext.sort;
      const queryValue = normalizeQueryValue(options.query ?? navigationContext.query);

      if (filterValue !== FILTER_KEY.ALL) {
        params.set("filter", filterValue);
      }

      if (sortValue !== SORT_KEY.RECOMMENDED) {
        params.set("sort", sortValue);
      }

      if (queryValue) {
        params.set("q", queryValue);
      }

      appendAdvancedContextParams(params, options);
      return `${STOREFRONT_PATH}?${params.toString()}`;
    }

    function getActiveDetailHref(productId) {
      return getContextualDetailHref(productId, {
        filter: activeFilter,
        sort: activeSort,
        query: activeQuery
      });
    }

    function getContinueShoppingHref() {
      return navigationContext.storefrontHref || STOREFRONT_PATH;
    }

    function rememberStorefrontOriginForCheckout() {
      if (getCurrentView() === "storefront" || hasExplicitStorefrontContextInUrl()) {
        syncNavigationContext(activeFilter, activeSort, activeQuery);
      }
    }

    function readStoredOrderConfirmation() {
      const rawValue = window.sessionStorage.getItem(ORDER_CONFIRMATION_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== "object") {
          return null;
        }

        return parsed;
      } catch (error) {
        return null;
      }
    }

    function clearOrderConfirmationState() {
      orderConfirmationState = null;
    }

    function saveOrderConfirmationSnapshot(snapshot) {
      window.sessionStorage.setItem(
        ORDER_CONFIRMATION_STORAGE_KEY,
        JSON.stringify(snapshot)
      );
    }

    function clearStoredOrderConfirmationSnapshot() {
      window.sessionStorage.removeItem(ORDER_CONFIRMATION_STORAGE_KEY);
    }

    async function fetchProductsForState(
      filterValue = FILTER_KEY.ALL,
      sortValue = SORT_KEY.RECOMMENDED,
      queryValue = ""
    ) {
      const params = new URLSearchParams({
        filter: filterValue,
        sort: sortValue,
        locale: activeLocale,
        pageSize: "24"
      });

      const normalizedQuery = normalizeQueryValue(queryValue);
      if (normalizedQuery) {
        params.set("q", normalizedQuery);
      }

      const response = await fetch(`/api/products?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load products");
      }

      const payload = await response.json();
      return Array.isArray(payload.items) ? payload.items : [];
    }

    async function fetchAllProducts() {
      return fetchProductsForState(FILTER_KEY.ALL, SORT_KEY.RECOMMENDED, "");
    }

    async function fetchProductReviews(productId, options = {}) {
      const params = new URLSearchParams();
      if (options.sort) {
        params.set("sort", options.sort);
      }
      if (options.rating) {
        params.set("rating", options.rating);
      }

      const query = params.toString();
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews${query ? `?${query}` : ""}`);
      if (!response.ok) {
        throw new Error("Failed to load product reviews");
      }
      const payload = await response.json();
      return {
        ...payload,
        options
      };
    }

    async function createProductReview(productId, payload) {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale: activeLocale })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Product review failed");
      }

      return response.json();
    }

    async function markProductReviewHelpful(productId, reviewId) {
      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(reviewId)}/helpful`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw await createCartRequestError(response, "Product review helpful vote failed");
      }

      return response.json();
    }

    async function fetchProductQuestions(productId) {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/questions`);
      if (!response.ok) {
        throw new Error("Failed to load product questions");
      }
      return response.json();
    }

    async function createProductQuestion(productId, payload) {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale: activeLocale })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Product question failed");
      }

      return response.json();
    }

    async function fetchSavedProducts() {
      const response = await fetch("/api/saved-products");
      if (!response.ok) {
        throw new Error("Failed to load saved products");
      }
      return response.json();
    }

    async function saveProduct(productId) {
      const response = await fetch("/api/saved-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Save product failed");
      }

      return response.json();
    }

    async function removeSavedProduct(productId) {
      const response = await fetch(`/api/saved-products/${encodeURIComponent(productId)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Remove saved product failed");
      }

      return response.json();
    }

    function createRetentionCardMarkup(product, options = {}) {
      const localizedProduct = getLocalizedProduct(product);
      const addAction = options.addAction || "";
      const removeAction = options.removeAction || "";
      const labelKey = options.labelKey || "wishlist";

      return `
        <article class="retention-card" data-wishlist-card data-product-id="${escapeHtml(product.id)}">
          <p class="retention-card__series">${escapeHtml(localizedProduct.series)}</p>
          <h2 class="retention-card__title">${escapeHtml(localizedProduct.title)}</h2>
          <p class="retention-card__meta">${escapeHtml(localizedProduct.categoryLabel)} · ¥${product.price} <s>¥${product.originalPrice}</s></p>
          <p class="retention-card__meta">${escapeHtml(String(localizedProduct.rating))} · ${formatReviewCount(product.reviewCount)}</p>
          <div class="retention-card__actions">
            <a class="retention-card__button" href="${getActiveDetailHref(product.id)}">${t(`${labelKey}.viewDetail`)}</a>
            <button class="retention-card__button retention-card__button--primary" type="button" ${addAction}>${t(`${labelKey}.addCart`)}</button>
            <button class="retention-card__button" type="button" ${removeAction}>${t(`${labelKey}.remove`)}</button>
          </div>
        </article>
      `;
    }

    async function renderWishlistPage() {
      if (!wishlistPanel) {
        return;
      }

      const payload = await fetchSavedProducts().catch(() => ({ items: [], savedProductIds: [] }));
      applySavedProductsPayload(payload);
      const items = Array.isArray(payload.items) ? payload.items : [];

      if (!items.length) {
        wishlistPanel.innerHTML = `
          <div class="empty-state" data-wishlist-empty>
            <p>${t("wishlist.empty")}</p>
            <a class="retention-card__button retention-card__button--primary" href="${STOREFRONT_PATH}">${t("wishlist.browse")}</a>
          </div>
        `;
        return;
      }

      wishlistPanel.innerHTML = `
        <div class="retention-grid">
          ${items.map((product) => createRetentionCardMarkup(product, {
            addAction: `data-wishlist-add-cart data-default-size="${escapeHtml(getDefaultSizeForProduct(product))}"`,
            removeAction: "data-wishlist-remove"
          })).join("")}
        </div>
      `;
      bindWishlistInteractions();
    }

    function bindWishlistInteractions() {
      if (!wishlistPanel) {
        return;
      }

      wishlistPanel.querySelectorAll("[data-wishlist-add-cart]").forEach((button) => {
        button.addEventListener("click", async () => {
          const card = button.closest("[data-product-id]");
          const productId = card?.dataset.productId;
          const size = button.dataset.defaultSize;
          if (!productId || !size || button.disabled) {
            return;
          }

          button.disabled = true;
          try {
            await addCartItem(productId, size);
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });

      wishlistPanel.querySelectorAll("[data-wishlist-remove]").forEach((button) => {
        button.addEventListener("click", async () => {
          const productId = button.closest("[data-product-id]")?.dataset.productId;
          if (!productId || button.disabled) {
            return;
          }

          button.disabled = true;
          try {
            const payload = await removeSavedProduct(productId);
            applySavedProductsPayload(payload);
            await renderWishlistPage();
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });
    }

    async function fetchRecentHistory(limit = 24) {
      const response = await fetch(`/api/recent-views?limit=${encodeURIComponent(limit)}&locale=${encodeURIComponent(activeLocale)}`);
      if (!response.ok) {
        throw new Error("Failed to load recent history");
      }
      return response.json();
    }

    async function removeRecentHistoryItem(productId) {
      const response = await fetch(`/api/recent-views/${encodeURIComponent(productId)}?locale=${encodeURIComponent(activeLocale)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to remove recent history item");
      }
      return response.json();
    }

    async function clearRecentHistory() {
      const response = await fetch("/api/recent-views/clear", {
        method: "POST"
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to clear recent history");
      }
      return response.json();
    }

    function createRecentHistoryCardMarkup(product) {
      return createRetentionCardMarkup(product, {
        labelKey: "recent",
        addAction: `data-recent-add-cart data-default-size="${escapeHtml(getDefaultSizeForProduct(product))}"`,
        removeAction: "data-recent-remove"
      }).replace("data-wishlist-card", "data-recent-history-card");
    }

    async function renderRecentHistoryPage(payload) {
      if (!recentPanel) {
        return;
      }

      const recentPayload = payload || await fetchRecentHistory().catch(() => ({ items: [] }));
      const items = Array.isArray(recentPayload.items) ? recentPayload.items : [];

      if (!items.length) {
        recentPanel.innerHTML = `<div class="empty-state" data-recent-history-empty>${t("recent.empty")}</div>`;
        return;
      }

      recentPanel.innerHTML = `
        <div class="retention-panel__toolbar">
          <button class="retention-card__button" type="button" data-recent-clear>${t("recent.clear")}</button>
        </div>
        <div class="retention-grid">
          ${items.map(createRecentHistoryCardMarkup).join("")}
        </div>
      `;
      bindRecentHistoryInteractions();
    }

    function bindRecentHistoryInteractions() {
      if (!recentPanel) {
        return;
      }

      recentPanel.querySelector("[data-recent-clear]")?.addEventListener("click", async () => {
        await clearRecentHistory();
        await renderRecentHistoryPage({ items: [] });
      });

      recentPanel.querySelectorAll("[data-recent-remove]").forEach((button) => {
        button.addEventListener("click", async () => {
          const productId = button.closest("[data-product-id]")?.dataset.productId;
          if (!productId || button.disabled) {
            return;
          }

          button.disabled = true;
          try {
            const payload = await removeRecentHistoryItem(productId);
            await renderRecentHistoryPage(payload);
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });

      recentPanel.querySelectorAll("[data-recent-add-cart]").forEach((button) => {
        button.addEventListener("click", async () => {
          const productId = button.closest("[data-product-id]")?.dataset.productId;
          const size = button.dataset.defaultSize;
          if (!productId || !size || button.disabled) {
            return;
          }

          button.disabled = true;
          try {
            await addCartItem(productId, size);
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });
    }

    function createRecommendationCardMarkup(product) {
      const localizedProduct = getLocalizedProduct(product);

      return `
        <article class="recommendation-card" data-recommended-card>
          <p class="recommendation-card__series">${localizedProduct.series}</p>
          <h3 class="recommendation-card__title">${localizedProduct.title}</h3>
          <p class="recommendation-card__price">¥${product.price}</p>
          <p class="recommendation-card__delivery">${localizedProduct.deliveryEstimate}</p>
        </article>
      `;
    }

    function createRecommendationsMarkup(products) {
      if (!products.length) {
        return `<p class="recommendations__empty">${t("detail.noRecommendations")}</p>`;
      }

      return `
        <div class="recommendations">
          ${products.map(createRecommendationCardMarkup).join("")}
        </div>
      `;
    }

    function createOrderPageSummaryMarkup(order, recommendationsMarkup) {
      const continueShoppingHref = getContinueShoppingHref();
      const orderSourceMarkup = createOrderSourceSummaryMarkup();

      return `
        <div class="order-stack">
          <section>
            <p class="order-panel__eyebrow">${t("order.summaryEyebrow")}</p>
            <h2 class="order-panel__title">${t("order.summaryTitle")}</h2>
            <div class="order-summary">
              <div class="order-summary__row">
                <span>${t("common.orderNumber")}</span>
                <span class="order-summary__value" data-order-page-number>${order.orderNumber}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.items")}</span>
                <span class="order-summary__value" data-order-page-items>${t("common.itemCount", { count: order.itemCount })}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.estimatedDelivery")}</span>
                <span class="order-summary__value" data-order-page-delivery>${order.estimatedDelivery}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.subtotal")}</span>
                <span class="order-summary__value" data-order-page-subtotal>${formatCurrency(order.subtotal || 0)}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.savings")}</span>
                <span class="order-summary__value" data-order-page-savings>-${formatCurrency(order.savings || 0)}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.estimatedTotal")}</span>
                <span class="order-summary__value" data-order-page-total>${formatCurrency(order.total || 0)}</span>
              </div>
            </div>
          </section>
          <section>
            <p class="order-panel__eyebrow">${t("order.continueEyebrow")}</p>
            <h2 class="order-panel__title">${t("order.continueTitle")}</h2>
            ${recommendationsMarkup}
          </section>
          <div class="order-actions">
            ${orderSourceMarkup}
            <a
              class="order-button order-button--secondary"
              href="${continueShoppingHref}"
              data-order-continue-shopping
            >
              ${t("cart.continueShopping")}
            </a>
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}">${t("order.backToStorefront")}</a>
          </div>
        </div>
      `;
    }

    function createOrderPageEmptyStateMarkup() {
      const continueShoppingHref = getContinueShoppingHref();

      return `
        <div class="order-empty-state">
          <h2 class="order-empty-state__title">${t("order.emptyTitle")}</h2>
          <p class="order-empty-state__copy">${t("order.emptyCopy")}</p>
          ${createOrderSourceSummaryMarkup()}
          <div class="order-actions">
            <a
              class="order-button order-button--secondary"
              href="${continueShoppingHref}"
              data-order-continue-shopping
            >
              ${t("cart.continueShopping")}
            </a>
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}">${t("order.backToStorefront")}</a>
          </div>
        </div>
      `;
    }

    function createOrderSourceSummaryMarkup() {
      const hasSource = hasStorefrontSourceContext();
      const title = hasSource ? t("order.sourceTitle") : t("order.defaultSourceTitle");
      const parts = [t("common.socksHome")];

      if (hasSource && navigationContext.filter !== FILTER_KEY.ALL) {
        parts.push(getFilterLabel(navigationContext.filter));
      } else if (!hasSource) {
        parts.push(getFilterLabel(FILTER_KEY.ALL));
      }

      if (hasSource && navigationContext.sort !== SORT_KEY.RECOMMENDED) {
        parts.push(getSortLabel(navigationContext.sort));
      }

      if (hasSource && navigationContext.query) {
        parts.push(navigationContext.query);
      }

      return `
        <div class="order-source" data-order-source>
          <p class="order-source__title" data-order-source-title>${title}</p>
          <p class="order-source__copy" data-order-source-copy>${parts.join(" / ")}</p>
        </div>
      `;
    }

    function renderCheckoutPage() {
      const quantity = getCartQuantity(cartState.items);

      if (!quantity) {
        checkoutPagePanel.innerHTML = `
          <div class="order-empty-state" data-checkout-empty-state>
            <h2 class="order-empty-state__title">${t("checkout.empty")}</h2>
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}">${t("common.backToStorefront")}</a>
          </div>
        `;
        return;
      }

      const enrichedItems = cartState.items
        .map((item) => {
          const product = findProduct(item.productId);
          return product ? { ...item, product, localizedProduct: getLocalizedProduct(product) } : null;
        })
        .filter(Boolean);
      const pricingSummary = getCartPricingSummary(enrichedItems);
      const savings = pricingSummary.subtotal - pricingSummary.total;
      const defaultAddress = addressBook.find((address) => address.isDefault) || addressBook[0] || null;

      checkoutPagePanel.innerHTML = `
        <div class="checkout-layout">
          <form class="checkout-form" data-checkout-form novalidate>
            ${defaultAddress ? `
              <div class="checkout-address-option" data-checkout-address-option data-address-id="${escapeHtml(defaultAddress.id)}">
                <strong>${escapeHtml(defaultAddress.name)}</strong>
                <span>${escapeHtml(defaultAddress.address)} ${escapeHtml(defaultAddress.city)} ${escapeHtml(defaultAddress.region)} ${escapeHtml(defaultAddress.postalCode)}</span>
              </div>
            ` : ""}
            <label class="checkout-field">${t("checkout.name")}<input name="name" data-checkout-field="customer.name" value="${defaultAddress ? escapeHtml(defaultAddress.name) : ""}"></label>
            <label class="checkout-field">${t("checkout.contact")}<input name="contact" data-checkout-field="customer.contact" value="${defaultAddress ? escapeHtml(defaultAddress.contact) : ""}"></label>
            <label class="checkout-field">${t("checkout.address")}<input name="address" data-checkout-field="shippingAddress.address" value="${defaultAddress ? escapeHtml(defaultAddress.address) : ""}"></label>
            <label class="checkout-field">${t("checkout.city")}<input name="city" data-checkout-field="shippingAddress.city" value="${defaultAddress ? escapeHtml(defaultAddress.city) : ""}"></label>
            <label class="checkout-field">${t("checkout.region")}<input name="region" data-checkout-field="shippingAddress.region" value="${defaultAddress ? escapeHtml(defaultAddress.region) : ""}"></label>
            <label class="checkout-field">${t("checkout.postalCode")}<input name="postalCode" data-checkout-field="shippingAddress.postalCode" value="${defaultAddress ? escapeHtml(defaultAddress.postalCode) : ""}"></label>
            <label class="checkout-field">${t("checkout.note")}<textarea name="note" data-checkout-field="shippingAddress.note">${defaultAddress ? escapeHtml(defaultAddress.note) : ""}</textarea></label>
            <section class="shipping-estimate" data-shipping-estimate-panel>
              <div class="shipping-estimate__header">
                <strong>${t("checkout.shippingMethod")}</strong>
                <button class="order-button order-button--secondary" type="button" data-shipping-refresh>
                  ${activeLocale === LOCALE_KEY.EN_US ? "Refresh delivery estimates" : "刷新预计送达"}
                </button>
              </div>
              <div data-shipping-method-options></div>
            </section>
            <div class="checkout-form__error" data-checkout-form-error role="alert"></div>
            <button class="cart-drawer__checkout-button" type="submit" data-checkout-submit>${t("checkout.submitOrder")}</button>
          </form>
          <aside class="checkout-summary" data-checkout-summary>
            ${enrichedItems.map((item) => `
              <article class="checkout-summary__item" data-checkout-summary-item data-product-id="${item.productId}" data-size="${item.size}">
                <span>${item.localizedProduct.title}</span>
                <span>${item.size}</span>
                <span data-checkout-summary-quantity>x${item.quantity}</span>
              </article>
            `).join("")}
            <div class="order-summary__row"><span>${t("common.subtotal")}</span><span>${formatCurrency(pricingSummary.subtotal)}</span></div>
            <div class="order-summary__row"><span>${t("common.savings")}</span><span>${formatSavingsValue(savings)}</span></div>
            <div class="order-summary__row"><span>${t("common.estimatedTotal")}</span><span data-checkout-total>${formatCurrency(pricingSummary.total)}</span></div>
          </aside>
        </div>
      `;
      renderCheckoutShippingEstimates();
    }

    function getCheckoutFormPayload(form) {
      const formData = new FormData(form);

      return {
        locale: activeLocale,
        customer: {
          name: formData.get("name"),
          contact: formData.get("contact")
        },
        shippingAddress: {
          address: formData.get("address"),
          city: formData.get("city"),
          region: formData.get("region"),
          postalCode: formData.get("postalCode"),
          note: formData.get("note")
        },
        shippingMethodId: formData.get("shippingMethodId") || "standard"
      };
    }

    async function createOrder(payload) {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to create order");
      }

      return response.json();
    }

    async function fetchShippingMethodsForCheckout(address = {}) {
      const params = new URLSearchParams({
        region: address.region || "",
        postalCode: address.postalCode || "",
        locale: activeLocale
      });
      const response = await fetch(`/api/shipping-methods?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load shipping methods");
      }
      return response.json();
    }

    async function renderCheckoutShippingEstimates() {
      const form = checkoutPagePanel.querySelector("[data-checkout-form]");
      const panel = checkoutPagePanel.querySelector("[data-shipping-estimate-panel]");
      const optionsRoot = checkoutPagePanel.querySelector("[data-shipping-method-options]");
      if (!form || !panel || !optionsRoot) return;

      const selectedMethod = form.querySelector('input[name="shippingMethodId"]:checked')?.value || "standard";
      const address = getCheckoutFormPayload(form).shippingAddress;
      const payload = await fetchShippingMethodsForCheckout(address).catch(() => ({ methods: [] }));
      optionsRoot.innerHTML = payload.methods.length
        ? payload.methods.map((method) => `
          <label class="shipping-estimate__option">
            <input type="radio" name="shippingMethodId" value="${escapeHtml(method.id)}" ${method.id === selectedMethod ? "checked" : ""}>
            <strong>${escapeHtml(method.label)} · ${formatCurrency(method.fee)}</strong>
            <span>${escapeHtml(method.estimatedDeliveryLabel)} · ${escapeHtml(method.addressZone)}</span>
            <span>${escapeHtml(method.deliveryWindow?.label || "")}</span>
          </label>
        `).join("")
        : `<p>${t("checkout.submitError")}</p>`;
    }

    function getRequestedOrderId() {
      return getSearchParams().get("id") || "";
    }

    function getPaymentOrderId() {
      return getSearchParams().get("id") || "";
    }

    async function fetchOrder(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);

      if (!response.ok) {
        throw new Error("Failed to load order");
      }

      return response.json();
    }

    async function fetchOrderFulfillment(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment`);
      if (!response.ok) {
        return { fulfillment: null };
      }
      return response.json();
    }

    async function fetchOrderRefunds(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refunds`);
      if (!response.ok) {
        return { refunds: [] };
      }
      return response.json();
    }

    async function fetchOrderInvoice(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`);
      if (!response.ok) {
        return { invoice: null };
      }
      return response.json();
    }

    async function cancelOrder(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "changed_mind", locale: activeLocale })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to cancel order");
      }

      return response.json();
    }

    async function reorderOrder(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
        method: "POST"
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to reorder");
      }

      const payload = await response.json();
      setCartStateFromPayload(payload);
      renderCartState();
      return payload;
    }

    async function fetchPaymentAttempts(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments`);

      if (!response.ok) {
        return { payments: [] };
      }

      return response.json();
    }

    async function fetchPaymentMethods(orderId) {
      const params = new URLSearchParams({ orderId, locale: activeLocale });
      const response = await fetch(`/api/payment-methods?${params.toString()}`);
      if (!response.ok) {
        return { methods: [] };
      }
      return response.json();
    }

    async function createPayment(orderId, payload) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale: activeLocale })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to process payment");
      }

      return response.json();
    }

    function getPaymentMethodLabel(method) {
      const labels = {
        card: t("payment.card"),
        paypal: t("payment.paypal"),
        gift_card: t("payment.giftCard")
      };
      return labels[method] || method;
    }

    function getPaymentStatusLabel(status) {
      if (status === "succeeded") {
        return t("payment.succeeded");
      }

      if (status === "failed") {
        return t("payment.failed");
      }

      return status || t("payment.unavailable");
    }

    function getNextOrderActions(order) {
      if (order.status === "pending_payment") {
        return [
          { href: `${STOREFRONT_PATH}?view=payment&id=${encodeURIComponent(order.id)}`, label: t("order.payDemo") },
          { status: "cancelled", label: t("order.cancelDemo") }
        ];
      }

      if (order.status === "paid") {
        return [{ status: "processing", label: t("order.processDemo") }];
      }

      if (order.status === "processing") {
        return [{ status: "shipped", label: t("order.shipDemo") }];
      }

      if (order.status === "shipped") {
        return [{ status: "delivered", label: t("order.deliverDemo") }];
      }

      return [];
    }

    function createOrderStatusActionsMarkup(order) {
      const actions = getNextOrderActions(order);
      if (!actions.length) {
        return "";
      }

      return `
        <div class="order-actions" data-order-actions>
          ${actions.map((action) => `
            ${action.href ? `
              <a
                class="cart-drawer__confirmation-action"
                href="${action.href}"
                data-order-payment-link
              >
                ${action.label}
              </a>
            ` : `
              <button
                class="cart-drawer__confirmation-action"
                type="button"
                data-order-status-action
                data-next-status="${action.status}"
              >
                ${action.label}
              </button>
            `}
          `).join("")}
        </div>
      `;
    }

    async function updateOrderStatus(orderId, status) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, locale: activeLocale })
      });

      if (!response.ok) {
        throw new Error("Failed to update order status");
      }

      return response.json();
    }

    function createFulfillmentCardMarkup(fulfillment) {
      if (!fulfillment) return "";

      return `
        <div class="order-source" data-fulfillment-card>
          <p class="order-source__title">${escapeHtml(fulfillment.shippingMethodLabel || fulfillment.shippingMethodId || "")} · ${escapeHtml(fulfillment.carrier || "")}</p>
          <p class="order-source__copy">${escapeHtml(fulfillment.estimatedDeliveryLabel || "")} · ${escapeHtml(fulfillment.addressZone || "")}</p>
          <p class="order-source__copy" data-fulfillment-tracking-number>
            ${fulfillment.trackingNumber ? escapeHtml(fulfillment.trackingNumber) : (activeLocale === LOCALE_KEY.EN_US ? "Tracking pending" : "待生成发货单号")}
          </p>
          <div class="lifecycle-timeline" data-fulfillment-events>
            ${(fulfillment.events || []).map((event) => `<p>${escapeHtml(event.label)} · ${escapeHtml(event.location || "")}</p>`).join("")}
          </div>
        </div>
      `;
    }

    function createRefundProgressMarkup(refunds = []) {
      if (!refunds.length) return "";
      const refund = refunds[0];

      return `
        <div class="order-source" data-refund-progress>
          <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Refund progress" : "退款进度"} · ${formatCurrency(refund.amount || 0)}</p>
          <div class="lifecycle-timeline">
            ${(refund.events || []).map((event) => `<p>${escapeHtml(event.label)}</p>`).join("")}
          </div>
        </div>
      `;
    }

    function createInvoiceCardMarkup(invoice) {
      if (!invoice) {
        return `
          <div class="order-source" data-invoice-card>
            <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Invoice" : "发票"}</p>
            <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Available after successful payment." : "支付成功后可查看发票。"}</p>
          </div>
        `;
      }

      return `
        <div class="order-source invoice-card" data-invoice-card>
          <p class="order-source__title">${escapeHtml(invoice.invoiceNumber)}</p>
          <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Tax" : "税费"} · ${formatCurrency(invoice.tax || 0)}</p>
          <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Grand total" : "应付总额"} · ${formatCurrency(invoice.grandTotal || 0)}</p>
        </div>
      `;
    }

    function canCancelOrder(order) {
      return ["pending_payment", "paid", "processing"].includes(order.status);
    }

    function renderPersistedOrder(order, options = {}) {
      const latestTimelineEntry = order.timeline[order.timeline.length - 1];

      orderPageTitle.textContent = t("order.heroTitle");
      orderPageCopy.textContent = t("order.heroCopy");
      orderPagePanel.innerHTML = `
        <section class="order-stack" data-order-detail>
          <div class="order-summary">
            <div class="order-summary__row">
              <span>${t("common.orderNumber")}</span>
              <span class="order-summary__value" data-order-number>${order.id}</span>
            </div>
            <div class="order-summary__row">
              <span>Status</span>
              <span class="order-summary__value" data-order-status>${latestTimelineEntry.label}</span>
            </div>
            <div class="order-summary__row">
              <span>${t("common.estimatedDelivery")}</span>
              <span class="order-summary__value">${order.shippingMethod.estimatedDelivery}</span>
            </div>
            <div class="order-summary__row">
              <span>${t("common.estimatedTotal")}</span>
              <span class="order-summary__value" data-order-total>${formatCurrency(order.totals.total)}</span>
            </div>
          </div>
          <div class="order-source" data-order-address>
            <p class="order-source__title">${order.customer.name} · ${order.customer.contact}</p>
            <p class="order-source__copy">${order.shippingAddress.address} ${order.shippingAddress.city} ${order.shippingAddress.region} ${order.shippingAddress.postalCode}</p>
          </div>
          ${order.payment ? `
            <div class="order-source" data-order-payment>
              <p class="order-source__title">${getPaymentMethodLabel(order.payment.method)}</p>
              <p class="order-source__copy">${getPaymentStatusLabel(order.payment.status)}</p>
            </div>
          ` : ""}
          ${createInvoiceCardMarkup(options.invoice)}
          ${createFulfillmentCardMarkup(options.fulfillment || order.fulfillment)}
          ${createRefundProgressMarkup(options.refunds || (order.refund ? [order.refund] : []))}
          <div class="checkout-summary" data-order-items>
            ${order.items.map((item) => `
              <article class="checkout-summary__item">
                <span>${item.title}</span>
                <span>${item.size}</span>
                <span>x${item.quantity}</span>
              </article>
            `).join("")}
          </div>
          <div class="order-source" data-order-timeline>
            ${order.timeline.map((entry) => `<p>${entry.label}</p>`).join("")}
          </div>
          <div class="order-actions">
            ${createOrderSourceSummaryMarkup()}
            ${isCustomerReturnableOrder(order) ? `
              <a
                class="order-button order-button--primary"
                href="${STOREFRONT_PATH}?view=return&id=${encodeURIComponent(order.id)}"
                data-order-return-link
              >
                ${t("returns.request")}
              </a>
            ` : ""}
            <button
              class="order-button order-button--primary"
              type="button"
              data-order-detail-reorder
              data-order-id="${escapeHtml(order.id)}"
            >
              ${t("reorder.button")}
            </button>
            <a
              class="order-button order-button--secondary"
              href="${getContinueShoppingHref()}"
              data-order-continue-shopping
            >
              ${t("cart.continueShopping")}
            </a>
            ${canCancelOrder(order) ? `
              <button
                class="order-button order-button--secondary"
                type="button"
                data-order-cancel
                data-order-id="${escapeHtml(order.id)}"
              >
                ${activeLocale === LOCALE_KEY.EN_US ? "Cancel order" : "取消订单"}
              </button>
            ` : ""}
            <a class="order-button order-button--primary" href="${STOREFRONT_PATH}">${t("order.backToStorefront")}</a>
          </div>
          ${createOrderStatusActionsMarkup(order)}
        </section>
      `;
      bindReorderButtons(orderPagePanel);
    }

    async function renderPaymentPage() {
      const orderId = getPaymentOrderId();
      const payload = await fetchOrder(orderId);
      const order = payload.order;
      const paymentsPayload = await fetchPaymentAttempts(orderId);
      const methodsPayload = await fetchPaymentMethods(orderId);
      const payments = Array.isArray(paymentsPayload.payments) ? paymentsPayload.payments : [];
      const paymentMethods = Array.isArray(methodsPayload.methods) ? methodsPayload.methods : [];
      const latestPayment = payments[0] || order.payment || null;
      const canPay = order.status === "pending_payment";

      paymentHeroEyebrow.textContent = t("payment.heroEyebrow");
      paymentTitle.textContent = t("payment.heroTitle");
      paymentCopy.textContent = t("payment.heroCopy");
      paymentPanel.innerHTML = `
        <div class="checkout-layout">
          <form class="checkout-form" data-payment-form novalidate>
            <div class="order-summary">
              <div class="order-summary__row">
                <span>${t("common.orderNumber")}</span>
                <span class="order-summary__value">${escapeHtml(order.id)}</span>
              </div>
              <div class="order-summary__row">
                <span>${t("common.estimatedTotal")}</span>
                <span class="order-summary__value">${formatCurrency(order.totals.grandTotal ?? order.totals.total)}</span>
              </div>
            </div>
            <section class="order-source" data-payment-breakdown>
              <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Payment breakdown" : "支付明细"}</p>
              <p>${t("common.subtotal")} · ${formatCurrency(order.totals.subtotal || 0)}</p>
              <p>${t("common.shipping")} · ${formatCurrency(order.totals.shipping || 0)}</p>
              <p>${activeLocale === LOCALE_KEY.EN_US ? "Tax" : "税费"} · ${formatCurrency(order.totals.tax || 0)}</p>
              <p>${activeLocale === LOCALE_KEY.EN_US ? "Grand total" : "应付总额"} · ${formatCurrency(order.totals.grandTotal ?? order.totals.total)}</p>
            </section>
            <fieldset class="checkout-shipping" data-payment-methods>
              <legend>${t("payment.method")}</legend>
              ${paymentMethods.map((method, index) => `
                <label class="payment-method-card" data-payment-method-card>
                  <input type="radio" name="method" value="${escapeHtml(method.id)}" data-payment-method="${escapeHtml(method.id)}" ${index === 0 ? "checked" : ""}>
                  <strong>${escapeHtml(method.label)}</strong>
                  <span>${escapeHtml(method.description)}</span>
                  <span>${formatCurrency(method.fee || 0)}</span>
                </label>
              `).join("")}
            </fieldset>
            <div class="checkout-form__error" data-payment-error role="alert">${latestPayment?.status === "failed" ? t("payment.failed") : ""}</div>
            <button class="cart-drawer__checkout-button" type="submit" data-payment-submit ${canPay ? "" : "disabled"}>
              ${latestPayment?.status === "failed" ? t("payment.retry") : t("payment.payNow")}
            </button>
            <button class="cart-drawer__confirmation-action" type="button" data-payment-fail-demo ${canPay ? "" : "disabled"}>${t("payment.failDemo")}</button>
            <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(order.id)}">${t("payment.backToOrder")}</a>
          </form>
          <aside class="checkout-summary" data-payment-attempts>
            <h2>${t("payment.attempts")}</h2>
            ${payments.length ? payments.map((payment) => `
              <article class="checkout-summary__item" data-payment-attempt>
                <span>${getPaymentMethodLabel(payment.method)}</span>
                <span>${getPaymentStatusLabel(payment.status)}</span>
                <span>${formatCurrency(payment.amount)}</span>
              </article>
            `).join("") : `<p>${t("payment.attemptEmpty")}</p>`}
          </aside>
        </div>
      `;
      renderCheckoutShippingEstimates();
    }

    async function fetchRecommendedProducts(order) {
      const response = await fetch(`/api/products?${new URLSearchParams({
        filter: FILTER_KEY.ALL,
        sort: SORT_KEY.RECOMMENDED,
        locale: activeLocale
      }).toString()}`);
      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      const purchasedProductIds = Array.isArray(order.purchasedProductIds)
        ? order.purchasedProductIds
        : [];

      return payload.items
        .filter((product) => !purchasedProductIds.includes(product.id))
        .slice(0, 3);
    }

    async function renderOrderPage() {
      if (hasExplicitStorefrontContextInUrl()) {
        syncNavigationContext(activeFilter, activeSort, activeQuery);
      }

      const requestedOrderId = getRequestedOrderId();
      if (requestedOrderId) {
        const payload = await fetchOrder(requestedOrderId);
        const fulfillmentPayload = await fetchOrderFulfillment(requestedOrderId);
        const refundsPayload = await fetchOrderRefunds(requestedOrderId);
        const invoicePayload = await fetchOrderInvoice(requestedOrderId);
        renderPersistedOrder(payload.order, {
          fulfillment: fulfillmentPayload.fulfillment,
          refunds: refundsPayload.refunds || [],
          invoice: invoicePayload.invoice
        });
        return;
      }

      const storedOrder = readStoredOrderConfirmation();

      if (!storedOrder) {
        orderPageTitle.textContent = t("order.emptyTitle");
        orderPageCopy.textContent = t("order.emptyCopy");
        orderPagePanel.innerHTML = createOrderPageEmptyStateMarkup();
        return;
      }

      const recommendedProducts = await fetchRecommendedProducts(storedOrder);
      orderPageTitle.textContent = t("order.heroTitle");
      orderPageCopy.textContent = t("order.heroCopy");
      orderPagePanel.innerHTML = createOrderPageSummaryMarkup(
        storedOrder,
        createRecommendationsMarkup(recommendedProducts)
      );
    }

    function renderOrderPageFallback() {
      orderPageTitle.textContent = t("order.heroTitle");
      orderPageCopy.textContent = t("order.heroCopy");
      orderPagePanel.innerHTML = createOrderPageSummaryMarkup(
        readStoredOrderConfirmation() || {
          orderNumber: "Unavailable",
          itemCount: 0,
          estimatedDelivery: "Not available",
          subtotal: 0,
          savings: 0,
          total: 0
        },
        `<p class="recommendations__empty">${t("detail.noRecommendations")}</p>`
      );
    }

    function createRatingMarkup(product) {
      const topRatedMarkup = product.isTopRated
        ? `<span class="product-card__top-rated" data-top-rated>${t("rating.topRated")}</span>`
        : "";

      return `
        <div class="product-card__rating" data-rating-band>
          <span class="product-card__stars" data-rating-stars aria-hidden="true">★★★★★</span>
          <span class="product-card__rating-value" data-rating-value>${formatRatingValue(product.ratingValue)}</span>
          <span class="product-card__reviews" data-review-count>${formatReviewCount(product.reviewCount)}</span>
          ${topRatedMarkup}
        </div>
      `;
    }

    function createCommerceMarkup(product) {
      const localizedProduct = getLocalizedProduct(product);
      const bestsellerMarkup = product.isBestSeller
        ? `<span class="product-card__bestseller" data-bestseller-badge>${activeLocale === LOCALE_KEY.EN_US ? "Best seller" : "热卖"}</span>`
        : "";

      const stockVariant = getPrimaryStockVariant(product);

      return `
        <div class="product-card__commerce" data-commerce-info>
          <div class="product-card__shipping">
            <span class="product-card__shipping-label" data-shipping-label>${localizedProduct.shippingLabel}</span>
            <span class="product-card__delivery-estimate" data-delivery-estimate>${localizedProduct.deliveryEstimate}</span>
          </div>
          <span class="product-card__stock" data-stock-label data-low-stock="${product.isLowStock ? "true" : "false"}">${localizedProduct.stockLabel}</span>
          <span class="product-card__stock" data-sku-stock-summary data-low-stock="${isVariantLowStock(stockVariant) ? "true" : "false"}">${getVariantStockText(stockVariant)}</span>
          <div class="product-card__social-proof" data-social-proof>
            ${bestsellerMarkup}
            <span class="product-card__recently-bought" data-recently-bought>${localizedProduct.recentlyBoughtLabel}</span>
          </div>
        </div>
      `;
    }

    function createSizeButtonsMarkup(product, options = {}) {
      const dataAttribute = options.dataAttribute || "data-size";
      const variants = getProductVariants(product);
      const selectedSize = options.selectedSize
        || variants.find(isVariantAvailable)?.size
        || variants[0]?.size
        || "";

      return variants
        .map((variant) => {
          const isAvailable = isVariantAvailable(variant);
          const isSelected = variant.size === selectedSize && isAvailable;
          const selectedClass = isSelected ? " is-selected" : "";
          const pressedState = isSelected ? "true" : "false";
          const skuAttribute = variant.skuId ? ` data-sku-id="${variant.skuId}"` : "";
          const scopedSizeAttribute = dataAttribute === "data-size" ? "" : ` ${dataAttribute}="${variant.size}"`;
          return `<button class="product-card__size${selectedClass}" type="button" aria-pressed="${pressedState}" data-size="${variant.size}"${scopedSizeAttribute}${skuAttribute} data-low-stock="${isVariantLowStock(variant) ? "true" : "false"}" data-sold-out="${isAvailable ? "false" : "true"}"${isAvailable ? "" : " disabled"}>${variant.size}</button>`;
        })
        .join("");
    }

    function createDetailRecommendationsMarkup(products) {
      if (!products.length) {
        return `<p class="detail-recommendations__empty">${t("detail.noRecommendations")}</p>`;
      }

      return `
        <div class="detail-recommendations">
          ${products.map((product) => {
            const localizedProduct = getLocalizedProduct(product);
            return `
              <a
                class="detail-recommendation-card"
                href="${getContextualDetailHref(product.id, {
                  filter: getRequestedFilter(),
                  sort: getRequestedSort(),
                  query: getRequestedQuery()
                })}"
                data-detail-recommendation-card
              >
                <p class="detail-recommendation-card__series">${localizedProduct.series}</p>
                <h3 class="detail-recommendation-card__title">${localizedProduct.title}</h3>
                <p class="detail-recommendation-card__price">¥${product.price}</p>
                <p class="detail-recommendation-card__meta">${localizedProduct.deliveryEstimate}</p>
              </a>
            `;
          }).join("")}
        </div>
      `;
    }

    function createDetailNavigationLink(direction, product) {
      if (!product) {
        return `
          <a class="detail-nav__link" aria-disabled="true" data-detail-nav-${direction}>
            <span class="detail-nav__direction">${direction === "previous" ? "Previous" : "Next"}</span>
            <span class="detail-nav__title">${t("detail.navNoItemTitle")}</span>
            <span class="detail-nav__meta">${t("detail.navNoItemMeta")}</span>
          </a>
        `;
      }

      const localizedProduct = getLocalizedProduct(product);

      return `
        <a class="detail-nav__link" href="${getActiveDetailHref(product.id)}" data-detail-nav-${direction}>
          <span class="detail-nav__direction">${direction === "previous" ? "Previous" : "Next"}</span>
          <span class="detail-nav__title">${localizedProduct.title}</span>
          <span class="detail-nav__meta">${localizedProduct.categoryLabel} · ¥${product.price}</span>
        </a>
      `;
    }

    function createDetailBreadcrumbMarkup(product, filterValue) {
      const localizedProduct = getLocalizedProduct(product);
      const storefrontHref = getStorefrontHref(filterValue, getRequestedSort(), getRequestedQuery());
      const segments = [
        `<a class="detail-breadcrumb__link" href="${STOREFRONT_PATH}">${t("common.home")}</a>`,
        `<a class="detail-breadcrumb__link" href="${storefrontHref}">${t("common.socksHome")}</a>`
      ];

      if (filterValue && filterValue !== FILTER_KEY.ALL) {
        segments.push(`<span class="detail-breadcrumb__segment">${getFilterLabel(filterValue)}</span>`);
      }

      segments.push(`<span class="detail-breadcrumb__segment is-current">${localizedProduct.title}</span>`);

      return `
        <nav class="detail-breadcrumb" aria-label="Breadcrumb" data-detail-breadcrumb>
          ${segments.join('<span class="detail-breadcrumb__divider">/</span>')}
        </nav>
      `;
    }

    function createDetailSourceMarkup(product) {
      const filterValue = getRequestedFilter();
      const sortValue = getRequestedSort();
      const queryValue = getRequestedQuery();
      const hasExplicitContext = hasExplicitStorefrontContextInUrl();
      const breadcrumbMarkup = createDetailBreadcrumbMarkup(
        product,
        hasExplicitContext ? filterValue : FILTER_KEY.ALL
      );

      if (!hasExplicitContext) {
        return `
          <div class="detail-source detail-source--compact">
            ${breadcrumbMarkup}
          </div>
        `;
      }

      return `
        <div class="detail-source">
          <a class="detail-source__link" href="${getStorefrontHref(filterValue, sortValue, queryValue)}" data-detail-source-link>
            ${t("detail.sourceBack", { label: getFilterLabel(filterValue) })}
          </a>
          <p class="detail-source__sort" data-detail-sort-copy>${t("detail.currentSort", { label: getSortLabel(sortValue) })}</p>
          ${breadcrumbMarkup}
        </div>
      `;
    }

    function getDetailNavigationState(productId, contextProducts) {
      const currentIndex = contextProducts.findIndex((product) => product.id === productId);
      if (currentIndex === -1) {
        return {
          previousProduct: null,
          nextProduct: null
        };
      }

      return {
        previousProduct: contextProducts[currentIndex - 1] || null,
        nextProduct: contextProducts[currentIndex + 1] || null
      };
    }

    function createBundleCardMarkup() {
      const bundle = Array.isArray(marketingState.bundles) ? marketingState.bundles[0] : null;
      if (!bundle) {
        return "";
      }

      const title = activeLocale === LOCALE_KEY.EN_US ? bundle.title : (bundle.titleZh || bundle.title);
      return `
        <section class="bundle-card" data-bundle-card>
          <p class="bundle-card__eyebrow">${activeLocale === LOCALE_KEY.EN_US ? "Bundle deal" : "组合购买"}</p>
          <h3 class="bundle-card__title">${escapeHtml(title)}</h3>
          <p class="bundle-card__copy">${activeLocale === LOCALE_KEY.EN_US ? "Save" : "立省"} ${formatCurrency(bundle.discountAmount)}</p>
          <button class="bundle-card__button" type="button" data-add-bundle="${escapeHtml(bundle.id)}">${activeLocale === LOCALE_KEY.EN_US ? "Add bundle" : "加入组合"}</button>
        </section>
      `;
    }

    function createReviewItemsMarkup(reviews) {
      if (!reviews.length) {
        return `<p class="detail-reviews__empty" data-review-empty>${t("detail.reviewsEmpty")}</p>`;
      }

      return reviews.map((review) => {
        const helpfulCount = Number.isInteger(review.helpfulCount) ? review.helpfulCount : 0;
        const mediaUrls = Array.isArray(review.mediaUrls) ? review.mediaUrls : [];
        const reasonTags = Array.isArray(review.reasonTags) ? review.reasonTags : [];

        return `
          <article class="detail-review" data-review-item data-review-id="${escapeHtml(review.id)}">
            <div class="detail-review__header">
              <div class="detail-review__author">
                <strong>${escapeHtml(review.author)}</strong>
                ${review.verifiedPurchase ? `<span class="detail-review__verified" data-verified-purchase>${t("detail.verifiedPurchase")}</span>` : ""}
              </div>
              <span class="detail-review__rating">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
            </div>
            <p>${escapeHtml(review.body)}</p>
            ${review.reply ? `
              <aside class="detail-review__merchant-reply" data-review-merchant-reply>
                <strong>${activeLocale === LOCALE_KEY.EN_US ? "Seller response" : "商家回复"}</strong>
                <p>${escapeHtml(review.reply.body)}</p>
              </aside>
            ` : ""}
            ${reasonTags.length ? `
              <div class="detail-review__reasons" aria-label="${activeLocale === LOCALE_KEY.EN_US ? "Negative review reason tags" : "差评原因标签"}">
                ${reasonTags.map((tag) => `<span class="detail-review__reason-tag" data-review-reason-tag>${escapeHtml(tag)}</span>`).join("")}
              </div>
            ` : ""}
            ${mediaUrls.length ? `
              <div class="detail-review__media" aria-label="${activeLocale === LOCALE_KEY.EN_US ? "Buyer photos" : "买家晒图"}">
                ${mediaUrls.map((url, index) => `
                  <img
                    class="detail-review__media-image"
                    src="${escapeHtml(url)}"
                    alt="${activeLocale === LOCALE_KEY.EN_US ? `Buyer photo ${index + 1}` : `买家晒图 ${index + 1}`}"
                    data-review-media
                    loading="lazy"
                  >
                `).join("")}
              </div>
            ` : ""}
            <div class="detail-review__footer">
              <time datetime="${escapeHtml(review.createdAt)}">${escapeHtml(String(review.createdAt || "").slice(0, 10))}</time>
              <button
                class="detail-review__helpful"
                type="button"
                data-review-helpful-button
                data-review-helpful-id="${escapeHtml(review.id)}"
              >${t("detail.helpful", { count: helpfulCount })}</button>
            </div>
          </article>
        `;
      }).join("");
    }

    function createReviewControlsMarkup(options = {}) {
      const activeSortValue = options.sort || "newest";
      const activeRatingValue = options.rating || "";
      const sortOptions = [
        ["newest", t("detail.reviewSortNewest")],
        ["rating-desc", t("detail.reviewSortHigh")],
        ["rating-asc", t("detail.reviewSortLow")]
      ];
      const ratingOptions = [
        ["", t("detail.reviewFilterAll")],
        ["5", "5 ★"],
        ["4", "4 ★"],
        ["3", "3 ★"],
        ["2", "2 ★"],
        ["1", "1 ★"]
      ];

      return `
        <div class="detail-reviews__controls" data-review-controls>
          <label>
            ${t("detail.reviewSort")}
            <select data-review-sort>
              ${sortOptions.map(([value, label]) => `
                <option value="${value}"${activeSortValue === value ? " selected" : ""}>${label}</option>
              `).join("")}
            </select>
          </label>
          <label>
            ${t("detail.reviewFilter")}
            <select data-review-rating-filter>
              ${ratingOptions.map(([value, label]) => `
                <option value="${value}"${activeRatingValue === value ? " selected" : ""}>${label}</option>
              `).join("")}
            </select>
          </label>
        </div>
      `;
    }

    function createProductReviewsMarkup(productId, payload = {}) {
      const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      const summary = payload.summary || { count: 0, averageRating: 0 };
      const averageRating = Number(summary.averageRating || 0).toFixed(1);
      const submissionStatus = payload.review?.status === "pending"
        ? t("detail.reviewPending")
        : payload.review?.status === "published"
          ? t("detail.reviewPublished")
          : "";

      return `
        <section class="detail-section detail-reviews" data-product-reviews data-product-id="${escapeHtml(productId)}">
          <div class="detail-reviews__heading">
            <div>
              <p class="detail-section__eyebrow">${t("detail.reviewsEyebrow")}</p>
              <h2 class="detail-section__title">${t("detail.reviewsTitle")}</h2>
            </div>
            <div class="detail-reviews__summary">
              <strong data-review-summary>${t("detail.reviewsSummary", { rating: averageRating })}</strong>
              <span data-product-review-count>${t("detail.reviewsCount", { count: summary.count || 0 })}</span>
            </div>
          </div>
          ${createReviewControlsMarkup(payload.options || {})}
          <div class="detail-reviews__list" data-review-list>
            ${createReviewItemsMarkup(reviews)}
          </div>
          <form class="detail-review-form" data-review-form novalidate>
            <label class="detail-review-form__field">
              ${t("detail.reviewAuthor")}
              <input name="author" maxlength="60" data-review-author>
            </label>
            <label class="detail-review-form__field">
              ${t("detail.reviewRating")}
              <select name="rating" data-review-rating>
                <option value="5">5</option>
                <option value="4">4</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
              </select>
            </label>
            <label class="detail-review-form__field detail-review-form__field--wide">
              ${t("detail.reviewBody")}
              <textarea name="body" maxlength="500" rows="4" data-review-body></textarea>
            </label>
            <p class="detail-review-form__status" data-review-submission-status role="status">${escapeHtml(submissionStatus)}</p>
            <p class="detail-review-form__error" data-review-error role="alert"></p>
            <button class="detail-review-form__submit" type="submit" data-review-submit>${t("detail.reviewSubmit")}</button>
          </form>
        </section>
      `;
    }

    function createQuestionItemsMarkup(questions) {
      if (!questions.length) {
        return `<p class="detail-questions__empty" data-question-empty>${t("detail.questionsEmpty")}</p>`;
      }

      return questions.map((question) => `
        <article class="detail-question" data-question-item>
          <div class="detail-question__header">
            <strong>${escapeHtml(question.author)}</strong>
            <time datetime="${escapeHtml(question.createdAt)}">${escapeHtml(String(question.createdAt || "").slice(0, 10))}</time>
          </div>
          <p class="detail-question__body">${escapeHtml(question.question)}</p>
          <p class="detail-question__answer">${escapeHtml(question.answer || t("detail.questionPendingAnswer"))}</p>
        </article>
      `).join("");
    }

    function createProductQuestionsMarkup(productId, payload = {}) {
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      const summary = payload.summary || { count: 0 };

      return `
        <section class="detail-section detail-questions" data-product-questions data-product-id="${escapeHtml(productId)}">
          <div class="detail-questions__heading">
            <div>
              <p class="detail-section__eyebrow">${t("detail.questionsEyebrow")}</p>
              <h2 class="detail-section__title">${t("detail.questionsTitle")}</h2>
            </div>
            <span class="detail-questions__count" data-product-question-count>${t("detail.questionsCount", { count: summary.count || 0 })}</span>
          </div>
          <div class="detail-questions__list" data-question-list>
            ${createQuestionItemsMarkup(questions)}
          </div>
          <form class="detail-question-form" data-question-form novalidate>
            <label class="detail-question-form__field">
              ${t("detail.questionAuthor")}
              <input name="author" maxlength="60" data-question-author>
            </label>
            <label class="detail-question-form__field detail-question-form__field--wide">
              ${t("detail.questionBody")}
              <textarea name="question" maxlength="280" rows="3" data-question-body></textarea>
            </label>
            <p class="detail-question-form__error" data-question-error role="alert"></p>
            <button class="detail-question-form__submit" type="submit" data-question-submit>${t("detail.questionSubmit")}</button>
          </form>
        </section>
      `;
    }

    function createSavedProductMarkup(productId) {
      const isSaved = savedProductIds.has(productId);
      return `
        <div class="detail-save" data-save-product-root>
          <button class="detail-save__button${isSaved ? " is-saved" : ""}" type="button" data-save-product-button data-product-id="${escapeHtml(productId)}" aria-pressed="${isSaved}">
            ${isSaved ? t("detail.savedProduct") : t("detail.saveProduct")}
          </button>
          <span class="detail-save__count" data-saved-products-count>${t("detail.savedProductsCount", { count: savedProductIds.size })}</span>
        </div>
      `;
    }

    function createDetailPagePanelMarkup(product, options = {}) {
      const localizedProduct = getLocalizedProduct(product);
      const previousProduct = options.previousProduct || null;
      const nextProduct = options.nextProduct || null;
      const detailSourceMarkup = options.detailSourceMarkup || "";
      const recommendationsMarkup = options.recommendationsMarkup || `<p class="detail-recommendations__empty">${t("detail.noRecommendations")}</p>`;
      const reviewsMarkup = options.reviewsMarkup || createProductReviewsMarkup(product.id);
      const questionsMarkup = options.questionsMarkup || createProductQuestionsMarkup(product.id);
      const detailTag = product.isRecommended ? t("listing.recommendedTag") : localizedProduct.categoryLabel;
      const sizeButtons = createSizeButtonsMarkup(product, {
        dataAttribute: "data-detail-size"
      });
      const selectedVariant = getProductVariants(product).find(isVariantAvailable)
        || getProductVariants(product)[0]
        || null;

      return `
        <div class="detail-stack">
          ${detailSourceMarkup}
          <div class="detail-layout" data-detail-product-root data-product-id="${product.id}">
            <section class="detail-visual">
              <span class="detail-visual__badge">${product.discount}</span>
              <span class="detail-visual__tag">${detailTag}</span>
              <div class="detail-visual__sock" aria-hidden="true">${createSockIllustration(product)}</div>
              ${createGalleryMarkup(product)}
            </section>
            <section class="detail-content">
              <div class="detail-content__meta">
                <div class="detail-content__price">
                  <span class="detail-content__price-current" data-detail-page-price>¥${product.price}</span>
                  <span class="detail-content__price-original" data-detail-page-original-price>¥${product.originalPrice}</span>
                </div>
                ${createRatingMarkup(product)}
                ${createCommerceMarkup(product)}
              </div>
              ${createProductMetadataMarkup(product)}
              <div class="product-card__sizes" aria-label="${localizedProduct.title} sizes">
                ${sizeButtons}
              </div>
              <p class="detail-content__stock" data-selected-sku-stock>${getVariantStockText(selectedVariant)}</p>
              <p class="detail-content__release">${product.releaseDate}</p>
              <div class="detail-content__cart-actions" data-cart-actions>
                <button class="detail-content__cta" type="button" data-detail-cart-button>${t("cart.addToCart")}</button>
              </div>
              ${createSavedProductMarkup(product.id)}
              ${createBundleCardMarkup()}
            </section>
          </div>
          <div class="detail-sections">
            ${createSizeChartMarkup(product)}
            ${questionsMarkup}
            <section class="detail-section">
              <p class="detail-section__eyebrow">${t("detail.continueEyebrow")}</p>
              <h2 class="detail-section__title">${t("detail.continueTitle")}</h2>
              <div class="detail-nav">
                ${createDetailNavigationLink("previous", previousProduct)}
                ${createDetailNavigationLink("next", nextProduct)}
              </div>
            </section>
            <section class="detail-section">
              <p class="detail-section__eyebrow">${t("detail.recommendedEyebrow")}</p>
              <h2 class="detail-section__title">${t("detail.recommendedTitle")}</h2>
              ${recommendationsMarkup}
            </section>
            ${reviewsMarkup}
          </div>
        </div>
      `;
    }

    function createDetailEmptyStateMarkup() {
      return `
        <div class="detail-empty-state" data-detail-empty-state>
          <p class="detail-empty-state__title">${t("detail.emptyTitle")}</p>
          <p class="detail-empty-state__copy">${t("detail.emptyCopy")}</p>
        </div>
      `;
    }

    function createGalleryMarkup(product) {
      const gallery = Array.isArray(product.gallery) ? product.gallery : [];
      if (!gallery.length) {
        return "";
      }

      const primaryImage = gallery[0];
      return `
        <section class="detail-gallery" data-product-gallery>
          <img class="detail-gallery__image" src="${primaryImage.src}" alt="${primaryImage.alt}" data-product-gallery-image>
          <div class="detail-gallery__thumbs">
            ${gallery.map((image) => `
              <button class="detail-gallery__thumb" type="button" data-product-gallery-thumb data-gallery-src="${image.src}" data-gallery-alt="${image.alt}">
                <img src="${image.src}" alt="${image.alt}">
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }

    function createProductMetadataMarkup(product) {
      const colors = Array.isArray(product.colors) ? product.colors.join(", ") : "";
      const materials = Array.isArray(product.materials) ? product.materials.join(", ") : "";

      return `
        <div class="detail-metadata">
          <p data-product-colors>Colors: ${colors || "Not specified"}</p>
          <p data-product-materials>Materials: ${materials || "Not specified"}</p>
        </div>
      `;
    }

    function createSizeChartMarkup(product) {
      const rows = Array.isArray(product.sizeChart) ? product.sizeChart : [];
      if (!rows.length) {
        return "";
      }

      return `
        <section class="size-chart" data-size-chart>
          <h3>Size chart</h3>
          <div class="size-chart__grid">
            ${rows.map((row) => `
              <div class="size-chart__row" data-size-chart-row>
                <span>${row.size}</span>
                <span>${row.footLengthCm}</span>
                <span>${row.usMen}</span>
                <span>${row.usWomen}</span>
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }

    function createCardMarkup(product) {
      const localizedProduct = getLocalizedProduct(product);
      const sizeButtons = createSizeButtonsMarkup(product);

      const recommendationTag = product.isRecommended
        ? `<span class="product-card__tag">${t("listing.recommendedTag")}</span>`
        : `<span class="product-card__tag">${localizedProduct.categoryLabel}</span>`;

      return `
        <article class="product-card" data-product-card data-product-id="${product.id}">
          <div class="product-card__media">
            <span class="product-card__badge">${product.discount}</span>
            ${recommendationTag}
            <div class="product-card__sock" aria-hidden="true">${createSockIllustration(product)}</div>
          </div>
          <div class="product-card__content">
            <div>
              <p class="product-card__series">${localizedProduct.series}</p>
              <h2 class="product-card__title">${localizedProduct.title}</h2>
              <p class="product-card__name">${localizedProduct.categoryLabel}</p>
            </div>
            <div class="product-card__price">
              <span class="product-card__price-current">¥${product.price}</span>
              <span class="product-card__price-original">¥${product.originalPrice}</span>
            </div>
            ${createRatingMarkup(product)}
            <p class="product-card__description">${localizedProduct.description}</p>
            ${createCommerceMarkup(product)}
            <div class="product-card__sizes" aria-label="${localizedProduct.title} sizes">
              ${sizeButtons}
            </div>
            <div class="product-card__footer">
              <span class="product-card__name">${product.releaseDate}</span>
            </div>
            <a class="product-card__detail-link" href="${getActiveDetailHref(product.id)}" data-product-detail-link>${t("listing.viewDetails")}</a>
            <div class="product-card__cart-actions" data-cart-actions>
              <button class="product-card__cta" type="button" data-cart-button>${t("cart.addToCart")}</button>
            </div>
          </div>
        </article>
      `;
    }

    async function fetchProducts() {
      const params = new URLSearchParams({
        filter: activeFilter,
        sort: activeSort,
        locale: activeLocale,
        page: String(activePage),
        pageSize: String(activePageSize)
      });

      if (activeQuery) {
        params.set("q", activeQuery);
      }

      appendAdvancedFilterParams(params);

      const response = await fetch(`/api/products?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load products");
      }

      const payload = await response.json();
      activeHasMore = Boolean(payload.meta?.hasMore);
      activeTotalCount = payload.meta?.totalCount ?? payload.meta.count;
      recommendationProducts = Array.isArray(payload.recommendations) ? payload.recommendations : [];
      resultCount.textContent = t("listing.resultCount", { count: activeTotalCount });
      return payload.items;
    }

    function getCartQuantity(items) {
      return items.reduce((total, item) => total + item.quantity, 0);
    }

    function findProduct(productId) {
      return productCatalog.get(productId) || null;
    }

    function syncProductCatalog(products) {
      products.forEach((product) => {
        productCatalog.set(product.id, product);
      });
    }

    function syncActiveStateFromUrl() {
      activeFilter = getRequestedFilter();
      activeSort = getRequestedSort();
      activeQuery = getRequestedQuery();
      activeMinPrice = getRequestedNumberParam("minPrice");
      activeMaxPrice = getRequestedNumberParam("maxPrice");
      activeSize = getRequestedSize();
      activeStock = getRequestedStock();
      activeRatingMin = getRequestedNumberParam("ratingMin");
      activePage = getRequestedPage();
      activePageSize = getRequestedPageSize();
    }

    function bindSizeSelection(sizeButtons, options = {}) {
      sizeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (button.disabled) {
            return;
          }

          sizeButtons.forEach((sizeButton) => {
            sizeButton.classList.remove("is-selected");
            sizeButton.setAttribute("aria-pressed", "false");
          });

          button.classList.add("is-selected");
          button.setAttribute("aria-pressed", "true");
          options.onChange?.(button);
        });
      });
    }

    function getCartFeedbackState(feedbackKey) {
      const existingState = cartFeedbackCounts.get(feedbackKey);
      if (existingState) {
        return existingState;
      }

      const nextState = new Map();
      cartFeedbackCounts.set(feedbackKey, nextState);
      return nextState;
    }

    function createCartFeedbackMarkup(sizeCounts) {
      const entries = getSortedSizeCountEntries(sizeCounts);
      const totalCount = entries.reduce((total, [, count]) => total + count, 0);

      return `<span class="cart-feedback__summary" data-cart-feedback-summary>${t("cart.selectedSizesSummary", { count: totalCount })}</span>`;
    }

    function getSortedSizeCountEntries(sizeCounts) {
      return Array.from(sizeCounts.entries()).sort(([leftSize], [rightSize]) => {
        const leftNumber = Number(leftSize);
        const rightNumber = Number(rightSize);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
          return leftNumber - rightNumber;
        }
        return String(leftSize).localeCompare(String(rightSize));
      });
    }

    function createCartFeedbackPopoverMarkup(sizeCounts) {
      return getSortedSizeCountEntries(sizeCounts)
        .map(([size, count]) => `<span class="cart-feedback__size" data-cart-feedback-size>${size} x${count}</span>`)
        .join("");
    }

    function ensureCardRemoveButton(cartActions, button) {
      const removeButton = cartActions.querySelector("[data-card-remove-button]")
        || document.createElement("button");
      removeButton.className = "product-card__cta product-card__cta--remove";
      removeButton.type = "button";
      removeButton.textContent = t("cart.removeSelected");
      removeButton.setAttribute("data-card-remove-button", "");
      removeButton.setAttribute("aria-label", t("cart.removeSelectedAria"));

      if (!removeButton.parentElement) {
        button.insertAdjacentElement("afterend", removeButton);
      }

      return removeButton;
    }

    function renderCartButtonFeedback(button, sizeCounts) {
      if (!button || !sizeCounts.size) {
        return;
      }

      const feedbackMarkup = createCartFeedbackMarkup(sizeCounts);
      const cartActions = button.closest("[data-cart-actions]");

      if (!cartActions) {
        button.innerHTML = feedbackMarkup;
        return;
      }

      const isDetailAction = button.classList.contains("detail-content__cta");
      cartActions.classList.toggle("is-split", isDetailAction);
      cartActions.classList.toggle("is-triple", !isDetailAction);
      button.textContent = t("cart.addToCart");

      if (isDetailAction) {
        cartActions.querySelector("[data-card-remove-button]")?.remove();
      } else {
        ensureCardRemoveButton(cartActions, button);
      }

      const feedbackButton = cartActions.querySelector("[data-cart-feedback-button]")
        || document.createElement("button");
      feedbackButton.className = isDetailAction
        ? "detail-content__cta detail-content__cta--feedback"
        : "product-card__cta product-card__cta--feedback";
      feedbackButton.type = "button";
      feedbackButton.setAttribute("data-cart-feedback-button", "");
      feedbackButton.setAttribute("aria-live", "polite");
      feedbackButton.innerHTML = feedbackMarkup;

      if (!feedbackButton.parentElement) {
        cartActions.appendChild(feedbackButton);
      }

      const feedbackPopover = cartActions.querySelector("[data-cart-feedback-popover]")
        || document.createElement("div");
      feedbackPopover.className = "cart-feedback__popover";
      feedbackPopover.setAttribute("data-cart-feedback-popover", "");
      feedbackPopover.setAttribute("aria-hidden", "true");
      feedbackPopover.innerHTML = createCartFeedbackPopoverMarkup(sizeCounts);

      if (!feedbackPopover.parentElement) {
        cartActions.appendChild(feedbackPopover);
      }
    }

    function clearCartButtonFeedback(button, feedbackKey) {
      if (!button) {
        return;
      }

      cartFeedbackCounts.delete(feedbackKey);

      const cartActions = button.closest("[data-cart-actions]");
      if (cartActions) {
        cartActions.classList.remove("is-split");
        cartActions.classList.remove("is-triple");
        cartActions.querySelector("[data-card-remove-button]")?.remove();
        cartActions.querySelector("[data-cart-feedback-button]")?.remove();
        cartActions.querySelector("[data-cart-feedback-popover]")?.remove();
      }

      button.textContent = t("cart.addToCart");
    }

    function updateCartButtonFeedback(button, feedbackKey, selectedSize) {
      const feedbackState = getCartFeedbackState(feedbackKey);
      feedbackState.set(selectedSize, (feedbackState.get(selectedSize) || 0) + 1);
      renderCartButtonFeedback(button, feedbackState);
    }

    function getCartSizeCounts(productId) {
      return cartState.items.reduce((counts, item) => {
        if (item.productId !== productId) {
          return counts;
        }

        counts.set(item.size, (counts.get(item.size) || 0) + item.quantity);
        return counts;
      }, new Map());
    }

    function restoreCartButtonFeedback(button, productId, feedbackKey = productId) {
      const sizeCounts = getCartSizeCounts(productId);
      if (!sizeCounts.size) {
        clearCartButtonFeedback(button, feedbackKey);
        return;
      }

      cartFeedbackCounts.set(feedbackKey, new Map(sizeCounts));
      renderCartButtonFeedback(button, sizeCounts);
    }

    function syncVisibleCartFeedback() {
      const productCards = Array.from(productGrid.querySelectorAll("[data-product-card]"));
      productCards.forEach((card) => {
        restoreCartButtonFeedback(card.querySelector("[data-cart-button]"), card.dataset.productId);
      });

      const detailRoot = detailPagePanel.querySelector("[data-detail-product-root]");
      if (detailRoot?.dataset.productId) {
        restoreCartButtonFeedback(
          detailRoot.querySelector("[data-detail-cart-button]"),
          detailRoot.dataset.productId,
          `${detailRoot.dataset.productId}-detail`
        );
      }
    }

    function getCardRemoveItems(productId) {
      return cartState.items.filter((item) => {
        return item.productId === productId && item.quantity > 0;
      });
    }

    function getCardRemoveDialog() {
      const existingDialog = document.querySelector("[data-card-remove-dialog]");
      if (existingDialog) {
        return existingDialog;
      }

      const dialog = document.createElement("div");
      dialog.className = "card-remove-dialog";
      dialog.setAttribute("data-card-remove-dialog", "");
      dialog.setAttribute("data-open", "false");
      dialog.setAttribute("aria-hidden", "true");
      document.body.appendChild(dialog);

      dialog.addEventListener("click", async (event) => {
        if (event.target === dialog) {
          closeCardRemoveDialog();
          return;
        }

        const sizeButton = event.target.closest("[data-card-remove-size]");
        if (sizeButton) {
          cardRemoveDialogState.selectedSize = sizeButton.dataset.size;
          cardRemoveDialogState.quantity = 1;
          renderCardRemoveDialog();
          return;
        }

        const decreaseButton = event.target.closest("[data-card-remove-decrease]");
        if (decreaseButton) {
          cardRemoveDialogState.quantity = Math.max(1, cardRemoveDialogState.quantity - 1);
          renderCardRemoveDialog();
          return;
        }

        const increaseButton = event.target.closest("[data-card-remove-increase]");
        if (increaseButton) {
          const item = getSelectedCardRemoveItem();
          if (item) {
            cardRemoveDialogState.quantity = Math.min(item.quantity, cardRemoveDialogState.quantity + 1);
            renderCardRemoveDialog();
          }
          return;
        }

        const cancelButton = event.target.closest("[data-card-remove-cancel]");
        if (cancelButton) {
          closeCardRemoveDialog();
          return;
        }

        const confirmButton = event.target.closest("[data-card-remove-confirm]");
        if (confirmButton) {
          await confirmCardRemoveDialog();
        }
      });

      return dialog;
    }

    function getSelectedCardRemoveItem() {
      return cartState.items.find((item) => {
        return item.productId === cardRemoveDialogState.productId
          && item.size === cardRemoveDialogState.selectedSize;
      });
    }

    function renderCardRemoveDialog() {
      const dialog = getCardRemoveDialog();
      const items = getCardRemoveItems(cardRemoveDialogState.productId);

      if (!items.length) {
        closeCardRemoveDialog();
        return;
      }

      const selectedItem = items.find((item) => item.size === cardRemoveDialogState.selectedSize) || items[0];
      cardRemoveDialogState.selectedSize = selectedItem.size;
      cardRemoveDialogState.quantity = Math.min(Math.max(1, cardRemoveDialogState.quantity), selectedItem.quantity);

      dialog.innerHTML = `
        <div class="card-remove-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="card-remove-dialog-title">
          <h2 class="card-remove-dialog__title" id="card-remove-dialog-title">${t("cart.removeDialogTitle")}</h2>
          <p class="card-remove-dialog__copy">${t("cart.removeDialogCopy")}</p>
          <div class="card-remove-dialog__sizes" data-card-remove-sizes>
            ${items.map((item) => `
              <button
                class="card-remove-dialog__size${item.size === selectedItem.size ? " is-selected" : ""}"
                type="button"
                data-card-remove-size
                data-size="${item.size}"
                aria-pressed="${item.size === selectedItem.size ? "true" : "false"}"
              >${item.size} x${item.quantity}</button>
            `).join("")}
          </div>
          <div class="card-remove-dialog__quantity">
            <button class="card-remove-dialog__qty-button" type="button" data-card-remove-decrease aria-label="${t("cart.removeDialogDecrease")}"${cardRemoveDialogState.quantity <= 1 || isCartMutationPending ? " disabled" : ""}>-</button>
            <span class="card-remove-dialog__qty-value" data-card-remove-quantity>${cardRemoveDialogState.quantity}</span>
            <button class="card-remove-dialog__qty-button" type="button" data-card-remove-increase aria-label="${t("cart.removeDialogIncrease")}"${cardRemoveDialogState.quantity >= selectedItem.quantity || isCartMutationPending ? " disabled" : ""}>+</button>
          </div>
          <div class="card-remove-dialog__actions">
            <button class="card-remove-dialog__action" type="button" data-card-remove-cancel${isCartMutationPending ? " disabled" : ""}>${t("cart.removeDialogCancel")}</button>
            <button class="card-remove-dialog__action card-remove-dialog__action--primary" type="button" data-card-remove-confirm${isCartMutationPending ? " disabled" : ""}>${t("cart.removeDialogConfirm")}</button>
          </div>
        </div>
      `;
    }

    function openCardRemoveDialog(productId) {
      const items = getCardRemoveItems(productId);
      if (!items.length) {
        return;
      }

      cardRemoveDialogState.productId = productId;
      cardRemoveDialogState.selectedSize = items[0].size;
      cardRemoveDialogState.quantity = 1;
      renderCardRemoveDialog();

      const dialog = getCardRemoveDialog();
      dialog.setAttribute("data-open", "true");
      dialog.setAttribute("aria-hidden", "false");
      dialog.querySelector("[data-card-remove-size]")?.focus();
    }

    function closeCardRemoveDialog() {
      const dialog = document.querySelector("[data-card-remove-dialog]");
      if (!dialog) {
        return;
      }

      dialog.setAttribute("data-open", "false");
      dialog.setAttribute("aria-hidden", "true");
      cardRemoveDialogState.productId = null;
      cardRemoveDialogState.selectedSize = "";
      cardRemoveDialogState.quantity = 1;
    }

    function syncOpenCardRemoveDialog() {
      const dialog = document.querySelector("[data-card-remove-dialog]");
      if (dialog?.dataset.open === "true") {
        renderCardRemoveDialog();
      }
    }

    async function confirmCardRemoveDialog() {
      if (isCartMutationPending) {
        return;
      }

      const item = getSelectedCardRemoveItem();
      if (!item) {
        closeCardRemoveDialog();
        return;
      }

      const removeQuantity = Math.min(cardRemoveDialogState.quantity, item.quantity);
      const remainingQuantity = item.quantity - removeQuantity;

      try {
        if (remainingQuantity <= 0) {
          await removeCartItem(item.productId, item.size);
        } else {
          await updateCartItem(item.productId, item.size, remainingQuantity);
        }
        closeCardRemoveDialog();
      } catch (error) {
        renderCartState();
      }
    }

    function getStockToast() {
      const existingToast = document.querySelector("[data-stock-toast]");
      if (existingToast) {
        return existingToast;
      }

      const toast = document.createElement("div");
      toast.className = "stock-toast";
      toast.setAttribute("data-stock-toast", "");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
      return toast;
    }

    function showOutOfStockToast() {
      const toast = getStockToast();
      toast.textContent = t("cart.outOfStock");
      toast.classList.add("is-visible");

      window.clearTimeout(stockToastTimer);
      stockToastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
      }, 1800);
    }

    function isOutOfStockError(error) {
      return error && (error.code === "OUT_OF_STOCK" || error.code === "INSUFFICIENT_STOCK");
    }

    async function createCartRequestError(response, fallbackMessage) {
      let payload = {};
      try {
        payload = await response.json();
      } catch (error) {
        payload = {};
      }

      const requestError = new Error(payload.error?.message || fallbackMessage);
      requestError.code = payload.error?.code;
      requestError.status = response.status;
      return requestError;
    }

    function createDetailBackHref() {
      const params = appendStorefrontQueryParams(new URLSearchParams(), {
        filter: getRequestedFilter(),
        sort: getRequestedSort(),
        q: getRequestedQuery()
      });
      appendAdvancedContextParams(params, {
        minPrice: getRequestedNumberParam("minPrice"),
        maxPrice: getRequestedNumberParam("maxPrice"),
        size: getRequestedSize(),
        stock: getRequestedStock(),
        ratingMin: getRequestedNumberParam("ratingMin"),
        pageSize: getRequestedPageSize()
      });

      const search = params.toString();
      return search ? `${STOREFRONT_PATH}?${search}` : STOREFRONT_PATH;
    }

    function renderDetailEmptyState(backHref) {
      detailPageSeries.textContent = t("detail.pageSeries");
      detailPageTitle.textContent = t("detail.emptyTitle");
      detailPageDescription.textContent = t("detail.emptyCopy");
      detailBackLink.textContent = t("common.backToStorefront");
      detailBackLink.href = backHref;
      detailPagePanel.innerHTML = createDetailEmptyStateMarkup();
    }

    function renderProductReviews(productId, payload) {
      const currentSection = detailPagePanel.querySelector("[data-product-reviews]");
      if (!currentSection) {
        return;
      }

      currentSection.outerHTML = createProductReviewsMarkup(productId, payload);
      bindProductReviewForm(productId);
      bindProductReviewControls(productId);
      bindProductReviewHelpfulButtons(productId);
    }

    function bindProductReviewControls(productId) {
      const reviewSection = detailPagePanel.querySelector("[data-product-reviews]");
      if (!reviewSection) {
        return;
      }

      const sortSelect = reviewSection.querySelector("[data-review-sort]");
      const ratingSelect = reviewSection.querySelector("[data-review-rating-filter]");
      const reloadReviews = async () => {
        const payload = await fetchProductReviews(productId, {
          sort: sortSelect?.value || "newest",
          rating: ratingSelect?.value || ""
        });
        renderProductReviews(productId, payload);
      };

      sortSelect?.addEventListener("change", reloadReviews);
      ratingSelect?.addEventListener("change", reloadReviews);
    }

    function bindProductReviewHelpfulButtons(productId) {
      const reviewSection = detailPagePanel.querySelector("[data-product-reviews]");
      if (!reviewSection) {
        return;
      }

      reviewSection.querySelectorAll("[data-review-helpful-button]").forEach((button) => {
        button.addEventListener("click", async () => {
          const reviewId = button.getAttribute("data-review-helpful-id");
          if (!reviewId || button.disabled) {
            return;
          }

          const originalLabel = button.textContent;
          button.disabled = true;
          button.textContent = t("detail.helpfulSubmitting");

          try {
            const payload = await markProductReviewHelpful(productId, reviewId);
            renderProductReviews(productId, payload);
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
          }
        });
      });
    }

    function bindProductReviewForm(productId) {
      const reviewForm = detailPagePanel.querySelector("[data-review-form]");
      if (!reviewForm) {
        return;
      }

      reviewForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = reviewForm.querySelector("[data-review-submit]");
        const errorNode = reviewForm.querySelector("[data-review-error]");
        const formData = new FormData(reviewForm);
        submitButton.disabled = true;
        submitButton.textContent = t("detail.reviewSubmitting");
        errorNode.textContent = "";

        try {
          const payload = await createProductReview(productId, {
            author: formData.get("author"),
            rating: formData.get("rating"),
            body: formData.get("body")
          });
          renderProductReviews(productId, payload);
        } catch (error) {
          errorNode.textContent = t("detail.reviewError");
          submitButton.disabled = false;
          submitButton.textContent = t("detail.reviewSubmit");
        }
      });
    }

    function renderProductQuestions(productId, payload) {
      const currentSection = detailPagePanel.querySelector("[data-product-questions]");
      if (!currentSection) {
        return;
      }

      currentSection.outerHTML = createProductQuestionsMarkup(productId, payload);
      bindProductQuestionForm(productId);
    }

    function bindProductQuestionForm(productId) {
      const questionForm = detailPagePanel.querySelector("[data-question-form]");
      if (!questionForm) {
        return;
      }

      questionForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = questionForm.querySelector("[data-question-submit]");
        const errorNode = questionForm.querySelector("[data-question-error]");
        const formData = new FormData(questionForm);
        submitButton.disabled = true;
        submitButton.textContent = t("detail.questionSubmitting");
        errorNode.textContent = "";

        try {
          const payload = await createProductQuestion(productId, {
            author: formData.get("author"),
            question: formData.get("question")
          });
          renderProductQuestions(productId, payload);
        } catch (error) {
          errorNode.textContent = t("detail.questionError");
          submitButton.disabled = false;
          submitButton.textContent = t("detail.questionSubmit");
        }
      });
    }

    function applySavedProductsPayload(payload = {}) {
      savedProductIds = new Set(Array.isArray(payload.savedProductIds) ? payload.savedProductIds : []);
    }

    function refreshSaveButtons() {
      detailPagePanel.querySelectorAll("[data-save-product-button]").forEach((button) => {
        const productId = button.dataset.productId;
        const isSaved = savedProductIds.has(productId);
        button.classList.toggle("is-saved", isSaved);
        button.setAttribute("aria-pressed", String(isSaved));
        button.textContent = isSaved ? t("detail.savedProduct") : t("detail.saveProduct");
      });

      detailPagePanel.querySelectorAll("[data-saved-products-count]").forEach((node) => {
        node.textContent = t("detail.savedProductsCount", { count: savedProductIds.size });
      });
    }

    function bindSavedProductButton(productId) {
      const saveButton = detailPagePanel.querySelector("[data-save-product-button]");
      if (!saveButton) {
        return;
      }

      saveButton.addEventListener("click", async () => {
        saveButton.disabled = true;
        try {
          const payload = savedProductIds.has(productId)
            ? await removeSavedProduct(productId)
            : await saveProduct(productId);
          applySavedProductsPayload(payload);
          refreshSaveButtons();
        } catch (error) {
          showOutOfStockToast();
        } finally {
          saveButton.disabled = false;
        }
      });
    }

    function bindDetailInteractions(product) {
      const detailRoot = detailPagePanel.querySelector("[data-detail-product-root]");
      if (!detailRoot) {
        return;
      }

      bindProductReviewForm(product.id);
      bindProductReviewControls(product.id);
      bindProductReviewHelpfulButtons(product.id);
      bindProductQuestionForm(product.id);
      bindSavedProductButton(product.id);

      const sizeButtons = Array.from(detailRoot.querySelectorAll("[data-detail-size]"));
      const cartButton = detailRoot.querySelector("[data-detail-cart-button]");

      const updateSelectedSkuStock = (button) => {
        const selectedVariant = findVariantForSize(product, button.dataset.size || button.textContent.trim());
        const stockNode = detailRoot.querySelector("[data-selected-sku-stock]");
        if (stockNode) {
          stockNode.textContent = getVariantStockText(selectedVariant);
        }
      };

      bindSizeSelection(sizeButtons, {
        onChange: updateSelectedSkuStock
      });

      detailRoot.querySelectorAll("[data-product-gallery-thumb]").forEach((button) => {
        button.addEventListener("click", () => {
          const image = detailRoot.querySelector("[data-product-gallery-image]");
          if (!image) {
            return;
          }

          image.src = button.dataset.gallerySrc;
          image.alt = button.dataset.galleryAlt;
        });
      });

      detailRoot.querySelectorAll("[data-add-bundle]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await addBundle(button.dataset.addBundle);
          } catch (error) {
            showOutOfStockToast();
          } finally {
            button.disabled = false;
          }
        });
      });

      if (!cartButton) {
        return;
      }

      restoreCartButtonFeedback(cartButton, product.id, `${product.id}-detail`);

      cartButton.addEventListener("click", async () => {
        const selectedSize = detailRoot.querySelector('[data-detail-size][aria-pressed="true"]');

        if (!selectedSize || selectedSize.disabled) {
          showOutOfStockToast();
          return;
        }

        try {
          const selectedSizeValue = selectedSize.dataset.size || selectedSize.textContent.trim();
          await addCartItem(product.id, selectedSizeValue);
        } catch (error) {
          if (isOutOfStockError(error)) {
            showOutOfStockToast();
          }
          cartButton.textContent = t("cart.addToCart");
        }
      });
    }

    async function renderDetailPage() {
      const backHref = createDetailBackHref();
      const requestedProductId = getRequestedDetailProductId();
      const requestedFilter = getRequestedFilter();
      const requestedSort = getRequestedSort();
      const requestedQuery = getRequestedQuery();

      if (hasExplicitStorefrontContextInUrl()) {
        syncNavigationContext(requestedFilter, requestedSort, requestedQuery);
      }

      detailBackLink.href = backHref;

      if (!requestedProductId) {
        renderDetailEmptyState(backHref);
        return;
      }

      const allProductsPromise = fetchAllProducts();
      const contextProductsPromise = requestedFilter === FILTER_KEY.ALL && requestedSort === SORT_KEY.RECOMMENDED
        && !requestedQuery
        ? allProductsPromise
        : fetchProductsForState(requestedFilter, requestedSort, requestedQuery).catch(() => []);

      const [allProducts, contextProducts] = await Promise.all([
        allProductsPromise,
        contextProductsPromise
      ]);

      syncProductCatalog(allProducts);
      renderCartState();
      const product = allProducts.find((entry) => entry.id === requestedProductId);

      if (!product) {
        renderDetailEmptyState(backHref);
        return;
      }

      await recordRecentView(product.id).catch(() => {});

      const { previousProduct, nextProduct } = getDetailNavigationState(
        requestedProductId,
        Array.isArray(contextProducts) && contextProducts.length ? contextProducts : allProducts
      );
      const recommendedProducts = allProducts
        .filter((entry) => entry.id !== requestedProductId)
        .slice(0, 3);
      const reviewPayload = await fetchProductReviews(product.id).catch(() => ({
        ok: true,
        productId: product.id,
        summary: { count: 0, averageRating: 0 },
        reviews: []
      }));
      const questionPayload = await fetchProductQuestions(product.id).catch(() => ({
        ok: true,
        productId: product.id,
        summary: { count: 0 },
        questions: []
      }));
      const savedPayload = await fetchSavedProducts().catch(() => ({
        ok: true,
        savedProductIds: [],
        items: []
      }));
      applySavedProductsPayload(savedPayload);
      const localizedProduct = getLocalizedProduct(product);

      detailPageSeries.textContent = product.series;
      detailPageTitle.textContent = localizedProduct.title;
      detailPageDescription.textContent = localizedProduct.description;
      detailBackLink.href = backHref;
      detailPagePanel.innerHTML = createDetailPagePanelMarkup(product, {
        previousProduct,
        nextProduct,
        detailSourceMarkup: createDetailSourceMarkup(product),
        recommendationsMarkup: createDetailRecommendationsMarkup(recommendedProducts),
        questionsMarkup: createProductQuestionsMarkup(product.id, questionPayload),
        reviewsMarkup: createProductReviewsMarkup(product.id, reviewPayload)
      });

      const stockLabel = detailPagePanel.querySelector("[data-stock-label]");
      if (stockLabel) {
        stockLabel.setAttribute("data-detail-page-stock", "");
      }

      bindDetailInteractions(product);
    }

    function createCartItemMarkup(item) {
      const product = findProduct(item.productId);
      const localizedProduct = getLocalizedProduct(product);
      const title = localizedProduct ? localizedProduct.title : t("cart.itemFallback");
      const series = localizedProduct ? localizedProduct.series : "Anonymous Cart";
      const sizeText = t("cart.size", { size: item.size });
      const quantityText = `x${item.quantity}`;
      const unitPrice = product ? product.price : 0;
      const subtotal = unitPrice * item.quantity;
      const detailHref = product
        ? getContextualDetailHref(product.id, {
          filter: isValidFilter(getSearchParams().get("filter")) ? getSearchParams().get("filter") : undefined,
          sort: isValidSort(getSearchParams().get("sort")) ? getSearchParams().get("sort") : undefined,
          query: getRequestedQuery()
        })
        : "";
      const detailLinkMarkup = product
        ? `<a class="cart-drawer__item-link" href="${detailHref}" data-cart-item-detail-link>${t("cart.viewItem")}</a>`
        : "";

      return `
        <article class="cart-drawer__item" data-cart-item>
          <div class="cart-drawer__item-meta">
            <span>${series}</span>
            <span>${quantityText}</span>
          </div>
          <h3 class="cart-drawer__item-title">${title}</h3>
          <p class="cart-drawer__item-detail">${sizeText}</p>
          <p class="cart-drawer__item-subtotal">¥${subtotal}</p>
          <div class="cart-drawer__item-actions">
            <div class="cart-drawer__qty-controls">
              <button class="cart-drawer__qty-button" type="button" data-cart-decrease data-product-id="${item.productId}" data-size="${item.size}" aria-label="${t("cart.decrease", { title })}"${item.quantity <= 1 || isCartMutationPending ? " disabled" : ""}>-</button>
              <span class="cart-drawer__qty-value">${item.quantity}</span>
              <button class="cart-drawer__qty-button" type="button" data-cart-increase data-product-id="${item.productId}" data-size="${item.size}" aria-label="${t("cart.increase", { title })}"${isCartMutationPending ? " disabled" : ""}>+</button>
            </div>
            <div class="cart-drawer__item-secondary-actions">
              ${detailLinkMarkup}
              <button class="cart-drawer__remove" type="button" data-cart-remove data-product-id="${item.productId}" data-size="${item.size}" aria-label="${t("cart.remove", { title })}"${isCartMutationPending ? " disabled" : ""}>${activeLocale === LOCALE_KEY.EN_US ? "Remove" : "移除"}</button>
            </div>
          </div>
        </article>
      `;
    }

    function createOrderConfirmationMarkup() {
      if (!orderConfirmationState) {
        return "";
      }

      return `
        <section class="cart-drawer__confirmation" data-order-confirmation>
          <p class="cart-drawer__confirmation-eyebrow">${t("cart.confirmationEyebrow")}</p>
          <h3 class="cart-drawer__confirmation-title">${t("cart.confirmationTitle")}</h3>
          <p class="cart-drawer__confirmation-copy">${t("cart.confirmationCopy")}</p>
          <div class="cart-drawer__confirmation-grid">
            <div class="cart-drawer__confirmation-row">
              <span>${t("common.orderNumber")}</span>
              <span class="cart-drawer__confirmation-value" data-order-number>${orderConfirmationState.orderNumber}</span>
            </div>
            <div class="cart-drawer__confirmation-row">
              <span>${t("common.items")}</span>
              <span class="cart-drawer__confirmation-value" data-order-items>${t("common.itemCount", { count: orderConfirmationState.itemCount })}</span>
            </div>
            <div class="cart-drawer__confirmation-row">
              <span>${t("common.delivery")}</span>
              <span class="cart-drawer__confirmation-value" data-order-delivery>${t("common.estimatedDelivery")}: ${orderConfirmationState.estimatedDelivery}</span>
            </div>
          </div>
          <button class="cart-drawer__confirmation-action" type="button" data-view-order-page>${t("cart.viewOrderPage")}</button>
          <button class="cart-drawer__confirmation-action" type="button" data-continue-shopping>${t("cart.continueShopping")}</button>
        </section>
      `;
    }

    function getCartPricingSummary(items) {
      return items.reduce((summary, item) => {
        const product = findProduct(item.productId);
        if (!product) {
          return summary;
        }

        summary.subtotal += product.originalPrice * item.quantity;
        summary.total += product.price * item.quantity;
        return summary;
      }, {
        subtotal: 0,
        total: 0
      });
    }

    function getCartPricingForDisplay(items) {
      const fallback = getCartPricingSummary(items);
      const pricing = cartState.pricing || {};
      const subtotal = typeof pricing.subtotal === "number" ? pricing.subtotal : fallback.subtotal;
      const total = typeof pricing.total === "number" ? pricing.total : fallback.total;
      const productDiscount = typeof pricing.productDiscount === "number"
        ? pricing.productDiscount
        : Math.max(0, fallback.subtotal - fallback.total);
      const thresholdPromotion = Array.isArray(marketingState.promotions)
        ? marketingState.promotions.find((promotion) => promotion.type === "threshold")
        : null;
      const fallbackThresholdProgress = thresholdPromotion
        ? {
            id: thresholdPromotion.id,
            title: thresholdPromotion.title,
            threshold: thresholdPromotion.threshold,
            remaining: Math.max(0, thresholdPromotion.threshold - total),
            isMet: total >= thresholdPromotion.threshold
          }
        : null;

      return {
        subtotal,
        total,
        productDiscount,
        orderDiscount: typeof pricing.orderDiscount === "number" ? pricing.orderDiscount : 0,
        couponDiscount: typeof pricing.couponDiscount === "number" ? pricing.couponDiscount : 0,
        shipping: typeof pricing.shipping === "number" ? pricing.shipping : 0,
        coupon: pricing.coupon || null,
        thresholdProgress: pricing.thresholdProgress || fallbackThresholdProgress,
        appliedPromotions: Array.isArray(pricing.appliedPromotions) ? pricing.appliedPromotions : []
      };
    }

    function renderMarketingStrip() {
      const strip = document.querySelector("[data-marketing-strip]");
      if (!strip) {
        return;
      }

      const promotions = Array.isArray(marketingState.promotions) ? marketingState.promotions : [];
      const coupons = Array.isArray(marketingState.coupons) ? marketingState.coupons : [];
      const threshold = promotions.find((promotion) => promotion.type === "threshold");
      strip.hidden = promotions.length === 0 && coupons.length === 0;
      strip.innerHTML = `
        <p>
          <strong>${escapeHtml(threshold?.title || (activeLocale === LOCALE_KEY.EN_US ? "Weekly sock offers" : "本周袜子优惠"))}</strong>
          ${activeLocale === LOCALE_KEY.EN_US ? "Apply coupons in the live cart drawer." : "优惠券会在真实购物车价格中生效。"}
        </p>
        <div class="marketing-strip__chips">
          ${coupons.slice(0, 3).map((coupon) => `<span class="marketing-strip__chip" data-coupon-chip>${escapeHtml(coupon.code)}</span>`).join("")}
        </div>
      `;
    }

    function renderRecentlyViewed() {
      const root = document.querySelector("[data-recently-viewed]");
      if (!root) {
        return;
      }

      root.hidden = recentlyViewedProducts.length === 0;
      root.innerHTML = recentlyViewedProducts.length === 0
        ? ""
        : `
          <h2 class="recently-viewed__title">${activeLocale === LOCALE_KEY.EN_US ? "Recently viewed" : "最近浏览"}</h2>
          <div class="recently-viewed__items">
            ${recentlyViewedProducts.map((product) => {
              const localizedProduct = getLocalizedProduct(product);
              return `<a class="recently-viewed__link" href="${getActiveDetailHref(product.id)}">${escapeHtml(localizedProduct.title)} · ${escapeHtml(product.id)}</a>`;
            }).join("")}
          </div>
        `;
    }

    function getEarliestDeliveryDate(items) {
      const deliveryCandidates = items
        .map((item) => {
          const product = findProduct(item.productId);
          return product ? parseDeliveryEstimate(product.deliveryEstimate) : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.date - right.date);

      return deliveryCandidates[0] || null;
    }

    function getPurchasedProductIds(items) {
      return Array.from(new Set(items.map((item) => item.productId)));
    }

    function buildOrderConfirmationState() {
      const itemCount = getCartQuantity(cartState.items);
      const earliestDelivery = getEarliestDeliveryDate(cartState.items);
      const pricingSummary = getCartPricingSummary(cartState.items);

      return {
        orderNumber: createOrderNumber(),
        itemCount,
        estimatedDelivery: earliestDelivery
          ? formatAbsoluteDeliveryDate(earliestDelivery.date)
          : activeLocale === LOCALE_KEY.EN_US ? "Not available" : "暂不可用",
        subtotal: pricingSummary.subtotal,
        savings: pricingSummary.subtotal - pricingSummary.total,
        total: pricingSummary.total,
        purchasedProductIds: getPurchasedProductIds(cartState.items)
      };
    }

    function renderCartDrawer() {
      const quantity = getCartQuantity(cartState.items);
      const pricingSummary = getCartPricingForDisplay(cartState.items);
      const savingsValue = pricingSummary.productDiscount + pricingSummary.orderDiscount + pricingSummary.couponDiscount;
      const earliestDelivery = getEarliestDeliveryDate(cartState.items);
      const thresholdProgress = document.querySelector("[data-threshold-progress]");
      const appliedCoupon = document.querySelector("[data-applied-coupon]");
      const couponDiscount = document.querySelector("[data-cart-coupon-discount]");
      const couponInput = document.querySelector("[data-coupon-input]");

      cartDrawerMeta.textContent = orderConfirmationState
        ? t("cart.orderComplete")
        : t("cart.drawerMeta", { count: quantity });
      cartDrawerItems.innerHTML = orderConfirmationState
        ? createOrderConfirmationMarkup()
        : quantity === 0
          ? `<div class="cart-drawer__empty" data-cart-empty-state>${t("cart.empty")}</div>`
          : cartState.items.map(createCartItemMarkup).join("");
      cartSubtotal.textContent = formatCurrency(pricingSummary.subtotal);
      cartSavings.textContent = formatSavingsValue(savingsValue);
      if (couponDiscount) {
        couponDiscount.textContent = formatSavingsValue(pricingSummary.couponDiscount);
      }
      cartShipping.textContent = t("commerce.shippingFree");
      cartDrawerTotal.textContent = formatCurrency(pricingSummary.total);
      if (thresholdProgress) {
        thresholdProgress.textContent = pricingSummary.thresholdProgress
          ? pricingSummary.thresholdProgress.isMet
            ? activeLocale === LOCALE_KEY.EN_US ? "Threshold offer applied." : "已满足满减优惠。"
            : activeLocale === LOCALE_KEY.EN_US
              ? `Need ¥${pricingSummary.thresholdProgress.remaining} more for threshold savings.`
              : `还差 ¥${pricingSummary.thresholdProgress.remaining} 可享满减`
          : "";
      }
      if (appliedCoupon) {
        appliedCoupon.textContent = pricingSummary.coupon?.status === "applied"
          ? `${activeLocale === LOCALE_KEY.EN_US ? "Applied" : "已使用"} ${pricingSummary.coupon.code}`
          : "";
      }
      if (couponInput && !couponInput.value && cartState.couponCode) {
        couponInput.value = cartState.couponCode;
      }
      cartDeliverySummary.textContent = earliestDelivery
        ? t("commerce.earliestDelivery", { label: formatAbsoluteDeliveryDate(earliestDelivery.date) })
        : t("commerce.addItemsDelivery");
      cartTrustCopy.textContent = t("commerce.trustCopy");
    }

    function setCartDrawerOpen(nextState) {
      isCartDrawerOpen = nextState;
      cartDrawer.dataset.open = nextState ? "true" : "false";
      cartDrawer.setAttribute("aria-hidden", nextState ? "false" : "true");
      cartToggleButton.setAttribute("aria-expanded", nextState ? "true" : "false");
      detailCartToggleButton.setAttribute("aria-expanded", nextState ? "true" : "false");
      document.body.classList.toggle("is-cart-drawer-open", nextState);
    }

    function syncPageView() {
      const currentView = getCurrentView();
      const isStorefrontView = currentView === "storefront";
      const isDetailView = currentView === DETAIL_VIEW_KEY;
      const isWishlistView = currentView === WISHLIST_VIEW_KEY;
      const isRecentView = currentView === RECENT_VIEW_KEY;
      const isAuthView = currentView === AUTH_VIEW_KEY;
      const isAddressesView = currentView === ADDRESSES_VIEW_KEY;
      const isCheckoutView = currentView === CHECKOUT_VIEW_KEY;
      const isPaymentView = currentView === PAYMENT_VIEW_KEY;
      const isOrdersView = currentView === ORDERS_VIEW_KEY;
      const isOrderView = currentView === ORDER_VIEW_KEY;
      const isSupportView = currentView === SUPPORT_VIEW_KEY;
      const isSupportTicketsView = currentView === SUPPORT_TICKETS_VIEW_KEY;
      const isAdminView = currentView === ADMIN_VIEW_KEY;
      const isReturnView = currentView === RETURN_VIEW_KEY;
      const isReturnsView = currentView === RETURNS_VIEW_KEY;

      document.body.dataset.view = currentView;
      pageRoot.dataset.view = currentView;
      storefrontView.hidden = !isStorefrontView;
      detailView.hidden = !isDetailView;
      wishlistView.hidden = !isWishlistView;
      recentView.hidden = !isRecentView;
      authView.hidden = !isAuthView;
      addressesView.hidden = !isAddressesView;
      checkoutView.hidden = !isCheckoutView;
      paymentView.hidden = !isPaymentView;
      ordersView.hidden = !isOrdersView;
      orderView.hidden = !isOrderView;
      supportView.hidden = !isSupportView;
      supportTicketsView.hidden = !isSupportTicketsView;
      adminView.hidden = !isAdminView;
      returnView.hidden = !isReturnView;
      returnsView.hidden = !isReturnsView;
      const allowDrawer = !isOrderView;
      cartDrawer.hidden = !allowDrawer;
      cartBackdrop.hidden = !allowDrawer;

      if (!allowDrawer && isCartDrawerOpen) {
        setCartDrawerOpen(false);
      }
    }

    function setCartMutationPending(nextState) {
      isCartMutationPending = nextState;
      renderCartState();
    }

    function renderCartState() {
      const quantity = getCartQuantity(cartState.items);
      cartCount.textContent = String(quantity);
      cartSummary.textContent = t("cart.summary", { count: quantity });
      detailCartCount.textContent = String(quantity);
      detailCartSummary.textContent = t("cart.summary", { count: quantity });
      clearCartButton.disabled = quantity === 0 || isCartMutationPending;
      cartCheckoutButton.disabled = quantity === 0 || isCartMutationPending;
      renderCartDrawer();
      syncVisibleCartFeedback();
      syncOpenCardRemoveDialog();
    }

    function setCartStateFromPayload(payload = {}) {
      const cartPayload = payload.cart || payload;
      cartState = {
        items: Array.isArray(cartPayload.items) ? cartPayload.items : [],
        couponCode: cartPayload.couponCode || "",
        pricing: cartPayload.pricing || null
      };
    }

    async function fetchCart() {
      const response = await fetch("/api/cart");

      if (!response.ok) {
        throw new Error("Failed to load cart");
      }

      const payload = await response.json();
      setCartStateFromPayload(payload);
      renderCartState();
      return payload;
    }

    async function fetchMarketing() {
      const response = await fetch("/api/marketing");
      if (!response.ok) {
        throw new Error("Failed to load marketing");
      }
      marketingState = await response.json();
      return marketingState;
    }

    async function applyCoupon(code) {
      const response = await fetch("/api/cart/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });

      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to apply coupon");
      }

      const payload = await response.json();
      setCartStateFromPayload(payload);
      renderCartState();
      return payload;
    }

    async function addBundle(bundleId) {
      setCartMutationPending(true);
      try {
        const response = await fetch(`/api/cart/bundles/${encodeURIComponent(bundleId)}`, {
          method: "POST"
        });

        if (!response.ok) {
          throw await createCartRequestError(response, "Failed to add bundle");
        }

        const payload = await response.json();
        clearOrderConfirmationState();
        clearStoredOrderConfirmationSnapshot();
        setCartStateFromPayload(payload);
        renderCartState();
        return payload;
      } finally {
        setCartMutationPending(false);
      }
    }

    async function recordRecentView(productId) {
      await fetch("/api/recent-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });
    }

    async function fetchRecentlyViewed() {
      const response = await fetch(`/api/recommendations?scenario=recently-viewed&locale=${encodeURIComponent(activeLocale)}`);
      if (!response.ok) {
        recentlyViewedProducts = [];
        return recentlyViewedProducts;
      }

      const payload = await response.json();
      recentlyViewedProducts = Array.isArray(payload.items) ? payload.items : [];
      return recentlyViewedProducts;
    }

    async function addCartItem(productId, size) {
      setCartMutationPending(true);

      try {
        const response = await fetch("/api/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            size,
            quantity: 1
          })
        });

        if (!response.ok) {
          throw await createCartRequestError(response, "Failed to add cart item");
        }

        const payload = await response.json();
        clearOrderConfirmationState();
        clearStoredOrderConfirmationSnapshot();
        setCartStateFromPayload(payload);
        renderCartState();
        return payload;
      } finally {
        setCartMutationPending(false);
      }
    }

    async function updateCartItem(productId, size, quantity) {
      setCartMutationPending(true);

      try {
        const response = await fetch("/api/cart/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            size,
            quantity
          })
        });

        if (!response.ok) {
          throw await createCartRequestError(response, "Failed to update cart item");
        }

        const payload = await response.json();
        setCartStateFromPayload(payload);
        renderCartState();
        return payload;
      } finally {
        setCartMutationPending(false);
      }
    }

    async function removeCartItem(productId, size) {
      setCartMutationPending(true);

      try {
        const response = await fetch("/api/cart/items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            size
          })
        });

        if (!response.ok) {
          throw new Error("Failed to remove cart item");
        }

        const payload = await response.json();
        setCartStateFromPayload(payload);
        renderCartState();
        return payload;
      } finally {
        setCartMutationPending(false);
      }
    }

    async function clearCart() {
      setCartMutationPending(true);

      try {
        const response = await fetch("/api/cart/clear", {
          method: "POST"
        });

        if (!response.ok) {
          throw new Error("Failed to clear cart");
        }

        const payload = await response.json();
        setCartStateFromPayload(payload);
        renderCartState();
        return payload;
      } finally {
        setCartMutationPending(false);
      }
    }

    async function checkoutCart() {
      if (getCartQuantity(cartState.items) === 0 || isCartMutationPending) {
        return;
      }

      rememberStorefrontOriginForCheckout();
      const confirmationSnapshot = buildOrderConfirmationState();
      await clearCart();
      orderConfirmationState = confirmationSnapshot;
      saveOrderConfirmationSnapshot(confirmationSnapshot);
      renderCartState();
    }

    function showLoadFailureState() {
      productGrid.classList.add("is-empty");
      productGrid.innerHTML = `<div class="empty-state" data-empty-state>${t("listing.loadFailure")}</div>`;
      resultCount.textContent = t("listing.resultCount", { count: 0 });
      syncToolbarState();
      renderActiveFilterChips();
    }

    function syncToolbarState() {
      const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
      const sortButtons = Array.from(document.querySelectorAll("[data-sort]"));

      filterButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.filter === activeFilter);
      });

      sortButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.sort === activeSort);
      });

      renderShellCopy();
    }

    function renderActiveFilterChips() {
      if (!activeFilterChips) {
        return;
      }

      const chips = [];
      if (activeMinPrice || activeMaxPrice) {
        chips.push({
          key: "price",
          label: `¥${activeMinPrice || "0"} - ¥${activeMaxPrice || "不限"}`
        });
      }

      if (activeSize) {
        chips.push({ key: "size", label: activeSize });
      }

      if (activeStock !== STOCK_FILTER_KEY.ALL) {
        chips.push({ key: "stock", label: activeStock });
      }

      if (activeRatingMin) {
        chips.push({ key: "rating", label: `${activeRatingMin}+` });
      }

      activeFilterChips.hidden = chips.length === 0;
      activeFilterChips.innerHTML = chips.map((chip) => {
        return `<span class="active-filter-chip" data-active-filter-chip data-chip-key="${chip.key}">${escapeHtml(chip.label)}</span>`;
      }).join("");
    }

    function getAvailableSizesFromProducts(items = allProductsCache) {
      return Array.from(new Set(items.flatMap((product) => {
        return getProductVariants(product).map((variant) => variant.size);
      }))).sort((left, right) => Number(left) - Number(right));
    }

    function syncAdvancedFilterInput(input, value) {
      if (!input) {
        return;
      }

      const previousSyncedValue = input.dataset.syncedValue || "";
      const hasUserDraft = input.value !== "" && input.value !== previousSyncedValue && input.value !== value;

      if (!hasUserDraft) {
        input.value = value;
      }

      input.dataset.syncedValue = value;
    }

    function renderAdvancedFilterControls() {
      if (!advancedFilters) {
        return;
      }

      const minInput = advancedFilters.querySelector("[data-price-min]");
      const maxInput = advancedFilters.querySelector("[data-price-max]");
      const sizeRoot = advancedFilters.querySelector("[data-size-filter-group]");
      const stockRoot = advancedFilters.querySelector("[data-stock-filter-group]");
      const ratingRoot = advancedFilters.querySelector("[data-rating-filter-group]");

      syncAdvancedFilterInput(minInput, activeMinPrice);
      syncAdvancedFilterInput(maxInput, activeMaxPrice);

      if (sizeRoot) {
        const sizeButtons = getAvailableSizesFromProducts().map((size) => {
          const isActive = activeSize === size;
          return `<button class="advanced-filters__chip${isActive ? " is-active" : ""}" type="button" data-size-filter="${escapeHtml(size)}" aria-pressed="${isActive ? "true" : "false"}">${escapeHtml(size)}</button>`;
        }).join("");
        sizeRoot.innerHTML = `<p class="advanced-filters__label">尺码</p><div class="advanced-filters__chips">${sizeButtons}</div>`;
      }

      if (stockRoot) {
        const stockOptions = [
          { value: STOCK_FILTER_KEY.ALL, label: "库存总览" },
          { value: STOCK_FILTER_KEY.IN_STOCK, label: "现货" },
          { value: STOCK_FILTER_KEY.LOW_STOCK, label: "低库存" },
          { value: STOCK_FILTER_KEY.OUT_OF_STOCK, label: "缺货" }
        ];
        stockRoot.innerHTML = `
          <p class="advanced-filters__label">库存</p>
          <div class="advanced-filters__chips">
            ${stockOptions.map((option) => {
              const isActive = activeStock === option.value;
              return `<button class="advanced-filters__chip${isActive ? " is-active" : ""}" type="button" data-stock-filter="${option.value}" aria-pressed="${isActive ? "true" : "false"}">${option.label}</button>`;
            }).join("")}
          </div>
        `;
      }

      if (ratingRoot) {
        const ratingOptions = ["4", "4.5", "4.7"];
        ratingRoot.innerHTML = `
          <p class="advanced-filters__label">评分</p>
          <div class="advanced-filters__chips">
            ${ratingOptions.map((rating) => {
              const isActive = activeRatingMin === rating;
              return `<button class="advanced-filters__chip${isActive ? " is-active" : ""}" type="button" data-rating-filter="${rating}" aria-pressed="${isActive ? "true" : "false"}">${rating}+</button>`;
            }).join("")}
          </div>
        `;
      }
    }

    function syncLoadMoreButton() {
      if (!loadMoreProductsButton) {
        return;
      }

      loadMoreProductsButton.hidden = !activeHasMore;
      loadMoreProductsButton.disabled = false;
      loadMoreProductsButton.textContent = "加载更多";
    }

    function renderNoResults() {
      const title = activeLocale === LOCALE_KEY.EN_US ? "No exact matches" : "没有找到完全匹配";
      const copy = activeLocale === LOCALE_KEY.EN_US
        ? "Try clearing filters or browse recommended socks from the current catalog."
        : "可以清除筛选条件，或者先看看当前目录里更受欢迎的袜子。";
      const clearAllLabel = activeLocale === LOCALE_KEY.EN_US ? "View all socks" : "查看全部袜子";
      const clearRefinementsLabel = activeLocale === LOCALE_KEY.EN_US ? "Keep search, clear filters" : "保留搜索，清除筛选";
      const recommendations = recommendationProducts.map((product) => {
        const localizedProduct = getLocalizedProduct(product);
        return `
          <article class="no-results__recommendation" data-recommendation-card data-product-id="${escapeHtml(product.id)}">
            <h3 class="no-results__recommendation-title">${escapeHtml(localizedProduct.title)}</h3>
            <p class="no-results__recommendation-price">¥${product.price}</p>
          </article>
        `;
      }).join("");

      productGrid.innerHTML = `
        <section class="no-results" data-no-results>
          <h2 class="no-results__title" data-no-results-title>${title}</h2>
          <p class="no-results__copy">${copy}</p>
          <div class="no-results__actions">
            <button class="no-results__button" type="button" data-clear-all-filters>${clearAllLabel}</button>
            <button class="no-results__button no-results__button--secondary" type="button" data-clear-refinement-filters>${clearRefinementsLabel}</button>
          </div>
          <div class="no-results__recommendations">${recommendations}</div>
        </section>
      `;
    }

    function renderProductGridItems(products) {
      const isEmpty = products.length === 0;

      productGrid.classList.toggle("is-empty", isEmpty);
      if (isEmpty) {
        renderNoResults();
      } else {
        productGrid.innerHTML = products.map(createCardMarkup).join("");
      }
      resultCount.textContent = t("listing.resultCount", { count: activeTotalCount });
      syncToolbarState();
      renderAdvancedFilterControls();
      renderActiveFilterChips();
      syncLoadMoreButton();
      renderMarketingStrip();
      renderRecentlyViewed();
      renderCartDrawer();

      if (!isEmpty) {
        bindCardInteractions();
      }
    }

    async function loadMoreProducts() {
      if (!activeHasMore) {
        return;
      }

      activePage += 1;
      const nextProducts = await fetchProducts();
      visibleProducts = [...visibleProducts, ...nextProducts];
      renderProductGridItems(visibleProducts);
    }

    function bindCardInteractions() {
      const productCards = Array.from(productGrid.querySelectorAll("[data-product-card]"));

      productCards.forEach((card) => {
        const sizeButtons = Array.from(card.querySelectorAll("[data-size]"));
        const cartButton = card.querySelector("[data-cart-button]");
        const productId = card.dataset.productId;

        bindSizeSelection(sizeButtons);
        restoreCartButtonFeedback(cartButton, productId);

        card.addEventListener("click", (event) => {
          const removeButton = event.target.closest("[data-card-remove-button]");
          if (!removeButton || !card.contains(removeButton)) {
            return;
          }

          openCardRemoveDialog(productId);
        });

      cartButton.addEventListener("click", async () => {
          const selectedSizeButton = card.querySelector('[data-size][aria-pressed="true"]');
          if (!selectedSizeButton || selectedSizeButton.disabled) {
            showOutOfStockToast();
            return;
          }

          const selectedSize = selectedSizeButton.dataset.size || selectedSizeButton.textContent.trim();

          try {
            await addCartItem(productId, selectedSize);
          } catch (error) {
            if (isOutOfStockError(error)) {
              showOutOfStockToast();
            }
            cartButton.textContent = t("cart.addToCart");
          }
        });
      });
    }

    async function renderProducts() {
      const [allProducts, firstPageProducts] = await Promise.all([
        fetchAllProducts(),
        fetchProducts(),
        fetchRecentlyViewed().catch(() => [])
      ]);
      syncNavigationContext(activeFilter, activeSort, activeQuery);
      allProductsCache = allProducts;
      visibleProducts = firstPageProducts;
      syncProductCatalog(allProducts);
      renderProductGridItems(visibleProducts);
    }

    siteSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextQuery = normalizeQueryValue(siteSearchInput.value);
      const nextHref = getStorefrontHref(activeFilter, activeSort, nextQuery);
      window.location.href = nextHref;
    });

    toolbar.addEventListener("click", async (event) => {
      const cartToggle = event.target.closest("[data-cart-toggle]");
      if (cartToggle) {
        setCartDrawerOpen(true);
        return;
      }

      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        activeFilter = filterButton.dataset.filter;
        try {
          await renderProducts();
        } catch (error) {
          showLoadFailureState();
        }
        return;
      }

      const sortButton = event.target.closest("[data-sort]");
      if (sortButton) {
        activeSort = sortButton.dataset.sort;
        try {
          await renderProducts();
        } catch (error) {
          showLoadFailureState();
        }
      }
    });

    advancedFilters.addEventListener("click", async (event) => {
      const priceApply = event.target.closest("[data-price-apply]");
      if (priceApply) {
        await navigateToAdvancedFilterState({
          minPrice: advancedFilters.querySelector("[data-price-min]")?.value.trim() || "",
          maxPrice: advancedFilters.querySelector("[data-price-max]")?.value.trim() || ""
        });
        return;
      }

      const sizeFilter = event.target.closest("[data-size-filter]");
      if (sizeFilter) {
        await navigateToAdvancedFilterState({
          size: activeSize === sizeFilter.dataset.sizeFilter ? "" : sizeFilter.dataset.sizeFilter
        });
        return;
      }

      const stockFilter = event.target.closest("[data-stock-filter]");
      if (stockFilter) {
        await navigateToAdvancedFilterState({ stock: stockFilter.dataset.stockFilter });
        return;
      }

      const ratingFilter = event.target.closest("[data-rating-filter]");
      if (ratingFilter) {
        await navigateToAdvancedFilterState({
          ratingMin: activeRatingMin === ratingFilter.dataset.ratingFilter ? "" : ratingFilter.dataset.ratingFilter
        });
      }
    });

    loadMoreProductsButton.addEventListener("click", async () => {
      loadMoreProductsButton.disabled = true;
      loadMoreProductsButton.textContent = "加载中...";
      try {
        await loadMoreProducts();
      } catch (error) {
        loadMoreProductsButton.disabled = false;
        loadMoreProductsButton.textContent = "加载更多";
      }
    });

    productGrid.addEventListener("click", async (event) => {
      const clearAllFilters = event.target.closest("[data-clear-all-filters]");
      if (clearAllFilters) {
        await navigateToAdvancedFilterState({
          q: "",
          minPrice: "",
          maxPrice: "",
          size: "",
          stock: STOCK_FILTER_KEY.ALL,
          ratingMin: "",
          pageSize: DEFAULT_PAGE_SIZE
        });
        return;
      }

      const clearRefinementFilters = event.target.closest("[data-clear-refinement-filters]");
      if (clearRefinementFilters) {
        await navigateToAdvancedFilterState({
          minPrice: "",
          maxPrice: "",
          size: "",
          stock: STOCK_FILTER_KEY.ALL,
          ratingMin: ""
        });
      }
    });

    detailCartToggleButton.addEventListener("click", () => {
      setCartDrawerOpen(true);
    });

    clearCartButton.addEventListener("click", async () => {
      try {
        await clearCart();
      } catch (error) {
        renderCartState();
      }
    });

    cartCheckoutButton.addEventListener("click", () => {
      if (getCartQuantity(cartState.items) === 0 || isCartMutationPending) {
        return;
      }

      rememberStorefrontOriginForCheckout();
      setCartDrawerOpen(false);
      window.location.href = CHECKOUT_VIEW_PATH;
    });

    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      authError.textContent = "";
      authSubmit.disabled = true;

      try {
        const payload = await submitAuthForm(authForm);
        currentUser = payload.user;
        window.StorefrontCustomerSupport?.setUser(currentUser);
        setCartStateFromPayload(payload);
        renderAuthShell();
        renderCartState();
        window.history.replaceState({}, "", STOREFRONT_PATH);
        syncPageView();
        await renderProducts();
      } catch (error) {
        authError.textContent = error.code === "EMAIL_ALREADY_REGISTERED"
          ? "This email is already registered."
          : "Email or password is incorrect.";
      } finally {
        authSubmit.disabled = false;
      }
    });

    authShell.addEventListener("click", async (event) => {
      const logoutButton = event.target.closest("[data-auth-logout]");
      if (!logoutButton) {
        return;
      }

      logoutButton.disabled = true;
      try {
        await logoutUser();
        await fetchCart();
      } catch (error) {
        renderAuthShell();
      }
    });

    addressForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      addressError.textContent = "";

      try {
        const payload = await createAddress(getAddressFormPayload(addressForm));
        addressBook = Array.isArray(payload.addresses) ? payload.addresses : [];
        addressForm.reset();
        renderAddressList();
      } catch (error) {
        addressError.textContent = "Complete the address before saving.";
      }
    });

    addressList.addEventListener("click", async (event) => {
      const defaultButton = event.target.closest("[data-address-default]");
      if (defaultButton) {
        const response = await fetch(`/api/me/addresses/${encodeURIComponent(defaultButton.dataset.addressDefault)}/default`, {
          method: "POST"
        });
        const payload = await response.json();
        addressBook = Array.isArray(payload.addresses) ? payload.addresses : [];
        renderAddressList();
        return;
      }

      const deleteButton = event.target.closest("[data-address-delete]");
      if (deleteButton) {
        const response = await fetch(`/api/me/addresses/${encodeURIComponent(deleteButton.dataset.addressDelete)}`, {
          method: "DELETE"
        });
        const payload = await response.json();
        addressBook = Array.isArray(payload.addresses) ? payload.addresses : [];
        renderAddressList();
      }
    });

    checkoutPagePanel.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-checkout-form]");
      if (!form) {
        return;
      }

      event.preventDefault();
      const errorNode = form.querySelector("[data-checkout-form-error]");
      const submitButton = form.querySelector("[data-checkout-submit]");
      errorNode.textContent = "";
      submitButton.disabled = true;

      try {
        const payload = await createOrder(getCheckoutFormPayload(form));
        setCartStateFromPayload(payload);
        renderCartState();
        window.location.href = `${STOREFRONT_PATH}?view=payment&id=${encodeURIComponent(payload.order.id)}`;
      } catch (error) {
        errorNode.textContent = error.code === "CHECKOUT_VALIDATION_FAILED"
          ? t("checkout.validationError")
          : t("checkout.submitError");
        submitButton.disabled = false;
      }
    });

    paymentPanel.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-payment-form]");
      if (!form) {
        return;
      }

      event.preventDefault();
      const orderId = getPaymentOrderId();
      const submitButton = form.querySelector("[data-payment-submit]");
      const errorNode = form.querySelector("[data-payment-error]");
      submitButton.disabled = true;
      errorNode.textContent = "";

      try {
        const method = new FormData(form).get("method") || "card";
        const payload = await createPayment(orderId, { method, outcome: "succeeded" });
        window.location.href = `${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(payload.order.id)}`;
      } catch (error) {
        errorNode.textContent = t("payment.failed");
        submitButton.disabled = false;
      }
    });

    paymentPanel.addEventListener("click", async (event) => {
      const failButton = event.target.closest("[data-payment-fail-demo]");
      if (!failButton) {
        return;
      }

      const form = failButton.closest("[data-payment-form]");
      const orderId = getPaymentOrderId();
      const method = new FormData(form).get("method") || "card";
      failButton.disabled = true;

      try {
        await createPayment(orderId, { method, outcome: "failed" });
      } catch (error) {
        // Re-render below so stale buttons and retry copy always match backend state.
      }

      await renderPaymentPage();
    });

    checkoutPagePanel.addEventListener("click", async (event) => {
      const refreshButton = event.target.closest("[data-shipping-refresh]");
      if (!refreshButton) {
        return;
      }

      refreshButton.disabled = true;
      try {
        await renderCheckoutShippingEstimates();
      } finally {
        refreshButton.disabled = false;
      }
    });

    checkoutPagePanel.addEventListener("input", (event) => {
      const field = event.target.closest("[data-checkout-field]");
      if (!field || !String(field.dataset.checkoutField || "").startsWith("shippingAddress.")) {
        return;
      }

      window.clearTimeout(checkoutShippingEstimateTimer);
      checkoutShippingEstimateTimer = window.setTimeout(() => {
        renderCheckoutShippingEstimates();
      }, 80);
    });

    orderPagePanel.addEventListener("click", async (event) => {
      const cancelButton = event.target.closest("[data-order-cancel]");
      if (cancelButton) {
        const orderId = cancelButton.dataset.orderId || getRequestedOrderId();
        if (!orderId) return;

        cancelButton.disabled = true;
        try {
          await cancelOrder(orderId);
          await renderOrderPage();
        } catch (error) {
          cancelButton.disabled = false;
        }
        return;
      }

      const statusButton = event.target.closest("[data-order-status-action]");
      if (!statusButton) {
        return;
      }

      const orderId = getRequestedOrderId();
      if (!orderId) {
        return;
      }

      statusButton.disabled = true;

      try {
        await updateOrderStatus(orderId, statusButton.dataset.nextStatus);
        await renderOrderPage();
      } catch (error) {
        await renderOrderPage();
      }
    });

    returnPagePanel.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-return-form]");
      if (!form) {
        return;
      }

      event.preventDefault();
      const errorNode = form.querySelector("[data-return-form-error]");
      const submitButton = form.querySelector("[data-return-submit]");
      errorNode.textContent = "";
      const checkedItems = [...form.querySelectorAll("[data-return-item-checkbox]:checked")];

      if (!checkedItems.length) {
        errorNode.textContent = t("returns.errors.itemsRequired");
        return;
      }

      const items = checkedItems.map((checkbox) => {
        const row = checkbox.closest("[data-return-line-item]");
        return {
          skuId: row.dataset.skuId,
          quantity: Number.parseInt(row.querySelector("[data-return-quantity]").value, 10)
        };
      });

      submitButton.disabled = true;
      submitButton.textContent = t("returns.submitting");

      try {
        const payload = await submitReturnRequest({
          orderId: getRequestedOrderId(),
          type: form.querySelector("[data-return-type]").value,
          reason: form.querySelector("[data-return-reason]").value,
          contact: form.querySelector("[data-return-contact]").value,
          note: form.querySelector("[data-return-note]").value,
          items
        });
        window.location.href = `${STOREFRONT_PATH}?view=returns&created=${encodeURIComponent(payload.returnRequest.id)}`;
      } catch (error) {
        errorNode.textContent = t(`returns.errors.${error.code}`) || t("checkout.submitError");
        submitButton.disabled = false;
        submitButton.textContent = t("returns.submit");
      }
    });

    returnsPagePanel.addEventListener("click", async (event) => {
      const cancelButton = event.target.closest("[data-return-cancel]");
      if (!cancelButton) {
        return;
      }

      cancelButton.disabled = true;
      try {
        await cancelReturnRequest(cancelButton.dataset.returnCancel);
        await renderReturnsView();
      } catch (error) {
        cancelButton.disabled = false;
      }
    });

    cartCloseButton.addEventListener("click", () => {
      setCartDrawerOpen(false);
    });

    cartBackdrop.addEventListener("click", () => {
      setCartDrawerOpen(false);
    });

    localeButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const nextLocale = normalizeLocale(button.dataset.localeOption);

        if (nextLocale === activeLocale) {
          return;
        }

        activeLocale = nextLocale;
        saveLocale(activeLocale);
        await rerenderActiveViewForLocale();
      });
    });

    cartDrawer.addEventListener("click", async (event) => {
      const continueShoppingButton = event.target.closest("[data-continue-shopping]");
      if (continueShoppingButton) {
        setCartDrawerOpen(false);
        return;
      }

      const couponApply = event.target.closest("[data-coupon-apply]");
      if (couponApply) {
        const input = cartDrawer.querySelector("[data-coupon-input]");
        const errorNode = cartDrawer.querySelector("[data-coupon-error]");
        if (errorNode) {
          errorNode.textContent = "";
        }
        couponApply.disabled = true;
        try {
          await applyCoupon(input?.value || "");
        } catch (error) {
          if (errorNode) {
            errorNode.textContent = error.message;
          }
        } finally {
          couponApply.disabled = false;
        }
        return;
      }

      const viewOrderPageButton = event.target.closest("[data-view-order-page]");
      if (viewOrderPageButton) {
        window.location.href = ORDER_VIEW_PATH;
        return;
      }

      const increaseButton = event.target.closest("[data-cart-increase]");
      if (increaseButton) {
        const productId = increaseButton.dataset.productId;
        const size = increaseButton.dataset.size;
        const item = cartState.items.find((entry) => {
          return entry.productId === productId && entry.size === size;
        });

        if (!item) {
          return;
        }

        try {
          await updateCartItem(productId, size, item.quantity + 1);
        } catch (error) {
          if (isOutOfStockError(error)) {
            showOutOfStockToast();
          }
          renderCartState();
        }
        return;
      }

      const decreaseButton = event.target.closest("[data-cart-decrease]");
      if (decreaseButton) {
        const productId = decreaseButton.dataset.productId;
        const size = decreaseButton.dataset.size;
        const item = cartState.items.find((entry) => {
          return entry.productId === productId && entry.size === size;
        });

        if (!item || item.quantity <= 1) {
          return;
        }

        try {
          await updateCartItem(productId, size, item.quantity - 1);
        } catch (error) {
          renderCartState();
        }
        return;
      }

      const removeButton = event.target.closest("[data-cart-remove]");
      if (removeButton) {
        try {
          await removeCartItem(removeButton.dataset.productId, removeButton.dataset.size);
        } catch (error) {
          renderCartState();
        }
      }
    });

    async function initializePage() {
      activeLocale = readRequestedLocale() || readStoredLocale();
      syncActiveStateFromUrl();
      initializeNavigationContext();
      renderLocaleControls();
      renderStaticCopy();
      await fetchMarketing().catch(() => {
        marketingState = { promotions: [], coupons: [], bundles: [] };
      });
      syncPageView();
      if (getCurrentView() === "storefront") {
        syncNavigationContext(activeFilter, activeSort, activeQuery);
      }
      await fetchSession();

      if (getCurrentView() === ORDER_VIEW_KEY) {
        await renderOrderPage();
        return;
      }

      renderCartState();
      renderCartDrawer();

      const cartLoadPromise = fetchCart().catch(() => {
        renderCartState();
      });

      if (getCurrentView() === AUTH_VIEW_KEY) {
        await cartLoadPromise;
        renderAuthView();
        return;
      }

      if (getCurrentView() === ADDRESSES_VIEW_KEY) {
        await cartLoadPromise;
        await renderAddressesView();
        return;
      }

      if (getCurrentView() === ORDERS_VIEW_KEY) {
        await cartLoadPromise;
        await renderOrdersView();
        return;
      }

      if (getCurrentView() === SUPPORT_VIEW_KEY) {
        await cartLoadPromise;
        await fetchTrustCenter();
        return;
      }

      if (getCurrentView() === SUPPORT_TICKETS_VIEW_KEY) {
        await cartLoadPromise;
        const supportModule = mountCustomerSupportTickets();
        if (!supportModule) throw new Error("Customer support ticket module failed to load");
        await supportModule.render();
        return;
      }

      if (getCurrentView() === ADMIN_VIEW_KEY) {
        await cartLoadPromise;
        await renderAdminView();
        return;
      }

      if (getCurrentView() === RETURN_VIEW_KEY) {
        await cartLoadPromise;
        await renderReturnView();
        return;
      }

      if (getCurrentView() === RETURNS_VIEW_KEY) {
        await cartLoadPromise;
        await renderReturnsView();
        return;
      }

      if (getCurrentView() === CHECKOUT_VIEW_KEY) {
        const allProducts = await fetchAllProducts();
        syncProductCatalog(allProducts);
        await cartLoadPromise;
        if (currentUser) {
          await fetchAddresses();
        }
        renderCheckoutPage();
        return;
      }

      if (getCurrentView() === PAYMENT_VIEW_KEY) {
        await cartLoadPromise;
        await renderPaymentPage();
        return;
      }

      if (getCurrentView() === WISHLIST_VIEW_KEY) {
        await cartLoadPromise;
        await renderWishlistPage();
        return;
      }

      if (getCurrentView() === RECENT_VIEW_KEY) {
        await cartLoadPromise;
        await renderRecentHistoryPage();
        return;
      }

      if (getCurrentView() === DETAIL_VIEW_KEY) {
        await cartLoadPromise;
        await renderDetailPage();
        return;
      }
      cartLoadPromise.catch(() => {
        renderCartState();
      });

      try {
        await renderProducts();
      } catch (error) {
        showLoadFailureState();
      }
    }

    initializePage().catch(() => {
      if (getCurrentView() === ORDER_VIEW_KEY) {
        renderOrderPageFallback();
        return;
      }

      if (getCurrentView() === CHECKOUT_VIEW_KEY) {
        checkoutPagePanel.innerHTML = `
          <div class="order-empty-state" data-checkout-empty-state>${t("checkout.submitError")}</div>
        `;
        return;
      }

      if (getCurrentView() === PAYMENT_VIEW_KEY) {
        paymentPanel.innerHTML = `
          <div class="order-empty-state" data-payment-empty-state>${t("payment.unavailable")}</div>
        `;
        return;
      }

      if (getCurrentView() === DETAIL_VIEW_KEY) {
        renderDetailEmptyState(createDetailBackHref());
        return;
      }

      if (getCurrentView() === SUPPORT_VIEW_KEY) {
        supportCurrentTitle.textContent = t("support.loadFailure");
        return;
      }

      if (getCurrentView() === SUPPORT_TICKETS_VIEW_KEY) {
        supportTicketsView.innerHTML = '<div class="empty-state">客服工单暂时无法加载。</div>';
        return;
      }

      if (getCurrentView() === ADMIN_VIEW_KEY) {
        adminPanel.innerHTML = `<div class="empty-state">Admin console failed to load.</div>`;
        return;
      }

      if (getCurrentView() === RETURN_VIEW_KEY) {
        returnPagePanel.innerHTML = `<div class="empty-state">${t("returns.orderNotEligible")}</div>`;
        return;
      }

      if (getCurrentView() === RETURNS_VIEW_KEY) {
        returnsPagePanel.innerHTML = `<div class="empty-state">${t("returns.empty")}</div>`;
        return;
      }

      showLoadFailureState();
      renderCartState();
    });


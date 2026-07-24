function findProduct(products, productId) {
  return products.find((product) => product.id === productId) || null;
}

function getLimitedPromotion(product, promotions = []) {
  return promotions.find((promotion) => {
    return promotion.type === "limited-time-product" && promotion.productId === product.id;
  }) || null;
}

function getEffectiveUnitPrice(product, promotions = []) {
  const limitedPromotion = getLimitedPromotion(product, promotions);
  if (!limitedPromotion) {
    return {
      unitPrice: product.price,
      promotion: null
    };
  }

  return {
    unitPrice: Math.min(product.price, limitedPromotion.promotionalPrice),
    promotion: limitedPromotion
  };
}

function getEligibleCoupon(coupons = [], couponCode = "") {
  const normalizedCode = String(couponCode || "").trim().toUpperCase();
  return coupons.find((coupon) => coupon.code === normalizedCode) || null;
}

function calculateCouponDiscount(coupon, itemTotal) {
  if (!coupon) {
    return {
      coupon: null,
      discount: 0
    };
  }

  if (itemTotal < coupon.minimumSubtotal) {
    return {
      coupon: {
        code: coupon.code,
        title: coupon.title,
        status: "minimum-not-met",
        minimumSubtotal: coupon.minimumSubtotal
      },
      discount: 0
    };
  }

  if (coupon.type === "amount-off") {
    const discount = Math.min(coupon.discountAmount, itemTotal);
    return {
      coupon: {
        code: coupon.code,
        title: coupon.title,
        status: "applied",
        discount
      },
      discount
    };
  }

  return {
    coupon: {
      code: coupon.code,
      title: coupon.title,
      status: "unsupported"
    },
    discount: 0
  };
}

function calculateThresholdPromotion(promotions = [], itemTotal) {
  const thresholdPromotion = promotions.find((promotion) => promotion.type === "threshold") || null;
  if (!thresholdPromotion) {
    return {
      discount: 0,
      promotion: null,
      progress: null
    };
  }

  const isMet = itemTotal >= thresholdPromotion.threshold;
  const discount = isMet ? Math.min(thresholdPromotion.discountAmount, itemTotal) : 0;

  return {
    discount,
    promotion: isMet
      ? {
          id: thresholdPromotion.id,
          title: thresholdPromotion.title,
          type: thresholdPromotion.type,
          discount
        }
      : null,
    progress: {
      id: thresholdPromotion.id,
      title: thresholdPromotion.title,
      threshold: thresholdPromotion.threshold,
      remaining: Math.max(0, thresholdPromotion.threshold - itemTotal),
      isMet
    }
  };
}

function createPricingSummary({ cart, products, marketing = {}, shippingFee = 0 }) {
  const promotions = Array.isArray(marketing.promotions) ? marketing.promotions : [];
  const coupons = Array.isArray(marketing.coupons) ? marketing.coupons : [];
  const appliedPromotions = [];

  const subtotal = cart.items.reduce((sum, item) => {
    const product = findProduct(products, item.productId);
    return product ? sum + product.originalPrice * item.quantity : sum;
  }, 0);

  const itemTotal = cart.items.reduce((sum, item) => {
    const product = findProduct(products, item.productId);
    if (!product) {
      return sum;
    }

    const pricing = getEffectiveUnitPrice(product, promotions);
    if (pricing.promotion) {
      appliedPromotions.push({
        id: pricing.promotion.id,
        title: pricing.promotion.title,
        type: pricing.promotion.type,
        productId: product.id,
        discount: (product.price - pricing.unitPrice) * item.quantity
      });
    }

    return sum + pricing.unitPrice * item.quantity;
  }, 0);

  const threshold = calculateThresholdPromotion(promotions, itemTotal);
  if (threshold.promotion) {
    appliedPromotions.push(threshold.promotion);
  }

  const couponResult = calculateCouponDiscount(
    getEligibleCoupon(coupons, cart.couponCode),
    itemTotal - threshold.discount
  );
  const total = Math.max(0, itemTotal - threshold.discount - couponResult.discount + shippingFee);

  return {
    subtotal,
    itemTotal,
    productDiscount: subtotal - itemTotal,
    orderDiscount: threshold.discount,
    couponDiscount: couponResult.discount,
    shipping: shippingFee,
    total,
    coupon: couponResult.coupon,
    thresholdProgress: threshold.progress,
    appliedPromotions
  };
}

module.exports = {
  createPricingSummary,
  getEffectiveUnitPrice
};

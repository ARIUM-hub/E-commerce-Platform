function registerProductRoutes(router, services) {
  router.get("/api/products", ({ requestUrl, response, sendJson }) => {
    const products = services.withDatabase((db) => services.listProducts(db));
    const payload = services.getProductsPayload(
      products,
      requestUrl.searchParams.get("filter"),
      requestUrl.searchParams.get("sort"),
      requestUrl.searchParams.get("locale"),
      requestUrl.searchParams.get("q"),
      {
        page: requestUrl.searchParams.get("page"),
        pageSize: requestUrl.searchParams.get("pageSize"),
        minPrice: requestUrl.searchParams.get("minPrice"),
        maxPrice: requestUrl.searchParams.get("maxPrice"),
        size: requestUrl.searchParams.get("size"),
        stock: requestUrl.searchParams.get("stock"),
        ratingMin: requestUrl.searchParams.get("ratingMin")
      }
    );
    sendJson(response, 200, payload);
  });
}

module.exports = {
  registerProductRoutes
};

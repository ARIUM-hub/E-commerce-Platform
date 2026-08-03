function createRouter() {
  const routes = [];

  function add(method, matcher, handler) {
    routes.push({ method, matcher, handler });
  }

  function get(pathname, handler) {
    add("GET", pathname, handler);
  }

  function post(pathname, handler) {
    add("POST", pathname, handler);
  }

  function patch(pathname, handler) {
    add("PATCH", pathname, handler);
  }

  function deleteRoute(pathname, handler) {
    add("DELETE", pathname, handler);
  }

  function matchRoute(method, pathname) {
    return routes.find((route) => {
      if (route.method !== method) return false;
      if (typeof route.matcher === "string") return route.matcher === pathname;
      return route.matcher.test(pathname);
    }) || null;
  }

  async function dispatch(context) {
    const route = matchRoute(context.request.method, context.requestUrl.pathname);
    if (!route) {
      return false;
    }

    await route.handler(context);
    return true;
  }

  return {
    add,
    get,
    post,
    patch,
    delete: deleteRoute,
    dispatch
  };
}

module.exports = {
  createRouter
};

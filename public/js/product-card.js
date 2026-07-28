const sizeButtons = Array.from(document.querySelectorAll("[data-size]"));
const cartButton = document.querySelector("[data-cart-button]");
let cartTimerId = null;

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sizeButtons.forEach((item) => {
      item.classList.remove("is-selected");
      item.setAttribute("aria-pressed", "false");
    });

    button.classList.add("is-selected");
    button.setAttribute("aria-pressed", "true");
  });
});

cartButton.addEventListener("click", () => {
  cartButton.textContent = "已加入购物车";

  if (cartTimerId !== null) {
    clearTimeout(cartTimerId);
  }

  cartTimerId = window.setTimeout(() => {
    cartButton.textContent = "加入购物车";
    cartTimerId = null;
  }, 1500);
});

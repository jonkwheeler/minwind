(function () {
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    // Theme toggle: mutates the <html> element's inline style, mirroring the
    // real site's jam switcher (which sets --color-accent on documentElement).
    var toggle = document.querySelector("footer button");
    if (toggle) {
      toggle.addEventListener("click", function () {
        document.documentElement.style.setProperty(
          "--fixture-accent",
          "rgb(7, 8, 9)",
        );
      });
    }

    // Client-side navigation emulation: intercept internal links and route
    // with history.pushState instead of a full reload, like Solid's router.
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var link = target.closest('a[href^="/"]');
      if (!link) return;
      event.preventDefault();
      var href = link.getAttribute("href");
      history.pushState({}, "", href);
      document.body.setAttribute("data-navigated", href);
    });
  });
})();

// Light mode random background image from bed chart — applied to #web_bg
(function () {
  var images = [
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/01.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/2.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/3.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/4.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/5.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/6.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/7.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/8.webp",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/9.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/10.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/11.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/12.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/13.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/14.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/15.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/16.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/17.jpg",
    "https://cdn.jsdelivr.net/gh/gaoshoulailo/image-host-1@main/background-image/18.jpg",
  ];

  var webBg = document.getElementById("web_bg");

  function setLightBg() {
    if (!webBg) return;
    var isLight =
      document.documentElement.getAttribute("data-theme") !== "dark";
    if (isLight) {
      var img = images[Math.floor(Math.random() * images.length)];
      webBg.style.backgroundImage = 'url("' + img + '")';
      // Keep the theme's var(--anzhiyu-background) as fallback during load
      webBg.style.backgroundSize = "cover";
      webBg.style.backgroundPosition = "center";
      webBg.style.backgroundRepeat = "no-repeat";
      webBg.style.backgroundAttachment = "fixed";
    } else {
      // Restore original solid color background for dark mode
      webBg.style.backgroundImage = "";
      // Let the theme's own CSS handle dark mode background color
    }
  }

  // Initial set after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setLightBg);
  } else {
    setLightBg();
  }

  // Listen for theme switches (user toggling dark/light mode)
  var observer = new MutationObserver(function () {
    setLightBg();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
})();

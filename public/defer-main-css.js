;(function () {
  var preload = document.getElementById("main-css-preload")
  if (!preload) return

  function activate() {
    if (preload.rel === "stylesheet") return
    preload.rel = "stylesheet"
    preload.removeAttribute("as")
  }

  preload.addEventListener("load", activate)
  preload.addEventListener("error", function () {
    var href = preload.getAttribute("href")
    if (!href) return
    var link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    if (preload.hasAttribute("crossorigin")) link.crossOrigin = "anonymous"
    document.head.appendChild(link)
  })
})()

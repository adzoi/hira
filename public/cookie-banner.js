;(function () {
  var CONSENT_KEY = "hira-cookie-consent"

  function hasConsent() {
    try {
      var value = localStorage.getItem(CONSENT_KEY)
      return value === "accepted" || value === "all" || value === "essential"
    } catch (_error) {
      return false
    }
  }

  function hideBanner() {
    document.documentElement.classList.remove("cookie-banner-visible")
    document.documentElement.classList.add("cookie-consent-given")
  }

  function showBanner() {
    document.documentElement.classList.add("cookie-banner-visible")
    document.documentElement.classList.remove("cookie-consent-given")
  }

  function persistAndReload(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value)
    } catch (_error) {
      // Ignore storage errors (private browsing, quota, etc.)
    }
    window.location.reload()
  }

  if (hasConsent()) {
    hideBanner()
    return
  }

  showBanner()

  document.addEventListener("click", function (event) {
    var target = event.target
    if (!(target instanceof HTMLElement)) return

    if (target.id === "cookie-banner-accept-all") {
      persistAndReload("accepted")
      return
    }

    if (target.id === "cookie-banner-essential") {
      persistAndReload("essential")
    }
  })
})()

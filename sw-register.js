if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ComiAPP/sw.js')
    .then(reg => {
      reg.update();
    });
}
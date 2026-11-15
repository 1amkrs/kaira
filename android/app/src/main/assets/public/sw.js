/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "402b66900e731ca748771b6fc5e7a068"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "bdaf0dea1f600a822f223fd527036874"
  }, {
    "url": "pwa-512x512.png",
    "revision": "45e43fa0d10a8ab0f86aeb8b73265aec"
  }, {
    "url": "pwa-192x192.png",
    "revision": "64c92347e26ca4b1dcdb159925ade0ee"
  }, {
    "url": "index.html",
    "revision": "14e0b6a491f4191b0d8c2be6e35f591c"
  }, {
    "url": "icon.svg",
    "revision": "490cb35ba2c6311e268959e4e260d4dd"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "0329c27acb42107183027e7467df1f30"
  }, {
    "url": "assets/workbox-window.prod.es5-BAA1jQbh.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-g4yivTGg.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-OHCDjB1y.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-FKCB-3kg.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-DxJgdcyL.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-DbNmFOHu.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-D2WYt7vL.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-CupW7qe8.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-CtBAL7h_.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-CGvFGbUj.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-C8S2fqOo.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-BNwAQdeg.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-B1v5LC39.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-Poxn_SEJ.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-CwDefEae.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-CvsnNQFq.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-CnXGktji.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-BlNLFnlL.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-B94A8ttP.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-B6lSvvUc.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-4ph0C4nj.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-UQrVJlaw.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-IEJRgi0K.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-DEGcDSWd.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-CzR-KKfP.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-CZ62ommf.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-CLPtQrFp.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-BB8lG44S.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-1x8lzJk9.js",
    "revision": null
  }, {
    "url": "assets/index-q8UUUQIW.css",
    "revision": null
  }, {
    "url": "assets/index-gb0h_F8q.js",
    "revision": null
  }, {
    "url": "assets/index-Z-4mAXjH.js",
    "revision": null
  }, {
    "url": "assets/index-YYR10XO9.js",
    "revision": null
  }, {
    "url": "assets/index-VHxESn_8.js",
    "revision": null
  }, {
    "url": "assets/index-HHHMZXqY.css",
    "revision": null
  }, {
    "url": "assets/index-Dzrw7Haq.css",
    "revision": null
  }, {
    "url": "assets/index-DuG_6WLJ.js",
    "revision": null
  }, {
    "url": "assets/index-DrwMijPQ.css",
    "revision": null
  }, {
    "url": "assets/index-DrVzX4yS.js",
    "revision": null
  }, {
    "url": "assets/index-DpvMCOu0.js",
    "revision": null
  }, {
    "url": "assets/index-DpRY_3zZ.js",
    "revision": null
  }, {
    "url": "assets/index-DiVAzlom.js",
    "revision": null
  }, {
    "url": "assets/index-DPaUydiZ.css",
    "revision": null
  }, {
    "url": "assets/index-DOpR5vkr.js",
    "revision": null
  }, {
    "url": "assets/index-DNIr91za.css",
    "revision": null
  }, {
    "url": "assets/index-DN79zwZ0.js",
    "revision": null
  }, {
    "url": "assets/index-DGmD8d1D.css",
    "revision": null
  }, {
    "url": "assets/index-DC8In7VU.css",
    "revision": null
  }, {
    "url": "assets/index-DB_aOnPP.js",
    "revision": null
  }, {
    "url": "assets/index-D1nKWV-W.css",
    "revision": null
  }, {
    "url": "assets/index-D1a7-xvU.css",
    "revision": null
  }, {
    "url": "assets/index-CoWMA0v5.css",
    "revision": null
  }, {
    "url": "assets/index-CXTt1Wxy.css",
    "revision": null
  }, {
    "url": "assets/index-CRSQygYq.js",
    "revision": null
  }, {
    "url": "assets/index-CCb579Nj.css",
    "revision": null
  }, {
    "url": "assets/index-CCJ3Mmaf.js",
    "revision": null
  }, {
    "url": "assets/index-C68oy87s.css",
    "revision": null
  }, {
    "url": "assets/index-C4NDGMx3.js",
    "revision": null
  }, {
    "url": "assets/index-C-z-rwDf.css",
    "revision": null
  }, {
    "url": "assets/index-BnLy0zf6.js",
    "revision": null
  }, {
    "url": "assets/index-Bmztg7z6.css",
    "revision": null
  }, {
    "url": "assets/index-BjPuIyw2.css",
    "revision": null
  }, {
    "url": "assets/index-BgIZ8C_i.js",
    "revision": null
  }, {
    "url": "assets/index-BfI7_cVl.js",
    "revision": null
  }, {
    "url": "assets/index-BfEtly1D.js",
    "revision": null
  }, {
    "url": "assets/index-B_Oo3mXo.css",
    "revision": null
  }, {
    "url": "assets/index-BJJBBcNs.js",
    "revision": null
  }, {
    "url": "assets/index-BGdnytAt.css",
    "revision": null
  }, {
    "url": "assets/index-BG5PFAei.css",
    "revision": null
  }, {
    "url": "assets/index-BElcb4_4.js",
    "revision": null
  }, {
    "url": "assets/index-BEXt32w3.js",
    "revision": null
  }, {
    "url": "assets/index-B4R4gVK-.js",
    "revision": null
  }, {
    "url": "assets/index-7IPlcJVt.js",
    "revision": null
  }, {
    "url": "assets/index-6d8LsjQE.css",
    "revision": null
  }, {
    "url": "assets/index-5CXX4Wv2.css",
    "revision": null
  }, {
    "url": "assets/aistudio/image_f0f75130.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_e45e4075.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_bce3f632.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_a48d82b7.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_978ac4cb.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_4b8527cc.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_425efa25.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "0329c27acb42107183027e7467df1f30"
  }, {
    "url": "icon.svg",
    "revision": "490cb35ba2c6311e268959e4e260d4dd"
  }, {
    "url": "pwa-192x192.png",
    "revision": "64c92347e26ca4b1dcdb159925ade0ee"
  }, {
    "url": "pwa-512x512.png",
    "revision": "45e43fa0d10a8ab0f86aeb8b73265aec"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "bdaf0dea1f600a822f223fd527036874"
  }, {
    "url": "manifest.webmanifest",
    "revision": "844c42e8f4f834961198d82661754b6c"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));

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
    "revision": "0d88b36d6192303e4989de9bda024ad9"
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
    "url": "assets/virtual_pwa-register-BTER0BSW.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-CwDefEae.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-B6lSvvUc.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-CzR-KKfP.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-CZ62ommf.js",
    "revision": null
  }, {
    "url": "assets/index-egrJsc9Y.css",
    "revision": null
  }, {
    "url": "assets/index-PDCLzQq1.js",
    "revision": null
  }, {
    "url": "assets/index-MExTs1ZP.js",
    "revision": null
  }, {
    "url": "assets/index-DTbXc_68.css",
    "revision": null
  }, {
    "url": "assets/CompanionRemoteApp-TGKR6jwA.js",
    "revision": null
  }, {
    "url": "assets/CompanionRemoteApp-CToTsn1z.css",
    "revision": null
  }, {
    "url": "assets/CompanionRemoteApp-8_hmmlIs.js",
    "revision": null
  }, {
    "url": "assets/CompanionRemoteApp-8H4AvIP1.css",
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
    "url": "assets/aistudio/image_a292f2a4.png",
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
    "url": "assets/aistudio/image_09b6eed0.png",
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

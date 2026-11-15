import { _ as __vitePreload } from "./index-B4R4gVK-.js";
import "./vendor-icons-CzR-KKfP.js";
import "./vendor-react-B6lSvvUc.js";
function registerSW(options = {}) {
  const {
    immediate = false,
    onNeedReload,
    onNeedRefresh,
    onOfflineReady,
    onRegistered,
    onRegisteredSW,
    onRegisterError
  } = options;
  let wb;
  let registerPromise;
  const updateServiceWorker = async (_reloadPage = true) => {
    await registerPromise;
  };
  async function register() {
    if ("serviceWorker" in navigator) {
      wb = await __vitePreload(async () => {
        const { Workbox } = await import("./workbox-window.prod.es5-BAA1jQbh.js");
        return { Workbox };
      }, true ? [] : void 0, import.meta.url).then(({ Workbox }) => {
        return new Workbox("./sw.js", { scope: "./", type: "classic" });
      }).catch((e) => {
        onRegisterError == null ? void 0 : onRegisterError(e);
        return void 0;
      });
      if (!wb)
        return;
      {
        {
          wb.addEventListener("activated", (event) => {
            if (event.isUpdate || event.isExternal) {
              if (onNeedReload)
                onNeedReload();
              else
                window.location.reload();
            }
          });
          wb.addEventListener("installed", (event) => {
            if (!event.isUpdate) {
              onOfflineReady == null ? void 0 : onOfflineReady();
            }
          });
        }
      }
      wb.register({ immediate }).then((r) => {
        if (onRegisteredSW)
          onRegisteredSW("./sw.js", r);
        else
          onRegistered == null ? void 0 : onRegistered(r);
      }).catch((e) => {
        onRegisterError == null ? void 0 : onRegisterError(e);
      });
    }
  }
  registerPromise = register();
  return updateServiceWorker;
}
export {
  registerSW
};

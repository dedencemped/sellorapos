import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=541f185f"; const Fragment = __vite__cjsImport0_react_jsxDevRuntime["Fragment"]; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import __vite__cjsImport1_react from "/node_modules/.vite/deps/react.js?v=541f185f"; const React = __vite__cjsImport1_react.__esModule ? __vite__cjsImport1_react.default : __vite__cjsImport1_react;
import { Toaster } from "/src/components/ui/toaster.jsx";
import { QueryClientProvider } from "/node_modules/.vite/deps/@tanstack_react-query.js?v=a42b8e3d";
import { queryClientInstance } from "/src/lib/query-client.js";
import NavigationTracker from "/src/lib/NavigationTracker.jsx";
import { pagesConfig } from "/src/pages.config.js";
import PageNotFound from "/src/lib/PageNotFound.jsx";
import { BrowserRouter as Router, Route, Routes, Navigate } from "/node_modules/.vite/deps/react-router-dom.js?v=70bcfaca";
import { AuthProvider, useAuth } from "/src/lib/AuthContext.jsx";
const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
  }
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ jsxDEV("div", { className: "fixed inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxDEV("div", { className: "text-center space-y-3", children: [
        /* @__PURE__ */ jsxDEV("h2", { className: "text-xl font-semibold", children: "Terjadi kesalahan saat memuat halaman" }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 28,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            onClick: () => window.location.reload(),
            className: "inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800",
            children: "Muat Ulang"
          },
          void 0,
          false,
          {
            fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
            lineNumber: 29,
            columnNumber: 13
          },
          this
        )
      ] }, void 0, true, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 27,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 26,
        columnNumber: 9
      }, this);
    }
    return this.props.children;
  }
}
const LayoutWrapper = ({ children, currentPageName }) => Layout ? /* @__PURE__ */ jsxDEV(Layout, { currentPageName, children }, void 0, false, {
  fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
  lineNumber: 43,
  columnNumber: 3
}, this) : /* @__PURE__ */ jsxDEV(Fragment, { children }, void 0, false, {
  fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
  lineNumber: 44,
  columnNumber: 5
}, this);
const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState, updateAppId } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) {
    return /* @__PURE__ */ jsxDEV("div", { className: "fixed inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxDEV("div", { className: "w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" }, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 53,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 52,
      columnNumber: 7
    }, this);
  }
  if (authError) {
    if (authError.type === "user_not_registered") {
      return /* @__PURE__ */ jsxDEV("div", { className: "flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50", children: /* @__PURE__ */ jsxDEV("div", { className: "max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100", children: /* @__PURE__ */ jsxDEV("div", { className: "text-center", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-orange-100", children: /* @__PURE__ */ jsxDEV("svg", { className: "w-8 h-8 text-orange-600", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ jsxDEV("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 67,
          columnNumber: 19
        }, this) }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 66,
          columnNumber: 17
        }, this) }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 65,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("h1", { className: "text-3xl font-bold text-slate-900 mb-4", children: "Access Restricted" }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 70,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("p", { className: "text-slate-600 mb-8", children: "You are not registered to use this application. Please contact the app administrator to request access." }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 71,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "p-4 bg-slate-50 rounded-md text-sm text-slate-600", children: [
          /* @__PURE__ */ jsxDEV("p", { children: "If you believe this is an error, you can:" }, void 0, false, {
            fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
            lineNumber: 75,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDEV("ul", { className: "list-disc list-inside mt-2 space-y-1", children: [
            /* @__PURE__ */ jsxDEV("li", { children: "Verify you are logged in with the correct account" }, void 0, false, {
              fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
              lineNumber: 77,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("li", { children: "Contact the app administrator for access" }, void 0, false, {
              fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
              lineNumber: 78,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("li", { children: "Try logging out and back in again" }, void 0, false, {
              fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
              lineNumber: 79,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
            lineNumber: 76,
            columnNumber: 17
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 74,
          columnNumber: 15
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 64,
        columnNumber: 13
      }, this) }, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 63,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 62,
        columnNumber: 9
      }, this);
    } else if (authError.type === "auth_required") {
      return /* @__PURE__ */ jsxDEV("div", { className: "fixed inset-0 flex items-center justify-center p-6 bg-slate-50", children: /* @__PURE__ */ jsxDEV("div", { className: "max-w-md w-full bg-white border rounded-lg p-6 text-center space-y-4", children: [
        /* @__PURE__ */ jsxDEV("h2", { className: "text-xl font-semibold", children: "Authentication Required" }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 90,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("p", { className: "text-slate-600", children: "Please sign in to continue." }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 91,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            onClick: navigateToLogin,
            className: "inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800",
            children: "Sign In"
          },
          void 0,
          false,
          {
            fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
            lineNumber: 92,
            columnNumber: 13
          },
          this
        )
      ] }, void 0, true, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 89,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 88,
        columnNumber: 9
      }, this);
    } else {
      return /* @__PURE__ */ jsxDEV("div", { className: "fixed inset-0 flex items-center justify-center p-6 bg-slate-50", children: /* @__PURE__ */ jsxDEV("div", { className: "max-w-md w-full bg-white border rounded-lg p-6 text-center space-y-4", children: [
        /* @__PURE__ */ jsxDEV("h2", { className: "text-xl font-semibold", children: "Terjadi Kesalahan" }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 105,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("p", { className: "text-slate-600", children: authError.message || "Gagal memuat status aplikasi." }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 106,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "flex gap-3 justify-center", children: [
          /* @__PURE__ */ jsxDEV("button", { onClick: checkAppState, className: "inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800", children: "Coba Lagi" }, void 0, false, {
            fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
            lineNumber: 110,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => {
                const id = window.prompt("Masukkan App ID");
                if (id) updateAppId(id);
              },
              className: "inline-flex items-center px-4 py-2 bg-slate-100 text-slate-900 rounded-md hover:bg-slate-200",
              children: "Set App ID"
            },
            void 0,
            false,
            {
              fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
              lineNumber: 111,
              columnNumber: 15
            },
            this
          )
        ] }, void 0, true, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 109,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 104,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 103,
        columnNumber: 9
      }, this);
    }
  }
  return /* @__PURE__ */ jsxDEV(Routes, { children: [
    /* @__PURE__ */ jsxDEV(Route, { path: "/", element: /* @__PURE__ */ jsxDEV(Navigate, { to: `/${mainPageKey}`, replace: true }, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 130,
      columnNumber: 32
    }, this) }, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 130,
      columnNumber: 7
    }, this),
    Object.entries(Pages).map(([path, Page]) => /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: `/${path}`,
        element: /* @__PURE__ */ jsxDEV(LayoutWrapper, { currentPageName: path, children: /* @__PURE__ */ jsxDEV(Page, {}, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 137,
          columnNumber: 15
        }, this) }, void 0, false, {
          fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
          lineNumber: 136,
          columnNumber: 13
        }, this)
      },
      path,
      false,
      {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 132,
        columnNumber: 9
      },
      this
    )),
    /* @__PURE__ */ jsxDEV(Route, { path: "*", element: /* @__PURE__ */ jsxDEV(PageNotFound, {}, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 142,
      columnNumber: 32
    }, this) }, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 142,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
    lineNumber: 129,
    columnNumber: 5
  }, this);
};
export default function App() {
  return /* @__PURE__ */ jsxDEV(AuthProvider, { children: /* @__PURE__ */ jsxDEV(QueryClientProvider, { client: queryClientInstance, children: [
    /* @__PURE__ */ jsxDEV(Router, { children: [
      /* @__PURE__ */ jsxDEV(NavigationTracker, {}, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 154,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV(AuthenticatedApp, {}, void 0, false, {
        fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
        lineNumber: 155,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 153,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV(Toaster, {}, void 0, false, {
      fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
      lineNumber: 157,
      columnNumber: 9
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
    lineNumber: 152,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "C:/Users/TOSHIBA/Documents/trae_projects/New folder/src/App.jsx",
    lineNumber: 151,
    columnNumber: 5
  }, this);
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkFwcC5qc3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0IGZyb20gXCJyZWFjdFwiO1xyXG5pbXBvcnQgeyBUb2FzdGVyIH0gZnJvbSBcIkAvY29tcG9uZW50cy91aS90b2FzdGVyLmpzeFwiXHJcbmltcG9ydCB7IFF1ZXJ5Q2xpZW50UHJvdmlkZXIgfSBmcm9tICdAdGFuc3RhY2svcmVhY3QtcXVlcnknXHJcbmltcG9ydCB7IHF1ZXJ5Q2xpZW50SW5zdGFuY2UgfSBmcm9tICdAL2xpYi9xdWVyeS1jbGllbnQuanMnXHJcbmltcG9ydCBOYXZpZ2F0aW9uVHJhY2tlciBmcm9tICdAL2xpYi9OYXZpZ2F0aW9uVHJhY2tlci5qc3gnXHJcbmltcG9ydCB7IHBhZ2VzQ29uZmlnIH0gZnJvbSAnLi9wYWdlcy5jb25maWcuanMnXHJcbmltcG9ydCBQYWdlTm90Rm91bmQgZnJvbSAnLi9saWIvUGFnZU5vdEZvdW5kLmpzeCdcclxuaW1wb3J0IHsgQnJvd3NlclJvdXRlciBhcyBSb3V0ZXIsIFJvdXRlLCBSb3V0ZXMsIE5hdmlnYXRlIH0gZnJvbSAncmVhY3Qtcm91dGVyLWRvbSc7XHJcbmltcG9ydCB7IEF1dGhQcm92aWRlciwgdXNlQXV0aCB9IGZyb20gJ0AvbGliL0F1dGhDb250ZXh0LmpzeCc7XHJcblxyXG5jb25zdCB7IFBhZ2VzLCBMYXlvdXQsIG1haW5QYWdlIH0gPSBwYWdlc0NvbmZpZztcclxuY29uc3QgbWFpblBhZ2VLZXkgPSBtYWluUGFnZSA/PyBPYmplY3Qua2V5cyhQYWdlcylbMF07XHJcblxyXG5jbGFzcyBFcnJvckJvdW5kYXJ5IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50IHtcclxuICBjb25zdHJ1Y3Rvcihwcm9wcykge1xyXG4gICAgc3VwZXIocHJvcHMpO1xyXG4gICAgdGhpcy5zdGF0ZSA9IHsgaGFzRXJyb3I6IGZhbHNlIH07XHJcbiAgfVxyXG4gIHN0YXRpYyBnZXREZXJpdmVkU3RhdGVGcm9tRXJyb3IoKSB7XHJcbiAgICByZXR1cm4geyBoYXNFcnJvcjogdHJ1ZSB9O1xyXG4gIH1cclxuICBjb21wb25lbnREaWRDYXRjaCgpIHt9XHJcbiAgcmVuZGVyKCkge1xyXG4gICAgaWYgKHRoaXMuc3RhdGUuaGFzRXJyb3IpIHtcclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpeGVkIGluc2V0LTAgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXJcIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1jZW50ZXIgc3BhY2UteS0zXCI+XHJcbiAgICAgICAgICAgIDxoMiBjbGFzc05hbWU9XCJ0ZXh0LXhsIGZvbnQtc2VtaWJvbGRcIj5UZXJqYWRpIGtlc2FsYWhhbiBzYWF0IG1lbXVhdCBoYWxhbWFuPC9oMj5cclxuICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKX1cclxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJpbmxpbmUtZmxleCBpdGVtcy1jZW50ZXIgcHgtNCBweS0yIGJnLXNsYXRlLTkwMCB0ZXh0LXdoaXRlIHJvdW5kZWQtbWQgaG92ZXI6Ymctc2xhdGUtODAwXCJcclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIE11YXQgVWxhbmdcclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLnByb3BzLmNoaWxkcmVuO1xyXG4gIH1cclxufVxyXG5jb25zdCBMYXlvdXRXcmFwcGVyID0gKHsgY2hpbGRyZW4sIGN1cnJlbnRQYWdlTmFtZSB9KSA9PiBMYXlvdXQgP1xyXG4gIDxMYXlvdXQgY3VycmVudFBhZ2VOYW1lPXtjdXJyZW50UGFnZU5hbWV9PntjaGlsZHJlbn08L0xheW91dD5cclxuICA6IDw+e2NoaWxkcmVufTwvPjtcclxuXHJcbmNvbnN0IEF1dGhlbnRpY2F0ZWRBcHAgPSAoKSA9PiB7XHJcbiAgY29uc3QgeyBpc0xvYWRpbmdBdXRoLCBpc0xvYWRpbmdQdWJsaWNTZXR0aW5ncywgYXV0aEVycm9yLCBuYXZpZ2F0ZVRvTG9naW4sIGNoZWNrQXBwU3RhdGUsIHVwZGF0ZUFwcElkIH0gPSB1c2VBdXRoKCk7XHJcblxyXG4gIC8vIFNob3cgbG9hZGluZyBzcGlubmVyIHdoaWxlIGNoZWNraW5nIGFwcCBwdWJsaWMgc2V0dGluZ3Mgb3IgYXV0aFxyXG4gIGlmIChpc0xvYWRpbmdQdWJsaWNTZXR0aW5ncyB8fCBpc0xvYWRpbmdBdXRoKSB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpeGVkIGluc2V0LTAgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXJcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInctOCBoLTggYm9yZGVyLTQgYm9yZGVyLXNsYXRlLTIwMCBib3JkZXItdC1zbGF0ZS04MDAgcm91bmRlZC1mdWxsIGFuaW1hdGUtc3BpblwiPjwvZGl2PlxyXG4gICAgICA8L2Rpdj5cclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvLyBIYW5kbGUgYXV0aGVudGljYXRpb24gZXJyb3JzXHJcbiAgaWYgKGF1dGhFcnJvcikge1xyXG4gICAgaWYgKGF1dGhFcnJvci50eXBlID09PSAndXNlcl9ub3RfcmVnaXN0ZXJlZCcpIHtcclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIG1pbi1oLXNjcmVlbiBiZy1ncmFkaWVudC10by1iIGZyb20td2hpdGUgdG8tc2xhdGUtNTBcIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWF4LXctbWQgdy1mdWxsIHAtOCBiZy13aGl0ZSByb3VuZGVkLWxnIHNoYWRvdy1sZyBib3JkZXIgYm9yZGVyLXNsYXRlLTEwMFwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpbmxpbmUtZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgdy0xNiBoLTE2IG1iLTYgcm91bmRlZC1mdWxsIGJnLW9yYW5nZS0xMDBcIj5cclxuICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy04IGgtOCB0ZXh0LW9yYW5nZS02MDBcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIj5cclxuICAgICAgICAgICAgICAgICAgPHBhdGggc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiIHN0cm9rZVdpZHRoPVwiMlwiIGQ9XCJNMTIgOXYybTAgNGguMDFtLTYuOTM4IDRoMTMuODU2YzEuNTQgMCAyLjUwMi0xLjY2NyAxLjczMi0zTDEzLjczMiA0Yy0uNzctMS4zMzMtMi42OTQtMS4zMzMtMy40NjQgMEwzLjM0IDE2Yy0uNzcgMS4zMzMuMTkyIDMgMS43MzIgM3pcIiAvPlxyXG4gICAgICAgICAgICAgICAgPC9zdmc+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgPGgxIGNsYXNzTmFtZT1cInRleHQtM3hsIGZvbnQtYm9sZCB0ZXh0LXNsYXRlLTkwMCBtYi00XCI+QWNjZXNzIFJlc3RyaWN0ZWQ8L2gxPlxyXG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNjAwIG1iLThcIj5cclxuICAgICAgICAgICAgICAgIFlvdSBhcmUgbm90IHJlZ2lzdGVyZWQgdG8gdXNlIHRoaXMgYXBwbGljYXRpb24uIFBsZWFzZSBjb250YWN0IHRoZSBhcHAgYWRtaW5pc3RyYXRvciB0byByZXF1ZXN0IGFjY2Vzcy5cclxuICAgICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwLTQgYmctc2xhdGUtNTAgcm91bmRlZC1tZCB0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+XHJcbiAgICAgICAgICAgICAgICA8cD5JZiB5b3UgYmVsaWV2ZSB0aGlzIGlzIGFuIGVycm9yLCB5b3UgY2FuOjwvcD5cclxuICAgICAgICAgICAgICAgIDx1bCBjbGFzc05hbWU9XCJsaXN0LWRpc2MgbGlzdC1pbnNpZGUgbXQtMiBzcGFjZS15LTFcIj5cclxuICAgICAgICAgICAgICAgICAgPGxpPlZlcmlmeSB5b3UgYXJlIGxvZ2dlZCBpbiB3aXRoIHRoZSBjb3JyZWN0IGFjY291bnQ8L2xpPlxyXG4gICAgICAgICAgICAgICAgICA8bGk+Q29udGFjdCB0aGUgYXBwIGFkbWluaXN0cmF0b3IgZm9yIGFjY2VzczwvbGk+XHJcbiAgICAgICAgICAgICAgICAgIDxsaT5UcnkgbG9nZ2luZyBvdXQgYW5kIGJhY2sgaW4gYWdhaW48L2xpPlxyXG4gICAgICAgICAgICAgICAgPC91bD5cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgKTtcclxuICAgIH0gZWxzZSBpZiAoYXV0aEVycm9yLnR5cGUgPT09ICdhdXRoX3JlcXVpcmVkJykge1xyXG4gICAgICByZXR1cm4gKFxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZml4ZWQgaW5zZXQtMCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBwLTYgYmctc2xhdGUtNTBcIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWF4LXctbWQgdy1mdWxsIGJnLXdoaXRlIGJvcmRlciByb3VuZGVkLWxnIHAtNiB0ZXh0LWNlbnRlciBzcGFjZS15LTRcIj5cclxuICAgICAgICAgICAgPGgyIGNsYXNzTmFtZT1cInRleHQteGwgZm9udC1zZW1pYm9sZFwiPkF1dGhlbnRpY2F0aW9uIFJlcXVpcmVkPC9oMj5cclxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS02MDBcIj5QbGVhc2Ugc2lnbiBpbiB0byBjb250aW51ZS48L3A+XHJcbiAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICBvbkNsaWNrPXtuYXZpZ2F0ZVRvTG9naW59XHJcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIHB4LTQgcHktMiBiZy1zbGF0ZS05MDAgdGV4dC13aGl0ZSByb3VuZGVkLW1kIGhvdmVyOmJnLXNsYXRlLTgwMFwiXHJcbiAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICBTaWduIEluXHJcbiAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gKFxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZml4ZWQgaW5zZXQtMCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBwLTYgYmctc2xhdGUtNTBcIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWF4LXctbWQgdy1mdWxsIGJnLXdoaXRlIGJvcmRlciByb3VuZGVkLWxnIHAtNiB0ZXh0LWNlbnRlciBzcGFjZS15LTRcIj5cclxuICAgICAgICAgICAgPGgyIGNsYXNzTmFtZT1cInRleHQteGwgZm9udC1zZW1pYm9sZFwiPlRlcmphZGkgS2VzYWxhaGFuPC9oMj5cclxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS02MDBcIj5cclxuICAgICAgICAgICAgICB7YXV0aEVycm9yLm1lc3NhZ2UgfHwgJ0dhZ2FsIG1lbXVhdCBzdGF0dXMgYXBsaWthc2kuJ31cclxuICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTMganVzdGlmeS1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2NoZWNrQXBwU3RhdGV9IGNsYXNzTmFtZT1cImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciBweC00IHB5LTIgYmctc2xhdGUtOTAwIHRleHQtd2hpdGUgcm91bmRlZC1tZCBob3ZlcjpiZy1zbGF0ZS04MDBcIj5Db2JhIExhZ2k8L2J1dHRvbj5cclxuICAgICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gd2luZG93LnByb21wdCgnTWFzdWtrYW4gQXBwIElEJyk7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChpZCkgdXBkYXRlQXBwSWQoaWQpO1xyXG4gICAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciBweC00IHB5LTIgYmctc2xhdGUtMTAwIHRleHQtc2xhdGUtOTAwIHJvdW5kZWQtbWQgaG92ZXI6Ymctc2xhdGUtMjAwXCJcclxuICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICBTZXQgQXBwIElEXHJcbiAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBSZW5kZXIgdGhlIG1haW4gYXBwXHJcbiAgcmV0dXJuIChcclxuICAgIDxSb3V0ZXM+XHJcbiAgICAgIDxSb3V0ZSBwYXRoPVwiL1wiIGVsZW1lbnQ9ezxOYXZpZ2F0ZSB0bz17YC8ke21haW5QYWdlS2V5fWB9IHJlcGxhY2UgLz59IC8+XHJcbiAgICAgIHtPYmplY3QuZW50cmllcyhQYWdlcykubWFwKChbcGF0aCwgUGFnZV0pID0+IChcclxuICAgICAgICA8Um91dGVcclxuICAgICAgICAgIGtleT17cGF0aH1cclxuICAgICAgICAgIHBhdGg9e2AvJHtwYXRofWB9XHJcbiAgICAgICAgICBlbGVtZW50PXtcclxuICAgICAgICAgICAgPExheW91dFdyYXBwZXIgY3VycmVudFBhZ2VOYW1lPXtwYXRofT5cclxuICAgICAgICAgICAgICA8UGFnZSAvPlxyXG4gICAgICAgICAgICA8L0xheW91dFdyYXBwZXI+XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgLz5cclxuICAgICAgKSl9XHJcbiAgICAgIDxSb3V0ZSBwYXRoPVwiKlwiIGVsZW1lbnQ9ezxQYWdlTm90Rm91bmQgLz59IC8+XHJcbiAgICA8L1JvdXRlcz5cclxuICApO1xyXG59O1xyXG5cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEFwcCgpIHtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDxBdXRoUHJvdmlkZXI+XHJcbiAgICAgIDxRdWVyeUNsaWVudFByb3ZpZGVyIGNsaWVudD17cXVlcnlDbGllbnRJbnN0YW5jZX0+XHJcbiAgICAgICAgPFJvdXRlcj5cclxuICAgICAgICAgIDxOYXZpZ2F0aW9uVHJhY2tlciAvPlxyXG4gICAgICAgICAgPEF1dGhlbnRpY2F0ZWRBcHAgLz5cclxuICAgICAgICA8L1JvdXRlcj5cclxuICAgICAgICA8VG9hc3RlciAvPlxyXG4gICAgICA8L1F1ZXJ5Q2xpZW50UHJvdmlkZXI+XHJcbiAgICA8L0F1dGhQcm92aWRlcj5cclxuICApXHJcbn1cclxuIl0sIm1hcHBpbmdzIjoiQUEyQlksU0FnQlIsVUFoQlE7QUEzQlosT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxPQUFPLHVCQUF1QjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixPQUFPLGtCQUFrQjtBQUN6QixTQUFTLGlCQUFpQixRQUFRLE9BQU8sUUFBUSxnQkFBZ0I7QUFDakUsU0FBUyxjQUFjLGVBQWU7QUFFdEMsTUFBTSxFQUFFLE9BQU8sUUFBUSxTQUFTLElBQUk7QUFDcEMsTUFBTSxjQUFjLFlBQVksT0FB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

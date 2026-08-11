var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/path-browserify/index.js
var require_path_browserify = __commonJS({
  "../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/path-browserify/index.js"(exports, module) {
    "use strict";
    function assertPath(path) {
      if (typeof path !== "string") {
        throw new TypeError("Path must be a string. Received " + JSON.stringify(path));
      }
    }
    function normalizeStringPosix(path, allowAboveRoot) {
      var res = "";
      var lastSegmentLength = 0;
      var lastSlash = -1;
      var dots = 0;
      var code;
      for (var i = 0; i <= path.length; ++i) {
        if (i < path.length)
          code = path.charCodeAt(i);
        else if (code === 47)
          break;
        else
          code = 47;
        if (code === 47) {
          if (lastSlash === i - 1 || dots === 1) {
          } else if (lastSlash !== i - 1 && dots === 2) {
            if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
              if (res.length > 2) {
                var lastSlashIndex = res.lastIndexOf("/");
                if (lastSlashIndex !== res.length - 1) {
                  if (lastSlashIndex === -1) {
                    res = "";
                    lastSegmentLength = 0;
                  } else {
                    res = res.slice(0, lastSlashIndex);
                    lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
                  }
                  lastSlash = i;
                  dots = 0;
                  continue;
                }
              } else if (res.length === 2 || res.length === 1) {
                res = "";
                lastSegmentLength = 0;
                lastSlash = i;
                dots = 0;
                continue;
              }
            }
            if (allowAboveRoot) {
              if (res.length > 0)
                res += "/..";
              else
                res = "..";
              lastSegmentLength = 2;
            }
          } else {
            if (res.length > 0)
              res += "/" + path.slice(lastSlash + 1, i);
            else
              res = path.slice(lastSlash + 1, i);
            lastSegmentLength = i - lastSlash - 1;
          }
          lastSlash = i;
          dots = 0;
        } else if (code === 46 && dots !== -1) {
          ++dots;
        } else {
          dots = -1;
        }
      }
      return res;
    }
    function _format(sep, pathObject) {
      var dir = pathObject.dir || pathObject.root;
      var base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
      if (!dir) {
        return base;
      }
      if (dir === pathObject.root) {
        return dir + base;
      }
      return dir + sep + base;
    }
    var posix = {
      // path.resolve([from ...], to)
      resolve: function resolve() {
        var resolvedPath = "";
        var resolvedAbsolute = false;
        var cwd;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path;
          if (i >= 0)
            path = arguments[i];
          else {
            if (cwd === void 0)
              cwd = process.cwd();
            path = cwd;
          }
          assertPath(path);
          if (path.length === 0) {
            continue;
          }
          resolvedPath = path + "/" + resolvedPath;
          resolvedAbsolute = path.charCodeAt(0) === 47;
        }
        resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);
        if (resolvedAbsolute) {
          if (resolvedPath.length > 0)
            return "/" + resolvedPath;
          else
            return "/";
        } else if (resolvedPath.length > 0) {
          return resolvedPath;
        } else {
          return ".";
        }
      },
      normalize: function normalize2(path) {
        assertPath(path);
        if (path.length === 0) return ".";
        var isAbsolute2 = path.charCodeAt(0) === 47;
        var trailingSeparator = path.charCodeAt(path.length - 1) === 47;
        path = normalizeStringPosix(path, !isAbsolute2);
        if (path.length === 0 && !isAbsolute2) path = ".";
        if (path.length > 0 && trailingSeparator) path += "/";
        if (isAbsolute2) return "/" + path;
        return path;
      },
      isAbsolute: function isAbsolute2(path) {
        assertPath(path);
        return path.length > 0 && path.charCodeAt(0) === 47;
      },
      join: function join2() {
        if (arguments.length === 0)
          return ".";
        var joined;
        for (var i = 0; i < arguments.length; ++i) {
          var arg = arguments[i];
          assertPath(arg);
          if (arg.length > 0) {
            if (joined === void 0)
              joined = arg;
            else
              joined += "/" + arg;
          }
        }
        if (joined === void 0)
          return ".";
        return posix.normalize(joined);
      },
      relative: function relative(from, to) {
        assertPath(from);
        assertPath(to);
        if (from === to) return "";
        from = posix.resolve(from);
        to = posix.resolve(to);
        if (from === to) return "";
        var fromStart = 1;
        for (; fromStart < from.length; ++fromStart) {
          if (from.charCodeAt(fromStart) !== 47)
            break;
        }
        var fromEnd = from.length;
        var fromLen = fromEnd - fromStart;
        var toStart = 1;
        for (; toStart < to.length; ++toStart) {
          if (to.charCodeAt(toStart) !== 47)
            break;
        }
        var toEnd = to.length;
        var toLen = toEnd - toStart;
        var length = fromLen < toLen ? fromLen : toLen;
        var lastCommonSep = -1;
        var i = 0;
        for (; i <= length; ++i) {
          if (i === length) {
            if (toLen > length) {
              if (to.charCodeAt(toStart + i) === 47) {
                return to.slice(toStart + i + 1);
              } else if (i === 0) {
                return to.slice(toStart + i);
              }
            } else if (fromLen > length) {
              if (from.charCodeAt(fromStart + i) === 47) {
                lastCommonSep = i;
              } else if (i === 0) {
                lastCommonSep = 0;
              }
            }
            break;
          }
          var fromCode = from.charCodeAt(fromStart + i);
          var toCode = to.charCodeAt(toStart + i);
          if (fromCode !== toCode)
            break;
          else if (fromCode === 47)
            lastCommonSep = i;
        }
        var out = "";
        for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
          if (i === fromEnd || from.charCodeAt(i) === 47) {
            if (out.length === 0)
              out += "..";
            else
              out += "/..";
          }
        }
        if (out.length > 0)
          return out + to.slice(toStart + lastCommonSep);
        else {
          toStart += lastCommonSep;
          if (to.charCodeAt(toStart) === 47)
            ++toStart;
          return to.slice(toStart);
        }
      },
      _makeLong: function _makeLong(path) {
        return path;
      },
      dirname: function dirname(path) {
        assertPath(path);
        if (path.length === 0) return ".";
        var code = path.charCodeAt(0);
        var hasRoot = code === 47;
        var end = -1;
        var matchedSlash = true;
        for (var i = path.length - 1; i >= 1; --i) {
          code = path.charCodeAt(i);
          if (code === 47) {
            if (!matchedSlash) {
              end = i;
              break;
            }
          } else {
            matchedSlash = false;
          }
        }
        if (end === -1) return hasRoot ? "/" : ".";
        if (hasRoot && end === 1) return "//";
        return path.slice(0, end);
      },
      basename: function basename(path, ext) {
        if (ext !== void 0 && typeof ext !== "string") throw new TypeError('"ext" argument must be a string');
        assertPath(path);
        var start = 0;
        var end = -1;
        var matchedSlash = true;
        var i;
        if (ext !== void 0 && ext.length > 0 && ext.length <= path.length) {
          if (ext.length === path.length && ext === path) return "";
          var extIdx = ext.length - 1;
          var firstNonSlashEnd = -1;
          for (i = path.length - 1; i >= 0; --i) {
            var code = path.charCodeAt(i);
            if (code === 47) {
              if (!matchedSlash) {
                start = i + 1;
                break;
              }
            } else {
              if (firstNonSlashEnd === -1) {
                matchedSlash = false;
                firstNonSlashEnd = i + 1;
              }
              if (extIdx >= 0) {
                if (code === ext.charCodeAt(extIdx)) {
                  if (--extIdx === -1) {
                    end = i;
                  }
                } else {
                  extIdx = -1;
                  end = firstNonSlashEnd;
                }
              }
            }
          }
          if (start === end) end = firstNonSlashEnd;
          else if (end === -1) end = path.length;
          return path.slice(start, end);
        } else {
          for (i = path.length - 1; i >= 0; --i) {
            if (path.charCodeAt(i) === 47) {
              if (!matchedSlash) {
                start = i + 1;
                break;
              }
            } else if (end === -1) {
              matchedSlash = false;
              end = i + 1;
            }
          }
          if (end === -1) return "";
          return path.slice(start, end);
        }
      },
      extname: function extname(path) {
        assertPath(path);
        var startDot = -1;
        var startPart = 0;
        var end = -1;
        var matchedSlash = true;
        var preDotState = 0;
        for (var i = path.length - 1; i >= 0; --i) {
          var code = path.charCodeAt(i);
          if (code === 47) {
            if (!matchedSlash) {
              startPart = i + 1;
              break;
            }
            continue;
          }
          if (end === -1) {
            matchedSlash = false;
            end = i + 1;
          }
          if (code === 46) {
            if (startDot === -1)
              startDot = i;
            else if (preDotState !== 1)
              preDotState = 1;
          } else if (startDot !== -1) {
            preDotState = -1;
          }
        }
        if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
        preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
          return "";
        }
        return path.slice(startDot, end);
      },
      format: function format(pathObject) {
        if (pathObject === null || typeof pathObject !== "object") {
          throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
        }
        return _format("/", pathObject);
      },
      parse: function parse(path) {
        assertPath(path);
        var ret = { root: "", dir: "", base: "", ext: "", name: "" };
        if (path.length === 0) return ret;
        var code = path.charCodeAt(0);
        var isAbsolute2 = code === 47;
        var start;
        if (isAbsolute2) {
          ret.root = "/";
          start = 1;
        } else {
          start = 0;
        }
        var startDot = -1;
        var startPart = 0;
        var end = -1;
        var matchedSlash = true;
        var i = path.length - 1;
        var preDotState = 0;
        for (; i >= start; --i) {
          code = path.charCodeAt(i);
          if (code === 47) {
            if (!matchedSlash) {
              startPart = i + 1;
              break;
            }
            continue;
          }
          if (end === -1) {
            matchedSlash = false;
            end = i + 1;
          }
          if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
          } else if (startDot !== -1) {
            preDotState = -1;
          }
        }
        if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
        preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
          if (end !== -1) {
            if (startPart === 0 && isAbsolute2) ret.base = ret.name = path.slice(1, end);
            else ret.base = ret.name = path.slice(startPart, end);
          }
        } else {
          if (startPart === 0 && isAbsolute2) {
            ret.name = path.slice(1, startDot);
            ret.base = path.slice(1, end);
          } else {
            ret.name = path.slice(startPart, startDot);
            ret.base = path.slice(startPart, end);
          }
          ret.ext = path.slice(startDot, end);
        }
        if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
        else if (isAbsolute2) ret.dir = "/";
        return ret;
      },
      sep: "/",
      delimiter: ":",
      win32: null,
      posix: null
    };
    posix.posix = posix;
    module.exports = posix;
  }
});

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/events/events.js
var require_events = __commonJS({
  "../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/events/events.js"(exports, module) {
    "use strict";
    var R = typeof Reflect === "object" ? Reflect : null;
    var ReflectApply = R && typeof R.apply === "function" ? R.apply : function ReflectApply2(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args);
    };
    var ReflectOwnKeys;
    if (R && typeof R.ownKeys === "function") {
      ReflectOwnKeys = R.ownKeys;
    } else if (Object.getOwnPropertySymbols) {
      ReflectOwnKeys = function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
      };
    } else {
      ReflectOwnKeys = function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target);
      };
    }
    function ProcessEmitWarning(warning) {
      if (console && console.warn) console.warn(warning);
    }
    var NumberIsNaN = Number.isNaN || function NumberIsNaN2(value) {
      return value !== value;
    };
    function EventEmitter2() {
      EventEmitter2.init.call(this);
    }
    module.exports = EventEmitter2;
    module.exports.once = once;
    EventEmitter2.EventEmitter = EventEmitter2;
    EventEmitter2.prototype._events = void 0;
    EventEmitter2.prototype._eventsCount = 0;
    EventEmitter2.prototype._maxListeners = void 0;
    var defaultMaxListeners = 10;
    function checkListener(listener) {
      if (typeof listener !== "function") {
        throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
      }
    }
    Object.defineProperty(EventEmitter2, "defaultMaxListeners", {
      enumerable: true,
      get: function() {
        return defaultMaxListeners;
      },
      set: function(arg) {
        if (typeof arg !== "number" || arg < 0 || NumberIsNaN(arg)) {
          throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + ".");
        }
        defaultMaxListeners = arg;
      }
    });
    EventEmitter2.init = function() {
      if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
        this._events = /* @__PURE__ */ Object.create(null);
        this._eventsCount = 0;
      }
      this._maxListeners = this._maxListeners || void 0;
    };
    EventEmitter2.prototype.setMaxListeners = function setMaxListeners(n) {
      if (typeof n !== "number" || n < 0 || NumberIsNaN(n)) {
        throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + ".");
      }
      this._maxListeners = n;
      return this;
    };
    function _getMaxListeners(that) {
      if (that._maxListeners === void 0)
        return EventEmitter2.defaultMaxListeners;
      return that._maxListeners;
    }
    EventEmitter2.prototype.getMaxListeners = function getMaxListeners() {
      return _getMaxListeners(this);
    };
    EventEmitter2.prototype.emit = function emit(type) {
      var args = [];
      for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
      var doError = type === "error";
      var events = this._events;
      if (events !== void 0)
        doError = doError && events.error === void 0;
      else if (!doError)
        return false;
      if (doError) {
        var er;
        if (args.length > 0)
          er = args[0];
        if (er instanceof Error) {
          throw er;
        }
        var err2 = new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
        err2.context = er;
        throw err2;
      }
      var handler = events[type];
      if (handler === void 0)
        return false;
      if (typeof handler === "function") {
        ReflectApply(handler, this, args);
      } else {
        var len = handler.length;
        var listeners = arrayClone(handler, len);
        for (var i = 0; i < len; ++i)
          ReflectApply(listeners[i], this, args);
      }
      return true;
    };
    function _addListener(target, type, listener, prepend) {
      var m;
      var events;
      var existing;
      checkListener(listener);
      events = target._events;
      if (events === void 0) {
        events = target._events = /* @__PURE__ */ Object.create(null);
        target._eventsCount = 0;
      } else {
        if (events.newListener !== void 0) {
          target.emit(
            "newListener",
            type,
            listener.listener ? listener.listener : listener
          );
          events = target._events;
        }
        existing = events[type];
      }
      if (existing === void 0) {
        existing = events[type] = listener;
        ++target._eventsCount;
      } else {
        if (typeof existing === "function") {
          existing = events[type] = prepend ? [listener, existing] : [existing, listener];
        } else if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
        m = _getMaxListeners(target);
        if (m > 0 && existing.length > m && !existing.warned) {
          existing.warned = true;
          var w = new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
          w.name = "MaxListenersExceededWarning";
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          ProcessEmitWarning(w);
        }
      }
      return target;
    }
    EventEmitter2.prototype.addListener = function addListener(type, listener) {
      return _addListener(this, type, listener, false);
    };
    EventEmitter2.prototype.on = EventEmitter2.prototype.addListener;
    EventEmitter2.prototype.prependListener = function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };
    function onceWrapper() {
      if (!this.fired) {
        this.target.removeListener(this.type, this.wrapFn);
        this.fired = true;
        if (arguments.length === 0)
          return this.listener.call(this.target);
        return this.listener.apply(this.target, arguments);
      }
    }
    function _onceWrap(target, type, listener) {
      var state = { fired: false, wrapFn: void 0, target, type, listener };
      var wrapped = onceWrapper.bind(state);
      wrapped.listener = listener;
      state.wrapFn = wrapped;
      return wrapped;
    }
    EventEmitter2.prototype.once = function once2(type, listener) {
      checkListener(listener);
      this.on(type, _onceWrap(this, type, listener));
      return this;
    };
    EventEmitter2.prototype.prependOnceListener = function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };
    EventEmitter2.prototype.removeListener = function removeListener(type, listener) {
      var list, events, position, i, originalListener;
      checkListener(listener);
      events = this._events;
      if (events === void 0)
        return this;
      list = events[type];
      if (list === void 0)
        return this;
      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = /* @__PURE__ */ Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit("removeListener", type, list.listener || listener);
        }
      } else if (typeof list !== "function") {
        position = -1;
        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }
        if (position < 0)
          return this;
        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }
        if (list.length === 1)
          events[type] = list[0];
        if (events.removeListener !== void 0)
          this.emit("removeListener", type, originalListener || listener);
      }
      return this;
    };
    EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
    EventEmitter2.prototype.removeAllListeners = function removeAllListeners(type) {
      var listeners, events, i;
      events = this._events;
      if (events === void 0)
        return this;
      if (events.removeListener === void 0) {
        if (arguments.length === 0) {
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== void 0) {
          if (--this._eventsCount === 0)
            this._events = /* @__PURE__ */ Object.create(null);
          else
            delete events[type];
        }
        return this;
      }
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === "removeListener") continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners("removeListener");
        this._events = /* @__PURE__ */ Object.create(null);
        this._eventsCount = 0;
        return this;
      }
      listeners = events[type];
      if (typeof listeners === "function") {
        this.removeListener(type, listeners);
      } else if (listeners !== void 0) {
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }
      return this;
    };
    function _listeners(target, type, unwrap) {
      var events = target._events;
      if (events === void 0)
        return [];
      var evlistener = events[type];
      if (evlistener === void 0)
        return [];
      if (typeof evlistener === "function")
        return unwrap ? [evlistener.listener || evlistener] : [evlistener];
      return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
    }
    EventEmitter2.prototype.listeners = function listeners(type) {
      return _listeners(this, type, true);
    };
    EventEmitter2.prototype.rawListeners = function rawListeners(type) {
      return _listeners(this, type, false);
    };
    EventEmitter2.listenerCount = function(emitter, type) {
      if (typeof emitter.listenerCount === "function") {
        return emitter.listenerCount(type);
      } else {
        return listenerCount.call(emitter, type);
      }
    };
    EventEmitter2.prototype.listenerCount = listenerCount;
    function listenerCount(type) {
      var events = this._events;
      if (events !== void 0) {
        var evlistener = events[type];
        if (typeof evlistener === "function") {
          return 1;
        } else if (evlistener !== void 0) {
          return evlistener.length;
        }
      }
      return 0;
    }
    EventEmitter2.prototype.eventNames = function eventNames() {
      return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
    };
    function arrayClone(arr, n) {
      var copy = new Array(n);
      for (var i = 0; i < n; ++i)
        copy[i] = arr[i];
      return copy;
    }
    function spliceOne(list, index) {
      for (; index + 1 < list.length; index++)
        list[index] = list[index + 1];
      list.pop();
    }
    function unwrapListeners(arr) {
      var ret = new Array(arr.length);
      for (var i = 0; i < ret.length; ++i) {
        ret[i] = arr[i].listener || arr[i];
      }
      return ret;
    }
    function once(emitter, name) {
      return new Promise(function(resolve, reject) {
        function errorListener(err2) {
          emitter.removeListener(name, resolver);
          reject(err2);
        }
        function resolver() {
          if (typeof emitter.removeListener === "function") {
            emitter.removeListener("error", errorListener);
          }
          resolve([].slice.call(arguments));
        }
        ;
        eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
        if (name !== "error") {
          addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
        }
      });
    }
    function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
      if (typeof emitter.on === "function") {
        eventTargetAgnosticAddListener(emitter, "error", handler, flags);
      }
    }
    function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
      if (typeof emitter.on === "function") {
        if (flags.once) {
          emitter.once(name, listener);
        } else {
          emitter.on(name, listener);
        }
      } else if (typeof emitter.addEventListener === "function") {
        emitter.addEventListener(name, function wrapListener(arg) {
          if (flags.once) {
            emitter.removeEventListener(name, wrapListener);
          }
          listener(arg);
        });
      } else {
        throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
      }
    }
  }
});

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/sax/lib/sax.js
var require_sax = __commonJS({
  "../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/sax/lib/sax.js"(exports) {
    (function(sax2) {
      sax2.parser = function(strict, opt) {
        return new SAXParser(strict, opt);
      };
      sax2.SAXParser = SAXParser;
      sax2.SAXStream = SAXStream;
      sax2.createStream = createStream;
      sax2.MAX_BUFFER_LENGTH = 64 * 1024;
      var buffers = [
        "comment",
        "sgmlDecl",
        "textNode",
        "tagName",
        "doctype",
        "procInstName",
        "procInstBody",
        "entity",
        "attribName",
        "attribValue",
        "cdata",
        "script"
      ];
      sax2.EVENTS = [
        "text",
        "processinginstruction",
        "sgmldeclaration",
        "doctype",
        "comment",
        "opentagstart",
        "attribute",
        "opentag",
        "closetag",
        "opencdata",
        "cdata",
        "closecdata",
        "error",
        "end",
        "ready",
        "script",
        "opennamespace",
        "closenamespace"
      ];
      function SAXParser(strict, opt) {
        if (!(this instanceof SAXParser)) {
          return new SAXParser(strict, opt);
        }
        var parser = this;
        clearBuffers(parser);
        parser.q = parser.c = "";
        parser.bufferCheckPosition = sax2.MAX_BUFFER_LENGTH;
        parser.encoding = null;
        parser.opt = opt || {};
        parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags;
        parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase";
        parser.opt.maxEntityCount = parser.opt.maxEntityCount || 512;
        parser.opt.maxEntityDepth = parser.opt.maxEntityDepth || 4;
        parser.entityCount = parser.entityDepth = 0;
        parser.tags = [];
        parser.closed = parser.closedRoot = parser.sawRoot = false;
        parser.tag = parser.error = null;
        parser.strict = !!strict;
        parser.noscript = !!(strict || parser.opt.noscript);
        parser.state = S.BEGIN;
        parser.strictEntities = parser.opt.strictEntities;
        parser.ENTITIES = parser.strictEntities ? Object.create(sax2.XML_ENTITIES) : Object.create(sax2.ENTITIES);
        parser.attribList = [];
        if (parser.opt.xmlns) {
          parser.ns = Object.create(rootNS);
        }
        if (parser.opt.unquotedAttributeValues === void 0) {
          parser.opt.unquotedAttributeValues = !strict;
        }
        parser.trackPosition = parser.opt.position !== false;
        if (parser.trackPosition) {
          parser.position = parser.line = parser.column = 0;
        }
        emit(parser, "onready");
      }
      if (!Object.create) {
        Object.create = function(o) {
          function F() {
          }
          F.prototype = o;
          var newf = new F();
          return newf;
        };
      }
      if (!Object.keys) {
        Object.keys = function(o) {
          var a = [];
          for (var i in o) if (o.hasOwnProperty(i)) a.push(i);
          return a;
        };
      }
      function checkBufferLength(parser) {
        var maxAllowed = Math.max(sax2.MAX_BUFFER_LENGTH, 10);
        var maxActual = 0;
        for (var i = 0, l = buffers.length; i < l; i++) {
          var len = parser[buffers[i]].length;
          if (len > maxAllowed) {
            switch (buffers[i]) {
              case "textNode":
                closeText(parser);
                break;
              case "cdata":
                emitNode(parser, "oncdata", parser.cdata);
                parser.cdata = "";
                break;
              case "script":
                emitNode(parser, "onscript", parser.script);
                parser.script = "";
                break;
              default:
                error(parser, "Max buffer length exceeded: " + buffers[i]);
            }
          }
          maxActual = Math.max(maxActual, len);
        }
        var m = sax2.MAX_BUFFER_LENGTH - maxActual;
        parser.bufferCheckPosition = m + parser.position;
      }
      function clearBuffers(parser) {
        for (var i = 0, l = buffers.length; i < l; i++) {
          parser[buffers[i]] = "";
        }
      }
      function flushBuffers(parser) {
        closeText(parser);
        if (parser.cdata !== "") {
          emitNode(parser, "oncdata", parser.cdata);
          parser.cdata = "";
        }
        if (parser.script !== "") {
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
      }
      SAXParser.prototype = {
        end: function() {
          end(this);
        },
        write,
        resume: function() {
          this.error = null;
          return this;
        },
        close: function() {
          return this.write(null);
        },
        flush: function() {
          flushBuffers(this);
        }
      };
      var Stream;
      try {
        Stream = __require("stream").Stream;
      } catch (ex) {
        Stream = function() {
        };
      }
      if (!Stream) Stream = function() {
      };
      var streamWraps = sax2.EVENTS.filter(function(ev) {
        return ev !== "error" && ev !== "end";
      });
      function createStream(strict, opt) {
        return new SAXStream(strict, opt);
      }
      function determineBufferEncoding(data, isEnd) {
        if (data.length >= 2) {
          if (data[0] === 255 && data[1] === 254) {
            return "utf-16le";
          }
          if (data[0] === 254 && data[1] === 255) {
            return "utf-16be";
          }
        }
        if (data.length >= 3 && data[0] === 239 && data[1] === 187 && data[2] === 191) {
          return "utf8";
        }
        if (data.length >= 4) {
          if (data[0] === 60 && data[1] === 0 && data[2] === 63 && data[3] === 0) {
            return "utf-16le";
          }
          if (data[0] === 0 && data[1] === 60 && data[2] === 0 && data[3] === 63) {
            return "utf-16be";
          }
          return "utf8";
        }
        return isEnd ? "utf8" : null;
      }
      function SAXStream(strict, opt) {
        if (!(this instanceof SAXStream)) {
          return new SAXStream(strict, opt);
        }
        Stream.apply(this);
        this._parser = new SAXParser(strict, opt);
        this.writable = true;
        this.readable = true;
        var me = this;
        this._parser.onend = function() {
          me.emit("end");
        };
        this._parser.onerror = function(er) {
          me.emit("error", er);
          me._parser.error = null;
        };
        this._decoder = null;
        this._decoderBuffer = null;
        streamWraps.forEach(function(ev) {
          Object.defineProperty(me, "on" + ev, {
            get: function() {
              return me._parser["on" + ev];
            },
            set: function(h) {
              if (!h) {
                me.removeAllListeners(ev);
                me._parser["on" + ev] = h;
                return h;
              }
              me.on(ev, h);
            },
            enumerable: true,
            configurable: false
          });
        });
      }
      SAXStream.prototype = Object.create(Stream.prototype, {
        constructor: {
          value: SAXStream
        }
      });
      SAXStream.prototype._decodeBuffer = function(data, isEnd) {
        if (this._decoderBuffer) {
          data = Buffer.concat([this._decoderBuffer, data]);
          this._decoderBuffer = null;
        }
        if (!this._decoder) {
          var encoding = determineBufferEncoding(data, isEnd);
          if (!encoding) {
            this._decoderBuffer = data;
            return "";
          }
          this._parser.encoding = encoding;
          this._decoder = new TextDecoder(encoding);
        }
        return this._decoder.decode(data, { stream: !isEnd });
      };
      SAXStream.prototype.write = function(data) {
        if (typeof Buffer === "function" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(data)) {
          data = this._decodeBuffer(data, false);
        } else if (this._decoderBuffer) {
          var remaining = this._decodeBuffer(Buffer.alloc(0), true);
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.write(data.toString());
        this.emit("data", data);
        return true;
      };
      SAXStream.prototype.end = function(chunk) {
        if (chunk && chunk.length) {
          this.write(chunk);
        }
        if (this._decoderBuffer) {
          var finalChunk = this._decodeBuffer(Buffer.alloc(0), true);
          if (finalChunk) {
            this._parser.write(finalChunk);
            this.emit("data", finalChunk);
          }
        } else if (this._decoder) {
          var remaining = this._decoder.decode();
          if (remaining) {
            this._parser.write(remaining);
            this.emit("data", remaining);
          }
        }
        this._parser.end();
        return true;
      };
      SAXStream.prototype.on = function(ev, handler) {
        var me = this;
        if (!me._parser["on" + ev] && streamWraps.indexOf(ev) !== -1) {
          me._parser["on" + ev] = function() {
            var args = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
            args.splice(0, 0, ev);
            me.emit.apply(me, args);
          };
        }
        return Stream.prototype.on.call(me, ev, handler);
      };
      var CDATA = "[CDATA[";
      var DOCTYPE = "DOCTYPE";
      var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
      var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
      var rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE };
      var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      var entityStart = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      var entityBody = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      function isWhitespace(c) {
        return c === " " || c === "\n" || c === "\r" || c === "	";
      }
      function isQuote(c) {
        return c === '"' || c === "'";
      }
      function isAttribEnd(c) {
        return c === ">" || isWhitespace(c);
      }
      function isMatch(regex, c) {
        return regex.test(c);
      }
      function notMatch(regex, c) {
        return !isMatch(regex, c);
      }
      var S = 0;
      sax2.STATE = {
        BEGIN: S++,
        // leading byte order mark or whitespace
        BEGIN_WHITESPACE: S++,
        // leading whitespace
        TEXT: S++,
        // general stuff
        TEXT_ENTITY: S++,
        // &amp and such.
        OPEN_WAKA: S++,
        // <
        SGML_DECL: S++,
        // <!BLARG
        SGML_DECL_QUOTED: S++,
        // <!BLARG foo "bar
        DOCTYPE: S++,
        // <!DOCTYPE
        DOCTYPE_QUOTED: S++,
        // <!DOCTYPE "//blah
        DOCTYPE_DTD: S++,
        // <!DOCTYPE "//blah" [ ...
        DOCTYPE_DTD_QUOTED: S++,
        // <!DOCTYPE "//blah" [ "foo
        COMMENT_STARTING: S++,
        // <!-
        COMMENT: S++,
        // <!--
        COMMENT_ENDING: S++,
        // <!-- blah -
        COMMENT_ENDED: S++,
        // <!-- blah --
        CDATA: S++,
        // <![CDATA[ something
        CDATA_ENDING: S++,
        // ]
        CDATA_ENDING_2: S++,
        // ]]
        PROC_INST: S++,
        // <?hi
        PROC_INST_BODY: S++,
        // <?hi there
        PROC_INST_ENDING: S++,
        // <?hi "there" ?
        OPEN_TAG: S++,
        // <strong
        OPEN_TAG_SLASH: S++,
        // <strong /
        ATTRIB: S++,
        // <a
        ATTRIB_NAME: S++,
        // <a foo
        ATTRIB_NAME_SAW_WHITE: S++,
        // <a foo _
        ATTRIB_VALUE: S++,
        // <a foo=
        ATTRIB_VALUE_QUOTED: S++,
        // <a foo="bar
        ATTRIB_VALUE_CLOSED: S++,
        // <a foo="bar"
        ATTRIB_VALUE_UNQUOTED: S++,
        // <a foo=bar
        ATTRIB_VALUE_ENTITY_Q: S++,
        // <foo bar="&quot;"
        ATTRIB_VALUE_ENTITY_U: S++,
        // <foo bar=&quot
        CLOSE_TAG: S++,
        // </a
        CLOSE_TAG_SAW_WHITE: S++,
        // </a   >
        SCRIPT: S++,
        // <script> ...
        SCRIPT_ENDING: S++
        // <script> ... <
      };
      sax2.XML_ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'"
      };
      sax2.ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'",
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Ccedil: 199,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Euml: 203,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iuml: 207,
        Ntilde: 209,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        THORN: 222,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Uuml: 220,
        Yacute: 221,
        aacute: 225,
        acirc: 226,
        aelig: 230,
        agrave: 224,
        aring: 229,
        atilde: 227,
        auml: 228,
        ccedil: 231,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        eth: 240,
        euml: 235,
        iacute: 237,
        icirc: 238,
        igrave: 236,
        iuml: 239,
        ntilde: 241,
        oacute: 243,
        ocirc: 244,
        ograve: 242,
        oslash: 248,
        otilde: 245,
        ouml: 246,
        szlig: 223,
        thorn: 254,
        uacute: 250,
        ucirc: 251,
        ugrave: 249,
        uuml: 252,
        yacute: 253,
        yuml: 255,
        copy: 169,
        reg: 174,
        nbsp: 160,
        iexcl: 161,
        cent: 162,
        pound: 163,
        curren: 164,
        yen: 165,
        brvbar: 166,
        sect: 167,
        uml: 168,
        ordf: 170,
        laquo: 171,
        not: 172,
        shy: 173,
        macr: 175,
        deg: 176,
        plusmn: 177,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        acute: 180,
        micro: 181,
        para: 182,
        middot: 183,
        cedil: 184,
        ordm: 186,
        raquo: 187,
        frac14: 188,
        frac12: 189,
        frac34: 190,
        iquest: 191,
        times: 215,
        divide: 247,
        OElig: 338,
        oelig: 339,
        Scaron: 352,
        scaron: 353,
        Yuml: 376,
        fnof: 402,
        circ: 710,
        tilde: 732,
        Alpha: 913,
        Beta: 914,
        Gamma: 915,
        Delta: 916,
        Epsilon: 917,
        Zeta: 918,
        Eta: 919,
        Theta: 920,
        Iota: 921,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Nu: 925,
        Xi: 926,
        Omicron: 927,
        Pi: 928,
        Rho: 929,
        Sigma: 931,
        Tau: 932,
        Upsilon: 933,
        Phi: 934,
        Chi: 935,
        Psi: 936,
        Omega: 937,
        alpha: 945,
        beta: 946,
        gamma: 947,
        delta: 948,
        epsilon: 949,
        zeta: 950,
        eta: 951,
        theta: 952,
        iota: 953,
        kappa: 954,
        lambda: 955,
        mu: 956,
        nu: 957,
        xi: 958,
        omicron: 959,
        pi: 960,
        rho: 961,
        sigmaf: 962,
        sigma: 963,
        tau: 964,
        upsilon: 965,
        phi: 966,
        chi: 967,
        psi: 968,
        omega: 969,
        thetasym: 977,
        upsih: 978,
        piv: 982,
        ensp: 8194,
        emsp: 8195,
        thinsp: 8201,
        zwnj: 8204,
        zwj: 8205,
        lrm: 8206,
        rlm: 8207,
        ndash: 8211,
        mdash: 8212,
        lsquo: 8216,
        rsquo: 8217,
        sbquo: 8218,
        ldquo: 8220,
        rdquo: 8221,
        bdquo: 8222,
        dagger: 8224,
        Dagger: 8225,
        bull: 8226,
        hellip: 8230,
        permil: 8240,
        prime: 8242,
        Prime: 8243,
        lsaquo: 8249,
        rsaquo: 8250,
        oline: 8254,
        frasl: 8260,
        euro: 8364,
        image: 8465,
        weierp: 8472,
        real: 8476,
        trade: 8482,
        alefsym: 8501,
        larr: 8592,
        uarr: 8593,
        rarr: 8594,
        darr: 8595,
        harr: 8596,
        crarr: 8629,
        lArr: 8656,
        uArr: 8657,
        rArr: 8658,
        dArr: 8659,
        hArr: 8660,
        forall: 8704,
        part: 8706,
        exist: 8707,
        empty: 8709,
        nabla: 8711,
        isin: 8712,
        notin: 8713,
        ni: 8715,
        prod: 8719,
        sum: 8721,
        minus: 8722,
        lowast: 8727,
        radic: 8730,
        prop: 8733,
        infin: 8734,
        ang: 8736,
        and: 8743,
        or: 8744,
        cap: 8745,
        cup: 8746,
        int: 8747,
        there4: 8756,
        sim: 8764,
        cong: 8773,
        asymp: 8776,
        ne: 8800,
        equiv: 8801,
        le: 8804,
        ge: 8805,
        sub: 8834,
        sup: 8835,
        nsub: 8836,
        sube: 8838,
        supe: 8839,
        oplus: 8853,
        otimes: 8855,
        perp: 8869,
        sdot: 8901,
        lceil: 8968,
        rceil: 8969,
        lfloor: 8970,
        rfloor: 8971,
        lang: 9001,
        rang: 9002,
        loz: 9674,
        spades: 9824,
        clubs: 9827,
        hearts: 9829,
        diams: 9830
      };
      Object.keys(sax2.ENTITIES).forEach(function(key) {
        var e = sax2.ENTITIES[key];
        var s2 = typeof e === "number" ? String.fromCharCode(e) : e;
        sax2.ENTITIES[key] = s2;
      });
      for (var s in sax2.STATE) {
        sax2.STATE[sax2.STATE[s]] = s;
      }
      S = sax2.STATE;
      function emit(parser, event, data) {
        parser[event] && parser[event](data);
      }
      function getDeclaredEncoding(body) {
        var match = body && body.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
        return match ? match[2] : null;
      }
      function normalizeEncodingName(encoding) {
        if (!encoding) {
          return null;
        }
        return encoding.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      function encodingsMatch(detectedEncoding, declaredEncoding) {
        const detected = normalizeEncodingName(detectedEncoding);
        const declared = normalizeEncodingName(declaredEncoding);
        if (!detected || !declared) {
          return true;
        }
        if (declared === "utf16") {
          return detected === "utf16le" || detected === "utf16be";
        }
        return detected === declared;
      }
      function validateXmlDeclarationEncoding(parser, data) {
        if (!parser.strict || !parser.encoding || !data || data.name !== "xml") {
          return;
        }
        var declaredEncoding = getDeclaredEncoding(data.body);
        if (declaredEncoding && !encodingsMatch(parser.encoding, declaredEncoding)) {
          strictFail(
            parser,
            "XML declaration encoding " + declaredEncoding + " does not match detected stream encoding " + parser.encoding.toUpperCase()
          );
        }
      }
      function emitNode(parser, nodeType, data) {
        if (parser.textNode) closeText(parser);
        emit(parser, nodeType, data);
      }
      function closeText(parser) {
        parser.textNode = textopts(parser.opt, parser.textNode);
        if (parser.textNode) emit(parser, "ontext", parser.textNode);
        parser.textNode = "";
      }
      function textopts(opt, text) {
        if (opt.trim) text = text.trim();
        if (opt.normalize) text = text.replace(/\s+/g, " ");
        return text;
      }
      function error(parser, er) {
        closeText(parser);
        if (parser.trackPosition) {
          er += "\nLine: " + parser.line + "\nColumn: " + parser.column + "\nChar: " + parser.c;
        }
        er = new Error(er);
        parser.error = er;
        emit(parser, "onerror", er);
        return parser;
      }
      function end(parser) {
        if (parser.sawRoot && !parser.closedRoot)
          strictFail(parser, "Unclosed root tag");
        if (parser.state !== S.BEGIN && parser.state !== S.BEGIN_WHITESPACE && parser.state !== S.TEXT) {
          error(parser, "Unexpected end");
        }
        closeText(parser);
        parser.c = "";
        parser.closed = true;
        emit(parser, "onend");
        SAXParser.call(parser, parser.strict, parser.opt);
        return parser;
      }
      function strictFail(parser, message) {
        if (typeof parser !== "object" || !(parser instanceof SAXParser)) {
          throw new Error("bad call to strictFail");
        }
        if (parser.strict) {
          error(parser, message);
        }
      }
      function newTag(parser) {
        if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]();
        var parent = parser.tags[parser.tags.length - 1] || parser;
        var tag = parser.tag = { name: parser.tagName, attributes: {} };
        if (parser.opt.xmlns) {
          tag.ns = parent.ns;
        }
        parser.attribList.length = 0;
        emitNode(parser, "onopentagstart", tag);
      }
      function qname(name, attribute) {
        var i = name.indexOf(":");
        var qualName = i < 0 ? ["", name] : name.split(":");
        var prefix = qualName[0];
        var local = qualName[1];
        if (attribute && name === "xmlns") {
          prefix = "xmlns";
          local = "";
        }
        return { prefix, local };
      }
      function attrib(parser) {
        if (!parser.strict) {
          parser.attribName = parser.attribName[parser.looseCase]();
        }
        if (parser.attribList.indexOf(parser.attribName) !== -1 || parser.tag.attributes.hasOwnProperty(parser.attribName)) {
          parser.attribName = parser.attribValue = "";
          return;
        }
        if (parser.opt.xmlns) {
          var qn = qname(parser.attribName, true);
          var prefix = qn.prefix;
          var local = qn.local;
          if (prefix === "xmlns") {
            if (local === "xml" && parser.attribValue !== XML_NAMESPACE) {
              strictFail(
                parser,
                "xml: prefix must be bound to " + XML_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) {
              strictFail(
                parser,
                "xmlns: prefix must be bound to " + XMLNS_NAMESPACE + "\nActual: " + parser.attribValue
              );
            } else {
              var tag = parser.tag;
              var parent = parser.tags[parser.tags.length - 1] || parser;
              if (tag.ns === parent.ns) {
                tag.ns = Object.create(parent.ns);
              }
              tag.ns[local] = parser.attribValue;
            }
          }
          parser.attribList.push([parser.attribName, parser.attribValue]);
        } else {
          parser.tag.attributes[parser.attribName] = parser.attribValue;
          emitNode(parser, "onattribute", {
            name: parser.attribName,
            value: parser.attribValue
          });
        }
        parser.attribName = parser.attribValue = "";
      }
      function openTag(parser, selfClosing) {
        if (parser.opt.xmlns) {
          var tag = parser.tag;
          var qn = qname(parser.tagName);
          tag.prefix = qn.prefix;
          tag.local = qn.local;
          tag.uri = tag.ns[qn.prefix] || "";
          if (tag.prefix && !tag.uri) {
            strictFail(
              parser,
              "Unbound namespace prefix: " + JSON.stringify(parser.tagName)
            );
            tag.uri = qn.prefix;
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (tag.ns && parent.ns !== tag.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              emitNode(parser, "onopennamespace", {
                prefix: p,
                uri: tag.ns[p]
              });
            });
          }
          for (var i = 0, l = parser.attribList.length; i < l; i++) {
            var nv = parser.attribList[i];
            var name = nv[0];
            var value = nv[1];
            var qualName = qname(name, true);
            var prefix = qualName.prefix;
            var local = qualName.local;
            var uri = prefix === "" ? "" : tag.ns[prefix] || "";
            var a = {
              name,
              value,
              prefix,
              local,
              uri
            };
            if (prefix && prefix !== "xmlns" && !uri) {
              strictFail(
                parser,
                "Unbound namespace prefix: " + JSON.stringify(prefix)
              );
              a.uri = prefix;
            }
            parser.tag.attributes[name] = a;
            emitNode(parser, "onattribute", a);
          }
          parser.attribList.length = 0;
        }
        parser.tag.isSelfClosing = !!selfClosing;
        parser.sawRoot = true;
        parser.tags.push(parser.tag);
        emitNode(parser, "onopentag", parser.tag);
        if (!selfClosing) {
          if (!parser.noscript && parser.tagName.toLowerCase() === "script") {
            parser.state = S.SCRIPT;
          } else {
            parser.state = S.TEXT;
          }
          parser.tag = null;
          parser.tagName = "";
        }
        parser.attribName = parser.attribValue = "";
        parser.attribList.length = 0;
      }
      function closeTag(parser) {
        if (!parser.tagName) {
          strictFail(parser, "Weird empty close tag.");
          parser.textNode += "</>";
          parser.state = S.TEXT;
          return;
        }
        if (parser.script) {
          if (parser.tagName !== "script") {
            parser.script += "</" + parser.tagName + ">";
            parser.tagName = "";
            parser.state = S.SCRIPT;
            return;
          }
          emitNode(parser, "onscript", parser.script);
          parser.script = "";
        }
        var t = parser.tags.length;
        var tagName = parser.tagName;
        if (!parser.strict) {
          tagName = tagName[parser.looseCase]();
        }
        var closeTo = tagName;
        while (t--) {
          var close = parser.tags[t];
          if (close.name !== closeTo) {
            strictFail(parser, "Unexpected close tag");
          } else {
            break;
          }
        }
        if (t < 0) {
          strictFail(parser, "Unmatched closing tag: " + parser.tagName);
          parser.textNode += "</" + parser.tagName + ">";
          parser.state = S.TEXT;
          return;
        }
        parser.tagName = tagName;
        var s2 = parser.tags.length;
        while (s2-- > t) {
          var tag = parser.tag = parser.tags.pop();
          parser.tagName = parser.tag.name;
          emitNode(parser, "onclosetag", parser.tagName);
          var x = {};
          for (var i in tag.ns) {
            x[i] = tag.ns[i];
          }
          var parent = parser.tags[parser.tags.length - 1] || parser;
          if (parser.opt.xmlns && tag.ns !== parent.ns) {
            Object.keys(tag.ns).forEach(function(p) {
              var n = tag.ns[p];
              emitNode(parser, "onclosenamespace", { prefix: p, uri: n });
            });
          }
        }
        if (t === 0) parser.closedRoot = true;
        parser.tagName = parser.attribValue = parser.attribName = "";
        parser.attribList.length = 0;
        parser.state = S.TEXT;
      }
      function parseEntity(parser) {
        var entity = parser.entity;
        var entityLC = entity.toLowerCase();
        var num;
        var numStr = "";
        if (parser.ENTITIES[entity]) {
          return parser.ENTITIES[entity];
        }
        if (parser.ENTITIES[entityLC]) {
          return parser.ENTITIES[entityLC];
        }
        entity = entityLC;
        if (entity.charAt(0) === "#") {
          if (entity.charAt(1) === "x") {
            entity = entity.slice(2);
            num = parseInt(entity, 16);
            numStr = num.toString(16);
          } else {
            entity = entity.slice(1);
            num = parseInt(entity, 10);
            numStr = num.toString(10);
          }
        }
        entity = entity.replace(/^0+/, "");
        if (isNaN(num) || numStr.toLowerCase() !== entity || num < 0 || num > 1114111) {
          strictFail(parser, "Invalid character entity");
          return "&" + parser.entity + ";";
        }
        return String.fromCodePoint(num);
      }
      function beginWhiteSpace(parser, c) {
        if (c === "<") {
          parser.state = S.OPEN_WAKA;
          parser.startTagPosition = parser.position;
        } else if (!isWhitespace(c)) {
          strictFail(parser, "Non-whitespace before first tag.");
          parser.textNode = c;
          parser.state = S.TEXT;
        }
      }
      function charAt(chunk, i) {
        var result = "";
        if (i < chunk.length) {
          result = chunk.charAt(i);
        }
        return result;
      }
      function write(chunk) {
        var parser = this;
        if (this.error) {
          throw this.error;
        }
        if (parser.closed) {
          return error(
            parser,
            "Cannot write after close. Assign an onready handler."
          );
        }
        if (chunk === null) {
          return end(parser);
        }
        if (typeof chunk === "object") {
          chunk = chunk.toString();
        }
        var i = 0;
        var c = "";
        while (true) {
          c = charAt(chunk, i++);
          parser.c = c;
          if (!c) {
            break;
          }
          if (parser.trackPosition) {
            parser.position++;
            if (c === "\n") {
              parser.line++;
              parser.column = 0;
            } else {
              parser.column++;
            }
          }
          switch (parser.state) {
            case S.BEGIN:
              parser.state = S.BEGIN_WHITESPACE;
              if (c === "\uFEFF") {
                continue;
              }
              beginWhiteSpace(parser, c);
              continue;
            case S.BEGIN_WHITESPACE:
              beginWhiteSpace(parser, c);
              continue;
            case S.TEXT:
              if (parser.sawRoot && !parser.closedRoot) {
                var starti = i - 1;
                while (c && c !== "<" && c !== "&") {
                  c = charAt(chunk, i++);
                  if (c && parser.trackPosition) {
                    parser.position++;
                    if (c === "\n") {
                      parser.line++;
                      parser.column = 0;
                    } else {
                      parser.column++;
                    }
                  }
                }
                parser.textNode += chunk.substring(starti, i - 1);
              }
              if (c === "<" && !(parser.sawRoot && parser.closedRoot && !parser.strict)) {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else {
                if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) {
                  strictFail(parser, "Text data outside of root node.");
                }
                if (c === "&") {
                  parser.state = S.TEXT_ENTITY;
                } else {
                  parser.textNode += c;
                }
              }
              continue;
            case S.SCRIPT:
              if (c === "<") {
                parser.state = S.SCRIPT_ENDING;
              } else {
                parser.script += c;
              }
              continue;
            case S.SCRIPT_ENDING:
              if (c === "/") {
                parser.state = S.CLOSE_TAG;
              } else {
                parser.script += "<" + c;
                parser.state = S.SCRIPT;
              }
              continue;
            case S.OPEN_WAKA:
              if (c === "!") {
                parser.state = S.SGML_DECL;
                parser.sgmlDecl = "";
              } else if (isWhitespace(c)) {
              } else if (isMatch(nameStart, c)) {
                parser.state = S.OPEN_TAG;
                parser.tagName = c;
              } else if (c === "/") {
                parser.state = S.CLOSE_TAG;
                parser.tagName = "";
              } else if (c === "?") {
                parser.state = S.PROC_INST;
                parser.procInstName = parser.procInstBody = "";
              } else {
                strictFail(parser, "Unencoded <");
                if (parser.startTagPosition + 1 < parser.position) {
                  var pad = parser.position - parser.startTagPosition;
                  c = new Array(pad).join(" ") + c;
                }
                parser.textNode += "<" + c;
                parser.state = S.TEXT;
              }
              continue;
            case S.SGML_DECL:
              if (parser.sgmlDecl + c === "--") {
                parser.state = S.COMMENT;
                parser.comment = "";
                parser.sgmlDecl = "";
                continue;
              }
              if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
                parser.state = S.DOCTYPE_DTD;
                parser.doctype += "<!" + parser.sgmlDecl + c;
                parser.sgmlDecl = "";
              } else if ((parser.sgmlDecl + c).toUpperCase() === CDATA) {
                emitNode(parser, "onopencdata");
                parser.state = S.CDATA;
                parser.sgmlDecl = "";
                parser.cdata = "";
              } else if ((parser.sgmlDecl + c).toUpperCase() === DOCTYPE) {
                parser.state = S.DOCTYPE;
                if (parser.doctype || parser.sawRoot) {
                  strictFail(
                    parser,
                    "Inappropriately located doctype declaration"
                  );
                }
                parser.doctype = "";
                parser.sgmlDecl = "";
              } else if (c === ">") {
                emitNode(parser, "onsgmldeclaration", parser.sgmlDecl);
                parser.sgmlDecl = "";
                parser.state = S.TEXT;
              } else if (isQuote(c)) {
                parser.state = S.SGML_DECL_QUOTED;
                parser.sgmlDecl += c;
              } else {
                parser.sgmlDecl += c;
              }
              continue;
            case S.SGML_DECL_QUOTED:
              if (c === parser.q) {
                parser.state = S.SGML_DECL;
                parser.q = "";
              }
              parser.sgmlDecl += c;
              continue;
            case S.DOCTYPE:
              if (c === ">") {
                parser.state = S.TEXT;
                emitNode(parser, "ondoctype", parser.doctype);
                parser.doctype = true;
              } else {
                parser.doctype += c;
                if (c === "[") {
                  parser.state = S.DOCTYPE_DTD;
                } else if (isQuote(c)) {
                  parser.state = S.DOCTYPE_QUOTED;
                  parser.q = c;
                }
              }
              continue;
            case S.DOCTYPE_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.q = "";
                parser.state = S.DOCTYPE;
              }
              continue;
            case S.DOCTYPE_DTD:
              if (c === "]") {
                parser.doctype += c;
                parser.state = S.DOCTYPE;
              } else if (c === "<") {
                parser.state = S.OPEN_WAKA;
                parser.startTagPosition = parser.position;
              } else if (isQuote(c)) {
                parser.doctype += c;
                parser.state = S.DOCTYPE_DTD_QUOTED;
                parser.q = c;
              } else {
                parser.doctype += c;
              }
              continue;
            case S.DOCTYPE_DTD_QUOTED:
              parser.doctype += c;
              if (c === parser.q) {
                parser.state = S.DOCTYPE_DTD;
                parser.q = "";
              }
              continue;
            case S.COMMENT:
              if (c === "-") {
                parser.state = S.COMMENT_ENDING;
              } else {
                parser.comment += c;
              }
              continue;
            case S.COMMENT_ENDING:
              if (c === "-") {
                parser.state = S.COMMENT_ENDED;
                parser.comment = textopts(parser.opt, parser.comment);
                if (parser.comment) {
                  emitNode(parser, "oncomment", parser.comment);
                }
                parser.comment = "";
              } else {
                parser.comment += "-" + c;
                parser.state = S.COMMENT;
              }
              continue;
            case S.COMMENT_ENDED:
              if (c !== ">") {
                strictFail(parser, "Malformed comment");
                parser.comment += "--" + c;
                parser.state = S.COMMENT;
              } else if (parser.doctype && parser.doctype !== true) {
                parser.state = S.DOCTYPE_DTD;
              } else {
                parser.state = S.TEXT;
              }
              continue;
            case S.CDATA:
              var starti = i - 1;
              while (c && c !== "]") {
                c = charAt(chunk, i++);
                if (c && parser.trackPosition) {
                  parser.position++;
                  if (c === "\n") {
                    parser.line++;
                    parser.column = 0;
                  } else {
                    parser.column++;
                  }
                }
              }
              parser.cdata += chunk.substring(starti, i - 1);
              if (c === "]") {
                parser.state = S.CDATA_ENDING;
              }
              continue;
            case S.CDATA_ENDING:
              if (c === "]") {
                parser.state = S.CDATA_ENDING_2;
              } else {
                parser.cdata += "]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.CDATA_ENDING_2:
              if (c === ">") {
                if (parser.cdata) {
                  emitNode(parser, "oncdata", parser.cdata);
                }
                emitNode(parser, "onclosecdata");
                parser.cdata = "";
                parser.state = S.TEXT;
              } else if (c === "]") {
                parser.cdata += "]";
              } else {
                parser.cdata += "]]" + c;
                parser.state = S.CDATA;
              }
              continue;
            case S.PROC_INST:
              if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else if (isWhitespace(c)) {
                parser.state = S.PROC_INST_BODY;
              } else {
                parser.procInstName += c;
              }
              continue;
            case S.PROC_INST_BODY:
              if (!parser.procInstBody && isWhitespace(c)) {
                continue;
              } else if (c === "?") {
                parser.state = S.PROC_INST_ENDING;
              } else {
                parser.procInstBody += c;
              }
              continue;
            case S.PROC_INST_ENDING:
              if (c === ">") {
                const procInstEndData = {
                  name: parser.procInstName,
                  body: parser.procInstBody
                };
                validateXmlDeclarationEncoding(parser, procInstEndData);
                emitNode(parser, "onprocessinginstruction", procInstEndData);
                parser.procInstName = parser.procInstBody = "";
                parser.state = S.TEXT;
              } else {
                parser.procInstBody += "?" + c;
                parser.state = S.PROC_INST_BODY;
              }
              continue;
            case S.OPEN_TAG:
              if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else {
                newTag(parser);
                if (c === ">") {
                  openTag(parser);
                } else if (c === "/") {
                  parser.state = S.OPEN_TAG_SLASH;
                } else {
                  if (!isWhitespace(c)) {
                    strictFail(parser, "Invalid character in tag name");
                  }
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.OPEN_TAG_SLASH:
              if (c === ">") {
                openTag(parser, true);
                closeTag(parser);
              } else {
                strictFail(
                  parser,
                  "Forward-slash in opening tag not followed by >"
                );
                parser.state = S.ATTRIB;
              }
              continue;
            case S.ATTRIB:
              if (isWhitespace(c)) {
                continue;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (c === ">") {
                strictFail(parser, "Attribute without value");
                parser.attribValue = parser.attribName;
                attrib(parser);
                openTag(parser);
              } else if (isWhitespace(c)) {
                parser.state = S.ATTRIB_NAME_SAW_WHITE;
              } else if (isMatch(nameBody, c)) {
                parser.attribName += c;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_NAME_SAW_WHITE:
              if (c === "=") {
                parser.state = S.ATTRIB_VALUE;
              } else if (isWhitespace(c)) {
                continue;
              } else {
                strictFail(parser, "Attribute without value");
                parser.tag.attributes[parser.attribName] = "";
                parser.attribValue = "";
                emitNode(parser, "onattribute", {
                  name: parser.attribName,
                  value: ""
                });
                parser.attribName = "";
                if (c === ">") {
                  openTag(parser);
                } else if (isMatch(nameStart, c)) {
                  parser.attribName = c;
                  parser.state = S.ATTRIB_NAME;
                } else {
                  strictFail(parser, "Invalid attribute name");
                  parser.state = S.ATTRIB;
                }
              }
              continue;
            case S.ATTRIB_VALUE:
              if (isWhitespace(c)) {
                continue;
              } else if (isQuote(c)) {
                parser.q = c;
                parser.state = S.ATTRIB_VALUE_QUOTED;
              } else {
                if (!parser.opt.unquotedAttributeValues) {
                  error(parser, "Unquoted attribute value");
                }
                parser.state = S.ATTRIB_VALUE_UNQUOTED;
                parser.attribValue = c;
              }
              continue;
            case S.ATTRIB_VALUE_QUOTED:
              if (c !== parser.q) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_Q;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              parser.q = "";
              parser.state = S.ATTRIB_VALUE_CLOSED;
              continue;
            case S.ATTRIB_VALUE_CLOSED:
              if (isWhitespace(c)) {
                parser.state = S.ATTRIB;
              } else if (c === ">") {
                openTag(parser);
              } else if (c === "/") {
                parser.state = S.OPEN_TAG_SLASH;
              } else if (isMatch(nameStart, c)) {
                strictFail(parser, "No whitespace between attributes");
                parser.attribName = c;
                parser.attribValue = "";
                parser.state = S.ATTRIB_NAME;
              } else {
                strictFail(parser, "Invalid attribute name");
              }
              continue;
            case S.ATTRIB_VALUE_UNQUOTED:
              if (!isAttribEnd(c)) {
                if (c === "&") {
                  parser.state = S.ATTRIB_VALUE_ENTITY_U;
                } else {
                  parser.attribValue += c;
                }
                continue;
              }
              attrib(parser);
              if (c === ">") {
                openTag(parser);
              } else {
                parser.state = S.ATTRIB;
              }
              continue;
            case S.CLOSE_TAG:
              if (!parser.tagName) {
                if (isWhitespace(c)) {
                  continue;
                } else if (notMatch(nameStart, c)) {
                  if (parser.script) {
                    parser.script += "</" + c;
                    parser.state = S.SCRIPT;
                  } else {
                    strictFail(parser, "Invalid tagname in closing tag.");
                  }
                } else {
                  parser.tagName = c;
                }
              } else if (c === ">") {
                closeTag(parser);
              } else if (isMatch(nameBody, c)) {
                parser.tagName += c;
              } else if (parser.script) {
                parser.script += "</" + parser.tagName + c;
                parser.tagName = "";
                parser.state = S.SCRIPT;
              } else {
                if (!isWhitespace(c)) {
                  strictFail(parser, "Invalid tagname in closing tag");
                }
                parser.state = S.CLOSE_TAG_SAW_WHITE;
              }
              continue;
            case S.CLOSE_TAG_SAW_WHITE:
              if (isWhitespace(c)) {
                continue;
              }
              if (c === ">") {
                closeTag(parser);
              } else {
                strictFail(parser, "Invalid characters in closing tag");
              }
              continue;
            case S.TEXT_ENTITY:
            case S.ATTRIB_VALUE_ENTITY_Q:
            case S.ATTRIB_VALUE_ENTITY_U:
              var returnState;
              var buffer;
              switch (parser.state) {
                case S.TEXT_ENTITY:
                  returnState = S.TEXT;
                  buffer = "textNode";
                  break;
                case S.ATTRIB_VALUE_ENTITY_Q:
                  returnState = S.ATTRIB_VALUE_QUOTED;
                  buffer = "attribValue";
                  break;
                case S.ATTRIB_VALUE_ENTITY_U:
                  returnState = S.ATTRIB_VALUE_UNQUOTED;
                  buffer = "attribValue";
                  break;
              }
              if (c === ";") {
                var parsedEntity = parseEntity(parser);
                if (parser.opt.unparsedEntities && !Object.values(sax2.XML_ENTITIES).includes(parsedEntity)) {
                  if ((parser.entityCount += 1) > parser.opt.maxEntityCount) {
                    error(
                      parser,
                      "Parsed entity count exceeds max entity count"
                    );
                  }
                  if ((parser.entityDepth += 1) > parser.opt.maxEntityDepth) {
                    error(
                      parser,
                      "Parsed entity depth exceeds max entity depth"
                    );
                  }
                  parser.entity = "";
                  parser.state = returnState;
                  parser.write(parsedEntity);
                  parser.entityDepth -= 1;
                } else {
                  parser[buffer] += parsedEntity;
                  parser.entity = "";
                  parser.state = returnState;
                }
              } else if (isMatch(parser.entity.length ? entityBody : entityStart, c)) {
                parser.entity += c;
              } else {
                strictFail(parser, "Invalid character in entity name");
                parser[buffer] += "&" + parser.entity + c;
                parser.entity = "";
                parser.state = returnState;
              }
              continue;
            default: {
              throw new Error(parser, "Unknown state: " + parser.state);
            }
          }
        }
        if (parser.position >= parser.bufferCheckPosition) {
          checkBufferLength(parser);
        }
        return parser;
      }
      if (!String.fromCodePoint) {
        ;
        (function() {
          var stringFromCharCode = String.fromCharCode;
          var floor = Math.floor;
          var fromCodePoint = function() {
            var MAX_SIZE = 16384;
            var codeUnits = [];
            var highSurrogate;
            var lowSurrogate;
            var index = -1;
            var length = arguments.length;
            if (!length) {
              return "";
            }
            var result = "";
            while (++index < length) {
              var codePoint = Number(arguments[index]);
              if (!isFinite(codePoint) || // `NaN`, `+Infinity`, or `-Infinity`
              codePoint < 0 || // not a valid Unicode code point
              codePoint > 1114111 || // not a valid Unicode code point
              floor(codePoint) !== codePoint) {
                throw RangeError("Invalid code point: " + codePoint);
              }
              if (codePoint <= 65535) {
                codeUnits.push(codePoint);
              } else {
                codePoint -= 65536;
                highSurrogate = (codePoint >> 10) + 55296;
                lowSurrogate = codePoint % 1024 + 56320;
                codeUnits.push(highSurrogate, lowSurrogate);
              }
              if (index + 1 === length || codeUnits.length > MAX_SIZE) {
                result += stringFromCharCode.apply(null, codeUnits);
                codeUnits.length = 0;
              }
            }
            return result;
          };
          if (Object.defineProperty) {
            Object.defineProperty(String, "fromCodePoint", {
              value: fromCodePoint,
              configurable: true,
              writable: true
            });
          } else {
            String.fromCodePoint = fromCodePoint;
          }
        })();
      }
    })(typeof exports === "undefined" ? exports.sax = {} : exports);
  }
});

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
};
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == +!dict)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/@lingo-reader/shared/dist/index.browser.mjs
var import_path_browserify = __toESM(require_path_browserify(), 1);
var import_events = __toESM(require_events(), 1);
var import_sax = __toESM(require_sax(), 1);
var __defProp2 = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
function stripBOM(str) {
  if (str.charCodeAt(0) === 65279) {
    return str.slice(1);
  }
  return str;
}
var defaults = {
  0.1: {
    explicitCharkey: false,
    trim: true,
    // normalize implicates trimming, just so you know
    normalize: true,
    // normalize tag names to lower case
    normalizeTags: false,
    // set default attribute object key
    attrkey: "@",
    // set default char object key
    charkey: "#",
    // always put child nodes in an array
    explicitArray: false,
    // ignore all attributes regardless
    ignoreAttrs: false,
    // merge attributes and child elements onto parent object.  this may cause collisions.
    mergeAttrs: false,
    explicitRoot: false,
    validator: null,
    xmlns: false,
    // fold children elements into dedicated property (works only in 0.2)
    explicitChildren: false,
    childkey: "@@",
    charsAsChildren: false,
    // include white-space only text nodes
    includeWhiteChars: false,
    // callbacks are async? not in 0.1 mode
    async: false,
    strict: true,
    attrNameProcessors: null,
    attrValueProcessors: null,
    tagNameProcessors: null,
    valueProcessors: null,
    emptyTag: ""
  },
  0.2: {
    explicitCharkey: false,
    trim: false,
    normalize: false,
    normalizeTags: false,
    attrkey: "$",
    charkey: "_",
    explicitArray: true,
    ignoreAttrs: false,
    mergeAttrs: false,
    explicitRoot: true,
    validator: null,
    xmlns: false,
    explicitChildren: false,
    preserveChildrenOrder: false,
    childkey: "$$",
    charsAsChildren: false,
    // include white-space only text nodes
    includeWhiteChars: false,
    // not async in 0.2 mode either
    async: false,
    strict: true,
    attrNameProcessors: null,
    attrValueProcessors: null,
    tagNameProcessors: null,
    valueProcessors: null,
    // xml building options
    rootName: "root",
    xmldec: { version: "1.0", encoding: "UTF-8", standalone: true },
    doctype: null,
    renderOpts: { pretty: true, indent: "  ", newline: "\n" },
    headless: false,
    chunkSize: 1e4,
    emptyTag: "",
    cdata: false
  }
};
function normalize(str) {
  return str.toLowerCase();
}
function isEmpty(thing) {
  return typeof thing === "object" && thing !== null && Object.keys(thing).length === 0;
}
function processItem(processors, item, key) {
  for (const process2 of processors) {
    item = process2(item, key);
  }
  return item;
}
function defineProperty(obj, key, value) {
  const descriptor = /* @__PURE__ */ Object.create(null);
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  Object.defineProperty(obj, key, descriptor);
}
var Parser = class extends import_events.EventEmitter {
  constructor(opts) {
    super();
    __publicField(this, "options");
    __publicField(this, "remaining", "");
    __publicField(this, "saxParser");
    __publicField(this, "resultObject", null);
    __publicField(this, "EXPLICIT_CHARKEY");
    __publicField(this, "errThrown", false);
    __publicField(this, "ended", false);
    __publicField(this, "processAsync", () => {
      try {
        if (this.remaining.length <= this.options.chunkSize) {
          const chunk = this.remaining;
          this.remaining = "";
          this.saxParser = this.saxParser.write(chunk);
          this.saxParser.close();
        } else {
          const chunk = this.remaining.slice(0, this.options.chunkSize);
          this.remaining = this.remaining.slice(this.options.chunkSize);
          this.saxParser = this.saxParser.write(chunk);
          setTimeout(this.processAsync, 0);
        }
      } catch (err2) {
        if (!this.errThrown) {
          this.errThrown = true;
          this.emit("error", err2);
        }
      }
    });
    __publicField(this, "assignOrPush", (obj, key, newValue) => {
      if (!(key in obj)) {
        if (!this.options.explicitArray) {
          defineProperty(obj, key, newValue);
        } else {
          defineProperty(obj, key, [newValue]);
        }
      } else {
        if (!Array.isArray(obj[key])) {
          defineProperty(obj, key, [obj[key]]);
        }
        obj[key].push(newValue);
      }
    });
    __publicField(this, "reset", () => {
      this.removeAllListeners();
      this.saxParser = import_sax.default.parser(this.options.strict, {
        trim: false,
        normalize: false,
        xmlns: this.options.xmlns
      });
      this.errThrown = false;
      this.saxParser.onerror = (error) => {
        this.saxParser.resume();
        if (!this.errThrown) {
          this.errThrown = true;
          this.emit("error", error);
        }
      };
      this.saxParser.onend = () => {
        if (!this.ended) {
          this.ended = true;
          this.emit("end", this.resultObject);
        }
      };
      this.ended = false;
      this.EXPLICIT_CHARKEY = this.options.explicitCharkey;
      this.resultObject = null;
      const stack = [];
      const attrkey = this.options.attrkey;
      const charkey = this.options.charkey;
      this.saxParser.onopentag = (node) => {
        const obj = {};
        obj[charkey] = "";
        if (!this.options.ignoreAttrs) {
          Object.keys(node.attributes).forEach((key) => {
            if (!(attrkey in obj) && !this.options.mergeAttrs) {
              obj[attrkey] = {};
            }
            const newValue = this.options.attrValueProcessors ? processItem(this.options.attrValueProcessors, node.attributes[key], key) : node.attributes[key];
            const processedKey = this.options.attrNameProcessors ? processItem(this.options.attrNameProcessors, key) : key;
            if (this.options.mergeAttrs) {
              this.assignOrPush(obj, processedKey, newValue);
            } else {
              defineProperty(obj[attrkey], processedKey, newValue);
            }
          });
        }
        obj["#name"] = this.options.tagNameProcessors ? processItem(this.options.tagNameProcessors, node.name) : node.name;
        if (this.options.xmlns) {
          obj[this.options.xmlnskey] = { uri: node.uri, local: node.local };
        }
        stack.push(obj);
      };
      this.saxParser.onclosetag = () => {
        let obj = stack.pop();
        const nodeName = obj["#name"];
        if (!this.options.explicitChildren || !this.options.preserveChildrenOrder) {
          delete obj["#name"];
        }
        let cdata;
        if (obj.cdata === true) {
          cdata = obj.cdata;
          delete obj.cdata;
        }
        const s = stack[stack.length - 1];
        let emptyStr = "";
        if (obj[charkey].match(/^\s*$/) && !cdata) {
          emptyStr = obj[charkey];
          delete obj[charkey];
        } else {
          if (this.options.trim) {
            obj[charkey] = obj[charkey].trim();
          }
          if (this.options.normalize) {
            obj[charkey] = obj[charkey].replace(/\s{2,}/g, " ").trim();
          }
          obj[charkey] = this.options.valueProcessors ? processItem(this.options.valueProcessors, obj[charkey], nodeName) : obj[charkey];
          if (Object.keys(obj).length === 1 && charkey in obj && !this.EXPLICIT_CHARKEY) {
            obj = obj[charkey];
          }
        }
        if (isEmpty(obj)) {
          if (typeof this.options.emptyTag === "function") {
            obj = this.options.emptyTag();
          } else {
            obj = this.options.emptyTag !== "" ? this.options.emptyTag : emptyStr;
          }
        }
        if (this.options.validator) {
          const xpath = `/${stack.map((node) => node["#name"]).concat(nodeName).join("/")}`;
          (() => {
            try {
              obj = this.options.validator(xpath, s && s[nodeName], obj);
            } catch (err2) {
              this.emit("error", err2);
            }
          })();
        }
        if (this.options.explicitChildren && !this.options.mergeAttrs && typeof obj === "object") {
          if (!this.options.preserveChildrenOrder) {
            const node = {};
            if (this.options.attrkey in obj) {
              node[this.options.attrkey] = obj[this.options.attrkey];
              delete obj[this.options.attrkey];
            }
            if (!this.options.charsAsChildren && this.options.charkey in obj) {
              node[this.options.charkey] = obj[this.options.charkey];
              delete obj[this.options.charkey];
            }
            if (Object.getOwnPropertyNames(obj).length > 0) {
              node[this.options.childkey] = obj;
            }
            obj = node;
          } else if (s) {
            s[this.options.childkey] = s[this.options.childkey] || [];
            const objClone = {};
            Object.keys(obj).forEach((key) => {
              defineProperty(objClone, key, obj[key]);
            });
            s[this.options.childkey].push(objClone);
            delete obj["#name"];
            if (Object.keys(obj).length === 1 && charkey in obj && !this.EXPLICIT_CHARKEY) {
              obj = obj[charkey];
            }
          }
        }
        if (stack.length > 0) {
          this.assignOrPush(s, nodeName, obj);
        } else {
          if (this.options.explicitRoot) {
            const old = obj;
            const newObj = {};
            defineProperty(newObj, nodeName, old);
            obj = newObj;
          }
          this.resultObject = obj;
          this.ended = true;
          this.emit("end", this.resultObject);
        }
      };
      const ontext = (text) => {
        const s = stack[stack.length - 1];
        if (s) {
          s[charkey] += text;
          if (this.options.explicitChildren && this.options.preserveChildrenOrder && this.options.charsAsChildren && (this.options.includeWhiteChars || text.replace(/\\n/g, "").trim() !== "")) {
            s[this.options.childkey] = s[this.options.childkey] || [];
            const charChild = {
              "#name": "__text__"
            };
            charChild[charkey] = text;
            if (this.options.normalize) {
              charChild[charkey] = charChild[charkey].replace(/\s{2,}/g, " ").trim();
            }
            s[this.options.childkey].push(charChild);
          }
        }
        return s;
      };
      this.saxParser.ontext = ontext;
      this.saxParser.oncdata = (text) => {
        const s = ontext(text);
        if (s) {
          s.cdata = true;
        }
      };
    });
    __publicField(this, "parseString", (str, cb) => {
      if (cb && typeof cb === "function") {
        this.on("end", (result) => {
          this.reset();
          cb(null, result);
        });
        this.on("error", (err2) => {
          this.reset();
          cb(err2);
        });
      }
      try {
        str = str.toString();
        if (str.trim() === "") {
          this.emit("end", null);
          return true;
        }
        str = stripBOM(str);
        if (this.options.async) {
          this.remaining = str;
          setTimeout(this.processAsync, 0);
          return this.saxParser;
        }
        return this.saxParser.write(str).close();
      } catch (err2) {
        if (!this.errThrown && !this.ended) {
          this.emit("error", err2);
          this.errThrown = true;
        } else if (this.ended) {
          throw err2;
        }
      }
    });
    __publicField(this, "parseStringPromise", (str) => {
      return new Promise((resolve, reject) => {
        this.parseString(str, (err2, value) => {
          if (err2) {
            reject(err2);
          } else {
            resolve(value);
          }
        });
      });
    });
    this.options = {};
    Object.keys(defaults["0.2"]).forEach((key) => {
      this.options[key] = defaults["0.2"][key];
    });
    if (opts) {
      Object.keys(opts).forEach((key) => {
        this.options[key] = opts[key];
      });
    }
    if (this.options.xmlns) {
      this.options.xmlnskey = `${this.options.attrkey}ns`;
    }
    if (this.options.normalizeTags) {
      if (!this.options.tagNameProcessors) {
        this.options.tagNameProcessors = [];
      }
      this.options.tagNameProcessors.unshift(normalize);
    }
    this.reset();
  }
};
function parseStringPromise(str, a) {
  let options = {};
  if (typeof a === "object") {
    options = a;
  }
  const parser = new Parser(options);
  return parser.parseStringPromise(str);
}
async function parsexml(str, optionsParserOptions = {}) {
  const result = await parseStringPromise(str, optionsParserOptions);
  return result;
}

// ../../Users/user/AppData/Local/Temp/omni-converter-build/node_modules/@lingo-reader/mobi-parser/dist/index.browser.mjs
var htmlEntityMap = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
};
function unescapeHTML(str) {
  if (!str.includes("&")) {
    return str;
  }
  return str.replace(/&(#x[\dA-Fa-f]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    } else if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    } else {
      return htmlEntityMap[match] || match;
    }
  });
}
var MIME = {
  XML: "application/xml",
  XHTML: "application/xhtml+xml",
  HTML: "text/html",
  CSS: "text/css",
  SVG: "image/svg+xml"
};
var fileSignatures = {
  "ffd8ff": "image/jpeg",
  "89504e47": "image/png",
  "47494638": "image/gif",
  "424d": "image/bmp",
  "3c737667": "image/svg+xml",
  "00000018": "video/mp4",
  "00000020": "video/mp4",
  "1a45dfa3": "video/mkv",
  "1f43b675": "video/webm",
  "494433": "audio/mp3",
  "52494646": "audio/wav",
  "4f676753": "audio/ogg",
  "00010000": "font/ttf",
  "74727565": "font/ttf",
  "4f54544f": "font/otf",
  "774f4646": "font/woff",
  "774f4632": "font/woff2",
  "504c": "font/eot"
};
function getFileMimeType(fileBuffer) {
  const header = fileBuffer.slice(0, 12);
  const hexHeader = Array.from(header).map((b) => b.toString(16).padStart(2, "0")).join("");
  for (const [signature, type] of Object.entries(fileSignatures)) {
    if (hexHeader.startsWith(signature)) {
      return type;
    }
  }
  return "unknown";
}
function saveResource(data, type, filename, imageSaveDir) {
  {
    return URL.createObjectURL(new Blob([data], { type }));
  }
}
var mobiEncoding = {
  1252: "windows-1252",
  65001: "utf-8"
};
var mobiLang = {
  1: ["ar", "ar-SA", "ar-IQ", "ar-EG", "ar-LY", "ar-DZ", "ar-MA", "ar-TN", "ar-OM", "ar-YE", "ar-SY", "ar-JO", "ar-LB", "ar-KW", "ar-AE", "ar-BH", "ar-QA"],
  2: ["bg"],
  3: ["ca"],
  4: ["zh", "zh-TW", "zh-CN", "zh-HK", "zh-SG"],
  5: ["cs"],
  6: ["da"],
  7: ["de", "de-DE", "de-CH", "de-AT", "de-LU", "de-LI"],
  8: ["el"],
  9: ["en", "en-US", "en-GB", "en-AU", "en-CA", "en-NZ", "en-IE", "en-ZA", "en-JM", null, "en-BZ", "en-TT", "en-ZW", "en-PH"],
  10: ["es", "es-ES", "es-MX", null, "es-GT", "es-CR", "es-PA", "es-DO", "es-VE", "es-CO", "es-PE", "es-AR", "es-EC", "es-CL", "es-UY", "es-PY", "es-BO", "es-SV", "es-HN", "es-NI", "es-PR"],
  11: ["fi"],
  12: ["fr", "fr-FR", "fr-BE", "fr-CA", "fr-CH", "fr-LU", "fr-MC"],
  13: ["he"],
  14: ["hu"],
  15: ["is"],
  16: ["it", "it-IT", "it-CH"],
  17: ["ja"],
  18: ["ko"],
  19: ["nl", "nl-NL", "nl-BE"],
  20: ["no", "nb", "nn"],
  21: ["pl"],
  22: ["pt", "pt-BR", "pt-PT"],
  23: ["rm"],
  24: ["ro"],
  25: ["ru"],
  26: ["hr", null, "sr"],
  27: ["sk"],
  28: ["sq"],
  29: ["sv", "sv-SE", "sv-FI"],
  30: ["th"],
  31: ["tr"],
  32: ["ur"],
  33: ["id"],
  34: ["uk"],
  35: ["be"],
  36: ["sl"],
  37: ["et"],
  38: ["lv"],
  39: ["lt"],
  41: ["fa"],
  42: ["vi"],
  43: ["hy"],
  44: ["az"],
  45: ["eu"],
  46: ["hsb"],
  47: ["mk"],
  48: ["st"],
  49: ["ts"],
  50: ["tn"],
  52: ["xh"],
  53: ["zu"],
  54: ["af"],
  55: ["ka"],
  56: ["fo"],
  57: ["hi"],
  58: ["mt"],
  59: ["se"],
  62: ["ms"],
  63: ["kk"],
  65: ["sw"],
  67: ["uz", null, "uz-UZ"],
  68: ["tt"],
  69: ["bn"],
  70: ["pa"],
  71: ["gu"],
  72: ["or"],
  73: ["ta"],
  74: ["te"],
  75: ["kn"],
  76: ["ml"],
  77: ["as"],
  78: ["mr"],
  79: ["sa"],
  82: ["cy", "cy-GB"],
  83: ["gl", "gl-ES"],
  87: ["kok"],
  97: ["ne"],
  98: ["fy"]
};
var pdbHeader = {
  name: [0, 32, "string"],
  type: [60, 4, "string"],
  creator: [64, 4, "string"],
  numRecords: [76, 2, "uint"]
};
var palmdocHeader = {
  compression: [0, 2, "uint"],
  numTextRecords: [8, 2, "uint"],
  recordSize: [10, 2, "uint"],
  encryption: [12, 2, "uint"]
};
var mobiHeader = {
  magic: [16, 4, "string"],
  length: [20, 4, "uint"],
  type: [24, 4, "uint"],
  encoding: [28, 4, "uint"],
  uid: [32, 4, "uint"],
  version: [36, 4, "uint"],
  titleOffset: [84, 4, "uint"],
  titleLength: [88, 4, "uint"],
  localeRegion: [94, 1, "uint"],
  localeLanguage: [95, 1, "uint"],
  resourceStart: [108, 4, "uint"],
  huffcdic: [112, 4, "uint"],
  numHuffcdic: [116, 4, "uint"],
  exthFlag: [128, 4, "uint"],
  trailingFlags: [240, 4, "uint"],
  indx: [244, 4, "uint"]
};
var kf8Header = {
  resourceStart: [108, 4, "uint"],
  fdst: [192, 4, "uint"],
  numFdst: [196, 4, "uint"],
  frag: [248, 4, "uint"],
  skel: [252, 4, "uint"],
  guide: [260, 4, "uint"]
};
var exthHeader = {
  magic: [0, 4, "string"],
  length: [4, 4, "uint"],
  count: [8, 4, "uint"]
};
var indxHeader = {
  magic: [0, 4, "string"],
  length: [4, 4, "uint"],
  type: [8, 4, "uint"],
  idxt: [20, 4, "uint"],
  numRecords: [24, 4, "uint"],
  encoding: [28, 4, "uint"],
  language: [32, 4, "uint"],
  total: [36, 4, "uint"],
  ordt: [40, 4, "uint"],
  ligt: [44, 4, "uint"],
  numLigt: [48, 4, "uint"],
  numCncx: [52, 4, "uint"]
};
var tagxHeader = {
  magic: [0, 4, "string"],
  length: [4, 4, "uint"],
  numControlBytes: [8, 4, "uint"]
};
var huffHeader = {
  magic: [0, 4, "string"],
  offset1: [8, 4, "uint"],
  offset2: [12, 4, "uint"]
};
var cdicHeader = {
  magic: [0, 4, "string"],
  length: [4, 4, "uint"],
  numEntries: [8, 4, "uint"],
  codeLength: [12, 4, "uint"]
};
var fdstHeader = {
  magic: [0, 4, "string"],
  numEntries: [8, 4, "uint"]
};
var fontHeader = {
  flags: [8, 4, "uint"],
  dataStart: [12, 4, "uint"],
  keyLength: [16, 4, "uint"],
  keyStart: [20, 4, "uint"]
};
function getMobiFileName(file) {
  let fileName = "";
  {
    fileName = file.name ?? "";
  }
  return fileName;
}
function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
async function toArrayBuffer(file) {
  {
    return file instanceof Uint8Array ? bufferToArrayBuffer(file) : await file.arrayBuffer();
  }
}
var decoder = new TextDecoder();
var getString = (buffer) => decoder.decode(buffer);
function getUint(buffer) {
  const l = buffer.byteLength;
  const func = l === 4 ? "getUint32" : l === 2 ? "getUint16" : "getUint8";
  return new DataView(buffer)[func](0);
}
function getStruct(def, buffer) {
  const res = {};
  for (const key in def) {
    const [start, len, type] = def[key];
    res[key] = type === "string" ? getString(buffer.slice(start, start + len)) : getUint(buffer.slice(start, start + len));
  }
  return res;
}
function concatTypedArrays(arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new arrays[0].constructor(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}
var getDecoder = (x) => new TextDecoder(mobiEncoding[x]);
function getVarLen(byteArray, i = 0) {
  let value = 0;
  let length = 0;
  for (const byte of byteArray.subarray(i, i + 4)) {
    value = value << 7 | (byte & 127) >>> 0;
    length++;
    if (byte & 128) {
      break;
    }
  }
  return { value, length };
}
function getVarLenFromEnd(byteArray) {
  let value = 0;
  for (const byte of byteArray.subarray(-4)) {
    if (byte & 128) {
      value = 0;
    }
    value = value << 7 | byte & 127;
  }
  return value;
}
function countBitsSet(x) {
  let count = 0;
  for (; x > 0; x = x >> 1) {
    if ((x & 1) === 1) {
      count++;
    }
  }
  return count;
}
function countUnsetEnd(x) {
  let count = 0;
  while ((x & 1) === 0) {
    x = x >> 1;
    count++;
  }
  return count;
}
function decompressPalmDOC(array) {
  const output = [];
  for (let i = 0; i < array.length; i++) {
    const byte = array[i];
    if (byte === 0) {
      output.push(0);
    } else if (byte <= 8) {
      for (const x of array.subarray(i + 1, (i += byte) + 1))
        output.push(x);
    } else if (byte <= 127) {
      output.push(byte);
    } else if (byte <= 191) {
      const bytes = byte << 8 | array[i++ + 1];
      const distance = (bytes & 16383) >>> 3;
      const length = (bytes & 7) + 3;
      for (let j = 0; j < length; j++)
        output.push(output[output.length - distance]);
    } else {
      output.push(32, byte ^ 128);
    }
  }
  return Uint8Array.from(output);
}
function huffcdic(mobi, loadRecord) {
  const huffRecord = loadRecord(mobi.huffcdic);
  const { magic, offset1, offset2 } = getStruct(huffHeader, huffRecord);
  if (magic !== "HUFF") {
    throw new Error("Invalid HUFF record");
  }
  const table1 = Array.from(
    { length: 256 },
    (_, i) => offset1 + i * 4
  ).map((offset) => getUint(huffRecord.slice(offset, offset + 4))).map((x) => [x & 128, x & 31, x >>> 8]);
  const table2 = [[0, 0], ...Array.from(
    { length: 32 },
    (_, i) => offset2 + i * 8
  ).map((offset) => [
    getUint(huffRecord.slice(offset, offset + 4)),
    getUint(huffRecord.slice(offset + 4, offset + 8))
  ])];
  const dictionary = [];
  for (let i = 1; i < mobi.numHuffcdic; i++) {
    const record = loadRecord(mobi.huffcdic + i);
    const cdic = getStruct(cdicHeader, record);
    if (cdic.magic !== "CDIC") {
      throw new Error("Invalid CDIC record");
    }
    const n = Math.min(1 << cdic.codeLength, cdic.numEntries - dictionary.length);
    const buffer = record.slice(cdic.length);
    for (let i2 = 0; i2 < n; i2++) {
      const offset = getUint(buffer.slice(i2 * 2, i2 * 2 + 2));
      const x = getUint(buffer.slice(offset, offset + 2));
      const length = x & 32767;
      const decompressed = x & 32768;
      const value = new Uint8Array(buffer.slice(offset + 2, offset + 2 + length));
      dictionary.push([value, decompressed]);
    }
  }
  const decompress = (byteArray) => {
    let output = new Uint8Array();
    const bitLength = byteArray.byteLength * 8;
    for (let i = 0; i < bitLength; ) {
      const bits2 = Number(read32Bits(byteArray, i));
      let [found, codeLength, value] = table1[bits2 >>> 24];
      if (!found) {
        while (bits2 >>> 32 - codeLength < table2[codeLength][0])
          codeLength += 1;
        value = table2[codeLength][1];
      }
      i += codeLength;
      if (i > bitLength) {
        break;
      }
      const code = value - (bits2 >>> 32 - codeLength);
      let [result, decompressed] = dictionary[code];
      if (!decompressed) {
        result = decompress(result);
        dictionary[code] = [result, true];
      }
      output = concatTypedArrays([output, result]);
    }
    return output;
  };
  return decompress;
}
function read32Bits(byteArray, from) {
  const startByte = from >> 3;
  const end = from + 32;
  const endByte = end >> 3;
  let bits2 = 0n;
  for (let i = startByte; i <= endByte; i++) {
    bits2 = bits2 << 8n | BigInt(byteArray[i] ?? 0);
  }
  return bits2 >> 8n - BigInt(end & 7) & 0xFFFFFFFFn;
}
var exthRecordType = {
  100: ["creator", "string", true],
  // many
  101: ["publisher", "string", false],
  103: ["description", "string", false],
  104: ["isbn", "string", false],
  105: ["subject", "string", true],
  // many
  106: ["date", "string", false],
  108: ["contributor", "string", true],
  // many
  109: ["rights", "string", false],
  110: ["subjectCode", "string", true],
  // many
  112: ["source", "string", true],
  // many
  113: ["asin", "string", false],
  121: ["boundary", "uint", false],
  122: ["fixedLayout", "string", false],
  125: ["numResources", "uint", false],
  126: ["originalResolution", "string", false],
  127: ["zeroGutter", "string", false],
  128: ["zeroMargin", "string", false],
  129: ["coverURI", "string", false],
  132: ["regionMagnification", "string", false],
  201: ["coverOffset", "uint", false],
  202: ["thumbnailOffset", "uint", false],
  503: ["title", "string", false],
  524: ["language", "string", true],
  // many
  527: ["pageProgressionDirection", "string", false]
};
function getExth(buf, encoding) {
  const { magic, count } = getStruct(exthHeader, buf);
  if (magic !== "EXTH") {
    throw new Error("Invalid EXTH header");
  }
  const decoder2 = getDecoder(encoding.toString());
  const results = {};
  let offset = 12;
  for (let i = 0; i < count; i++) {
    const type = getUint(buf.slice(offset, offset + 4));
    const length = getUint(buf.slice(offset + 4, offset + 8));
    if (type in exthRecordType) {
      const [name, typ, ismany] = exthRecordType[type];
      const data = buf.slice(offset + 8, offset + length);
      const value = typ === "uint" ? getUint(data) : decoder2.decode(data);
      if (ismany) {
        results[name] ?? (results[name] = []);
        results[name].push(value);
      } else {
        results[name] = value;
      }
    }
    offset += length;
  }
  return results;
}
function getRemoveTrailingEntries(trailingFlags) {
  const multibyte = trailingFlags & 1;
  const numTrailingEntries = countBitsSet(trailingFlags >>> 1);
  return (array) => {
    for (let i = 0; i < numTrailingEntries; i++) {
      const length = getVarLenFromEnd(array);
      array = array.subarray(0, -length);
    }
    if (multibyte) {
      const length = (array[array.length - 1] & 3) + 1;
      array = array.subarray(0, -length);
    }
    return array;
  };
}
function getFont(buf) {
  const { flags, dataStart, keyLength, keyStart } = getStruct(fontHeader, buf);
  const array = new Uint8Array(buf.slice(dataStart));
  if (flags & 2) {
    const bytes = keyLength === 16 ? 1024 : 1040;
    const key = new Uint8Array(buf.slice(keyStart, keyStart + keyLength));
    const length = Math.min(bytes, array.length);
    for (let i = 0; i < length; i++) array[i] = array[i] ^ key[i % key.length];
  }
  if (flags & 1) {
    try {
      return unzlibSync(array);
    } catch (e) {
      console.warn(e);
      console.warn("Failed to decompress font");
    }
  }
  return array;
}
function getIndexData(indxIndex, loadRecord) {
  const indxRecord = loadRecord(indxIndex);
  const indx = getStruct(indxHeader, indxRecord);
  if (indx.magic !== "INDX")
    throw new Error("Invalid INDX record");
  const decoder2 = getDecoder(indx.encoding.toString());
  const cncx = {};
  let cncxRecordOffset = 0;
  for (let i = 0; i < indx.numCncx; i++) {
    const record = loadRecord(indxIndex + indx.numRecords + i + 1);
    const array = new Uint8Array(record);
    for (let pos = 0; pos < array.byteLength; ) {
      const index = pos;
      const { value, length } = getVarLen(array, pos);
      pos += length;
      const result = record.slice(pos, pos + value);
      pos += value;
      cncx[cncxRecordOffset + index] = decoder2.decode(result);
    }
    cncxRecordOffset += 65536;
  }
  const tagxBuffer = indxRecord.slice(indx.length);
  const tagx = getStruct(tagxHeader, tagxBuffer);
  if (tagx.magic !== "TAGX")
    throw new Error("Invalid TAGX section");
  const numTags = (tagx.length - 12) / 4;
  const tagTable = Array.from(
    { length: numTags },
    (_, i) => new Uint8Array(tagxBuffer.slice(12 + i * 4, 12 + i * 4 + 4))
  );
  const table = [];
  for (let i = 0; i < indx.numRecords; i++) {
    const record = loadRecord(indxIndex + 1 + i);
    const array = new Uint8Array(record);
    const indx2 = getStruct(indxHeader, record);
    if (indx2.magic !== "INDX") {
      throw new Error("Invalid INDX record");
    }
    for (let j = 0; j < indx2.numRecords; j++) {
      const offsetOffset = indx2.idxt + 4 + 2 * j;
      const offset = getUint(record.slice(offsetOffset, offsetOffset + 2));
      const length = getUint(record.slice(offset, offset + 1));
      const name = getString(record.slice(offset + 1, offset + 1 + length));
      const tags = [];
      const startPos = offset + 1 + length;
      let controlByteIndex = 0;
      let pos = startPos + tagx.numControlBytes;
      for (const [tag, numValues, mask, end] of tagTable) {
        if (end & 1) {
          controlByteIndex++;
          continue;
        }
        const offset2 = startPos + controlByteIndex;
        const value = getUint(record.slice(offset2, offset2 + 1)) & mask;
        if (value === mask) {
          if (countBitsSet(mask) > 1) {
            const { value: value2, length: length2 } = getVarLen(array, pos);
            tags.push([tag, 0, value2, numValues]);
            pos += length2;
          } else {
            tags.push([tag, 1, 0, numValues]);
          }
        } else {
          tags.push([tag, value >> countUnsetEnd(mask), 0, numValues]);
        }
      }
      const tagMap = {};
      for (const [tag, valueCount, valueBytes, numValues] of tags) {
        const values = [];
        if (valueCount !== 0) {
          for (let i2 = 0; i2 < valueCount * numValues; i2++) {
            const { value, length: length2 } = getVarLen(array, pos);
            values.push(value);
            pos += length2;
          }
        } else {
          let count = 0;
          while (count < valueBytes) {
            const { value, length: length2 } = getVarLen(array, pos);
            values.push(value);
            pos += length2;
            count += length2;
          }
        }
        tagMap[tag] = values;
      }
      table.push({ name, tagMap });
    }
  }
  return { table, cncx };
}
function getNCX(indxIndex, loadRecord) {
  const { table, cncx } = getIndexData(indxIndex, loadRecord);
  const items = table.map(({ tagMap }, index) => ({
    index,
    offset: tagMap[1]?.[0],
    size: tagMap[2]?.[0],
    label: cncx[tagMap[3]?.[0]] ?? "",
    headingLevel: tagMap[4]?.[0],
    pos: tagMap[6],
    parent: tagMap[21]?.[0],
    firstChild: tagMap[22]?.[0],
    lastChild: tagMap[23]?.[0]
  }));
  const getChildren = (item) => {
    if (item.firstChild == null)
      return item;
    item.children = items.filter((x) => x.parent === item.index).map(getChildren);
    return item;
  };
  return items.filter((item) => item.headingLevel === 0).map(getChildren);
}
var mbpPagebreakRegex = /<\s*(?:mbp:)?pagebreak[^>]*>/gi;
function makePosURI(fid = 0, off = 0) {
  return `kindle:pos:fid:${fid.toString(32).toUpperCase().padStart(4, "0")}:off:${off.toString(32).toUpperCase().padStart(10, "0")}`;
}
var selectorReg = /\s(id|name|aid)\s*=\s*['"]([^'"]*)['"]/i;
function getFragmentSelector(str) {
  const match = str.match(selectorReg);
  if (!match) {
    return "";
  }
  const [, attr, value] = match;
  return `[${attr}="${value}"]`;
}
var kindlePosRegex = /kindle:pos:fid:(\w+):off:(\w+)/;
function parsePosURI(str) {
  const [fid, off] = str.match(kindlePosRegex).slice(1);
  return {
    fid: Number.parseInt(fid, 32),
    off: Number.parseInt(off, 32)
  };
}
var kindleResourceRegex = /kindle:(flow|embed):(\w+)(?:\?mime=(\w+\/[-+.\w]+))?/;
var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
var MobiFile = class {
  constructor(file, fileName) {
    __publicField$2(this, "fileArrayBuffer");
    __publicField$2(this, "recordsOffset");
    __publicField$2(this, "recordsMagic");
    __publicField$2(this, "start", 0);
    __publicField$2(this, "pdbHeader");
    __publicField$2(this, "mobiHeader");
    __publicField$2(this, "palmdocHeader");
    __publicField$2(this, "kf8Header");
    __publicField$2(this, "exth");
    __publicField$2(this, "isKf8", false);
    __publicField$2(this, "resourceStart");
    __publicField$2(this, "decoder");
    __publicField$2(this, "encoder");
    __publicField$2(this, "removeTrailingEntries");
    __publicField$2(this, "decompress");
    this.fileArrayBuffer = file;
    this.parsePdbHeader();
    this.parseFirstRecord(this.loadRecord(0));
    this.resourceStart = this.mobiHeader.resourceStart;
    if (!this.isKf8) {
      const boundary = this.exth.boundary ?? 4294967295;
      if (boundary < 4294967295) {
        try {
          this.parseFirstRecord(this.loadRecord(boundary));
          this.start = boundary;
          this.isKf8 = true;
        } catch (e) {
          console.warn("Failed to parse kf8 header.");
        }
        if (fileName.endsWith(".mobi")) {
          console.warn(`File "${fileName}" is a compatible file. Please change the file extension to .azw3 to make it parse correctly.`);
        }
      }
    }
    this.setup();
  }
  decode(arr) {
    return this.decoder.decode(arr);
  }
  encode(str) {
    return this.encoder.encode(str);
  }
  pdbLoadRecord(index) {
    const [start, end] = this.recordsOffset[index] ?? [0, 0];
    return this.fileArrayBuffer.slice(start, end);
  }
  loadRecord(index) {
    return this.pdbLoadRecord(this.start + index);
  }
  loadMagic(index) {
    return this.recordsMagic[this.start + index];
  }
  loadTextBuffer(index) {
    return this.decompress(
      this.removeTrailingEntries(
        new Uint8Array(
          this.loadRecord(index + 1)
        )
      )
    );
  }
  loadResource(index) {
    const buf = this.pdbLoadRecord(this.resourceStart + index);
    const magic = getString(buf.slice(0, 4));
    let data;
    if (magic === "FONT") {
      data = getFont(buf);
    } else if (magic === "VIDE" || magic === "AUDI") {
      data = new Uint8Array(buf.slice(12));
    } else {
      data = new Uint8Array(buf);
    }
    return {
      type: getFileMimeType(data),
      raw: data
    };
  }
  getNCX() {
    const index = this.mobiHeader.indx;
    if (index < 4294967295) {
      return getNCX(index, this.loadRecord.bind(this));
    }
    return void 0;
  }
  getMetadata() {
    const mobi = this.mobiHeader;
    const exth = this.exth;
    return {
      identifier: this.mobiHeader.uid.toString(),
      title: exth?.title || mobi.title,
      author: exth?.creator?.map(unescapeHTML) ?? [],
      publisher: exth?.publisher ?? "",
      // language in exth is many, we use the first one in this case
      language: exth?.language?.[0] ?? mobi.language,
      published: exth?.date ?? "",
      description: exth?.description ?? "",
      subject: exth?.subject?.map(unescapeHTML) ?? [],
      rights: exth?.rights ?? "",
      contributor: exth?.contributor ?? []
    };
  }
  getCoverImage() {
    const exth = this.exth;
    const coverOffset = Number(exth.coverOffset ?? 4294967295);
    const thumbnailOffset = Number(exth.thumbnailOffset ?? 4294967295);
    const offset = coverOffset < 4294967295 ? coverOffset : thumbnailOffset < 4294967295 ? thumbnailOffset : void 0;
    if (offset) {
      return this.loadResource(offset);
    }
    return void 0;
  }
  parsePdbHeader() {
    const pdb = getStruct(pdbHeader, this.fileArrayBuffer.slice(0, 78));
    pdb.name = pdb.name.replace(/\0.*$/, "");
    this.pdbHeader = pdb;
    const recordsBuffer = this.fileArrayBuffer.slice(78, 78 + pdb.numRecords * 8);
    const recordsStart = Array.from(
      { length: pdb.numRecords },
      (_, i) => getUint(recordsBuffer.slice(i * 8, i * 8 + 4))
    );
    this.recordsOffset = recordsStart.map(
      (start, i) => [start, recordsStart[i + 1]]
    );
    this.recordsMagic = recordsStart.map(
      (val) => getString(this.fileArrayBuffer.slice(val, val + 4))
    );
  }
  // palmdocHeader, mobiHeader, isKf8, exth
  parseFirstRecord(firstRecord) {
    this.palmdocHeader = getStruct(palmdocHeader, firstRecord.slice(0, 16));
    const mobi = getStruct(mobiHeader, firstRecord);
    if (mobi.magic !== "MOBI") {
      throw new Error("Missing MOBI header");
    }
    const { titleOffset, titleLength, localeLanguage, localeRegion } = mobi;
    const lang = mobiLang[localeLanguage.toString()] ?? [];
    const mobiHeaderExtends = {
      title: getString(firstRecord.slice(titleOffset, titleOffset + titleLength)),
      language: lang[localeRegion >> 2] ?? lang[0] ?? "unknown"
    };
    this.mobiHeader = Object.assign(mobi, mobiHeaderExtends);
    this.kf8Header = mobi.version >= 8 ? getStruct(kf8Header, firstRecord) : void 0;
    this.isKf8 = mobi.version >= 8;
    this.exth = mobi.exthFlag & 64 ? getExth(firstRecord.slice(mobi.length + 16), mobi.encoding) : void 0;
  }
  // setup decoder, encoder, decompress, removeTrailingEntries
  setup() {
    this.decoder = getDecoder(this.mobiHeader.encoding.toString());
    this.encoder = new TextEncoder();
    const compression = this.palmdocHeader.compression;
    if (compression === 1) {
      this.decompress = (f) => f;
    } else if (compression === 2) {
      this.decompress = decompressPalmDOC;
    } else if (compression === 17480) {
      this.decompress = huffcdic(this.mobiHeader, this.loadRecord.bind(this));
    } else {
      throw new Error("Unsupported compression");
    }
    const trailingFlags = this.mobiHeader.trailingFlags;
    this.removeTrailingEntries = getRemoveTrailingEntries(trailingFlags);
  }
};
var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
async function initKf8File(file, resourceSaveDir) {
  const kf8 = new Kf8(file, resourceSaveDir);
  await kf8.innerLoadFile();
  await kf8.innerInit();
  return kf8;
}
var Kf8 = class {
  constructor(file, resourceSaveDir = "./images") {
    this.file = file;
    __publicField$1(this, "fileArrayBuffer");
    __publicField$1(this, "mobiFile");
    __publicField$1(this, "fileName", "");
    __publicField$1(this, "fdstTable", []);
    __publicField$1(this, "fullRawLength", 0);
    __publicField$1(this, "skelTable", []);
    __publicField$1(this, "fragTable", []);
    __publicField$1(this, "chapters", []);
    __publicField$1(this, "toc", []);
    __publicField$1(this, "fragmentOffsets", /* @__PURE__ */ new Map());
    __publicField$1(this, "fragmentSelectors", /* @__PURE__ */ new Map());
    __publicField$1(this, "rawHead", new Uint8Array());
    __publicField$1(this, "rawTail", new Uint8Array());
    __publicField$1(this, "lastLoadedHead", -1);
    __publicField$1(this, "lastLoadedTail", -1);
    __publicField$1(this, "resourceCache", /* @__PURE__ */ new Map());
    __publicField$1(this, "chapterCache", /* @__PURE__ */ new Map());
    __publicField$1(this, "idToChapter", /* @__PURE__ */ new Map());
    __publicField$1(this, "resourceSaveDir", "./images");
    this.fileName = getMobiFileName(file);
    this.resourceSaveDir = resourceSaveDir;
  }
  getFileInfo() {
    return {
      fileName: this.fileName
    };
  }
  getMetadata() {
    return this.mobiFile.getMetadata();
  }
  getCoverImage() {
    if (this.resourceCache.has("cover")) {
      return this.resourceCache.get("cover");
    }
    const coverImage = this.mobiFile.getCoverImage();
    let coverUrl = "";
    if (coverImage) {
      coverUrl = saveResource(coverImage.raw, coverImage.type, "cover", this.resourceSaveDir);
      this.resourceCache.set("cover", coverUrl);
    }
    return coverUrl;
  }
  getSpine() {
    return this.chapters;
  }
  getToc() {
    return this.toc;
  }
  async innerLoadFile() {
    this.fileArrayBuffer = await toArrayBuffer(this.file);
    this.mobiFile = new MobiFile(this.fileArrayBuffer, this.fileName);
  }
  async innerInit() {
    const loadRecord = this.mobiFile.loadRecord.bind(this.mobiFile);
    const kf8Header2 = this.mobiFile.kf8Header;
    const fdstBuffer = this.mobiFile.loadRecord(kf8Header2.fdst);
    const fdst = getStruct(fdstHeader, fdstBuffer);
    if (fdst.magic !== "FDST") {
      throw new Error("Missing FDST record");
    }
    const fdstTable = Array.from(
      { length: fdst.numEntries },
      (_, i) => 12 + i * 8
    ).map((offset) => [
      getUint(fdstBuffer.slice(offset, offset + 4)),
      getUint(fdstBuffer.slice(offset + 4, offset + 8))
    ]);
    this.fdstTable = fdstTable;
    this.fullRawLength = fdstTable[fdstTable.length - 1][1];
    const skelData = getIndexData(kf8Header2.skel, loadRecord);
    const skelTable = skelData.table.map(({ name, tagMap }, index) => ({
      index,
      name,
      numFrag: tagMap[1][0],
      offset: tagMap[6][0],
      length: tagMap[6][1]
    }));
    this.skelTable = skelTable;
    const fragData = getIndexData(kf8Header2.frag, loadRecord);
    const fragTable = fragData.table.map(({ name, tagMap }) => ({
      insertOffset: Number.parseInt(name),
      selector: fragData.cncx[tagMap[2][0]],
      index: tagMap[4][0],
      offset: tagMap[6][0],
      length: tagMap[6][1]
    }));
    this.fragTable = fragTable;
    const chapters = this.skelTable.reduce((acc, skel, index) => {
      const last = acc[acc.length - 1];
      const fragStart = last?.fragEnd ?? 0;
      const fragEnd = fragStart + skel.numFrag;
      const frags = this.fragTable.slice(fragStart, fragEnd);
      const length = skel.length + frags.reduce((a, v) => a + v.length, 0);
      const totalLength = (last?.totalLength ?? 0) + length;
      const chapter = { id: index.toString(), skel, frags, fragEnd, length, totalLength };
      this.idToChapter.set(index, chapter);
      acc.push(chapter);
      return acc;
    }, []);
    this.chapters = chapters;
    const ncx = this.mobiFile.getNCX();
    if (ncx) {
      const map = ({ label, pos, children }) => {
        const [fid, off] = pos;
        const href = makePosURI(fid, off);
        const arr = this.fragmentOffsets.get(fid);
        if (arr) {
          arr.push(off);
        } else {
          this.fragmentOffsets.set(fid, [off]);
        }
        return { label, href, children: children?.map(map) };
      };
      this.toc = ncx.map(map);
    }
  }
  getGuide() {
    const index = this.mobiFile.kf8Header.guide;
    if (index < 4294967295) {
      const loadRecord = this.mobiFile.loadRecord.bind(this.mobiFile);
      const { table, cncx } = getIndexData(index, loadRecord);
      return table.map(({ name, tagMap }) => ({
        label: cncx[tagMap[1][0]] ?? "",
        type: name?.split(/\s/),
        href: makePosURI(tagMap[6]?.[0] ?? tagMap[3]?.[0])
      }));
    }
    return void 0;
  }
  loadRaw(start, end) {
    const distanceHead = end - this.rawHead.length;
    const distanceEnd = this.fullRawLength === 0 ? Infinity : this.fullRawLength - this.rawTail.length - start;
    if (distanceHead < 0 || distanceHead < distanceEnd) {
      while (this.rawHead.length < end) {
        this.lastLoadedHead++;
        const index = this.lastLoadedHead;
        const data = this.mobiFile.loadTextBuffer(index);
        this.rawHead = concatTypedArrays([this.rawHead, data]);
      }
      return this.rawHead.slice(start, end);
    }
    while (this.fullRawLength - this.rawTail.length > start) {
      this.lastLoadedTail++;
      const index = this.mobiFile.palmdocHeader.numTextRecords - 1 - this.lastLoadedTail;
      const data = this.mobiFile.loadTextBuffer(index);
      this.rawTail = concatTypedArrays([data, this.rawTail]);
    }
    const rawTailStart = this.fullRawLength - this.rawTail.length;
    return this.rawTail.slice(start - rawTailStart, end - rawTailStart);
  }
  loadText(chapter) {
    const { skel, frags, length } = chapter;
    const raw = this.loadRaw(skel.offset, skel.offset + length);
    let skeleton = raw.slice(0, skel.length);
    for (const frag of frags) {
      const insertOffset = frag.insertOffset - skel.offset;
      const offset = skel.length + frag.offset;
      const fragRaw = raw.slice(offset, offset + frag.length);
      skeleton = concatTypedArrays([
        skeleton.slice(0, insertOffset),
        fragRaw,
        skeleton.slice(insertOffset)
      ]);
      const offsets = this.fragmentOffsets.get(frag.index);
      if (offsets) {
        for (const offset2 of offsets) {
          const str = this.mobiFile.decode(fragRaw.buffer).slice(offset2);
          const selector = getFragmentSelector(str);
          if (selector) {
            this.cacheFragmentSelector(frag.index, offset2, selector);
          }
        }
      }
    }
    return this.mobiFile.decode(skeleton.buffer);
  }
  loadChapter(id) {
    const numId = Number.parseInt(id);
    if (Number.isNaN(numId)) {
      return void 0;
    }
    if (this.chapterCache.has(numId)) {
      return this.chapterCache.get(numId);
    }
    const chapter = this.idToChapter.get(numId);
    if (chapter) {
      const processed = this.replace(this.loadText(chapter));
      this.chapterCache.set(numId, processed);
      return processed;
    }
    return void 0;
  }
  cacheFragmentSelector(id, offset, selector) {
    const map = this.fragmentSelectors.get(id);
    if (map) {
      map.set(offset, selector);
    } else {
      const map2 = /* @__PURE__ */ new Map();
      this.fragmentSelectors.set(id, map2);
      map2.set(offset, selector);
    }
  }
  loadFlow(index) {
    if (index < 4294967295) {
      return this.loadRaw(this.fdstTable[index][0], this.fdstTable[index][1]);
    }
    return void 0;
  }
  resolveHref(href) {
    if (/^(?!blob|kindle)\w+:/i.test(href)) {
      return void 0;
    }
    const { fid, off } = parsePosURI(href);
    const chapter = this.chapters.find(
      (chapter2) => chapter2.frags.some(
        (frag2) => frag2.index === fid
      )
    );
    if (!chapter) {
      return void 0;
    }
    const id = chapter.id;
    const savedSelector = this.fragmentSelectors.get(fid)?.get(off);
    if (savedSelector) {
      return { id, selector: savedSelector };
    }
    const { skel, frags } = chapter;
    const frag = frags.find((frag2) => frag2.index === fid);
    const offset = skel.offset + skel.length + frag.offset;
    const fragRaw = this.loadRaw(offset, offset + frag.length);
    const str = this.mobiFile.decode(fragRaw.buffer).slice(off);
    const selector = getFragmentSelector(str);
    this.cacheFragmentSelector(fid, off, selector);
    return { id, selector };
  }
  replaceResources(str) {
    return str.replace(
      new RegExp(kindleResourceRegex, "gi"),
      (matched, resourceType, id, type) => {
        if (this.resourceCache.has(matched)) {
          return this.resourceCache.get(matched);
        }
        const raw = resourceType === "flow" ? this.loadFlow(Number.parseInt(id)) : this.mobiFile.loadResource(Number.parseInt(id, 36) - 1).raw;
        let blobData = "";
        if (type === MIME.CSS || type === MIME.SVG) {
          const text = this.mobiFile.decode(raw?.buffer);
          const textReplaced = this.replaceResources(text);
          blobData = textReplaced;
        } else {
          blobData = raw;
        }
        const url = saveResource(blobData, type, id, this.resourceSaveDir);
        this.resourceCache.set(matched, url);
        return url;
      }
    );
  }
  replace(str) {
    const cssUrls = [];
    const head = str.match(/<head[^>]*>([\s\S]*)<\/head>/i)[1];
    const links = head.match(/<link[^>]*>/gi) ?? [];
    for (const link of links) {
      const linkHref = link.match(/href="([^"]*)"/i)[1];
      const id = link.match(kindleResourceRegex)[2];
      const href = this.replaceResources(linkHref);
      cssUrls.push({
        id,
        href
      });
    }
    const body = str.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
    const bodyReplaced = this.replaceResources(body);
    return {
      html: bodyReplaced,
      css: cssUrls
    };
  }
  destroy() {
    this.resourceCache.forEach((url) => {
      {
        URL.revokeObjectURL(url);
      }
    });
  }
};
var __defProp3 = Object.defineProperty;
var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField2 = (obj, key, value) => __defNormalProp2(obj, typeof key !== "symbol" ? key + "" : key, value);
async function initMobiFile(file, resourceSaveDir) {
  const mobi = new Mobi(file, resourceSaveDir);
  await mobi.innerLoadFile();
  await mobi.innerInit();
  return mobi;
}
var Mobi = class {
  constructor(file, resourceSaveDir = "./images") {
    this.file = file;
    __publicField2(this, "fileArrayBuffer");
    __publicField2(this, "mobiFile");
    __publicField2(this, "fileName", "");
    __publicField2(this, "chapters", []);
    __publicField2(this, "idToChapter", /* @__PURE__ */ new Map());
    __publicField2(this, "toc", []);
    __publicField2(this, "resourceSaveDir", "./images");
    __publicField2(this, "chapterCache", /* @__PURE__ */ new Map());
    __publicField2(this, "resourceCache", /* @__PURE__ */ new Map());
    __publicField2(this, "recindexReg", /recindex=["']?(\d+)["']?/);
    __publicField2(this, "mediarecindexReg", /mediarecindex=["']?(\d+)["']?/);
    __publicField2(this, "fileposReg", /filepos=["']?(\d+)["']?/);
    this.fileName = getMobiFileName(file);
    this.resourceSaveDir = resourceSaveDir;
  }
  getFileInfo() {
    return {
      fileName: this.fileName
    };
  }
  getSpine() {
    return this.chapters;
  }
  loadChapter(id) {
    const numId = Number.parseInt(id);
    if (Number.isNaN(numId)) {
      return void 0;
    }
    if (this.chapterCache.has(numId)) {
      return this.chapterCache.get(numId);
    }
    const chapter = this.idToChapter.get(numId);
    if (!chapter) {
      return void 0;
    }
    const processedChapter = this.replace(chapter.text);
    this.chapterCache.set(numId, processedChapter);
    return processedChapter;
  }
  getToc() {
    return this.toc;
  }
  getCoverImage() {
    if (this.resourceCache.has("cover")) {
      return this.resourceCache.get("cover");
    }
    const coverImage = this.mobiFile.getCoverImage();
    let coverUrl = "";
    if (coverImage) {
      coverUrl = saveResource(coverImage.raw, coverImage.type, "cover", this.resourceSaveDir);
      this.resourceCache.set("cover", coverUrl);
    }
    return coverUrl;
  }
  getMetadata() {
    return this.mobiFile.getMetadata();
  }
  async innerLoadFile() {
    this.fileArrayBuffer = await toArrayBuffer(this.file);
    this.mobiFile = new MobiFile(this.fileArrayBuffer, this.fileName);
  }
  async innerInit() {
    const { palmdocHeader: palmdocHeader2 } = this.mobiFile;
    const buffers = [];
    for (let i = 0; i < palmdocHeader2.numTextRecords; i++) {
      buffers.push(this.mobiFile.loadTextBuffer(i));
    }
    const array = concatTypedArrays(buffers);
    const str = Array.from(
      array,
      (val) => String.fromCharCode(val)
    ).join("");
    const chapters = [];
    const idToChapter = /* @__PURE__ */ new Map();
    let id = 0;
    const matches = Array.from(str.matchAll(mbpPagebreakRegex));
    matches.unshift({ index: 0, input: "", groups: void 0, 0: "" });
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.index;
      const matched = match[0];
      const end = matches[i + 1]?.index;
      const section = str.slice(start + matched.length, end);
      const buffer = Uint8Array.from(section, (c) => c.charCodeAt(0));
      const text = this.mobiFile.decode(buffer.buffer);
      const chapter = {
        id: String(id),
        text,
        start,
        end,
        size: buffer.length
      };
      chapters.push(chapter);
      idToChapter.set(id, chapter);
      id++;
    }
    const lastChapterText = chapters[chapters.length - 1].text;
    chapters[chapters.length - 1].text = lastChapterText.slice(0, lastChapterText.indexOf("</body>"));
    const firstChapterText = chapters[0].text;
    const bodyOpenTagIndex = firstChapterText.indexOf("<body>");
    chapters[0].text = firstChapterText.slice(bodyOpenTagIndex + "<body>".length);
    this.chapters = chapters;
    this.idToChapter = idToChapter;
    const referenceStr = firstChapterText.slice(0, bodyOpenTagIndex);
    const tocChapterStr = this.findTocChapter(referenceStr);
    if (tocChapterStr) {
      const wrappedChapterStr = `<wrapper>${tocChapterStr.text.replace(/filepos=(\d+)/gi, 'filepos="$1"')}</wrapper>`;
      const tocAst = await parsexml(wrappedChapterStr, {
        preserveChildrenOrder: true,
        explicitChildren: true,
        childkey: "children"
      });
      const toc = [];
      this.parseNavMap(tocAst.wrapper.children, toc);
      this.toc = toc;
    }
  }
  findTocChapter(referenceStr) {
    const tocPosReg = /<reference.*\/>/g;
    const refs = referenceStr.match(tocPosReg);
    const typeReg = /type="(.+?)"/;
    const fileposReg = /filepos=(.*)/;
    if (refs) {
      for (const ref of refs) {
        const type = ref.match(typeReg)?.[1].trim();
        const filepos = ref.match(fileposReg)?.[1].trim();
        if (type === "toc" && filepos) {
          const tocPos = Number.parseInt(filepos, 10);
          const chapter = this.chapters.find((ch) => ch.end > tocPos);
          return chapter;
        }
      }
    }
    return void 0;
  }
  parseNavMap(children, toc) {
    for (const child of children) {
      const childName = child["#name"];
      if (childName === "p" || childName === "blockquote") {
        let subItem = {
          label: "",
          href: ""
        };
        if (child.a) {
          const a = child.a[0];
          const label = a._;
          const filepos = Number(a.$.filepos);
          subItem = {
            label,
            href: `filepos:${filepos}`
          };
          toc.push(subItem);
        }
        if (child.p || child.blockquote) {
          subItem.children = [];
          this.parseNavMap(child.children, subItem.children);
        }
      }
    }
  }
  loadResource(index) {
    if (this.resourceCache.has(String(index))) {
      return this.resourceCache.get(String(index));
    }
    const { type, raw } = this.mobiFile.loadResource(index - 1);
    const resourceUrl = saveResource(raw, type, String(index), this.resourceSaveDir);
    this.resourceCache.set(String(index), resourceUrl);
    return resourceUrl;
  }
  replace(html) {
    html = html.replace(
      /<img[^>]*>/g,
      (matched) => {
        const recindex = matched.match(this.recindexReg)[1];
        const url = this.loadResource(Number.parseInt(recindex));
        return matched.replace(this.recindexReg, `src="${url}"`);
      }
    );
    html = html.replace(
      /<(video|audio)[^>]*>/g,
      (matched) => {
        const mediarecindex = matched.match(this.recindexReg)[1];
        const mediaUrl = this.loadResource(Number.parseInt(mediarecindex));
        matched = matched.replace(this.mediarecindexReg, `src="${mediaUrl}"`);
        const recindex = matched.match(this.recindexReg)?.[1];
        if (recindex) {
          const posterUrl = this.loadResource(Number.parseInt(recindex));
          matched = matched.replace(this.recindexReg, `poster="${posterUrl}"`);
        }
        return matched;
      }
    );
    html = html.replace(
      /<a[^>]*>/g,
      (matched) => {
        const fileposMatch = matched.match(this.fileposReg);
        if (!fileposMatch) {
          return matched;
        }
        const filepos = fileposMatch[1];
        return matched.replace(this.fileposReg, `href="filepos:${filepos}"`);
      }
    );
    return {
      html,
      css: []
    };
  }
  resolveHref(href) {
    const hrefmatch = href.match(/filepos:(\d+)/);
    if (!hrefmatch) {
      return void 0;
    }
    const filepos = hrefmatch[1];
    const fileposNum = Number(filepos);
    const chapter = this.chapters.find((ch) => ch.end > fileposNum);
    if (chapter) {
      return { id: chapter.id, selector: `[id="filepos:${filepos}"]` };
    }
    return void 0;
  }
  destroy() {
    this.resourceCache.forEach((url) => {
      {
        URL.revokeObjectURL(url);
      }
    });
    this.resourceCache.clear();
  }
};
export {
  initKf8File,
  initMobiFile
};
/*! Bundled license information:

sax/lib/sax.js:
  (*! http://mths.be/fromcodepoint v0.1.0 by @mathias *)
*/

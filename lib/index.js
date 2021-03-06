/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

/**
 * Tokenize input string.
 */
function lexer(str) {
    var tokens = [];
    var i = 0;
    while (i < str.length) {
        var char = str[i];
        if (char === "*" || char === "+" || char === "?") {
            tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
            continue;
        }
        if (char === "\\") {
            tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
            continue;
        }
        if (char === "{") {
            tokens.push({ type: "OPEN", index: i, value: str[i++] });
            continue;
        }
        if (char === "}") {
            tokens.push({ type: "CLOSE", index: i, value: str[i++] });
            continue;
        }
        if (char === ":") {
            var name = "";
            var j = i + 1;
            while (j < str.length) {
                var code = str.charCodeAt(j);
                if (
                // `0-9`
                (code >= 48 && code <= 57) ||
                    // `A-Z`
                    (code >= 65 && code <= 90) ||
                    // `a-z`
                    (code >= 97 && code <= 122) ||
                    // `_`
                    code === 95) {
                    name += str[j++];
                    continue;
                }
                break;
            }
            if (!name)
                throw new TypeError("Missing parameter name at " + i);
            tokens.push({ type: "NAME", index: i, value: name });
            i = j;
            continue;
        }
        if (char === "(") {
            var count = 1;
            var pattern = "";
            var j = i + 1;
            if (str[j] === "?") {
                throw new TypeError("Pattern cannot start with \"?\" at " + j);
            }
            while (j < str.length) {
                if (str[j] === "\\") {
                    pattern += str[j++] + str[j++];
                    continue;
                }
                if (str[j] === ")") {
                    count--;
                    if (count === 0) {
                        j++;
                        break;
                    }
                }
                else if (str[j] === "(") {
                    count++;
                    if (str[j + 1] !== "?") {
                        throw new TypeError("Capturing groups are not allowed at " + j);
                    }
                }
                pattern += str[j++];
            }
            if (count)
                throw new TypeError("Unbalanced pattern at " + i);
            if (!pattern)
                throw new TypeError("Missing pattern at " + i);
            tokens.push({ type: "PATTERN", index: i, value: pattern });
            i = j;
            continue;
        }
        tokens.push({ type: "CHAR", index: i, value: str[i++] });
    }
    tokens.push({ type: "END", index: i, value: "" });
    return tokens;
}
/**
 * Parse a string for the raw tokens.
 */
function parse(str, options) {
    if (options === void 0) { options = {}; }
    var tokens = lexer(str);
    var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a;
    var defaultPattern = "[^" + escapeString(options.delimiter || "/#?") + "]+?";
    var result = [];
    var key = 0;
    var i = 0;
    var path = "";
    var tryConsume = function (type) {
        if (i < tokens.length && tokens[i].type === type)
            return tokens[i++].value;
    };
    var mustConsume = function (type) {
        var value = tryConsume(type);
        if (value !== undefined)
            return value;
        var _a = tokens[i], nextType = _a.type, index = _a.index;
        throw new TypeError("Unexpected " + nextType + " at " + index + ", expected " + type);
    };
    var consumeText = function () {
        var result = "";
        var value;
        // tslint:disable-next-line
        while ((value = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR"))) {
            result += value;
        }
        return result;
    };
    while (i < tokens.length) {
        var char = tryConsume("CHAR");
        var name = tryConsume("NAME");
        var pattern = tryConsume("PATTERN");
        if (name || pattern) {
            var prefix = char || "";
            if (prefixes.indexOf(prefix) === -1) {
                path += prefix;
                prefix = "";
            }
            if (path) {
                result.push(path);
                path = "";
            }
            result.push({
                name: name || key++,
                prefix: prefix,
                suffix: "",
                pattern: pattern || defaultPattern,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        var value = char || tryConsume("ESCAPED_CHAR");
        if (value) {
            path += value;
            continue;
        }
        if (path) {
            result.push(path);
            path = "";
        }
        var open = tryConsume("OPEN");
        if (open) {
            var prefix = consumeText();
            var name_1 = tryConsume("NAME") || "";
            var pattern_1 = tryConsume("PATTERN") || "";
            var suffix = consumeText();
            mustConsume("CLOSE");
            result.push({
                name: name_1 || (pattern_1 ? key++ : ""),
                pattern: name_1 && !pattern_1 ? defaultPattern : pattern_1,
                prefix: prefix,
                suffix: suffix,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        mustConsume("END");
    }
    return result;
}
/**
 * Compile a string to a template function for the path.
 */
function compile(str, options) {
    return tokensToFunction(parse(str, options), options);
}
/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction(tokens, options) {
    if (options === void 0) { options = {}; }
    var reFlags = flags(options);
    var _a = options.encode, encode = _a === void 0 ? function (x) { return x; } : _a, _b = options.validate, validate = _b === void 0 ? true : _b;
    // Compile all the tokens into regexps.
    var matches = tokens.map(function (token) {
        if (typeof token === "object") {
            return new RegExp("^(?:" + token.pattern + ")$", reFlags);
        }
    });
    return function (data) {
        var path = "";
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            if (typeof token === "string") {
                path += token;
                continue;
            }
            var value = data ? data[token.name] : undefined;
            var optional = token.modifier === "?" || token.modifier === "*";
            var repeat = token.modifier === "*" || token.modifier === "+";
            if (Array.isArray(value)) {
                if (!repeat) {
                    throw new TypeError("Expected \"" + token.name + "\" to not repeat, but got an array");
                }
                if (value.length === 0) {
                    if (optional)
                        continue;
                    throw new TypeError("Expected \"" + token.name + "\" to not be empty");
                }
                for (var j = 0; j < value.length; j++) {
                    var segment = encode(value[j], token);
                    if (validate && !matches[i].test(segment)) {
                        throw new TypeError("Expected all \"" + token.name + "\" to match \"" + token.pattern + "\", but got \"" + segment + "\"");
                    }
                    path += token.prefix + segment + token.suffix;
                }
                continue;
            }
            if (typeof value === "string" || typeof value === "number") {
                var segment = encode(String(value), token);
                if (validate && !matches[i].test(segment)) {
                    throw new TypeError("Expected \"" + token.name + "\" to match \"" + token.pattern + "\", but got \"" + segment + "\"");
                }
                path += token.prefix + segment + token.suffix;
                continue;
            }
            if (optional)
                continue;
            var typeOfMessage = repeat ? "an array" : "a string";
            throw new TypeError("Expected \"" + token.name + "\" to be " + typeOfMessage);
        }
        return path;
    };
}
/**
 * Create path match function from `path-to-regexp` spec.
 */
function match$1(str, options) {
    var keys = [];
    var re = pathToRegexp(str, keys, options);
    return regexpToFunction(re, keys, options);
}
/**
 * Create a path match function from `path-to-regexp` output.
 */
function regexpToFunction(re, keys, options) {
    if (options === void 0) { options = {}; }
    var _a = options.decode, decode = _a === void 0 ? function (x) { return x; } : _a;
    return function (pathname) {
        var m = re.exec(pathname);
        if (!m)
            return false;
        var path = m[0], index = m.index;
        var params = Object.create(null);
        var _loop_1 = function (i) {
            // tslint:disable-next-line
            if (m[i] === undefined)
                return "continue";
            var key = keys[i - 1];
            if (key.modifier === "*" || key.modifier === "+") {
                params[key.name] = m[i].split(key.prefix + key.suffix).map(function (value) {
                    return decode(value, key);
                });
            }
            else {
                params[key.name] = decode(m[i], key);
            }
        };
        for (var i = 1; i < m.length; i++) {
            _loop_1(i);
        }
        return { path: path, index: index, params: params };
    };
}
/**
 * Escape a regular expression string.
 */
function escapeString(str) {
    return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
/**
 * Get the flags for a regexp from the options.
 */
function flags(options) {
    return options && options.sensitive ? "" : "i";
}
/**
 * Pull out keys from a regexp.
 */
function regexpToRegexp(path, keys) {
    if (!keys)
        return path;
    var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
    var index = 0;
    var execResult = groupsRegex.exec(path.source);
    while (execResult) {
        keys.push({
            // Use parenthesized substring match if available, index otherwise
            name: execResult[1] || index++,
            prefix: "",
            suffix: "",
            modifier: "",
            pattern: ""
        });
        execResult = groupsRegex.exec(path.source);
    }
    return path;
}
/**
 * Transform an array into a regexp.
 */
function arrayToRegexp(paths, keys, options) {
    var parts = paths.map(function (path) { return pathToRegexp(path, keys, options).source; });
    return new RegExp("(?:" + parts.join("|") + ")", flags(options));
}
/**
 * Create a path regexp from string input.
 */
function stringToRegexp(path, keys, options) {
    return tokensToRegexp(parse(path, options), keys, options);
}
/**
 * Expose a function for taking tokens and returning a RegExp.
 */
function tokensToRegexp(tokens, keys, options) {
    if (options === void 0) { options = {}; }
    var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function (x) { return x; } : _d;
    var endsWith = "[" + escapeString(options.endsWith || "") + "]|$";
    var delimiter = "[" + escapeString(options.delimiter || "/#?") + "]";
    var route = start ? "^" : "";
    // Iterate over the tokens and create our regexp string.
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        if (typeof token === "string") {
            route += escapeString(encode(token));
        }
        else {
            var prefix = escapeString(encode(token.prefix));
            var suffix = escapeString(encode(token.suffix));
            if (token.pattern) {
                if (keys)
                    keys.push(token);
                if (prefix || suffix) {
                    if (token.modifier === "+" || token.modifier === "*") {
                        var mod = token.modifier === "*" ? "?" : "";
                        route += "(?:" + prefix + "((?:" + token.pattern + ")(?:" + suffix + prefix + "(?:" + token.pattern + "))*)" + suffix + ")" + mod;
                    }
                    else {
                        route += "(?:" + prefix + "(" + token.pattern + ")" + suffix + ")" + token.modifier;
                    }
                }
                else {
                    route += "(" + token.pattern + ")" + token.modifier;
                }
            }
            else {
                route += "(?:" + prefix + suffix + ")" + token.modifier;
            }
        }
    }
    if (end) {
        if (!strict)
            route += delimiter + "?";
        route += !options.endsWith ? "$" : "(?=" + endsWith + ")";
    }
    else {
        var endToken = tokens[tokens.length - 1];
        var isEndDelimited = typeof endToken === "string"
            ? delimiter.indexOf(endToken[endToken.length - 1]) > -1
            : // tslint:disable-next-line
                endToken === undefined;
        if (!strict) {
            route += "(?:" + delimiter + "(?=" + endsWith + "))?";
        }
        if (!isEndDelimited) {
            route += "(?=" + delimiter + "|" + endsWith + ")";
        }
    }
    return new RegExp(route, flags(options));
}
/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 */
function pathToRegexp(path, keys, options) {
    if (path instanceof RegExp)
        return regexpToRegexp(path, keys);
    if (Array.isArray(path))
        return arrayToRegexp(path, keys, options);
    return stringToRegexp(path, keys, options);
}

var PathToRegexp = /*#__PURE__*/Object.freeze({
    __proto__: null,
    parse: parse,
    compile: compile,
    tokensToFunction: tokensToFunction,
    match: match$1,
    regexpToFunction: regexpToFunction,
    tokensToRegexp: tokensToRegexp,
    pathToRegexp: pathToRegexp
});

const { match } = PathToRegexp;
class KoawRouter {
    constructor() {
        this.stack = [];
        this.rewrite = [];
        this.stack = [];
        this.rewrite = [];
    }
    get(path, handler) {
        return this.verb("get", path, handler);
    }
    post(path, handler) {
        return this.verb("post", path, handler);
    }
    delete(path, handler) {
        return this.verb("delete", path, handler);
    }
    put(path, handler) {
        return this.verb("put", path, handler);
    }
    patch(path, handler) {
        return this.verb("patch", path, handler);
    }
    connect(path, handler) {
        return this.verb("connect", path, handler);
    }
    trace(path, handler) {
        return this.verb("trace", path, handler);
    }
    options(path, handler) {
        return this.verb("options", path, handler);
    }
    all(path, handler) {
        return this.verb("all", path, handler);
    }
    rewriteTo(origin, to, method = "all") {
        this.stack.push({
            path: origin,
            rewrite: to,
            method,
            handler: () => { },
        });
        return this;
    }
    verb(method, path, handler) {
        this.stack.push({
            path,
            handler,
            method,
        });
        return this;
    }
    compose(routes, path, ctx) {
        let needReRoute = "";
        let finalHandlers = [];
        for (let i = 0; i < routes.length; i++) {
            let matcher = match(routes[i].path, {
                encode: encodeURI,
                decode: decodeURIComponent,
            });
            let isMatched = matcher(path);
            if (isMatched) {
                if (this.rewrite.includes(path))
                    throw new Error("`KoawRouter` detect loop rewrite, cannot make a correct response");
                if (routes[i].rewrite !== undefined &&
                    routes[i].rewrite &&
                    !this.rewrite.includes(path) &&
                    routes[i].rewrite !== path) {
                    this.rewrite.push(path);
                    needReRoute = routes[i].rewrite || "";
                    break;
                }
                finalHandlers.push({ handler: routes[i].handler, match: isMatched });
            }
        }
        if (needReRoute) {
            finalHandlers = this.compose(routes, needReRoute, ctx);
        }
        return finalHandlers;
    }
    route() {
        return (ctx) => __awaiter(this, void 0, void 0, function* () {
            let pathname = ctx.req.url.pathname;
            let properRoutes = this.stack.filter((r) => r.method === "all" || r.method === ctx.req.method.toLowerCase());
            let tasks = this.compose(properRoutes, pathname, ctx);
            for (let i = 0; i < tasks.length; i++) {
                yield tasks[i].handler(ctx, tasks[i].match);
                if (ctx.finished)
                    break;
            }
        });
    }
}

function proxyGetHeader(headers) {
    let headersObj = Object.fromEntries(headers.entries());
    let proxiedHeaders = new Proxy(headersObj, {
        get: function (target, property) {
            if (typeof property === "symbol")
                return;
            const lowerCaseProp = property.toLowerCase();
            return target[property] || target[lowerCaseProp] || undefined;
        },
    });
    return proxiedHeaders;
}

function responseToCtx(response) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!response || !(response instanceof Response))
            throw new TypeError("`responseToCtx` recieved a non-Response");
        let res = {};
        res.status = response.status;
        res.statusText = response.statusText;
        res.headers = proxyGetHeader(response.headers);
        if (res.headers["content-type"]) {
            if (res.headers["content-type"].includes("application/json")) {
                res.body = yield response.text();
            }
            else if (res.headers["content-type"].includes("application/x-www-form-urlencoded")) {
                let urlSearch = yield response.text();
                res.body = Object.fromEntries(new URLSearchParams(urlSearch).entries());
            }
            else if (res.headers["content-type"].includes("text/")) {
                res.body = yield response.text();
            }
            else {
                res.body = yield response.blob();
            }
        }
        else {
            res.body = yield response.blob();
        }
        return res;
    });
}
const Transformer = { responseToCtx };

function isOriginAllowed(origin, allowedOrigin) {
    if (Array.isArray(allowedOrigin)) {
        for (let i = 0; i < allowedOrigin.length; i += 1) {
            if (isOriginAllowed(origin, allowedOrigin[i])) {
                return true;
            }
        }
        return false;
    }
    if (typeof allowedOrigin === "string") {
        return origin === allowedOrigin;
    }
    if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
    }
    return !!allowedOrigin;
}
function configureOrigin(ctx, options) {
    var _a;
    const requestOrigin = ((_a = ctx.req) === null || _a === void 0 ? void 0 : _a.headers) ? ctx.req.headers["Origin"] : "";
    if (!options.origin || options.origin === "*") {
        return {
            key: "Access-Control-Allow-Origin",
            value: "*",
        };
    }
    if (typeof options.origin === "string") {
        return {
            key: "Access-Control-Allow-Origin",
            value: options.origin,
        };
    }
    const isAllowed = isOriginAllowed(requestOrigin, options.origin);
    return {
        key: "Access-Control-Allow-Origin",
        value: isAllowed ? requestOrigin : false,
    };
}
function configureMethods(options) {
    if (Array.isArray(options.methods) && options.methods.join) {
        options.methods = options.methods.join(",");
    }
    return {
        key: "Access-Control-Allow-Methods",
        value: options.methods,
    };
}
function configureExposeHeaders(options) {
    if (Array.isArray(options.exposedHeaders) && options.exposedHeaders.join) {
        options.exposedHeaders = options.exposedHeaders.join(",");
    }
    return {
        key: "Access-Control-Expose-Headers",
        value: options.exposedHeaders,
    };
}
function configureAllowedHeaders(options) {
    if (Array.isArray(options.allowedHeaders) && options.allowedHeaders.join) {
        options.allowedHeaders = options.allowedHeaders.join(",");
    }
    return {
        key: "Access-Control-Allow-Headers",
        value: options.allowedHeaders,
    };
}
function configureMaxAge(options) {
    const maxAge = (typeof options.maxAge === "number" || options.maxAge) &&
        options.maxAge.toString();
    if (maxAge && maxAge.length) {
        return {
            key: "Access-Control-Max-Age",
            value: maxAge,
        };
    }
}
function configureCredentials(options) {
    if (options.credentials === true) {
        return {
            key: "Access-Control-Allow-Credentials",
            value: "true",
        };
    }
}
const defaultOptions = {
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
function cors(options) {
    return (ctx) => {
        if (!options)
            return;
        if (options === true) {
            options = defaultOptions;
        }
        if (typeof options === "object" && options.preflightContinue)
            return;
        ctx.tail((ctx) => {
            if (!options)
                return;
            if (options === true)
                options = defaultOptions;
            if (ctx.req.method === "options") {
                ctx.res.status = options.optionsSuccessStatus || 204;
                ctx.res.body = null;
                ctx.end();
            }
            const clonedResponse = ctx.res;
            const headers = [];
            headers.push(configureAllowedHeaders(options));
            headers.push(configureCredentials(options));
            headers.push(configureExposeHeaders(options));
            headers.push(configureMaxAge(options));
            headers.push(configureMethods(options));
            headers.push(configureOrigin(ctx, options));
            headers.forEach((header) => {
                if (typeof header === "object" && header.key && header.value)
                    clonedResponse.headers[header.key] = header.value.toString();
            });
            ctx.res = clonedResponse;
        });
    };
}

class ApplicationContext {
    constructor(event) {
        this.finished = false;
        let url = new URL(event.request.url);
        this.req = {
            url,
            method: event.request.method.toLowerCase() || "get",
            headers: proxyGetHeader(event.request.headers),
            query: Object.fromEntries(url.searchParams),
        };
        this.res = { status: 200, headers: {} };
        this.tailHandlers = [];
    }
    end() {
        this.finished = true;
        return this;
    }
    tail(fn) {
        this.tailHandlers.push(fn);
        return this;
    }
    json(data) {
        let body;
        try {
            body = JSON.stringify(data);
        }
        catch (e) {
            throw new TypeError("`koaw` ctx.json cannot stringify provided data");
        }
        this.res.body = body;
        this.res.headers["Content-Type"] = "application/json";
        this.finished = true;
        return this;
    }
    text(data) {
        if (typeof data !== "string")
            throw new TypeError("`koaw` ctx.text only recieve 'string' type");
        this.res.headers["Content-Type"] = "text/plain";
        this.finished = true;
        return this;
    }
    html(data) {
        if (typeof data !== "string")
            throw new TypeError("`koaw` ctx.text only recieve 'string' type");
        this.res.headers["Content-Type"] = "text/html";
        this.finished = true;
        return this;
    }
    error(status = 500, data) {
        this.res.status = status;
        if (data) {
            switch (typeof data) {
                case "object":
                    this.res.body = JSON.stringify(data);
                    this.res.headers["Content-Type"] = "application/json";
                    break;
                case "string":
                    this.res.body = data;
                    this.res.headers["Content-Type"] = "text/plain";
                    break;
                default:
                    this.res.body = data.toString();
            }
            this.finished = true;
        }
        return this;
    }
    redirect(url, status) {
        try {
            new URL(url);
        }
        catch (e) {
            throw new Error("`koaw` cannot parse url in ctx.redirect");
        }
        this.res.location = url;
        this.res.status = status || 302;
        this.finished = true;
        return this;
    }
}

class Koaw {
    constructor(event, options) {
        this.finished = false;
        this.middleware = [];
        this.ctx = new ApplicationContext(event);
        this.options = options;
        return this;
    }
    contextToResponse(ctx) {
        var _a, _b, _c, _d, _e;
        if (!ctx || !(ctx instanceof ApplicationContext))
            throw new TypeError("`Koaw` context has been modified and cannot make it a response");
        if (!ctx.finished) {
            ctx.finished = true;
            ctx.res.body =
                (ctx.res && ctx.res.body) || "Resource Not Found by `koaw`";
            ctx.res.status = 404;
        }
        const resp = {
            body: ((_a = ctx.res) === null || _a === void 0 ? void 0 : _a.body) || null,
            location: (_b = ctx.res) === null || _b === void 0 ? void 0 : _b.location,
            status: (_c = ctx.res) === null || _c === void 0 ? void 0 : _c.status,
            statusText: (_d = ctx.res) === null || _d === void 0 ? void 0 : _d.statusText,
            headers: ((_e = ctx.res) === null || _e === void 0 ? void 0 : _e.headers) || {},
        };
        if (resp.location) {
            if (!resp.headers)
                resp.headers = {};
            resp.headers["Location"] = resp.location;
        }
        const respInit = {
            status: resp.status || 404,
            headers: resp.headers,
        };
        return new Response(resp.body, respInit);
    }
    use(fn) {
        if (typeof fn !== "function")
            throw new Error("`koaw` middleware should be an Object with `object.fn` handler");
        this.middleware.push(fn);
        return this;
    }
    selfReturn(ctx, handler) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield handler(ctx);
            }
            catch (e) {
                throw e;
            }
            return ctx;
        });
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.ctx.req)
                    throw new Error("`koaw` didn't recieve any request");
                const handlersCount = this.middleware.length;
                if (handlersCount === 0)
                    return new Response("Resource Not Found by `koaw`", { status: 404 });
                for (let i = 0; i < handlersCount; i++) {
                    if (this.ctx.finished)
                        break;
                    let middlewareRes = yield this.selfReturn(this.ctx, this.middleware[i]);
                    this.ctx.res = middlewareRes.res;
                }
                for (let j = 0; j < this.ctx.tailHandlers.length; j++) {
                    let tailCtx = yield this.selfReturn(this.ctx, this.ctx.tailHandlers[j]);
                    this.ctx.res = tailCtx.res;
                }
                return this.contextToResponse(this.ctx);
            }
            catch (e) {
                this.ctx.res.body =
                    "Server Crashed, please try later or contact the admin of the website!";
                if (this.options && this.options.debug && e instanceof Error) {
                    this.ctx.res.body = e.message;
                }
                this.ctx.res.status = 500;
                this.ctx.end();
                return this.contextToResponse(this.ctx);
            }
        });
    }
}

export { KoawRouter, Transformer, cors, Koaw as default };

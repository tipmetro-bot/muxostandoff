#!/usr/bin/env python3
"""
muxostandoff · прокси проверки Standoff 2 ID.

Официального API у Standoff 2 нет, а магазин store.standoff2.com закрыт от чужих
Origin (отвечает 403 Invalid CORS request) и от простых HTTP-клиентов из дата-центров
(403 Cloudflare). Единственный рабочий путь — настоящий браузер: он открывает магазин,
вводит ID и показывает ник. Этот прокси делает это за сайт и отдаёт результат в
простом виде:

    GET /?id=1234567  ->  200 {"nick": "Nickname"}

    GET /?id=0000000  ->  404 {"error": "not found"}
    GET /health       ->  200 {"ok": true, "mode": "browser", "cache": 3}

Запуск:
    pip install -r requirements.txt
    playwright install chromium
    python3 verify.py --port 8787

Проверка без браузера (только чтобы убедиться, что связка сайт↔прокси живая):
    python3 verify.py --stub
"""

from __future__ import annotations

import argparse
import json
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

STORE_URL = "https://store.standoff2.com/ru-RU"
ID_RE = re.compile(r"^\d{7,12}$")
NICK_KEYS = ("nickname", "nick", "nickName", "name", "displayName", "userName")
AVATAR_KEYS = ("avatar", "avatarUrl", "avatarURL", "avatarId", "photo", "image")
NICK_SELECTORS = (
    "[data-testid*=nick]",
    "[class*=nickname]",
    "[class*=Nickname]",
    "[class*=nick]",
    "[id*=nick]",
    "[class*=playerName]",
    "[class*=PlayerName]",
)
CHALLENGE_MARKERS = (
    "just a moment",
    "checking your browser",
    "attention required",
    "verify you are human",
    "проверяем браузер",
)

ARGS = None
LOG_LOCK = threading.Lock()
BROWSER_LOCK = threading.Lock()
BROWSER = None
PLAYWRIGHT = None
CACHE: dict[str, tuple[float, str | None, dict]] = {}


def log(message: str) -> None:
    with LOG_LOCK:
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), message))
        sys.stderr.flush()


# ----------------------------------------------------------------------------
# Браузер
# ----------------------------------------------------------------------------

def _ensure_browser():
    """Поднимает Chromium один раз на процесс."""
    global BROWSER, PLAYWRIGHT
    if BROWSER is not None:
        return BROWSER
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "не установлен playwright: pip install -r requirements.txt && playwright install chromium"
        )
    PLAYWRIGHT = sync_playwright().start()
    launch_args = ["--disable-blink-features=AutomationControlled"]
    BROWSER = PLAYWRIGHT.chromium.launch(headless=not ARGS.headful, args=launch_args)
    return BROWSER


def close_browser() -> None:
    global BROWSER, PLAYWRIGHT
    try:
        if BROWSER is not None:
            BROWSER.close()
    except Exception:
        pass
    try:
        if PLAYWRIGHT is not None:
            PLAYWRIGHT.stop()
    except Exception:
        pass
    BROWSER = None
    PLAYWRIGHT = None


def _find_nick(data) -> str | None:
    """Ищет ник в произвольном JSON от магазина."""
    stack = [data]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for key in NICK_KEYS:
                value = node.get(key)
                if isinstance(value, str) and 1 <= len(value.strip()) <= 32:
                    candidate = value.strip()
                    if not candidate.isdigit():
                        return candidate
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    return None


def _find_avatar(data) -> str | None:
    stack = [data]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for key in AVATAR_KEYS:
                value = node.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    return value
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    return None


def _lookup_browser(uid: str, dump_html: bool = False) -> tuple[str | None, dict]:
    """Открывает магазин в браузере, вводит ID и достаёт ник."""
    captured: list = []

    with BROWSER_LOCK:
        browser = _ensure_browser()
        context = browser.new_context(
            locale="ru-RU",
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        def on_response(response):
            url = response.url or ""
            if "/api/" not in url:
                return
            try:
                body = response.json()
            except Exception:
                return
            if _find_nick(body):
                captured.append(body)

        page.on("response", on_response)
        try:
            page.goto(STORE_URL, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)

            body_text = (page.inner_text("body") or "").lower()
            if any(marker in body_text for marker in CHALLENGE_MARKERS):
                page.wait_for_timeout(7000)
                body_text = (page.inner_text("body") or "").lower()
                if any(marker in body_text for marker in CHALLENGE_MARKERS):
                    raise RuntimeError("cloudflare challenge не пройден")

            filled = False
            for selector in (
                'input[placeholder*="ID" i]',
                'input[placeholder*="айди" i]',
                'input[placeholder*="ник" i]',
                'input[name*="id" i]',
                'input[data-testid*="id" i]',
                "input[type=text]",
            ):
                field = page.query_selector(selector)
                if field is not None and field.is_visible():
                    field.click()
                    field.fill(uid)
                    filled = True
                    break

            if not filled:
                raise RuntimeError("не найдено поле для Standoff 2 ID на странице магазина")

            for selector in (
                'button[type=submit]',
                'button:has-text("Найти")',
                'button:has-text("Искать")',
                'button:has-text("Поиск")',
                'button:has-text("Продолжить")',
                'button:has-text("Search")',
                '[data-testid*=search i]',
                '[class*=search i] button',
            ):
                button = page.query_selector(selector)
                if button is not None and button.is_visible():
                    button.click()
                    break
            else:
                page.keyboard.press("Enter")

            deadline = time.time() + 20
            nick = None
            while time.time() < deadline and not nick:
                for payload in list(captured):
                    nick = _find_nick(payload)
                    if nick:
                        break
                if not nick:
                    for selector in NICK_SELECTORS:
                        element = page.query_selector(selector)
                        if element is None:
                            continue
                        text = (element.inner_text() or "").strip()
                        if 1 <= len(text) <= 32 and not text.isdigit() and "ID" not in text:
                            nick = text
                            break
                if not nick:
                    page.wait_for_timeout(500)

            extra = {}
            for payload in captured:
                avatar = _find_avatar(payload)
                if avatar:
                    extra["avatar"] = avatar
                    break

            if dump_html:
                try:
                    with open("store-page.html", "w", encoding="utf-8") as handle:
                        handle.write(page.content())
                    with open("store-captured.json", "w", encoding="utf-8") as handle:
                        json.dump(captured, handle, ensure_ascii=False, indent=2)
                    extra["dumped"] = ["store-page.html", "store-captured.json"]
                except Exception as error:  # pragma: no cover
                    extra["dumpError"] = str(error)

            return nick, extra
        finally:
            try:
                context.close()
            except Exception:
                pass


def _lookup_stub(uid: str) -> tuple[str | None, dict]:
    """Заглушка без браузера: детерминированный ник из ID."""
    if uid.endswith("0"):
        return None, {}
    return "Stub_" + uid[-4:], {"stub": True}


# ----------------------------------------------------------------------------
# Кэш и HTTP
# ----------------------------------------------------------------------------

def lookup(uid: str, dump_html: bool = False):
    now = time.time()
    cached = CACHE.get(uid)
    if cached is not None:
        created, nick, extra = cached
        ttl = ARGS.cache_ttl if nick else min(ARGS.cache_ttl, 300)
        if now - created < ttl:
            return nick, dict(extra, cached=True)
        CACHE.pop(uid, None)

    started = time.time()
    if ARGS.stub:
        nick, extra = _lookup_stub(uid)
    else:
        nick, extra = _lookup_browser(uid, dump_html=dump_html)
    log("%s -> %r (%.1fs%s)" % (uid, nick, time.time() - started, ", stub" if ARGS.stub else ""))

    if len(CACHE) > 500:
        CACHE.clear()
    CACHE[uid] = (time.time(), nick, extra)
    return nick, extra


class Handler(BaseHTTPRequestHandler):
    server_version = "muxostandoff-proxy"
    protocol_version = "HTTP/1.1"

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        allowed = ARGS.origin or ["*"]
        if "*" in allowed:
            value = "*"
        elif origin in allowed:
            value = origin
        else:
            value = allowed[0]
        self.send_header("Access-Control-Allow-Origin", value)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Vary", "Origin")

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path in ("/health", "/healthz"):
            self._send(200, {"ok": True, "mode": "stub" if ARGS.stub else "browser", "cache": len(CACHE)})
            return

        if parsed.path not in ("/", "/verify", "/nick"):
            self._send(404, {"error": "not found"})
            return

        uid = (parse_qs(parsed.query).get("id") or [""])[0].strip()
        if not ID_RE.match(uid):
            self._send(400, {"error": "Standoff 2 ID — 7–12 цифр"})
            return

        try:
            nick, extra = lookup(uid, dump_html=parsed.query.find("dump=1") >= 0)
        except Exception as error:
            log("ошибка для %s: %s" % (uid, error))
            self._send(502, {"error": str(error)})
            return

        if not nick:
            self._send(404, {"error": "not found"})
            return

        payload = {"nick": nick}
        payload.update(extra)
        self._send(200, payload)

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return


# ----------------------------------------------------------------------------
# Запуск
# ----------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Прокси проверки Standoff 2 ID для muxostandoff")
    parser.add_argument("--host", default="127.0.0.1", help="адрес, по умолчанию 127.0.0.1")
    parser.add_argument("--port", type=int, default=8787, help="порт, по умолчанию 8787")
    parser.add_argument(
        "--origin",
        action="append",
        default=[],
        help="разрешённый Origin сайта (можно несколько раз), по умолчанию *",
    )
    parser.add_argument("--cache-ttl", type=int, default=3600, help="сколько секунд кэшировать ник")
    parser.add_argument("--headful", action="store_true", help="показывать окно браузера (для отладки)")
    parser.add_argument("--stub", action="store_true", help="не открывать браузер, отдавать заглушку")
    parser.add_argument("--calibrate", metavar="ID", help="один запрос с сохранением страницы и JSON")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    global ARGS
    ARGS = parse_args(argv)

    if ARGS.calibrate:
        try:
            nick, extra = lookup(ARGS.calibrate, dump_html=True)
        except Exception as error:
            log("калибровка не удалась: %s" % error)
            close_browser()
            return 1
        print(json.dumps({"id": ARGS.calibrate, "nick": nick, **extra}, ensure_ascii=False, indent=2))
        close_browser()
        return 0 if nick else 2

    server = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    log(
        "прокси слушает http://%s:%d  режим=%s  origin=%s"
        % (ARGS.host, ARGS.port, "stub" if ARGS.stub else "browser", ", ".join(ARGS.origin) or "*")
    )
    log("проверка: curl 'http://%s:%d/?id=1234567'" % (ARGS.host, ARGS.port))

    def stop(signum, frame):  # noqa: ARG001
        log("остановка")
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    try:
        server.serve_forever()
    finally:
        server.server_close()
        close_browser()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

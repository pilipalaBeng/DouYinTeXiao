#!/usr/bin/env python3
"""像塑工程「改了就存」守护脚本。

背景
----
1. 像塑的 MCP **没有**任何「设置自动保存」的接口 —— 只暴露了 save_project（立刻存一次）。
2. 编辑器自带的 `[Backup] Autosave` 是 **10 分钟一次**（日志：next backup in 600 seconds），
   而且它是**备份副本**：把整个工程拷到
   `%LOCALAPPDATA%\\DouyinAR\\Instances\\InstanceN\\Backup\\<时间戳>_x\\`，
   **不写回工程主文件**。所以在编辑器里拖完东西不按 Ctrl+S，关掉照样丢。

做法
----
外挂在像塑的 MCP HTTP 网关上，高频（默认 3 秒）只读轮询 project_status 的脏标记
（`scene_dirty` / `is_changed` / `is_saved`），一旦发现「有未保存改动」就调 save_project。
轮询是纯读、极轻；真正落盘只在确实有改动时发生 —— 效果≈「改完几秒内自动保存」。

用法
----
    python xs_autosave.py                 # 每 3 秒查一次，改了就存
    python xs_autosave.py --interval 10   # 每 10 秒查一次
    python xs_autosave.py --once          # 只查一次并打印状态（自检用）
停止：关掉窗口 / Ctrl+C
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

DEFAULT_MCP = "http://127.0.0.1:17320/mcp"
DEFAULT_IID = "1"
CFG_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "DouyinAR", "Shared", "MCP", "Projects")
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autosave.log")


def log(msg):
    """带时间戳输出到控制台 + 日志文件。"""
    line = "[{}] {}".format(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def find_endpoint():
    """从像塑的 MCP 工程配置里读网关地址与实例 ID（端口 / 实例号变了也能自适应）。"""
    pattern = os.path.join(CFG_DIR, "*.json")
    try:
        files = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    except OSError:
        files = []
    for path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            continue
        mcp = cfg.get("endpoints", {}).get("mcp")
        iid = cfg.get("instanceId")
        if mcp and iid:
            return mcp, str(iid)
    return DEFAULT_MCP, DEFAULT_IID


def call(url, tool, args, timeout=30):
    """发一次 MCP tools/call，返回工具结果解码后的 dict。"""
    body = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": tool, "arguments": args},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    })
    # 空代理表：绕开系统代理，否则 127.0.0.1 可能被劫持走代理。
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(str(payload["error"]))
    return json.loads(payload["result"]["content"][0]["text"])


def is_dirty(url, iid):
    """问一次工程状态，返回 (是否需要保存, 状态 dict)。"""
    st = call(url, "project_status", {"instance_id": iid, "intention": "自动保存守护：读取脏标记"})
    dirty = bool(st.get("scene_dirty") or st.get("is_changed") or st.get("is_saved") is False)
    return dirty, st


def main():
    ap = argparse.ArgumentParser(description="像塑工程改了就存的守护脚本")
    ap.add_argument("--interval", type=float, default=3.0, help="轮询间隔秒数（默认 3）")
    ap.add_argument("--once", action="store_true", help="只检查一次并打印，不循环")
    opts = ap.parse_args()

    url, iid = find_endpoint()
    log("[启动] 网关={} 实例={} 轮询={}s".format(url, iid, opts.interval))
    saves = 0
    misses = 0
    while True:
        try:
            dirty, st = is_dirty(url, iid)
            if opts.once:
                log("[自检] dirty={} status={} path={}".format(dirty, st.get("project_status"), st.get("path")))
                return
            if dirty:
                res = call(url, "save_project", {"instance_id": iid, "intention": "自动保存守护：检测到未保存改动"})
                saves += 1
                log("[保存 #{}] {} ({}ms)".format(saves, res.get("save_status"), res.get("save_duration_orion_part")))
            misses = 0
        except (urllib.error.URLError, OSError, RuntimeError, ValueError, KeyError) as e:
            misses += 1
            # 编辑器没开时最正常不过 —— 只在 1/10/60/300 次时提一句，别刷屏。
            if misses in (1, 10, 60) or misses % 300 == 0:
                log("[离线 x{}] 连不上编辑器：{}".format(misses, e))
        if opts.once:
            return
        time.sleep(opts.interval)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except KeyboardInterrupt:
        log("[退出] 已手动停止")

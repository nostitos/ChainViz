import argparse
import time
from typing import List, Dict, Any, Tuple

import httpx

from app.config import settings


def get_endpoints() -> List[Tuple[str, str]]:
    endpoints: List[Tuple[str, str]] = []
    # local
    if settings.mempool_local_enabled and settings.mempool_local_url not in settings.mempool_endpoint_disabled:
        endpoints.append(("local", settings.mempool_local_url))
    # additional
    for url in settings.mempool_additional_urls:
        if url in settings.mempool_endpoint_disabled:
            continue
        name = url.split("//", 1)[-1].split("/", 1)[0]
        endpoints.append((name, url))
    return endpoints


def fetch_json(client: httpx.Client, url: str, timeout: float) -> Any:
    r = client.get(url, timeout=timeout)
    r.raise_for_status()
    if r.status_code == 204:
        return None
    return r.json()


def probe_endpoint(
    client: httpx.Client,
    base_url: str,
    address: str,
    target: int,
    limit: int,
    timeout: float,
) -> Dict[str, Any]:
    summary_url = f"{base_url}/address/{address}"
    t0 = time.perf_counter()
    summary = None
    try:
        summary = fetch_json(client, summary_url, timeout)
    except Exception as exc:
        summary_err = str(exc)
    else:
        summary_err = None
    t_sum = time.perf_counter() - t0

    summary_tx_total = 0
    if isinstance(summary, dict):
        cs = summary.get("chain_stats", {}) or {}
        ms = summary.get("mempool_stats", {}) or {}
        summary_tx_total = int(cs.get("tx_count", 0)) + int(ms.get("tx_count", 0))

    collected: List[str] = []
    seen = set()
    offset = 0
    after_txid: str | None = None
    pages: List[Dict[str, Any]] = []
    consecutive_no_new = 0
    max_consecutive_no_new = 3

    while len(collected) < target:
        remaining = target - len(collected)
        page_limit = min(limit, remaining)
        if after_txid:
            url = f"{base_url}/address/{address}/txs?limit={page_limit}&after_txid={after_txid}"
        else:
            # First page: request by limit only (newest first)
            url = f"{base_url}/address/{address}/txs?limit={page_limit}"
        p0 = time.perf_counter()
        data = None
        err = None
        try:
            data = fetch_json(client, url, timeout)
        except Exception as exc:
            err = str(exc)
        latency = time.perf_counter() - p0

        page_size = len(data) if isinstance(data, list) else 0
        new_count = 0
        dups = 0
        txids: List[str] = []
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                txid = entry.get("txid")
                if not txid:
                    continue
                txids.append(txid)
                if txid in seen:
                    dups += 1
                else:
                    seen.add(txid)
                    collected.append(txid)
                    new_count += 1
        else:
            # Non-list or error
            pass

        pages.append(
            {
                "offset": offset,
                "limit": page_limit,
                "latency_s": round(latency, 3),
                "page_size": page_size,
                "new_unique": new_count,
                "duplicates": dups,
                "error": err,
                "txids": txids[:5],  # sample for readability
            }
        )

        # advance cursors
        if after_txid is None:
            offset += page_size
        # if we received any txs, update after_txid to last one to continue confirmed pagination
        if txids:
            after_txid = txids[-1]

        if new_count == 0:
            consecutive_no_new += 1
        else:
            consecutive_no_new = 0

        # stop if server is returning nothing new repeatedly
        if consecutive_no_new >= max_consecutive_no_new:
            break

        # stop if empty page
        if page_size == 0:
            break

        # stop if summary says fewer remaining (when available)
        if summary_tx_total and len(collected) >= min(summary_tx_total, target):
            break

        # hard safety for pathological cases
        if offset > 2000:
            break

    compact_mode = False
    if pages:
        # Heuristic: mostly page_size==10 while we always request 50
        nonzero_sizes = [p["page_size"] for p in pages if p["page_size"] > 0]
        if nonzero_sizes:
            ten_ratio = sum(1 for s in nonzero_sizes if s == 10) / len(nonzero_sizes)
            compact_mode = ten_ratio >= 0.8

    return {
        "summary_total": summary_tx_total,
        "summary_error": summary_err,
        "unique_collected": len(collected),
        "requests": len(pages),
        "pages": pages,
        "compact_mode": compact_mode,
        "sample_txids": collected[:10],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--address", required=True)
    parser.add_argument("--target", type=int, default=100)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--timeout", type=float, default=2.5)
    args = parser.parse_args()

    endpoints = get_endpoints()
    report_lines: List[str] = []
    report_lines.append("# Compact-mode Probe Report")
    report_lines.append("")
    report_lines.append(f"- Address: `{args.address}`")
    report_lines.append(f"- Target txids: {args.target}, Page limit requested: {args.limit}")
    report_lines.append("")
    report_lines.append("| Server | Summary total | Unique collected | Requests | Compact? | Notes |")
    report_lines.append("| --- | ---: | ---: | ---: | --- | --- |")

    headers = {
        "User-Agent": settings.mempool_http_user_agent,
        "Accept-Language": settings.mempool_http_accept_language,
    }
    with httpx.Client(headers=headers) as client:
        for name, base_url in endpoints:
            result = probe_endpoint(
                client,
                base_url=base_url,
                address=args.address,
                target=args.target,
                limit=args.limit,
                timeout=args.timeout,
            )
            notes = []
            if result["summary_error"]:
                notes.append("summary error")
            if any(p["error"] for p in result["pages"]):
                notes.append("page errors")
            if any(p["page_size"] == 0 for p in result["pages"]):
                notes.append("empty page")
            report_lines.append(
                f"| {name} | {result['summary_total']} | {result['unique_collected']} | {result['requests']} | "
                f"{'yes' if result['compact_mode'] else 'no'} | {', '.join(notes) or ''} |"
            )

            # Per-endpoint detail section
            report_lines.append("")
            report_lines.append(f"### {name}")
            report_lines.append("")
            report_lines.append(f"- Base URL: `{base_url}`")
            report_lines.append(f"- Sample txids: {', '.join(result['sample_txids']) or 'n/a'}")
            report_lines.append("")
            report_lines.append("Page log (first few):")
            for p in result["pages"][:8]:
                report_lines.append(
                    f"- offset={p['offset']} limit={p['limit']} size={p['page_size']} "
                    f"new={p['new_unique']} dup={p['duplicates']} t={p['latency_s']}s "
                    f"{'(err)' if p['error'] else ''} txids={p['txids']}"
                )
            report_lines.append("")

    # Write report
    # Write report relative to project root (backend/..)
    out_path = "../docs/compact-mode-report.md"
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(report_lines))
    except FileNotFoundError:
        # Fallback to current directory
        with open("compact-mode-report.md", "w", encoding="utf-8") as f:
            f.write("\n".join(report_lines))


if __name__ == "__main__":
    main()



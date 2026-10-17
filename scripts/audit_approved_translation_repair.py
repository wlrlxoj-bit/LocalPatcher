"""승인된 6개 매핑의 공식 원본 동일성·슬롯 경계를 읽기 전용으로 감사한다.

실행 파일을 실행하거나 파일·번역·DB를 수정하지 않는다. 출력은 민감 정보를
제외한 단일 JSON뿐이며, 실패 시 기존 승인본은 어떤 경우에도 변경하지 않는다.
"""

import argparse
import ast
import hashlib
import io
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from html.parser import HTMLParser

from translation_validation import option_text_is_publishable, parse_options

MAX_BYTES = 50 * 1024 * 1024
TARGETS = {2730: {"ko", "ja"}, 2731: {"ko", "ja", "de", "es"}}
EXPECTED_COUNTS = {2730: 21, 2731: 50}
EXPECTED_IDS = {2730: {10865, 10866}, 2731: {10859, 10860, 10861, 10862}}
EXPECTED_LANGUAGES = {10865: "ja", 10866: "ko", 10859: "de", 10860: "es", 10861: "ja", 10862: "ko"}
EXPECTED_POSTS = {2730: "/trainer/total-war-shogun-2-complete-edition-trainer",
                  2731: "/trainer/legend-of-heroes-three-kingdoms-trainer"}
FIXTURE = pathlib.Path(__file__).with_name("fixtures") / "approved-publication-repair-manifest.json"


class AuditBlocked(Exception):
    """고정 사유 코드와 원본 동일성의 미검사·불일치·일치 상태만 전달한다."""

    def __init__(self, reason, identity_matches=None, diagnostics=None):
        super().__init__(reason)
        self.identity_matches = identity_matches
        self.diagnostics = diagnostics


def _block(condition, code):
    if not condition:
        raise AuditBlocked(code)


def _path_bucket(path):
    """파일명이나 토큰을 보존하지 않고 알려진 경로 계열만 분류한다."""
    if path.startswith("/trainer/"):
        return "post"
    if path.startswith("/downloads/"):
        return "download_link"
    if path == "/download-trainer.php":
        return "dispatch"
    if path.startswith("/wp-content/uploads/trainer-files/"):
        return "trainer_member" if ".zip/" in path.lower() else "trainer_archive"
    if path.startswith("/wp-content/uploads/"):
        return "dated_asset"
    return "unknown"


def _asset_path(path):
    """공식 날짜별 자산과 관측된 ZIP/단일 EXE 경로만 판정한다."""
    leaf = r"[A-Za-z0-9_.() +,\-]+"
    date = r"\d{4}/(?:0[1-9]|1[0-2])"
    # 공백은 호출부가 %20 인코딩을 확인한 뒤 leaf에서만 허용한다.
    return bool(re.fullmatch(rf"/wp-content/uploads/{date}/{leaf}\.(?:zip|exe)", path, re.I)
                or re.fullmatch(rf"/wp-content/uploads/trainer-files/{date}/{leaf}\.zip(?:/{leaf}\.exe)?", path, re.I))


def official_url(url, kind="asset", *, allow_dispatch=False, stage="url_validation", hop=0):
    """HTTPS 공식 호스트와 관측된 명시 경로만 허용하고 %20은 파일 leaf에만 받는다."""
    diagnostics = {"stage": stage, "hop": hop, "host_is_official": False,
                   "path_bucket": "unknown", "rejection_subcode": "syntax"}

    def require(condition, subcode):
        if not condition:
            raise AuditBlocked("URL_REJECTED", diagnostics=dict(diagnostics, rejection_subcode=subcode))

    require(isinstance(url, str), "syntax")
    require(not re.search(r"[\x00-\x20\x7f\\]", url), "literal_character")
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        require(False, "syntax")
    diagnostics["host_is_official"] = parsed.netloc == "flingtrainer.com"
    diagnostics["path_bucket"] = _path_bucket(parsed.path)
    require(parsed.scheme == "https" and parsed.netloc == "flingtrainer.com", "origin")
    require(not parsed.fragment, "fragment")
    # 분리자·이중 인코딩·컨트롤 문자의 우회는 거부한다. 유일한 예외는 %20이다.
    require(not re.search(r"%(?!20)", parsed.path, re.I), "path_encoding")
    path = urllib.parse.unquote(parsed.path)
    require(".." not in path and not re.search(r"[\x00-\x1f\x7f\\%?#]", path), "path_character")
    if kind == "post":
        require(bool(re.fullmatch(r"/trainer/[a-z0-9-]+/?", path)) and not parsed.query, "post_path")
    elif path == "/download-trainer.php":
        require(allow_dispatch, "dispatch_requires_redirect")
        # 키 중복·추가 query·encoded separator·이중 decoding을 허용하지 않는다.
        require(parsed.query.startswith("path=") and "&" not in parsed.query
                and not re.search(r"%(?!20)", parsed.query, re.I), "dispatch_query")
        target = urllib.parse.unquote(parsed.query[len("path="):])
        require(".." not in target and _asset_path(target), "dispatch_path")
    else:
        require(not parsed.query, "unexpected_query")
        valid_download = bool(re.fullmatch(r"/downloads/[A-Za-z0-9_,.-]+/?", path))
        require(valid_download or _asset_path(path), "asset_path")
    return url


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_public(url, kind, opener=None, clock=time.monotonic):
    """자동 리디렉션·재시도 없이 각 홉 검증과 전체 시간·바이트 상한을 적용한다."""
    opener = opener or urllib.request.build_opener(_NoRedirect())
    deadline = clock() + 60
    stage = "post_fetch" if kind == "post" else "asset_fetch"

    def transport_require(condition, reason):
        if not condition:
            raise AuditBlocked(reason, diagnostics={
                "stage": stage, "hop": hop, "host_is_official": True,
                "path_bucket": _path_bucket(urllib.parse.urlsplit(url).path),
                "rejection_subcode": reason.lower(),
            })

    for hop in range(4):
        official_url(url, kind, allow_dispatch=hop > 0, stage=stage, hop=hop)
        remaining = deadline - clock()
        transport_require(remaining > 0, "HTTP_DEADLINE")
        request = urllib.request.Request(url, headers={"User-Agent": "LocalPatcher-ReadOnly-Audit/1.0", "Accept-Encoding": "identity"})
        try:
            response = opener.open(request, timeout=min(15, remaining))
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status = response.code
            if status in (301, 302, 303, 307, 308):
                transport_require(hop < 3, "HTTP_REDIRECT_LIMIT")
                location = response.headers.get("Location", "")
                transport_require(bool(location), "HTTP_REDIRECT_MISSING")
                url = urllib.parse.urljoin(url, location)
                continue
            transport_require(status == 200, "HTTP_FORBIDDEN" if status == 403 else "HTTP_RATE_LIMIT" if status == 429 else "HTTP_STATUS")
            length = response.headers.get("Content-Length")
            if length is not None:
                transport_require(length.isdigit() and int(length) <= MAX_BYTES, "HTTP_SIZE_LIMIT")
            output = bytearray()
            while True:
                transport_require(clock() < deadline, "HTTP_DEADLINE")
                chunk = response.read(min(65536, MAX_BYTES + 1 - len(output)))
                if not chunk:
                    break
                output.extend(chunk)
                transport_require(len(output) <= MAX_BYTES, "HTTP_SIZE_LIMIT")
            return bytes(output)
    raise AuditBlocked("HTTP_REDIRECT_LIMIT")


class _DownloadLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current = [dict(attrs).get("href", ""), ""]

    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            self.links.append(self.current)
            self.current = None


def select_download(html, post_url):
    """기존 수집기의 DOM 최신 순서를 유지하며 최신 지원 링크 하나만 선택한다."""
    parser = _DownloadLinks()
    parser.feed(html.decode("utf-8", errors="strict"))
    for href, label in parser.links:
        url = urllib.parse.urljoin(post_url, href)
        if not urllib.parse.urlsplit(url).path.startswith("/downloads/"):
            continue
        if re.search(r"\.rar(?:\s|$)", label, re.I):
            continue
        return official_url(url, stage="download_selection")
    raise AuditBlocked("NO_OFFICIAL_DOWNLOAD")


def unpack_asset(payload):
    """ZIP은 메모리에서 단일 EXE만 읽고 경로 탈출·암호화·압축 폭탄을 거부한다."""
    _block(0 < len(payload) <= MAX_BYTES, "ASSET_SIZE_LIMIT")
    if payload.startswith(b"MZ"):
        return payload
    _block(payload.startswith(b"PK\x03\x04"), "UNSUPPORTED_ARCHIVE")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        members = archive.infolist()
        _block(0 < len(members) <= 100, "ZIP_MEMBERS")
        total, candidates = 0, []
        for member in members:
            name = member.filename.replace("\\", "/")
            _block(not name.startswith("/") and not re.match(r"^[A-Za-z]:", name)
                   and ".." not in name.split("/") and "\x00" not in name, "ZIP_PATH")
            _block(not member.flag_bits & 1 and member.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "ZIP_FORMAT")
            _block((member.external_attr >> 16) & 0o170000 != 0o120000, "ZIP_SYMLINK")
            total += member.file_size
            _block(total <= MAX_BYTES and member.file_size <= max(1, member.compress_size) * 200, "ZIP_SIZE_LIMIT")
            if not member.is_dir() and name.lower().endswith(".exe"):
                candidates.append(member)
        _block(len(candidates) == 1, "ZIP_EXE_AMBIGUOUS")
        binary = archive.read(candidates[0])
        _block(binary.startswith(b"MZ"), "ASSET_NOT_PE")
        return binary


def load_scanner():
    """scraper의 순수 함수 두 개만 AST로 가져와 dotenv·외부 호출을 실행하지 않는다."""
    filename = pathlib.Path(__file__).with_name("scraper.py")
    module = ast.parse(filename.read_text(encoding="utf-8"))
    allowed = {"_safe_pe_data_ranges", "scan_cheat_string_offset"}
    nodes = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in allowed]
    _block(len(nodes) == 2 and {node.name for node in nodes} == allowed, "SCANNER_CONTRACT")
    for node in nodes:
        _block(not node.decorator_list and not node.args.defaults and not node.args.kw_defaults, "SCANNER_CONTRACT")
        _block(not any(isinstance(child, (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)) for child in ast.walk(node)), "SCANNER_CONTRACT")
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                function = child.func
                allowed_call = (isinstance(function, ast.Name) and function.id in {
                    "len", "range", "any", "min", "max", "option_text_is_publishable", "_safe_pe_data_ranges"})
                allowed_call = allowed_call or (isinstance(function, ast.Attribute)
                                                and function.attr in {"from_bytes", "find", "decode", "append"})
                _block(allowed_call, "SCANNER_CONTRACT")
    scope = {"option_text_is_publishable": option_text_is_publishable}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(filename), "exec"), scope)
    return scope["scan_cheat_string_offset"], scope["_safe_pe_data_ranges"]


def validate_manifest(manifest):
    """고정 대상·승인 상태·원본 다이제스트·용량 필드의 누락과 확장을 차단한다."""
    _block(isinstance(manifest, dict) and manifest.get("database_read_only") is True, "MANIFEST_SCHEMA")
    trainers, mappings = manifest.get("trainers"), manifest.get("mappings")
    _block(isinstance(trainers, list) and len(trainers) == 2 and isinstance(mappings, list) and len(mappings) == 6, "MANIFEST_TARGETS")
    _block({row.get("id") for row in trainers} == set(TARGETS), "MANIFEST_TARGETS")
    for trainer in trainers:
        ident = trainer["id"]
        _block(trainer.get("option_count") == EXPECTED_COUNTS[ident], "MANIFEST_COUNTS")
        _block(type(trainer.get("original_file_size")) is int and 0 < trainer["original_file_size"] <= MAX_BYTES, "MANIFEST_SIZE")
        _block(bool(re.fullmatch(r"[a-fA-F0-9]{64}", trainer.get("original_file_hash", ""))), "MANIFEST_HASH")
        official_url(trainer.get("fling_url"), "post")
        _block(urllib.parse.urlsplit(trainer["fling_url"]).path.rstrip("/") == EXPECTED_POSTS[ident], "MANIFEST_POST")
        rows = [row for row in mappings if row.get("trainer_id") == ident]
        _block({row.get("language_code") for row in rows} == TARGETS[ident]
               and {row.get("id") for row in rows} == EXPECTED_IDS[ident]
               and len(rows) == len(TARGETS[ident]), "MANIFEST_TARGETS")
        for row in rows:
            _block(row["language_code"] == EXPECTED_LANGUAGES[row["id"]], "MANIFEST_TARGETS")
            _block(row.get("is_approved") is True and row.get("translation_status") == "approved", "MANIFEST_APPROVAL")
            _block(row.get("encoding") in ("UTF-16LE", "ASCII"), "MANIFEST_ENCODING")
            _block(all(type(row.get(key)) is int and row[key] > 0 for key in ("offset_dec", "max_char_len", "original_chars")), "MANIFEST_BOUNDS")
            _block(row["original_chars"] <= row["max_char_len"] and row["max_char_len"] <= 65536, "MANIFEST_BOUNDS")
            _block(bool(re.fullmatch(r"[a-fA-F0-9]{32}", row.get("original_md5", ""))), "MANIFEST_HASH")
    return manifest


def audit_binary(binary, trainer, mappings, scanner=None):
    """파일 동일성 확인 뒤 전체 슬롯과 기존 매핑의 정확한 바이트 접두부를 대조한다."""
    identity = (len(binary) == trainer["original_file_size"]
                and hashlib.sha256(binary).hexdigest().lower() == trainer["original_file_hash"].lower())
    if not identity:
        raise AuditBlocked("SOURCE_IDENTITY_MISMATCH", identity_matches=False)
    try:
        return _audit_matching_binary(binary, trainer, mappings, scanner)
    except AuditBlocked as error:
        # 후속 옵션·접두부 검사가 실패해도 이미 확인한 파일 동일성은 잃지 않는다.
        error.identity_matches = True
        raise
    except Exception:
        raise AuditBlocked("AUDIT_INPUT_OR_TRANSPORT_ERROR", identity_matches=True) from None


def _audit_matching_binary(binary, trainer, mappings, scanner):
    """동일성이 확인된 바이트만 대상으로 순수 슬롯 감사를 수행한다."""
    scan, ranges = scanner or load_scanner()
    slot = scan(binary)
    _block(isinstance(slot, dict), "SAFE_SLOT_MISSING")
    encoding = slot.get("encoding")
    _block(encoding in ("UTF-16LE", "ASCII"), "SLOT_ENCODING")
    codec, width = ("utf-16-le", 2) if encoding == "UTF-16LE" else ("ascii", 1)
    text, start = slot["original_text"], slot["offset_dec"]
    raw = text.encode(codec, errors="strict")
    end = start + len(raw)
    _block(0 < len(raw) <= 65536 and slot["max_char_len"] * width == len(raw)
           and binary[start:end] == raw and binary[end:end + width] == b"\0" * width
           and any(left <= start < end and end + width <= right for left, right in ranges(binary)), "SLOT_BOUNDS")
    options = parse_options(text)
    keys = {re.sub(r"\s+", "", option[0]).casefold() for option in options}
    _block(option_text_is_publishable(text) and len(options) == trainer["option_count"]
           and len(keys) == len(options), "SOURCE_COVERAGE")
    checks = []
    for row in mappings:
        offset = row["offset_dec"]
        capacity = row["max_char_len"] * width
        _block(row["encoding"] == encoding and start <= offset < end
               and (offset - start) % width == 0 and offset + capacity <= end, "OLD_MAPPING_BOUNDS")
        # 같은 오프셋의 언어별 매핑은 허용하되 서로 다른 슬롯 경계는 넘지 않는다.
        _block(not any(offset < other["offset_dec"] < offset + capacity for other in mappings), "OLD_MAPPING_OVERLAP")
        prefix = binary[offset:end].decode(codec, errors="strict")[:row["original_chars"]]
        _block(len(prefix) == row["original_chars"] and hashlib.md5(prefix.encode("utf-8")).hexdigest().lower() == row["original_md5"].lower(), "OLD_SOURCE_DIGEST")
        old_options = parse_options(prefix)
        _block(len(old_options) == (44 if trainer["id"] == 2731 else 21)
               and option_text_is_publishable(prefix), "OLD_SOURCE_COVERAGE")
        checks.append({"mapping_id": row["id"], "offset": offset, "capacity_bytes": capacity,
                       "original_option_count": len(old_options), "prefix_matches": True})
    return {"status": "audit_passed", "identity_checked": True, "identity_matches": True, "source_option_count": len(options),
            "unique_hotkey_count": len(keys), "source_offset": start, "source_capacity_bytes": len(raw),
            "nul_terminated": True, "non_executable_data": True, "mappings": checks}


def run_audit(trainer_id, manifest, fetcher=fetch_public, scanner=None):
    """네트워크 전 고정 명세를 검증하고 공식 게시물·자산을 각각 한 번만 취득한다."""
    _block(type(trainer_id) is int and trainer_id in TARGETS, "TARGET_REJECTED")
    validate_manifest(manifest)
    trainer = next(row for row in manifest["trainers"] if row["id"] == trainer_id)
    mappings = [row for row in manifest["mappings"] if row["trainer_id"] == trainer_id]
    page = fetcher(trainer["fling_url"], "post")
    asset_url = select_download(page, trainer["fling_url"])
    binary = unpack_asset(fetcher(asset_url, "asset"))
    report = audit_binary(binary, trainer, mappings, scanner)
    report["trainer_id"] = trainer_id
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="고정 승인 매핑의 읽기 전용 원본 감사")
    parser.add_argument("--trainer-id", required=True, type=int, choices=tuple(TARGETS))
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(FIXTURE.read_text(encoding="utf-8"))
        report = run_audit(args.trainer_id, manifest)
        code = 0
    except AuditBlocked as error:
        reason = str(error)
        report = {"status": "blocked", "reason": reason, "trainer_id": args.trainer_id,
                  "identity_checked": error.identity_matches is not None,
                  "identity_matches": error.identity_matches}
        if error.diagnostics is not None:
            report.update(error.diagnostics)
        code = 1
    except Exception:
        # 라이브러리 예외에는 URL·응답·원문이 포함될 수 있으므로 절대 출력하지 않는다.
        report = {"status": "blocked", "reason": "AUDIT_INPUT_OR_TRANSPORT_ERROR", "trainer_id": args.trainer_id,
                  "identity_checked": False, "identity_matches": None}
        code = 1
    print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())

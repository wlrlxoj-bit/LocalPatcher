"""원본 감사 도구가 네트워크·바이너리 경계에서 닫힌 실패를 하는지 검증한다."""

import copy
import hashlib
import io
import json
import pathlib
import struct
import sys
import unittest
import urllib.error
import zipfile
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import audit_approved_translation_repair as audit


def synthetic_pe(text, flags=0x40000040, terminated=True):
    raw = text.encode("utf-16-le") + (b"\0\0" if terminated else b"xx")
    binary = bytearray(512 + len(raw))
    binary[:2] = b"MZ"
    struct.pack_into("<I", binary, 60, 64)
    binary[64:68] = b"PE\0\0"
    struct.pack_into("<H", binary, 70, 1)
    struct.pack_into("<H", binary, 84, 96)
    struct.pack_into("<H", binary, 88, 0x10B)
    struct.pack_into("<I", binary, 148, 512)
    binary[184:192] = b".rdata\0\0"
    struct.pack_into("<I", binary, 200, len(raw))
    struct.pack_into("<I", binary, 204, 512)
    struct.pack_into("<I", binary, 220, flags)
    binary[512:] = raw
    return bytes(binary)


def full_source(count):
    keys = ["Num 1"] + [f"F{i}" for i in range(1, 25)] + [f"Shift+F{i}" for i in range(1, 25)] + ["Ctrl+F1"]
    lines = [f"{key} - Option {i + 1}" for i, key in enumerate(keys[:count])]
    if count == 50:
        prefix = "\r\n".join(lines[:44]) + "\r\n"
        # 기존 4,000자 잘림 접두부와 8KB를 넘는 완전 슬롯을 모사한다.
        prefix += "Section " + " " * (4000 - len(prefix) - len("Section "))
        return prefix + "\r\n" + "\r\n".join(lines[44:])
    return "\r\n".join(lines)


def manifest_for_binary(binary, text, trainer_id=2731):
    manifest = json.loads(audit.FIXTURE.read_text(encoding="utf-8"))
    trainer = next(row for row in manifest["trainers"] if row["id"] == trainer_id)
    trainer["original_file_hash"] = hashlib.sha256(binary).hexdigest()
    trainer["original_file_size"] = len(binary)
    for row in manifest["mappings"]:
        if row["trainer_id"] == trainer_id:
            prefix = text[:4000] if trainer_id == 2731 else text
            row.update(offset_dec=512, max_char_len=len(prefix), original_chars=len(prefix),
                       original_md5=hashlib.md5(prefix.encode("utf-8")).hexdigest())
    return manifest, trainer, [row for row in manifest["mappings"] if row["trainer_id"] == trainer_id]


class AuditContractTests(unittest.TestCase):
    def test_fixed_manifest_has_only_six_approved_targets(self):
        manifest = json.loads(audit.FIXTURE.read_text(encoding="utf-8"))
        self.assertIs(audit.validate_manifest(manifest), manifest)
        self.assertEqual(len(manifest["mappings"]), 6)
        self.assertFalse({"original_text", "translated_text", "api_key", "token"} & set(json.dumps(manifest).split()))

    def test_invalid_targets_and_manifest_are_rejected_before_network(self):
        fetcher = Mock(side_effect=AssertionError("network must not run"))
        for target, manifest in ((9999, {}), (2731, {})):
            with self.assertRaises(audit.AuditBlocked):
                audit.run_audit(target, manifest, fetcher)
        fetcher.assert_not_called()

    def test_identity_failure_never_scans(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text)
        scan = Mock(side_effect=AssertionError("must not scan"))
        with self.assertRaisesRegex(audit.AuditBlocked, "SOURCE_IDENTITY_MISMATCH"):
            audit.audit_binary(binary + b"x", trainer, mappings, (scan, scan))
        scan.assert_not_called()

    def test_fifty_complete_options_and_old_forty_four_prefix(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        manifest, trainer, mappings = manifest_for_binary(binary, text)
        audit.validate_manifest(manifest)
        report = audit.audit_binary(binary, trainer, mappings)
        self.assertEqual(report["source_option_count"], 50)
        self.assertGreater(report["source_capacity_bytes"], 8000)
        self.assertEqual({row["original_option_count"] for row in report["mappings"]}, {44})
        self.assertNotIn(text, json.dumps(report))

    def test_twenty_one_complete_options(self):
        text = full_source(21)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text, 2730)
        self.assertEqual(audit.audit_binary(binary, trainer, mappings)["source_option_count"], 21)

    def test_old_prefix_digest_is_exact_without_newline_normalization(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text)
        mappings[0]["original_md5"] = hashlib.md5(text[:4000].replace("\r\n", "\n").encode()).hexdigest()
        with self.assertRaisesRegex(audit.AuditBlocked, "OLD_SOURCE_DIGEST"):
            audit.audit_binary(binary, trainer, mappings)

    def test_offset_capacity_and_other_mapping_boundaries(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text)
        for field, value, reason in (("offset_dec", 513, "OLD_MAPPING_BOUNDS"), ("max_char_len", 65536, "OLD_MAPPING_BOUNDS")):
            changed = copy.deepcopy(mappings)
            changed[0][field] = value
            with self.assertRaisesRegex(audit.AuditBlocked, reason):
                audit.audit_binary(binary, trainer, changed)
        changed = copy.deepcopy(mappings)
        changed[1]["offset_dec"] += 2
        with self.assertRaisesRegex(audit.AuditBlocked, "OLD_MAPPING_OVERLAP"):
            audit.audit_binary(binary, trainer, changed)

    def test_executable_missing_nul_duplicate_and_incomplete_are_blocked(self):
        for text, flags, terminated in ((full_source(50), 0x60000060, True),
                                        (full_source(50), 0x40000040, False),
                                        (full_source(50) + "\r\nNum 1 - Duplicate", 0x40000040, True),
                                        (full_source(21), 0x40000040, True)):
            binary = synthetic_pe(text, flags, terminated)
            _, trainer, mappings = manifest_for_binary(binary, text)
            with self.assertRaises(audit.AuditBlocked):
                audit.audit_binary(binary, trainer, mappings)

    def test_unsafe_urls_and_redirects(self):
        for url in ("http://flingtrainer.com/downloads/x", "https://other.test/downloads/x",
                    "https://flingtrainer.com.evil/downloads/x", "https://flingtrainer.com:443/downloads/x",
                    "https://flingtrainer.com/downloads/../x", "https://flingtrainer.com/downloads/x?token=a",
                    "https://flingtrainer.com/download-trainer.php?path=/etc/passwd"):
            with self.assertRaises(audit.AuditBlocked):
                audit.official_url(url)
        response = urllib.error.HTTPError("https://flingtrainer.com/downloads/x", 302, "", {"Location": "https://evil.test/x"}, io.BytesIO())
        opener = Mock()
        opener.open.side_effect = response
        with self.assertRaises(audit.AuditBlocked):
            audit.fetch_public("https://flingtrainer.com/downloads/x", "asset", opener)
        self.assertEqual(opener.open.call_count, 1)

    def test_observed_archive_and_encoded_space_member_routes(self):
        prefix = "https://flingtrainer.com/wp-content/uploads/trainer-files/2025/04/"
        archive = prefix + "Legend.Of.Heroes.Three.Kingdoms.Plus.50.Trainer-FLiNG.zip"
        member = archive + "/Legend%20Of%20Heroes%20Three%20Kingdoms%20Trainer.exe"
        self.assertEqual(audit.official_url(archive), archive)
        self.assertEqual(audit.official_url(member), member)
        direct = "https://flingtrainer.com/wp-content/uploads/2025/04/Public%20Trainer.exe"
        self.assertEqual(audit.official_url(direct), direct)

    def test_strict_dispatch_requires_actual_redirect_and_one_safe_path(self):
        target = "/wp-content/uploads/trainer-files/2025/04/Legend.zip/Legend%20Trainer.exe"
        dispatch = "https://flingtrainer.com/download-trainer.php?path=" + target
        with self.assertRaisesRegex(audit.AuditBlocked, "URL_REJECTED"):
            audit.official_url(dispatch)
        self.assertEqual(audit.official_url(dispatch, allow_dispatch=True), dispatch)
        for query in ("path=" + target + "&path=" + target, "path=" + target + "&x=1",
                      "x=1&path=" + target, "path=https://other.test/trainer.exe",
                      "path=/etc/passwd"):
            with self.assertRaises(audit.AuditBlocked):
                audit.official_url("https://flingtrainer.com/download-trainer.php?" + query, allow_dispatch=True)
        first = urllib.error.HTTPError("https://flingtrainer.com/downloads/x", 302, "", {"Location": dispatch}, io.BytesIO())
        final = io.BytesIO(b"MZpublic")
        final.code, final.headers = 200, {}
        opener = Mock()
        opener.open.side_effect = [first, final]
        self.assertEqual(audit.fetch_public("https://flingtrainer.com/downloads/x", "asset", opener), b"MZpublic")
        self.assertEqual(opener.open.call_count, 2)

    def test_dispatch_standard_query_decodes_exactly_once(self):
        base = "https://flingtrainer.com/download-trainer.php?path="
        target = "/wp-content/uploads/trainer-files/2025/04/Legend.zip/Legend Trainer.exe"
        for encoded in (audit.urllib.parse.quote(target, safe=""),
                        audit.urllib.parse.quote_plus(target, safe="")):
            url = base + encoded
            self.assertEqual(audit.official_url(url, allow_dispatch=True), url)
        # query의 +는 공백으로, 경로 자체의 +는 문자 그대로 해석된다.
        literal_plus = "https://flingtrainer.com/wp-content/uploads/2025/04/Trainer+Plus.exe"
        self.assertEqual(audit.official_url(literal_plus), literal_plus)
        plus_query = base + audit.urllib.parse.quote("/wp-content/uploads/2025/04/Trainer+Plus.exe", safe="")
        self.assertEqual(audit.official_url(plus_query, allow_dispatch=True), plus_query)
        # decode 후 공백이 디렉터리에 생기면 leaf 공백과 달리 거부한다.
        with self.assertRaises(audit.AuditBlocked):
            audit.official_url(base + "/wp-content/uploads/2025+/04/Trainer.exe", allow_dispatch=True)

    def test_dispatch_query_rejection_subcodes_are_specific_and_sanitized(self):
        base = "https://flingtrainer.com/download-trainer.php?"
        cases = (
            ("path=%GG", "dispatch_query_encoding"),
            ("path=%2", "dispatch_query_encoding"),
            ("path", "dispatch_query_parse"),
            ("path=%FF", "dispatch_query_parse"),
            ("other=value", "dispatch_keys"),
            ("path=/x&other=value", "dispatch_keys"),
            ("path=/x&path=/x", "dispatch_path_count"),
            ("path=", "dispatch_blank"),
            ("path=%252Fwp-content/uploads/2025/04/Trainer.exe", "dispatch_decoded_encoding"),
            ("path=/wp-content/uploads/2025/04/Trainer%00.exe", "dispatch_decoded_character"),
            ("path=/wp-content/uploads/2025/04/Trainer%23fragment.exe", "dispatch_decoded_character"),
            ("path=/wp-content/uploads/2025/04/Trainer%3Fquery.exe", "dispatch_decoded_character"),
            ("path=/wp-content/uploads/2025/04/%2E%2E/Trainer.exe", "dispatch_decoded_character"),
            ("path=/wp-content/uploads/2025/04/Trainer%5C.exe", "dispatch_decoded_character"),
            ("path=https%3A%2F%2Fother.test/trainer.exe", "dispatch_asset_path"),
            ("path=/wp-content/uploads/2025/04/Trainer%2FExtra.exe", "dispatch_asset_path"),
        )
        for query, subcode in cases:
            with self.assertRaises(audit.AuditBlocked) as caught:
                audit.official_url(base + query, allow_dispatch=True, stage="asset_fetch", hop=1)
            diagnostics = caught.exception.diagnostics
            self.assertEqual(diagnostics, {
                "stage": "asset_fetch", "hop": 1, "host_is_official": True,
                "path_bucket": "dispatch", "rejection_subcode": subcode,
            })
            # 'path' 입력과 고정 키 'path_bucket'의 문자열 충돌을 피한다.
            # 키·값은 위에서 전부 고정하고 입력 원문은 값에도 남지 않아야 한다.
            self.assertNotIn(query, json.dumps(list(diagnostics.values())))
        for url in (base + "path=/wp-content/uploads/2025/04/Trainer literal.exe",
                    base + "path=/wp-content/uploads/2025/04/Trainer.exe#fragment"):
            with self.assertRaises(audit.AuditBlocked):
                audit.official_url(url, allow_dispatch=True)

    def test_asset_path_bypasses_are_rejected(self):
        prefix = "https://flingtrainer.com/wp-content/uploads/trainer-files/2025/04/"
        for suffix in ("Legend.zip/Trainer%2f.exe", "Legend.zip/Trainer%5C.exe",
                       "Legend.zip/Trainer%00.exe", "Legend.zip/Trainer%252f.exe",
                       "Legend.zip/Trainer%09.exe", "Legend.zip/../Trainer.exe",
                       "Legend.zip/%2e%2e/Trainer.exe", "Legend.zip/nested/Trainer.exe",
                       "Legend.zip/Trainer literal.exe", "Legend.zip/Trainer.exe?x=1",
                       "Legend.rar", "Legend.exe/Trainer.exe", "Legend.zip/Trainer.dll"):
            with self.assertRaises(audit.AuditBlocked):
                audit.official_url(prefix + suffix)
        for url in ("https://user@flingtrainer.com/wp-content/uploads/2025/04/Trainer.exe",
                    "https://flingtrainer.com:443/wp-content/uploads/2025/04/Trainer.exe",
                    "https://other.test/wp-content/uploads/2025/04/Trainer.exe",
                    "https://flingtrainer.com/wp-content/uploads/trainer-files/2025%20/04/Trainer.zip",
                    "https://flingtrainer.com/wp-content/uploads/2025/04/Trainer.exe#fragment",
                    "https://flingtrainer.com/wp-content/uploads/2025/04/Trainer\n.exe"):
            with self.assertRaises(audit.AuditBlocked):
                audit.official_url(url)

    def test_url_rejection_report_has_only_sanitized_fixed_diagnostics(self):
        sensitive_url = "https://flingtrainer.com/wp-content/uploads/trainer-files/2025/04/PRIVATE.zip/SECRET%2f.exe"
        output = io.StringIO()
        with patch.object(audit, "run_audit", side_effect=lambda *args: audit.official_url(
                sensitive_url, stage="asset_fetch", hop=2)), redirect_stdout(output):
            self.assertEqual(audit.main(["--trainer-id", "2731"]), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["stage"], "asset_fetch")
        self.assertEqual(report["hop"], 2)
        self.assertIs(report["host_is_official"], True)
        self.assertEqual(report["path_bucket"], "trainer_member")
        self.assertEqual(report["rejection_subcode"], "path_encoding")
        self.assertNotIn("PRIVATE", output.getvalue())
        self.assertNotIn("SECRET", output.getvalue())
        self.assertNotIn(sensitive_url, output.getvalue())

    def test_403_and_429_have_no_retry(self):
        for status in (403, 429):
            opener = Mock()
            opener.open.side_effect = urllib.error.HTTPError("https://flingtrainer.com/downloads/x", status, "secret URL", {}, io.BytesIO())
            with self.assertRaises(audit.AuditBlocked):
                audit.fetch_public("https://flingtrainer.com/downloads/x", "asset", opener)
            self.assertEqual(opener.open.call_count, 1)

    def test_archive_ambiguous_paths_bombs_and_rar_are_rejected(self):
        for names, content in ((["a.exe", "b.exe"], b"MZx"), (["../a.exe"], b"MZx"), (["a.exe"], b"MZ" + b"0" * 100000)):
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name in names:
                    archive.writestr(name, content)
            with self.assertRaises(audit.AuditBlocked):
                audit.unpack_asset(output.getvalue())
        with self.assertRaises(audit.AuditBlocked):
            audit.unpack_asset(b"Rar!\x1a\x07")

    def test_single_zip_is_in_memory_only(self):
        binary = synthetic_pe(full_source(21))
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("trainer.exe", binary)
            archive.writestr("readme.txt", b"public")
        self.assertEqual(audit.unpack_asset(output.getvalue()), binary)

    def test_main_never_exposes_exception_or_digest(self):
        output = io.StringIO()
        with patch.object(audit, "run_audit", side_effect=RuntimeError("secret token source text")), redirect_stdout(output):
            self.assertEqual(audit.main(["--trainer-id", "2731"]), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["reason"], "AUDIT_INPUT_OR_TRANSPORT_ERROR")
        self.assertNotIn("secret", output.getvalue())
        self.assertFalse(report["identity_checked"])
        self.assertIsNone(report["identity_matches"])

    def test_main_preserves_checked_identity_after_coverage_digest_and_bounds_failure(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text)
        changed_count = dict(trainer, option_count=49)
        changed_digest = copy.deepcopy(mappings)
        changed_digest[0]["original_md5"] = "0" * 32
        changed_bounds = copy.deepcopy(mappings)
        changed_bounds[0]["max_char_len"] = 65536
        for chosen_trainer, chosen_mappings, reason in (
                (changed_count, mappings, "SOURCE_COVERAGE"),
                (trainer, changed_digest, "OLD_SOURCE_DIGEST"),
                (trainer, changed_bounds, "OLD_MAPPING_BOUNDS")):
            output = io.StringIO()
            def run_checked(*args):
                return audit.audit_binary(binary, chosen_trainer, chosen_mappings)
            with patch.object(audit, "run_audit", side_effect=run_checked), redirect_stdout(output):
                self.assertEqual(audit.main(["--trainer-id", "2731"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["reason"], reason)
            self.assertTrue(report["identity_checked"])
            self.assertIs(report["identity_matches"], True)

    def test_main_identity_is_null_before_check_false_on_mismatch_and_true_on_success(self):
        text = full_source(50)
        binary = synthetic_pe(text)
        _, trainer, mappings = manifest_for_binary(binary, text)
        cases = (
            (lambda *args: (_ for _ in ()).throw(audit.AuditBlocked("HTTP_FORBIDDEN")), None, 1),
            (lambda *args: audit.audit_binary(binary + b"x", trainer, mappings), False, 1),
            (lambda *args: audit.audit_binary(binary, trainer, mappings), True, 0),
        )
        for handler, identity, exit_code in cases:
            output = io.StringIO()
            with patch.object(audit, "run_audit", side_effect=handler), redirect_stdout(output):
                self.assertEqual(audit.main(["--trainer-id", "2731"]), exit_code)
            report = json.loads(output.getvalue())
            self.assertIs(report["identity_matches"], identity)
            self.assertEqual(report["identity_checked"], identity is not None)

    def test_scanner_debug_print_is_rejected_before_execution(self):
        source = ('def _safe_pe_data_ranges(exe_bytes: bytes):\n'
                  '    print("secret source text")\n    return []\n'
                  'def scan_cheat_string_offset(exe_bytes: bytes):\n    return None\n')
        output = io.StringIO()
        with patch.object(pathlib.Path, "read_text", return_value=source), redirect_stdout(output):
            with self.assertRaisesRegex(audit.AuditBlocked, "SCANNER_CONTRACT"):
                audit.load_scanner()
        self.assertEqual(output.getvalue(), "")

    def test_no_provider_database_or_write_imports(self):
        source = pathlib.Path(audit.__file__).read_text(encoding="utf-8")
        tree = audit.ast.parse(source)
        imports = {node.names[0].name for node in audit.ast.walk(tree) if isinstance(node, audit.ast.Import)}
        self.assertFalse(imports & {"scraper", "dotenv", "supabase", "openai", "google", "subprocess"})
        self.assertNotIn("write_bytes(", source)
        self.assertNotIn("write_text(", source)
        self.assertNotIn(".extract(", source)
        self.assertNotIn(".extractall(", source)


if __name__ == "__main__":
    unittest.main()

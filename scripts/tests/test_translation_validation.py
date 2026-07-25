import hashlib
import io
import json
import pathlib
import sys
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from translation_validation import (
    SaveOutcome,
    ValidationResult,
    _log_save_error,
    is_option_candidate,
    parse_options,
    save_validated_draft,
    validate_translation,
)


def fixture(size=1024):
    data = bytearray(size)
    data[:2] = b"MZ"
    return bytes(data)


class ValidationTests(unittest.TestCase):
    def check(self, **overrides):
        binary = overrides.pop("binary", fixture())
        args = dict(
            binary=binary,
            expected_sha256=hashlib.sha256(binary).hexdigest(),
            expected_size=len(binary),
            text_section=(64, 128),
            offset=256,
            max_char_len=100,
            encoding="UTF-16LE",
            original_text="Num 1 - Infinite Health",
            translated_text="Num 1 - 무한 체력",
            option_count=1,
            language_code="ko",
        )
        args.update(overrides)
        return validate_translation(**args)

    def test_utf16_pass(self):
        self.assertTrue(self.check().ok)

    def test_display_plus_count_does_not_block_actual_one_to_one(self):
        result = self.check(option_count=35)
        self.assertTrue(result.ok)
        self.assertEqual(result.counts["display_option_count"], 35)
        self.assertEqual(result.counts["source_patchable_count"], 1)

    def test_actual_option_mismatch_is_rejected(self):
        result = self.check(
            original_text="Num 1 - Infinite Health\nNum 2 - Infinite Ammo",
            translated_text="Num 1 - 무한 체력",
            option_count=35,
        )
        self.assertIn("TRANSLATED_OPTION_COUNT_MISMATCH", result.codes)

    def test_hotkey_prefix_and_delimiter_must_match(self):
        result = self.check(translated_text="Ctrl+Num 1: 무한 체력")
        self.assertIn("HOTKEY_FORMAT_MISMATCH", result.codes)

    def test_supported_delimiters_parse_exactly(self):
        text = (
            "Num 1 -> A\nNum 2 → B\nNum 3 - C\n"
            "Num 4 : D\nNum 5 – E\nNum 6 — F"
        )
        parsed = parse_options(text)
        self.assertEqual(len(parsed), 6)
        self.assertEqual([part[1].strip() for part in parsed], ["->", "→", "-", ":", "–", "—"])

    def test_missing_or_malformed_option_is_rejected(self):
        missing = self.check(
            original_text="Num 1 - A\nNum 2 – B",
            translated_text="Num 1 - 가",
        )
        malformed = self.check(
            original_text="Num 1 -> A",
            translated_text="Num 1 = 가",
        )
        self.assertIn("TRANSLATED_OPTION_COUNT_MISMATCH", missing.codes)
        self.assertIn("TRANSLATED_OPTION_COUNT_MISMATCH", malformed.codes)

    def test_single_key_candidates_with_invalid_delimiter_are_rejected(self):
        for invalid_line in ("Q = Infinite Health", "0 = Infinite Health",
                             "[ = Infinite Health", "] = Infinite Health"):
            with self.subTest(invalid_line=invalid_line):
                self.assertTrue(is_option_candidate(invalid_line))
                result = self.check(
                    translated_text=f"Num 1 - 무한 체력\n{invalid_line}",
                )
                self.assertIn("TRANSLATED_OPTION_PARSE_FAILED", result.codes)
                source_result = self.check(
                    original_text=f"Num 1 - Infinite Health\n{invalid_line}",
                )
                self.assertIn("SOURCE_OPTION_PARSE_FAILED", source_result.codes)

    def test_normal_header_is_not_an_option_candidate(self):
        self.assertFalse(is_option_candidate("Trainer Options"))
        result = self.check(
            original_text="Trainer Options\nNum 1 - Infinite Health",
            translated_text="트레이너 옵션\nNum 1 - 무한 체력",
        )
        self.assertNotIn("SOURCE_OPTION_PARSE_FAILED", result.codes)
        self.assertNotIn("TRANSLATED_OPTION_PARSE_FAILED", result.codes)

    def test_ascii_rejects_non_ascii(self):
        self.assertIn("ENCODING_ERROR", self.check(encoding="ASCII", max_char_len=8).codes)

    def test_same_source(self):
        self.assertIn("SAME_AS_SOURCE", self.check(translated_text="Num 1 - Infinite Health").codes)

    def test_ai_meta(self):
        self.assertIn(
            "AI_META_TEXT",
            self.check(translated_text="Sure, here is the translation: Num 1 - 무한 체력").codes,
        )

    def test_text_overlap(self):
        self.assertIn("TEXT_SECTION_OVERLAP", self.check(offset=80).codes)

    def test_out_of_range(self):
        self.assertIn("OFFSET_OUT_OF_RANGE", self.check(offset=1000).codes)


class FakeQuery:
    def __init__(self, store, row_count=1):
        self.store, self.row_count = store, row_count
    def update(self, values):
        self.store["update"] = values
        return self
    def eq(self, key, value):
        self.store.setdefault("filters", []).append((key, value))
        return self
    def select(self, columns):
        self.store["select"] = columns
        return self
    def execute(self):
        status = self.store.get("update", {}).get("translation_status", "approved")
        approved = self.store.get("update", {}).get("is_approved", True)
        rows = [
            {"id": index + 1, "is_approved": approved, "translation_status": status}
            for index in range(self.row_count)
        ]
        return type("R", (), {"data": rows})()


class FakeDb:
    def __init__(self, saved=True, row_count=1):
        self.saved, self.row_count, self.store = saved, row_count, {}
    def rpc(self, _name, _payload):
        return type(
            "Q", (), {
                "execute": lambda _: type(
                    "R", (), {"data": {"results": [{"saved": self.saved}]}}
                )()
            }
        )()
    def table(self, _name):
        return FakeQuery(self.store, self.row_count)


class FailingDb(FakeDb):
    def rpc(self, _name, _payload):
        raise RuntimeError("db unavailable")


class PersistenceTests(unittest.TestCase):
    mapping = {"trainer_id": 1, "language_code": "ko", "offset_dec": 10}

    def test_approved_preservation(self):
        db = FakeDb(False)
        outcome = save_validated_draft(
            db, mapping=self.mapping, validation=ValidationResult(True)
        )
        self.assertEqual(outcome, SaveOutcome.PRESERVED)
        self.assertNotIn("update", db.store)

    def test_locale_independence_and_pending_promotion(self):
        ko, ja = FakeDb(), FakeDb()
        self.assertEqual(
            save_validated_draft(ko, mapping=self.mapping, validation=ValidationResult(True)),
            SaveOutcome.APPROVED,
        )
        self.assertEqual(
            save_validated_draft(
                ja,
                mapping={**self.mapping, "language_code": "ja"},
                validation=ValidationResult(False),
            ),
            SaveOutcome.REJECTED,
        )
        self.assertEqual(ko.store["update"]["translation_status"], "approved")
        self.assertEqual(ja.store["update"]["translation_status"], "rejected")
        self.assertIn(("is_approved", False), ko.store["filters"])

    def test_db_error_is_distinct(self):
        self.assertEqual(
            save_validated_draft(
                FailingDb(), mapping=self.mapping, validation=ValidationResult(True)
            ),
            SaveOutcome.DB_ERROR,
        )

    def test_zero_or_multiple_selected_rows_are_db_errors(self):
        for row_count in (0, 2):
            with self.subTest(row_count=row_count):
                self.assertEqual(
                    save_validated_draft(
                        FakeDb(row_count=row_count),
                        mapping=self.mapping,
                        validation=ValidationResult(True),
                    ),
                    SaveOutcome.DB_ERROR,
                )

    def test_api_error_log_contains_only_safe_fields(self):
        APIError = type("APIError", (Exception,), {})
        error = APIError({
            "code": "23505",
            "message": "token=DO_NOT_LOG_MESSAGE",
            "details": "https://private.example/project",
            "hint": "Bearer DO_NOT_LOG_BEARER",
            "secret": "DO_NOT_LOG_THIS",
            "url": "https://private.example/project",
            "payload": {"token": "ALSO_SECRET"},
        })
        output = io.StringIO()
        with redirect_stdout(output):
            _log_save_error(self.mapping, error)
        line = output.getvalue().strip()
        event = json.loads(line)
        self.assertEqual(event["trainer_id"], 1)
        self.assertEqual(event["locale"], "ko")
        self.assertEqual(event["offset"], 10)
        self.assertEqual(event["exception_type"], "APIError")
        self.assertEqual(event["code"], "23505")
        self.assertNotIn("message", event)
        self.assertNotIn("details", event)
        self.assertNotIn("hint", event)
        self.assertNotIn("DO_NOT_LOG_THIS", line)
        self.assertNotIn("DO_NOT_LOG_MESSAGE", line)
        self.assertNotIn("DO_NOT_LOG_BEARER", line)
        self.assertNotIn("ALSO_SECRET", line)
        self.assertNotIn("private.example", line)

    def test_api_error_attributes_and_general_exception_are_supported(self):
        APIError = type("APIError", (Exception,), {})
        api_error = APIError("opaque-secret")
        api_error.code = "PGRST116"
        api_error.message = "row count mismatch"
        api_output = io.StringIO()
        with redirect_stdout(api_output):
            _log_save_error(self.mapping, api_error)
        api_event = json.loads(api_output.getvalue())
        self.assertEqual(api_event["code"], "PGRST116")
        self.assertNotIn("opaque-secret", api_output.getvalue())

        general_output = io.StringIO()
        with redirect_stdout(general_output):
            _log_save_error(self.mapping, RuntimeError("DO_NOT_LOG_GENERAL"))
        general_event = json.loads(general_output.getvalue())
        self.assertEqual(
            set(general_event),
            {"event", "trainer_id", "locale", "offset", "exception_type"},
        )
        self.assertNotIn("DO_NOT_LOG_GENERAL", general_output.getvalue())

    def test_malicious_api_error_code_is_omitted(self):
        APIError = type("APIError", (Exception,), {})
        error = APIError({
            "code": "23505\r\nBearer DO_NOT_LOG_CODE",
            "message": "DO_NOT_LOG_MESSAGE",
        })
        output = io.StringIO()
        with redirect_stdout(output):
            _log_save_error(self.mapping, error)
        event = json.loads(output.getvalue())
        self.assertNotIn("code", event)
        self.assertNotIn("DO_NOT_LOG_CODE", output.getvalue())
        self.assertNotIn("DO_NOT_LOG_MESSAGE", output.getvalue())


if __name__ == "__main__":
    unittest.main()

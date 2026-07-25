import hashlib
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from translation_validation import SaveOutcome, ValidationIssue, ValidationResult, save_validated_draft, validate_translation


def fixture(size=1024):
    data = bytearray(size)
    data[:2] = b"MZ"
    return bytes(data)


class ValidationTests(unittest.TestCase):
    def check(self, **overrides):
        binary = overrides.pop("binary", fixture())
        args = dict(binary=binary, expected_sha256=hashlib.sha256(binary).hexdigest(),
                    expected_size=len(binary), text_section=(64, 128), offset=256,
                    max_char_len=80, encoding="UTF-16LE",
                    original_text="Num 1 - Infinite Health",
                    translated_text="Num 1 - 무한 체력", option_count=1, language_code="ko")
        args.update(overrides)
        return validate_translation(**args)

    def test_utf16_pass(self): self.assertTrue(self.check().ok)
    def test_ascii_rejects_non_ascii(self): self.assertIn("ENCODING_ERROR", self.check(encoding="ASCII", max_char_len=8).codes)
    def test_line_hotkey_mismatch(self): self.assertIn("TRANSLATED_OPTION_COUNT_MISMATCH", self.check(translated_text="무한 체력").codes)
    def test_same_source(self): self.assertIn("SAME_AS_SOURCE", self.check(translated_text="Num 1 - Infinite Health").codes)
    def test_ai_meta(self): self.assertIn("AI_META_TEXT", self.check(translated_text="Sure, here is the translation: Num 1 - 무한 체력").codes)
    def test_text_overlap(self): self.assertIn("TEXT_SECTION_OVERLAP", self.check(offset=80).codes)
    def test_out_of_range(self): self.assertIn("OFFSET_OUT_OF_RANGE", self.check(offset=1000).codes)


class FakeQuery:
    def __init__(self, store): self.store = store
    def update(self, values): self.store["update"] = values; return self
    def eq(self, key, value): self.store.setdefault("filters", []).append((key, value)); return self
    def select(self, columns): return self
    def execute(self): return type("R", (), {"data": [{"id": 1}]})()


class FakeDb:
    def __init__(self, saved=True): self.saved, self.store = saved, {}
    def rpc(self, name, payload):
        return type("Q", (), {"execute": lambda _: type("R", (), {"data": {"results": [{"saved": self.saved}]}})()})()
    def table(self, name): return FakeQuery(self.store)


class FailingDb(FakeDb):
    def rpc(self, name, payload):
        raise RuntimeError("db unavailable")


class PersistenceTests(unittest.TestCase):
    mapping = {"trainer_id": 1, "language_code": "ko", "offset_dec": 10}
    def test_approved_preservation(self):
        db = FakeDb(False)
        self.assertEqual(save_validated_draft(db, mapping=self.mapping, validation=ValidationResult(True)), SaveOutcome.PRESERVED)
        self.assertNotIn("update", db.store)
    def test_locale_independence_and_pending_promotion(self):
        ko, ja = FakeDb(), FakeDb()
        self.assertEqual(save_validated_draft(ko, mapping=self.mapping, validation=ValidationResult(True)), SaveOutcome.APPROVED)
        self.assertEqual(save_validated_draft(ja, mapping={**self.mapping, "language_code": "ja"}, validation=ValidationResult(False)), SaveOutcome.REJECTED)
        self.assertEqual(ko.store["update"]["translation_status"], "approved")
        self.assertEqual(ja.store["update"]["translation_status"], "rejected")
        self.assertIn(("is_approved", False), ko.store["filters"])

    def test_count_mismatch_is_rejected(self):
        db = FakeDb()
        result = ValidationResult(False, [ValidationIssue("SOURCE_OPTION_COUNT_MISMATCH", "count")])
        self.assertEqual(save_validated_draft(db, mapping=self.mapping, validation=result), SaveOutcome.REJECTED)

    def test_db_error_is_distinct(self):
        self.assertEqual(
            save_validated_draft(FailingDb(), mapping=self.mapping, validation=ValidationResult(True)),
            SaveOutcome.DB_ERROR,
        )

    def test_hotkey_variants(self):
        binary = fixture()
        result = validate_translation(
            binary=binary, expected_sha256=hashlib.sha256(binary).hexdigest(),
            expected_size=len(binary), text_section=(64, 128), offset=256,
            max_char_len=100, encoding="UTF-16LE",
            original_text="Ctrl + Shift + F12 – Infinite Health\nNumPad * : Infinite Ammo\nPageUp - Super Speed",
            translated_text="Ctrl + Shift + F12 – 무한 체력\nNumPad * : 무한 탄약\nPageUp - 초고속",
            option_count=3, language_code="ko")
        self.assertTrue(result.ok, result.codes)


if __name__ == "__main__":
    unittest.main()

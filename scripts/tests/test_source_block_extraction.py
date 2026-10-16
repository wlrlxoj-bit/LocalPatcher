"""외부 파일 실행 없이 합성 PE 데이터에서 슬롯 경계와 공개 품질을 검증한다."""
import ast
import pathlib
import sys
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from translation_validation import option_text_is_publishable


def scanner():
    module = ast.parse((SCRIPTS / "scraper.py").read_text(encoding="utf-8"))
    nodes = [node for node in module.body if isinstance(node, ast.FunctionDef)
             and node.name in {"_safe_pe_data_ranges", "scan_cheat_string_offset"}]
    scope = {"option_text_is_publishable": option_text_is_publishable}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "scraper.py", "exec"), scope)
    return scope["scan_cheat_string_offset"]


def pe_fixture(text, *, terminate=True, flags=0x40000040, extra=32):
    """PE32 헤더와 데이터 한 섹션만 가진 비실행 합성 입력을 만든다."""
    raw = text.encode("utf-16-le") if isinstance(text, str) else text
    raw += b"\0\0" if terminate else b""
    data = bytearray(512 + len(raw) + extra)
    data[:2] = b"MZ"
    data[60:64] = (128).to_bytes(4, "little")
    data[128:132] = b"PE\0\0"
    data[134:136] = (1).to_bytes(2, "little")
    data[148:150] = (224).to_bytes(2, "little")
    data[152:154] = (0x10b).to_bytes(2, "little")
    data[212:216] = (512).to_bytes(4, "little")
    data[376:384] = b".rdata\0\0"
    data[392:396] = (len(raw) + extra).to_bytes(4, "little")
    data[396:400] = (512).to_bytes(4, "little")
    data[412:416] = flags.to_bytes(4, "little")
    data[512:512 + len(raw)] = raw
    return data


class SafeSourceExtractionTests(unittest.TestCase):
    def test_complete_fifty_option_block_over_eight_kilobytes(self):
        keys = [f"Num {n}" for n in range(10)] + [f"Ctrl+F{n}" for n in range(1, 21)] + [f"Shift+F{n}" for n in range(1, 21)]
        text = "\n".join(f"{key} - Option {index} " + "x" * 90 for index, key in enumerate(keys))
        self.assertGreater(len(text.encode("utf-16-le")), 8000)
        result = scanner()(bytes(pe_fixture(text)))
        self.assertEqual(result["original_text"], text)
        self.assertEqual(result["max_char_len"], len(text))
        self.assertEqual(result["offset_dec"], 512)

    def test_rejects_unterminated_executable_truncated_and_malformed_pe(self):
        good = pe_fixture("Num 1 - Infinite Health")
        bad_offset = bytearray(good)
        bad_offset[396:400] = (len(good) + 1).to_bytes(4, "little")
        bad_magic = bytearray(good)
        bad_magic[128:132] = b"NOPE"
        for data in (
            pe_fixture("Num 1 - Infinite Health", terminate=False, extra=0),
            pe_fixture("Num 1 - Infinite Health", flags=0x60000060),
            good[:-8], bad_offset, bad_magic,
            pe_fixture(b"N\0u\0m\0 \x001\0 -\0 \0\x00\xd8", extra=0),
        ):
            with self.subTest(size=len(data)):
                self.assertIsNone(scanner()(bytes(data)))

    def test_rejects_limit_unaligned_and_public_invalid_slots(self):
        for text in ("Num 1 - " + "x" * 33000, "Num 1 - **note", "Num 1 - Health\nNum 1 - Money"):
            self.assertIsNone(scanner()(bytes(pe_fixture(text))))
        shifted = pe_fixture("Num 1 - Health")
        shifted[396:400] = (513).to_bytes(4, "little")
        self.assertIsNone(scanner()(bytes(shifted)))


if __name__ == "__main__":
    unittest.main()

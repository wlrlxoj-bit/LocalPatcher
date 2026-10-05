"""무결성 복구용 다중 option-block 스캐너의 읽기 전용 경계를 검증한다."""

import pathlib
import sys
import unittest

TESTS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS))
from test_translation_pipeline_contracts import load_functions
from translation_validation import parse_options


class Section:
    def __init__(self, start=9000, size=20):
        self.PointerToRawData = start
        self.SizeOfRawData = size


def scanner():
    _offsets, _signature, blocks = load_functions(
        'recover_translation_integrity.py',
        ['_all_offsets', '_slot_signature', 'scan_option_blocks'],
        {'parse_options': parse_options},
    )
    return blocks


class TranslationIntegrityScannerTests(unittest.TestCase):
    def test_enumerates_distinct_ascii_and_utf16le_blocks(self):
        scan = scanner()
        ascii_text = 'Num 1 - HP\nNum 2 - MP'
        utf16_text = 'Num 1 - Health\nNum 2 - Ammo'
        blob = b'X\n\n' + ascii_text.encode('ascii') + b'\0\0' + b'PADD' + b'\n\0\n\0' + utf16_text.encode('utf-16-le') + b'\0\0\0\0'
        slots = scan(blob, Section())
        self.assertEqual(len(slots), 2)
        self.assertEqual([slot['encoding'] for slot in slots], ['ASCII', 'UTF-16LE'])
        self.assertEqual([slot['original_text'] for slot in slots], [ascii_text, utf16_text])

    def test_rejects_false_positive_without_safe_separator_or_strict_decode(self):
        scan = scanner()
        no_separator = b'prefix Num 1 - HP\0\0'
        invalid_ascii = b'X\n\nNum 1 - HP\xff\0\0'
        self.assertEqual(scan(no_separator, Section()), ())
        self.assertEqual(scan(invalid_ascii, Section()), ())

    def test_rejects_utf16le_marker_at_odd_absolute_offset(self):
        scan = scanner()
        text = 'Num 1 - Health\nNum 2 - Ammo'
        # UTF-16LE separator와 marker 모두 홀수 절대 offset이다. 바이트열이 우연히
        # 맞아도 유효한 UTF-16LE slot으로 취급하면 안 된다.
        blob = b'X' + b'\n\0\n\0' + text.encode('utf-16-le') + b'\0\0\0\0'
        self.assertEqual(scan(blob, Section()), ())

    def test_rejects_entire_slot_when_it_overlaps_text_section(self):
        scan = scanner()
        text = 'Num 1 - HP\nNum 2 - MP'
        blob = b'X\n\n' + text.encode('ascii') + b'\0\0'
        # start=3; overlap must reject even though marker itself is outside the first byte.
        self.assertEqual(scan(blob, Section(start=5, size=4)), ())

    def test_exact_source_matching_rejects_duplicate_or_missing_slots(self):
        checker, = load_functions('recover_translation_integrity.py', ['scanner_slots_are_exact_superset'])
        first = (10, 'ASCII', 12, 'Num 1 - HP')
        second = (40, 'ASCII', 12, 'Num 1 - MP')
        self.assertTrue(checker([first, second], [first, second]))
        self.assertFalse(checker([first, second], [first]))
        self.assertFalse(checker([first], [first, first]))


if __name__ == '__main__':
    unittest.main()

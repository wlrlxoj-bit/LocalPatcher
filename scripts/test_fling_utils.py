"""FLiNG 정규화 회귀 테스트."""

import unittest

from fling_utils import (
    find_game_by_canonical_slug,
    normalize_fling_slug,
    parse_trainer_version,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _GamesQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_columns):
        return self

    def eq(self, column, value):
        self.rows = [row for row in self.rows if row.get(column) == value]
        return self

    def execute(self):
        return _Result(self.rows)


class _FixtureDb:
    def __init__(self, games):
        self.games = games

    def table(self, table_name):
        if table_name == "games":
            return _GamesQuery(list(self.games))
        # 별칭 테이블 미적용 상태를 재현한다.
        raise RuntimeError("fixture에는 alias table이 없습니다")


class FlingUtilsTest(unittest.TestCase):
    def test_post_id_and_trainer_suffix_are_removed(self):
        self.assertEqual(
            normalize_fling_slug(
                "https://flingtrainer.com/trainer/cyberpunk-2077-trainer-123456/"
            ),
            "cyberpunk-2077",
        )

    def test_normalization_is_idempotent(self):
        url = (
            "https://flingtrainer.com/trainer/"
            "elden-ring-shadow-of-the-erdtree-trainer-1768067282/"
        )
        once = normalize_fling_slug(url)
        self.assertEqual(normalize_fling_slug(once), once)

    def test_numeric_game_slugs_are_preserved(self):
        self.assertEqual(normalize_fling_slug("cyberpunk-2077"), "cyberpunk-2077")
        self.assertEqual(normalize_fling_slug("f1-25"), "f1-25")

    def test_exact_legacy_slug_with_same_title_is_reused(self):
        db = _FixtureDb([
            {"id": 7, "slug": "foo-trainer", "title_en": "Foo"},
        ])
        canonical = normalize_fling_slug(
            "https://flingtrainer.com/trainer/foo-trainer-123456/"
        )
        self.assertEqual(canonical, "foo")
        self.assertEqual(
            find_game_by_canonical_slug(db, canonical, "Foo Trainer")["id"],
            7,
        )

    def test_ambiguous_legacy_slug_stops(self):
        db = _FixtureDb([
            {"id": 7, "slug": "foo-trainer", "title_en": "Foo"},
            {"id": 8, "slug": "foo-trainer", "title_en": "Foo"},
        ])
        with self.assertRaises(ValueError):
            find_game_by_canonical_slug(db, "foo", "Foo")

    def test_legacy_title_mismatch_stops(self):
        db = _FixtureDb([
            {"id": 7, "slug": "foo-trainer", "title_en": "Different Game"},
        ])
        with self.assertRaises(ValueError):
            find_game_by_canonical_slug(db, "foo", "Foo")

    def test_confirmed_elden_ring_dlc_url_uses_canonical_slug(self):
        self.assertEqual(
            normalize_fling_slug(
                "https://flingtrainer.com/trainer/"
                "elden-ring-shadow-of-the-erdtree-trainer-1768067282/"
            ),
            "elden-ring",
        )

    def test_unconfirmed_dlc_is_not_merged(self):
        self.assertEqual(
            normalize_fling_slug("some-game-unknown-dlc-trainer-123"),
            "some-game-unknown-dlc-trainer-123",
        )

    def test_version_range_has_no_trailing_dot(self):
        self.assertEqual(
            parse_trainer_version(
                "Elden.Ring.v1.02-v1.16.1.Plus.35.Trainer-FLiNG"
            ),
            ("v1.02-v1.16.1 Plus 35", 35),
        )


if __name__ == "__main__":
    unittest.main()

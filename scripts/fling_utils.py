"""FLiNG URL과 다운로드 표기를 안전하게 정규화하는 공통 도구."""

from __future__ import annotations

import re
from urllib.parse import urlparse


# DLC/리마스터 이름은 자동으로 합치지 않는다. 확인된 동일 게임만 명시한다.
EXPLICIT_GAME_ALIASES = {
    "elden-ring-shadow-of-the-erdtree": "elden-ring",
    "elden-ring-shadow-of-the-erdtree-1768067282": "elden-ring",
    "elden-ring-shadow-of-the-erdtree-trainer-1768067282": "elden-ring",
}


def normalize_fling_slug(url_or_slug: str) -> str:
    """FLiNG 게시물 URL에서 게시물 번호와 trainer 접미사를 제거한다."""
    parsed = urlparse(url_or_slug)
    is_url = bool(parsed.scheme and parsed.netloc)
    slug = parsed.path.rstrip("/").split("/")[-1] if is_url else url_or_slug
    slug = slug.strip().lower().strip("/")
    # 일반 slug의 cyberpunk-2077, f1-25 같은 숫자는 게시물 ID와 구별할 수
    # 없으므로 절대 제거하지 않는다. URL의 명확한 trainer 패턴만 정리한다.
    if is_url:
        slug = re.sub(r"-trainer-\d{6,}$", "", slug)
        slug = re.sub(r"-trainer$", "", slug)
    return EXPLICIT_GAME_ALIASES.get(slug, slug)


def parse_trainer_version(download_text: str) -> tuple[str, int]:
    """다운로드 표기에서 끝점 없는 버전 범위와 옵션 수를 반환한다."""
    version_match = re.search(
        r"v\d+(?:\.\d+)*(?:-v\d+(?:\.\d+)*)?",
        download_text,
        flags=re.IGNORECASE,
    )
    version = version_match.group(0).rstrip(".") if version_match else "v1.0"
    option_match = re.search(r"Plus[.\s]*(\d+)", download_text, flags=re.IGNORECASE)
    option_count = int(option_match.group(1)) if option_match else 0
    return f"{version} Plus {option_count}", option_count


def _normalize_game_title(title: str) -> str:
    """제목 비교용으로 대소문자와 구두점만 정규화한다."""
    title = re.sub(r"\btrainer\b", "", title, flags=re.IGNORECASE)
    title = re.sub(
        r"\bv\d+(?:\.\d+)*(?:-v\d+(?:\.\d+)*)?\b",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return " ".join(re.findall(r"[a-z0-9]+", title.lower()))


def find_game_by_canonical_slug(db, slug: str, title_en: str | None = None):
    """정규 slug/별칭 충돌을 검사하고 기존 게임을 찾는다."""
    canonical_slug = normalize_fling_slug(slug)
    canonical_result = db.table("games").select("id", "slug", "title_en").eq(
        "slug", canonical_slug
    ).execute()
    if len(canonical_result.data) > 1:
        raise ValueError(f"canonical slug가 중복되었습니다: {canonical_slug!r}")
    if canonical_result.data:
        return canonical_result.data[0]

    # 과거 수집기가 보존한 정확한 `${canonical}-trainer`만 제한적으로 찾는다.
    # DLC 이름 추론이나 부분 일치는 하지 않는다.
    legacy_slug = f"{canonical_slug}-trainer"
    legacy_result = db.table("games").select("id", "slug", "title_en").eq(
        "slug", legacy_slug
    ).execute()
    if len(legacy_result.data) > 1:
        raise ValueError(f"legacy slug 후보가 여러 개입니다: {legacy_slug!r}")
    if legacy_result.data:
        legacy_row = legacy_result.data[0]
        if not title_en or _normalize_game_title(
            legacy_row.get("title_en", "")
        ) != _normalize_game_title(title_en):
            raise ValueError(
                f"legacy slug 제목 불일치: {legacy_slug!r}, "
                f"{legacy_row.get('title_en')!r}, {title_en!r}"
            )
        return legacy_row

    # 마이그레이션 적용 전에도 스크레이퍼가 동작하도록 별칭 조회 실패는 허용한다.
    try:
        alias_result = db.table("game_slug_aliases").select(
            "game_id", "alias_slug"
        ).eq("alias_slug", canonical_slug).execute()
        if alias_result.data:
            game_result = db.table("games").select("id", "slug", "title_en").eq(
                "id", alias_result.data[0]["game_id"]
            ).execute()
            if game_result.data:
                return game_result.data[0]
    except Exception:
        pass

    if title_en:
        title_result = db.table("games").select("id", "slug", "title_en").eq(
            "title_en", title_en
        ).execute()
        if title_result.data:
            row = title_result.data[0]
            if normalize_fling_slug(row["slug"]) != canonical_slug:
                raise ValueError(
                    f"게임 제목 충돌: {title_en!r}의 기존 slug "
                    f"{row['slug']!r}와 신규 slug {canonical_slug!r}"
                )
            return row
    return None

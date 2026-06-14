from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import xlrd


ROOT = Path(__file__).resolve().parents[1]
SOURCE_GLOB = "2025年更新版导师评价表*.xls"
GENERATED_SOURCE = "mentor-evaluation-2025"

PROJECT_985 = {
    "北京大学",
    "清华大学",
    "中国人民大学",
    "北京航空航天大学",
    "北京理工大学",
    "中国农业大学",
    "北京师范大学",
    "中央民族大学",
    "南开大学",
    "天津大学",
    "大连理工大学",
    "东北大学",
    "吉林大学",
    "哈尔滨工业大学",
    "复旦大学",
    "同济大学",
    "上海交通大学",
    "华东师范大学",
    "南京大学",
    "东南大学",
    "浙江大学",
    "中国科学技术大学",
    "厦门大学",
    "山东大学",
    "中国海洋大学",
    "武汉大学",
    "华中科技大学",
    "湖南大学",
    "中南大学",
    "中山大学",
    "华南理工大学",
    "四川大学",
    "电子科技大学",
    "重庆大学",
    "西安交通大学",
    "西北工业大学",
    "西北农林科技大学",
    "兰州大学",
    "国防科技大学",
}

SPECIAL_SCHOOLS = {"南方科技大学"}

FIELD_KEYWORDS = [
    "机器人",
    "机械",
    "自动化",
    "控制",
    "航空航天",
    "航空",
    "航天",
    "人工智能",
    "智能",
    "机电",
    "车辆",
    "飞行器",
]

TEXT_KEYWORDS = [
    "机器人",
    "机械",
    "自动化",
    "航空航天",
    "航空",
    "航天",
    "人工智能",
    "机器学习",
    "深度学习",
    "飞行器",
    "智能制造",
    "智能控制",
    "控制理论",
    "控制科学",
    "控制工程",
    "自动控制",
    "无人机",
    "机械臂",
]

EXCLUDED_COLLEGE_TERMS = [
    "土木",
    "交通",
    "管理",
    "电气",
    "测绘",
    "数学",
    "计算机",
    "软件",
    "网络空间",
    "材料",
    "能源",
    "动力",
    "能动",
]

FIELD_PATTERN = re.compile("|".join(re.escape(k) for k in sorted(FIELD_KEYWORDS, key=len, reverse=True)), re.I)
TEXT_PATTERN = re.compile("|".join(re.escape(k) for k in sorted(TEXT_KEYWORDS, key=len, reverse=True)), re.I)


def stable_id(prefix: str, *parts: str) -> str:
    raw = "|".join(parts).encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()[:12]
    return f"{prefix}_{digest}"


def clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).replace("\u3000", " ")
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_key(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def school_level(school: str) -> str:
    if school in PROJECT_985:
        return "985"
    if "中国科学院" in school or "中科院" in school:
        return "中科院"
    if school in SPECIAL_SCHOOLS:
        return "南科大"
    return ""


def allowed_school(school: str) -> bool:
    return bool(school_level(school))


def allowed_college(college: str) -> bool:
    normalized = normalize_key(college)
    return not any(normalize_key(term) in normalized for term in EXCLUDED_COLLEGE_TERMS)


def rating_from_row(sheet_name: str, values: list[str]) -> float | None:
    if sheet_name in {"Sheet2", "黑名单"} and len(values) >= 4:
        try:
            return float(values[3])
        except ValueError:
            return None
    if sheet_name == "五星推荐":
        return 5.0
    return None


def match_keywords(college: str, row_text: str) -> set[str]:
    field_hits = {m.group(0) for m in FIELD_PATTERN.finditer(college)}
    text_hits = {m.group(0) for m in TEXT_PATTERN.finditer(row_text)}
    return field_hits | text_hits


def load_existing_data(path: Path) -> dict:
    if not path.exists():
        return {"colleges": [], "mentors": [], "intentions": []}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "colleges": data.get("colleges") if isinstance(data.get("colleges"), list) else [],
        "mentors": data.get("mentors") if isinstance(data.get("mentors"), list) else [],
        "intentions": data.get("intentions") if isinstance(data.get("intentions"), list) else [],
    }


def normalize_existing_college(college: dict) -> dict:
    item = dict(college)
    if "programType" not in item:
        camp_name = str(item.get("campName", ""))
        item["programType"] = "预推免" if "预推免" in camp_name else "夏令营"
    return item


def build_generated_data(source: Path) -> tuple[list[dict], list[dict], dict]:
    book = xlrd.open_workbook(source, on_demand=True)
    colleges: dict[tuple[str, str], dict] = {}
    mentors: dict[tuple[str, str, str], dict] = {}
    stats = {
        "source": str(source),
        "sheets": Counter(),
        "schools": Counter(),
        "keywords": Counter(),
    }

    for sheet in book.sheets():
        start_row = 2 if sheet.name == "Sheet1" else 1
        for row_index in range(start_row, sheet.nrows):
            values = [clean(sheet.cell_value(row_index, col)) for col in range(sheet.ncols)]
            if len(values) < 3:
                continue

            school, college, mentor_name = values[0], values[1], values[2]
            if not school or not college or not mentor_name or not allowed_school(school) or not allowed_college(college):
                continue

            row_text = " ".join(values[2:])
            keywords = match_keywords(college, row_text)
            if not keywords:
                continue

            school_college_key = (school, normalize_key(college))
            mentor_key = (school, normalize_key(college), normalize_key(mentor_name))
            rating = rating_from_row(sheet.name, values)

            stats["sheets"][sheet.name] += 1
            stats["schools"][school] += 1
            stats["keywords"].update(keywords)

            college_bucket = colleges.setdefault(
                school_college_key,
                {
                    "school": school,
                    "college": college,
                    "keywords": Counter(),
                    "recordCount": 0,
                    "mentorNames": set(),
                    "sourceSheets": Counter(),
                    "ratings": [],
                },
            )
            if len(college) > len(college_bucket["college"]):
                college_bucket["college"] = college
            college_bucket["keywords"].update(keywords)
            college_bucket["recordCount"] += 1
            college_bucket["mentorNames"].add(mentor_name)
            college_bucket["sourceSheets"][sheet.name] += 1
            if rating is not None:
                college_bucket["ratings"].append(rating)

            mentor_bucket = mentors.setdefault(
                mentor_key,
                {
                    "school": school,
                    "collegeKey": school_college_key,
                    "name": mentor_name,
                    "keywords": Counter(),
                    "recordCount": 0,
                    "sourceSheets": Counter(),
                    "ratings": [],
                },
            )
            mentor_bucket["keywords"].update(keywords)
            mentor_bucket["recordCount"] += 1
            mentor_bucket["sourceSheets"][sheet.name] += 1
            if rating is not None:
                mentor_bucket["ratings"].append(rating)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    generated_colleges = []
    generated_mentors = []

    def avg(values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    for key, bucket in sorted(colleges.items(), key=lambda item: (item[1]["school"], item[1]["college"])):
        school, college_key = key
        display_college = bucket["college"]
        college_id = stable_id("college_eval2025", school, college_key)
        keywords = [kw for kw, _count in bucket["keywords"].most_common()]
        average_rating = avg(bucket["ratings"])
        generated_colleges.append(
            {
                "id": college_id,
                "school": school,
                "college": display_college,
                "programType": "导师评价",
                "campName": "2025 导师评价关键词表",
                "deadline": "",
                "courses": "命中关键词：" + "、".join(keywords[:12]),
                "reviewMaterials": f"筛选范围：985 / 中科院 / 南科大；记录 {bucket['recordCount']} 条，导师 {len(bucket['mentorNames'])} 位。",
                "notes": "仅展示关键词、评分和来源聚合；不展示原始评价全文。"
                + (f" 平均评分 {average_rating}。" if average_rating is not None else ""),
                "relatedLink": "",
                "source": GENERATED_SOURCE,
                "sourceYear": 2025,
                "schoolLevel": school_level(school),
                "keywords": keywords,
                "recordCount": bucket["recordCount"],
                "averageRating": average_rating,
                "sourceSheets": dict(bucket["sourceSheets"]),
                "createdAt": now,
                "updatedAt": now,
            }
        )

    for bucket in sorted(mentors.values(), key=lambda item: (item["school"], item["collegeKey"][1], item["name"])):
        school, college_key = bucket["collegeKey"]
        college_id = stable_id("college_eval2025", school, college_key)
        keywords = [kw for kw, _count in bucket["keywords"].most_common()]
        average_rating = avg(bucket["ratings"])
        sheet_text = "、".join(f"{name} {count}" for name, count in bucket["sourceSheets"].items())
        generated_mentors.append(
            {
                "id": stable_id("mentor_eval2025", school, college_key, bucket["name"]),
                "collegeId": college_id,
                "name": bucket["name"],
                "title": f"评分 {average_rating}" if average_rating is not None else "评分暂无",
                "direction": "命中关键词：" + "、".join(keywords[:12]),
                "journals": f"评价记录：{bucket['recordCount']} 条；来源：{sheet_text}",
                "profile": "来自 2025 年导师评价表的关键词聚合结果，已按 985 / 中科院 / 南科大筛选；页面不展示原始评价全文。",
                "source": GENERATED_SOURCE,
                "sourceYear": 2025,
                "keywords": keywords,
                "recordCount": bucket["recordCount"],
                "averageRating": average_rating,
                "sourceSheets": dict(bucket["sourceSheets"]),
                "createdAt": now,
                "updatedAt": now,
            }
        )

    stats["generatedColleges"] = len(generated_colleges)
    stats["generatedMentors"] = len(generated_mentors)
    return generated_colleges, generated_mentors, stats


def write_data(data_path: Path, generated_colleges: list[dict], generated_mentors: list[dict]) -> dict:
    existing = load_existing_data(data_path)
    kept_colleges = [
        normalize_existing_college(item)
        for item in existing["colleges"]
        if item.get("source") != GENERATED_SOURCE
    ]
    kept_college_ids = {item.get("id") for item in kept_colleges}
    kept_mentors = [
        item
        for item in existing["mentors"]
        if item.get("source") != GENERATED_SOURCE and item.get("collegeId") in kept_college_ids
    ]
    kept_mentor_ids = {item.get("id") for item in kept_mentors}
    kept_intentions = [
        item
        for item in existing["intentions"]
        if item.get("collegeId") in kept_college_ids and (not item.get("mentorId") or item.get("mentorId") in kept_mentor_ids)
    ]
    output = {
        "colleges": kept_colleges + generated_colleges,
        "mentors": kept_mentors + generated_mentors,
        "intentions": kept_intentions,
    }
    data_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "keptColleges": len(kept_colleges),
        "keptMentors": len(kept_mentors),
        "keptIntentions": len(kept_intentions),
        "totalColleges": len(output["colleges"]),
        "totalMentors": len(output["mentors"]),
        "totalIntentions": len(output["intentions"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import 2025 mentor keyword data into website data.json.")
    parser.add_argument("--source", type=Path, default=None)
    parser.add_argument("--data", type=Path, default=ROOT / "data.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = args.source
    if source is None:
        matches = sorted((ROOT / "src").glob(SOURCE_GLOB))
        if not matches:
            raise SystemExit(f"No source file matched src/{SOURCE_GLOB}")
        source = matches[0]

    generated_colleges, generated_mentors, stats = build_generated_data(source)
    result = {
        "source": str(source),
        "matchedRecords": sum(stats["sheets"].values()),
        "generatedColleges": len(generated_colleges),
        "generatedMentors": len(generated_mentors),
        "sheets": dict(stats["sheets"]),
        "topSchools": stats["schools"].most_common(30),
        "topKeywords": stats["keywords"].most_common(30),
    }

    if not args.dry_run:
        result.update(write_data(args.data, generated_colleges, generated_mentors))

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

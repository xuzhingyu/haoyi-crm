import csv
import hashlib
import io
import json
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ImportBatch, LeadBatch, BatchRow, RepairShopLead


HEADER_ALIASES = {
    "门店名称": "shop_name",
    "汽修厂名称": "shop_name",
    "企业名称": "shop_name",
    "省份": "province",
    "省": "province",
    "城市": "city",
    "市": "city",
    "区县": "district",
    "区域": "district",
    "统一社会信用代码": "social_credit_code",
    "信用代码": "social_credit_code",
    "联系电话": "phone",
    "电话": "phone",
    "联系人": "contact_name",
    "微信": "wechat",
    "地址": "address",
    "新能源工位数": "new_energy_lifts",
    "月均进场台次": "monthly_order_count",
    "线索来源": "source",
}


def _normalise_header(value: Any) -> str:
    text = str(value or "").strip()
    return HEADER_ALIASES.get(text, text.lower())


def _normalise_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalise_key(value: Any) -> str:
    return "".join(character.casefold() for character in str(value or "") if character.isalnum())


def _normalise_phone(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[2:] if digits.startswith("86") and len(digits) > 11 else digits


def _normalise_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(float(value))


def _read_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _read_xlsx(content: bytes) -> list[dict[str, Any]]:
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows = sheet.iter_rows(values_only=True)
    headers = [str(value or "") for value in next(rows, ())]
    return [dict(zip(headers, row, strict=False)) for row in rows]


def read_rows(filename: str, content: bytes) -> tuple[str, list[dict[str, Any]]]:
    extension = Path(filename).suffix.lower()
    if extension == ".csv":
        return "csv", _read_csv(content)
    if extension in {".xlsx", ".xlsm"}:
        return "xlsx", _read_xlsx(content)
    raise ValueError("only CSV and XLSX files are supported")


def _canonicalise(row: dict[str, Any]) -> dict[str, Any]:
    mapped = {_normalise_header(key): value for key, value in row.items()}
    return {
        "shop_name": _normalise_text(mapped.get("shop_name")),
        "province": _normalise_text(mapped.get("province")),
        "city": _normalise_text(mapped.get("city")),
        "district": _normalise_text(mapped.get("district")),
        "social_credit_code": _normalise_text(mapped.get("social_credit_code")),
        "phone": _normalise_text(mapped.get("phone")),
        "wechat": _normalise_text(mapped.get("wechat")),
        "contact_name": _normalise_text(mapped.get("contact_name")),
        "address": _normalise_text(mapped.get("address")),
        "new_energy_lifts": _normalise_int(mapped.get("new_energy_lifts")),
        "monthly_order_count": _normalise_int(mapped.get("monthly_order_count")),
        "source": _normalise_text(mapped.get("source")) or "文件导入",
    }


def _duplicate_key(data: dict[str, Any]) -> tuple[str, ...] | None:
    credit_code = _normalise_key(data["social_credit_code"])
    if credit_code:
        return ("credit", credit_code)

    region = data["city"] or data["province"]
    if data["shop_name"] and region:
        return ("shop_region", _normalise_key(data["shop_name"]), _normalise_key(region))

    phone = _normalise_phone(data["phone"])
    return ("phone", phone) if phone else None


def _all_lookup_keys(data: dict[str, Any]) -> set[tuple[str, ...]]:
    keys: set[tuple[str, ...]] = set()
    credit_code = _normalise_key(data["social_credit_code"])
    if credit_code:
        keys.add(("credit", credit_code))
    region = data["city"] or data["province"]
    if data["shop_name"] and region:
        keys.add(("shop_region", _normalise_key(data["shop_name"]), _normalise_key(region)))
    phone = _normalise_phone(data["phone"])
    if phone:
        keys.add(("phone", phone))
    return keys


def _lead_data(lead: RepairShopLead) -> dict[str, Any]:
    return {
        "shop_name": lead.shop_name,
        "province": lead.province,
        "city": lead.city,
        "social_credit_code": lead.social_credit_code,
        "phone": lead.phone,
    }


def _validate_rows(
    session: Session,
    raw_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    duplicate_keys: set[tuple[str, ...]] = set()
    for lead in session.scalars(select(RepairShopLead)).all():
        duplicate_keys.update(_all_lookup_keys(_lead_data(lead)))
    accepted: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for spreadsheet_row, raw_row in enumerate(raw_rows, start=2):
        try:
            data = _canonicalise(raw_row)
        except (TypeError, ValueError):
            errors.append({"row": spreadsheet_row, "message": "invalid numeric value"})
            continue
        if not data["shop_name"]:
            errors.append({"row": spreadsheet_row, "message": "shop_name is required"})
            continue
        key = _duplicate_key(data)
        if key is not None and key in duplicate_keys:
            errors.append({"row": spreadsheet_row, "message": "duplicate lead"})
            continue
        duplicate_keys.update(_all_lookup_keys(data))
        accepted.append(data)
    return accepted, errors


def preview_file(session: Session, filename: str, content: bytes) -> dict[str, Any]:
    file_format, raw_rows = read_rows(filename, content)
    rows, errors = _validate_rows(session, raw_rows)
    return {
        "filename": filename,
        "file_format": file_format,
        "valid_rows": len(rows),
        "invalid_rows": len(errors),
        "rows": rows,
        "errors": errors,
    }


def _batch_payload(batch: ImportBatch, *, idempotent: bool = False) -> dict[str, Any]:
    return {
        "id": batch.id,
        "filename": batch.filename,
        "file_format": batch.file_format,
        "valid_rows": batch.valid_rows,
        "invalid_rows": batch.invalid_rows,
        "errors": json.loads(batch.errors_json),
        "idempotent": idempotent,
        "created_at": batch.created_at.isoformat(),
    }


def import_file(session: Session, filename: str, content: bytes) -> tuple[dict[str, Any], bool]:
    digest = hashlib.sha256(content).hexdigest()
    existing = session.scalar(select(ImportBatch).where(ImportBatch.file_sha256 == digest))
    if existing:
        return _batch_payload(existing, idempotent=True), True

    file_format, raw_rows = read_rows(filename, content)
    rows, errors = _validate_rows(session, raw_rows)
    created_leads: list[RepairShopLead] = []
    for data in rows:
        lead = RepairShopLead(**data)
        session.add(lead)
        created_leads.append(lead)
    session.flush()

    batch = ImportBatch(
        filename=filename,
        file_sha256=digest,
        file_format=file_format,
        valid_rows=len(rows),
        invalid_rows=len(errors),
        errors_json=json.dumps(errors, ensure_ascii=False),
    )
    session.add(batch)
    session.flush()
    region = next((item["city"] or item["province"] for item in rows if item.get("city") or item.get("province")), None)
    lead_batch = LeadBatch(import_batch_id=batch.id, target_region=region, status="new")
    session.add(lead_batch)
    session.flush()
    for index, lead in enumerate(created_leads, start=2):
        session.add(BatchRow(batch_id=lead_batch.id, lead_id=lead.id, source_row=index, shop_name=lead.shop_name, phone=lead.phone))
    session.commit()
    session.refresh(batch)
    return _batch_payload(batch), False


def list_batches(session: Session) -> Iterable[dict[str, Any]]:
    batches = session.scalars(select(ImportBatch).order_by(ImportBatch.created_at.desc())).all()
    return [_batch_payload(batch) for batch in batches]

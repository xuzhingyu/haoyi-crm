from __future__ import annotations

import csv
from dataclasses import dataclass
from enum import StrEnum
from io import BytesIO, StringIO

from bs4 import BeautifulSoup
from openpyxl import load_workbook
from pypdf import PdfReader


class ParseFormat(StrEnum):
    CSV = "csv"
    HTML = "html"
    XLSX = "xlsx"
    PDF = "pdf"


@dataclass(frozen=True)
class ParseResult:
    rows: list[dict[str, str]]
    requires_manual_review: bool = False
    review_reason: str | None = None


class DocumentParser:
    def parse(self, content: bytes, format_: ParseFormat) -> ParseResult:
        if format_ is ParseFormat.CSV:
            return ParseResult(self._parse_csv(content))
        if format_ is ParseFormat.HTML:
            return ParseResult(self._parse_html(content))
        if format_ is ParseFormat.XLSX:
            return ParseResult(self._parse_xlsx(content))
        return self._parse_pdf(content)

    @staticmethod
    def _parse_csv(content: bytes) -> list[dict[str, str]]:
        reader = csv.DictReader(StringIO(content.decode("utf-8-sig")))
        return [
            {key.strip(): (value or "").strip() for key, value in row.items() if key}
            for row in reader
        ]

    @staticmethod
    def _parse_html(content: bytes) -> list[dict[str, str]]:
        soup = BeautifulSoup(content, "html.parser")
        table = soup.find("table")
        if table is None:
            return []
        rows = table.find_all("tr")
        if not rows:
            return []
        headers = [cell.get_text(strip=True) for cell in rows[0].find_all(["th", "td"])]
        result: list[dict[str, str]] = []
        for row in rows[1:]:
            values = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]
            if values:
                result.append(dict(zip(headers, values, strict=False)))
        return result

    @staticmethod
    def _parse_xlsx(content: bytes) -> list[dict[str, str]]:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
        sheet = workbook.active
        values = list(sheet.iter_rows(values_only=True))
        if not values:
            return []
        headers = [str(value or "").strip() for value in values[0]]
        return [
            {
                header: str(value or "").strip()
                for header, value in zip(headers, row, strict=False)
                if header
            }
            for row in values[1:]
            if any(value is not None for value in row)
        ]

    @staticmethod
    def _parse_pdf(content: bytes) -> ParseResult:
        reader = PdfReader(BytesIO(content))
        text = "\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
        if not text:
            return ParseResult(
                rows=[],
                requires_manual_review=True,
                review_reason="pdf_has_no_extractable_text",
            )
        return ParseResult(
            rows=[{"raw_text": text}],
            requires_manual_review=True,
            review_reason="pdf_text_requires_field_mapping",
        )

from io import BytesIO

import pytest
from openpyxl import Workbook

from lead_core.ingestion.parsers import DocumentParser, ParseFormat
from lead_core.ingestion.source_policy import SourceAccessPolicy, SourceDefinition


def test_approved_source_only_allows_declared_domain_path_and_fields() -> None:
    source = SourceDefinition(
        status="approved",
        allowed_domains=("example.gov.cn",),
        allowed_path_prefixes=("/public/repair/",),
        allowed_fields=frozenset({"business_name", "city", "filing_number"}),
    )
    policy = SourceAccessPolicy(source)

    assert policy.assert_url_allowed("https://example.gov.cn/public/repair/list.xlsx") is None
    assert policy.filter_fields(
        {"business_name": "诚安汽修", "city": "南通市", "private_mobile": "13800000000"}
    ) == {"business_name": "诚安汽修", "city": "南通市"}

    with pytest.raises(ValueError, match="source URL is not allowed"):
        policy.assert_url_allowed("https://other.example/public/repair/list.xlsx")


def test_paused_source_cannot_be_fetched() -> None:
    policy = SourceAccessPolicy(
        SourceDefinition(
            status="paused",
            allowed_domains=("example.gov.cn",),
            allowed_path_prefixes=("/public/",),
            allowed_fields=frozenset({"business_name"}),
        )
    )

    with pytest.raises(ValueError, match="source is not approved"):
        policy.assert_url_allowed("https://example.gov.cn/public/list.html")


def test_csv_html_and_xlsx_parsers_return_normalized_rows() -> None:
    parser = DocumentParser()
    csv_result = parser.parse(
        b"business_name,city,filing_number\n\xe8\xaf\x9a\xe5\xae\x89\xe6\xb1\xbd\xe4\xbf\xae,\xe5\x8d\x97\xe9\x80\x9a\xe5\xb8\x82,001\n",
        ParseFormat.CSV,
    )
    html_result = parser.parse(
        "<table><tr><th>business_name</th><th>city</th></tr>"
        "<tr><td>顺达快修</td><td>南通市</td></tr></table>".encode(),
        ParseFormat.HTML,
    )

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["business_name", "city", "filing_number"])
    sheet.append(["恒通养护", "南通市", "002"])
    buffer = BytesIO()
    workbook.save(buffer)
    xlsx_result = parser.parse(buffer.getvalue(), ParseFormat.XLSX)

    assert csv_result.rows == [{"business_name": "诚安汽修", "city": "南通市", "filing_number": "001"}]
    assert html_result.rows == [{"business_name": "顺达快修", "city": "南通市"}]
    assert xlsx_result.rows == [{"business_name": "恒通养护", "city": "南通市", "filing_number": "002"}]


def test_pdf_without_extractable_text_requires_manual_review() -> None:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = BytesIO()
    writer.write(buffer)

    result = DocumentParser().parse(buffer.getvalue(), ParseFormat.PDF)

    assert result.rows == []
    assert result.requires_manual_review is True
    assert result.review_reason == "pdf_has_no_extractable_text"

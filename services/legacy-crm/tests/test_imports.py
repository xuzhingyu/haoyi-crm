from fastapi.testclient import TestClient


def make_client(tmp_path) -> TestClient:
    from app.main import create_app

    return TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'imports.db'}"))


def test_csv_import_creates_valid_lead_and_records_invalid_row(tmp_path):
    """Skipping row validation or lead creation must break the import outcome."""
    csv_bytes = (
        "shop_name,province,city,phone,social_credit_code,new_energy_lifts,monthly_order_count\n"
        "上海电驰新能源维修站,上海市,上海市,13900001111,91310115MA20TEST01,5,140\n"
        ",上海市,上海市,13900001112,,2,20\n"
    ).encode("utf-8")

    with make_client(tmp_path) as client:
        response = client.post(
            "/api/imports/upload",
            files={"file": ("shops.csv", csv_bytes, "text/csv")},
        )
        leads = client.get("/api/leads")

    assert response.status_code == 201
    body = response.json()
    assert body["valid_rows"] == 1
    assert body["invalid_rows"] == 1
    assert body["errors"] == [{"row": 3, "message": "shop_name is required"}]
    assert any(lead["shop_name"] == "上海电驰新能源维修站" for lead in leads.json())


def test_reimporting_identical_file_returns_existing_batch_without_new_leads(tmp_path):
    """Removing SHA-256 idempotency must create a second batch or duplicate lead."""
    csv_bytes = (
        "shop_name,province,city,phone\n"
        "常州迅维新能源服务中心,江苏省,常州市,13900002222\n"
    ).encode("utf-8")

    with make_client(tmp_path) as client:
        first = client.post("/api/imports/upload", files={"file": ("one.csv", csv_bytes, "text/csv")})
        count_after_first = len(client.get("/api/leads").json())
        second = client.post("/api/imports/upload", files={"file": ("again.csv", csv_bytes, "text/csv")})
        count_after_second = len(client.get("/api/leads").json())

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["idempotent"] is True
    assert count_after_second == count_after_first


def test_different_file_with_same_shop_does_not_duplicate_lead(tmp_path):
    """Removing the name-and-region duplicate fallback must create two leads."""
    first_file = "shop_name,province,city,phone\n宁波跃达电驱维修,浙江省,宁波市,13900003333\n".encode()
    second_file = "shop_name,province,city,phone\n宁波跃达电驱维修,浙江省,宁波市,13900004444\n".encode()

    with make_client(tmp_path) as client:
        first = client.post("/api/imports/upload", files={"file": ("first.csv", first_file, "text/csv")})
        second = client.post("/api/imports/upload", files={"file": ("second.csv", second_file, "text/csv")})
        leads = client.get("/api/leads").json()

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["valid_rows"] == 0
    assert second.json()["errors"] == [{"row": 2, "message": "duplicate lead"}]
    assert len([lead for lead in leads if lead["shop_name"] == "宁波跃达电驱维修"]) == 1


def test_xlsx_import_maps_chinese_column_aliases(tmp_path):
    """Breaking Chinese header alias mapping must prevent this lead from importing."""
    from io import BytesIO
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["门店名称", "省份", "城市", "统一社会信用代码", "联系电话", "新能源工位数", "月均进场台次"])
    sheet.append(["杭州光轮新能源汽车服务", "浙江省", "杭州市", "91330110MA20TEST01", "13900005555", 6, 160])
    buffer = BytesIO()
    workbook.save(buffer)

    with make_client(tmp_path) as client:
        response = client.post(
            "/api/imports/upload",
            files={"file": ("aliases.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        leads = client.get("/api/leads").json()

    assert response.status_code == 201
    assert response.json()["valid_rows"] == 1
    imported = next(lead for lead in leads if lead["shop_name"] == "杭州光轮新能源汽车服务")
    assert imported["new_energy_lifts"] == 6
    assert imported["monthly_order_count"] == 160


def test_import_batches_endpoint_returns_row_level_errors(tmp_path):
    """Removing stored batch errors or the batch list route must break audit visibility."""
    broken_file = "shop_name,province\n,江苏省\n".encode()

    with make_client(tmp_path) as client:
        client.post("/api/imports/upload", files={"file": ("broken.csv", broken_file, "text/csv")})
        response = client.get("/api/imports/batches")

    assert response.status_code == 200
    assert response.json()[0]["invalid_rows"] == 1
    assert response.json()[0]["errors"] == [{"row": 2, "message": "shop_name is required"}]


def test_preview_maps_and_validates_without_persisting_anything(tmp_path):
    csv_bytes = (
        "门店名称,省份,城市,联系电话,新能源工位数\n"
        "合肥星航新能源汽修,安徽省,合肥市,139-0000-7788,4\n"
        ",安徽省,合肥市,13900007799,2\n"
    ).encode("utf-8")

    with make_client(tmp_path) as client:
        before_leads = len(client.get("/api/leads").json())
        response = client.post(
            "/api/imports/preview",
            files={"file": ("preview.csv", csv_bytes, "text/csv")},
        )
        after_leads = len(client.get("/api/leads").json())
        batches = client.get("/api/imports/batches").json()

    assert response.status_code == 200
    assert response.json()["valid_rows"] == 1
    assert response.json()["invalid_rows"] == 1
    assert response.json()["rows"][0]["shop_name"] == "合肥星航新能源汽修"
    assert response.json()["errors"] == [{"row": 3, "message": "shop_name is required"}]
    assert after_leads == before_leads
    assert batches == []


def test_credit_code_has_priority_over_matching_phone(tmp_path):
    first_file = (
        "shop_name,province,city,phone,social_credit_code\n"
        "济南启程新能源汽修,山东省,济南市,13900008888,CODE-A\n"
    ).encode()
    second_file = (
        "shop_name,province,city,phone,social_credit_code\n"
        "济南启程二店,山东省,济南市,13900008888,CODE-B\n"
    ).encode()

    with make_client(tmp_path) as client:
        first = client.post("/api/imports/upload", files={"file": ("a.csv", first_file, "text/csv")})
        second = client.post("/api/imports/upload", files={"file": ("b.csv", second_file, "text/csv")})

    assert first.json()["valid_rows"] == 1
    assert second.json()["valid_rows"] == 1


def test_phone_fallback_normalizes_common_formatting(tmp_path):
    first_file = "shop_name,phone\n武汉电动工坊,139-0000-9999\n".encode()
    second_file = "shop_name,phone\n武汉新能源快修,+86 139 0000 9999\n".encode()

    with make_client(tmp_path) as client:
        first = client.post("/api/imports/upload", files={"file": ("phone-a.csv", first_file, "text/csv")})
        second = client.post("/api/imports/upload", files={"file": ("phone-b.csv", second_file, "text/csv")})

    assert first.json()["valid_rows"] == 1
    assert second.json()["valid_rows"] == 0
    assert second.json()["errors"] == [{"row": 2, "message": "duplicate lead"}]


def test_preview_and_upload_agree_on_duplicates_inside_one_file(tmp_path):
    csv_bytes = (
        "shop_name,province,city,phone\n"
        "南通迅电维修中心,江苏省,南通市,13900006111\n"
        "南通迅电维修中心,江苏省,南通市,13900006222\n"
    ).encode()

    with make_client(tmp_path) as client:
        before = len(client.get("/api/leads").json())
        preview = client.post(
            "/api/imports/preview",
            files={"file": ("same-file.csv", csv_bytes, "text/csv")},
        )
        after_preview = len(client.get("/api/leads").json())
        uploaded = client.post(
            "/api/imports/upload",
            files={"file": ("same-file.csv", csv_bytes, "text/csv")},
        )

    assert preview.json()["valid_rows"] == uploaded.json()["valid_rows"] == 1
    assert preview.json()["invalid_rows"] == uploaded.json()["invalid_rows"] == 1
    assert preview.json()["errors"] == uploaded.json()["errors"] == [
        {"row": 3, "message": "duplicate lead"}
    ]
    assert after_preview == before


def test_existing_credited_lead_blocks_no_credit_name_region_fallback(tmp_path):
    credited = (
        "shop_name,province,city,phone,social_credit_code\n"
        "徐州驰能汽修,江苏省,徐州市,13900007111,CREDIT-XZ-1\n"
    ).encode()
    no_credit = (
        "shop_name,province,city,phone,social_credit_code\n"
        "徐州驰能汽修,江苏省,徐州市,13900007222,\n"
    ).encode()

    with make_client(tmp_path) as client:
        first = client.post("/api/imports/upload", files={"file": ("credited.csv", credited, "text/csv")})
        second = client.post("/api/imports/upload", files={"file": ("fallback.csv", no_credit, "text/csv")})

    assert first.json()["valid_rows"] == 1
    assert second.json()["valid_rows"] == 0


def test_same_file_credited_lead_blocks_no_credit_name_region_fallback(tmp_path):
    rows = (
        "shop_name,province,city,phone,social_credit_code\n"
        "扬州驭电工坊,江苏省,扬州市,13900007333,CREDIT-YZ-1\n"
        "扬州驭电工坊,江苏省,扬州市,13900007444,\n"
    ).encode()

    with make_client(tmp_path) as client:
        preview = client.post("/api/imports/preview", files={"file": ("mixed.csv", rows, "text/csv")})
        uploaded = client.post("/api/imports/upload", files={"file": ("mixed.csv", rows, "text/csv")})

    assert preview.json()["valid_rows"] == uploaded.json()["valid_rows"] == 1
    assert preview.json()["errors"] == uploaded.json()["errors"] == [
        {"row": 3, "message": "duplicate lead"}
    ]


def test_existing_credited_lead_blocks_normalized_phone_fallback(tmp_path):
    credited = (
        "shop_name,province,city,phone,social_credit_code\n"
        "镇江电擎汽修,江苏省,镇江市,139-0000-7555,CREDIT-ZJ-1\n"
    ).encode()
    phone_only_fallback = (
        "shop_name,province,city,phone,social_credit_code\n"
        "新区新能源快修,,,+86 139 0000 7555,\n"
    ).encode()

    with make_client(tmp_path) as client:
        client.post("/api/imports/upload", files={"file": ("base.csv", credited, "text/csv")})
        duplicate = client.post(
            "/api/imports/upload",
            files={"file": ("phone-fallback.csv", phone_only_fallback, "text/csv")},
        )

    assert duplicate.json()["valid_rows"] == 0
    assert duplicate.json()["errors"] == [{"row": 2, "message": "duplicate lead"}]

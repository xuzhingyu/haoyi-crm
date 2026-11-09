from lead_core.domain.entities import BusinessIdentity, EntityResolver, MatchKind


def test_unified_social_credit_code_is_the_primary_exact_key() -> None:
    resolver = EntityResolver()
    left = BusinessIdentity(
        name="南通诚安汽车维修有限公司",
        city="南通市",
        address="崇川区青年路1号",
        unified_social_credit_code="91320600MA1234567X",
    )
    right = BusinessIdentity(
        name="另一展示名称",
        city="南通市",
        address="不同地址",
        unified_social_credit_code="91320600MA1234567X",
    )

    assert resolver.compare(left, right).kind is MatchKind.EXACT_USCC


def test_filing_number_is_used_when_credit_code_is_absent() -> None:
    resolver = EntityResolver()
    left = BusinessIdentity(name="启东顺达汽车服务中心", city="南通市", filing_number="苏交维备001")
    right = BusinessIdentity(name="启东顺达汽车服务中心", city="南通市", filing_number="苏交维备001")

    assert resolver.compare(left, right).kind is MatchKind.EXACT_FILING_NUMBER


def test_normalized_name_and_address_can_match_but_name_only_stays_manual() -> None:
    resolver = EntityResolver()
    exact_location = resolver.compare(
        BusinessIdentity(name="如皋恒通汽车养护中心（普通合伙）", city="南通市", address="如皋市中山路 8 号"),
        BusinessIdentity(name="如皋恒通汽车养护中心", city="南通市", address="如皋市中山路8号"),
    )
    ambiguous = resolver.compare(
        BusinessIdentity(name="恒通汽车养护", city="南通市"),
        BusinessIdentity(name="恒通汽车养护中心", city="南通市"),
    )

    assert exact_location.kind is MatchKind.EXACT_NAME_ADDRESS
    assert ambiguous.kind is MatchKind.MANUAL_REVIEW

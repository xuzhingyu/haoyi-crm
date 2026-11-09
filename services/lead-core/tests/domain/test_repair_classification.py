import pytest

from lead_core.domain.classification import RepairBusinessClassifier


@pytest.mark.parametrize(
    ("name", "scope"),
    [
        ("诚安汽车维修有限公司", "汽车综合维修、保养"),
        ("顺达汽车快修中心", "快修保养"),
        ("瑞驰轮胎服务部", "轮胎、电器维修"),
        ("恒通汽车养护中心", "汽车美容养护"),
    ],
)
def test_target_independent_repair_businesses_are_publishable(name: str, scope: str) -> None:
    result = RepairBusinessClassifier().classify(name=name, business_scope=scope)

    assert result.publishable is True


@pytest.mark.parametrize(
    ("name", "scope"),
    [
        ("某品牌汽车4S店", "整车销售和售后"),
        ("公交集团车辆维修站", "企业自有车辆维修"),
        ("机动车检测有限公司", "机动车检测"),
        ("摩托车维修部", "摩托车维修"),
        ("汽车配件商行", "汽车配件销售"),
        ("汽车维修职业培训学校", "职业技能培训"),
    ],
)
def test_excluded_business_types_are_not_publishable(name: str, scope: str) -> None:
    result = RepairBusinessClassifier().classify(name=name, business_scope=scope)

    assert result.publishable is False
    assert result.exclusion_reason is not None

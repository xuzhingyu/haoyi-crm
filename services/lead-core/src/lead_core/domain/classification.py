from dataclasses import dataclass


@dataclass(frozen=True)
class ClassificationResult:
    publishable: bool
    category: str | None = None
    exclusion_reason: str | None = None


class RepairBusinessClassifier:
    _EXCLUSIONS = {
        "4s": "brand_dealership",
        "整车销售": "brand_dealership",
        "公交": "fleet_internal_repair",
        "车队": "fleet_internal_repair",
        "自有车辆": "fleet_internal_repair",
        "检测": "inspection_only",
        "摩托车": "motorcycle_only",
        "配件": "parts_only",
        "培训": "training",
        "学校": "training",
    }
    _TARGETS = {
        "综合维修": "comprehensive_repair",
        "汽车维修": "comprehensive_repair",
        "快修": "quick_maintenance",
        "保养": "quick_maintenance",
        "轮胎": "tire_electrical",
        "电器维修": "tire_electrical",
        "美容": "beauty_maintenance",
        "养护": "beauty_maintenance",
    }

    def classify(self, *, name: str, business_scope: str) -> ClassificationResult:
        haystack = f"{name} {business_scope}".lower()
        for marker, reason in self._EXCLUSIONS.items():
            if marker in haystack:
                return ClassificationResult(False, exclusion_reason=reason)
        for marker, category in self._TARGETS.items():
            if marker in haystack:
                return ClassificationResult(True, category=category)
        return ClassificationResult(False, exclusion_reason="not_target_repair_business")

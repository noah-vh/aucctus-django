from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CompanyMetricViewSet,
    CompanyViewSet,
    FundingEventViewSet,
    IdeaViewSet,
    IntelSignalViewSet,
    InvestorViewSet,
    MarketSignalViewSet,
    ResearchStreamView,
    ResearchView,
    StatsView,
    VerdictViewSet,
)

router = DefaultRouter()
router.register(r"ideas", IdeaViewSet, basename="idea")
router.register(r"companies", CompanyViewSet, basename="company")
router.register(r"company-metrics", CompanyMetricViewSet, basename="companymetric")
router.register(r"funding-events", FundingEventViewSet, basename="fundingevent")
router.register(r"market-signals", MarketSignalViewSet, basename="marketsignal")
router.register(r"verdicts", VerdictViewSet, basename="verdict")
router.register(r"intel-signals", IntelSignalViewSet, basename="intelsignal")
router.register(r"investors", InvestorViewSet, basename="investor")

urlpatterns = [
    path("", include(router.urls)),
    path("stats/", StatsView.as_view(), name="stats"),
    path("research/", ResearchView.as_view(), name="research"),
    path("research/stream/", ResearchStreamView.as_view(), name="research-stream"),
]

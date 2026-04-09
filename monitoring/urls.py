from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ActivityLogViewSet, JobViewSet

router = DefaultRouter()
router.register(r"jobs", JobViewSet, basename="job")
router.register(r"activity", ActivityLogViewSet, basename="activitylog")

urlpatterns = [
    path("", include(router.urls)),
]

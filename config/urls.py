from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/ideas/", include("ideas.urls")),
    path("api/v1/chat/", include("chat.urls")),
    path("api/v1/monitoring/", include("monitoring.urls")),
    path("api/v1/evals/", include("evals.urls")),
    # Template views
    path("", include("ideas.template_urls")),
]

"""URL routing for Django template views (not REST API)."""
from django.urls import path
from . import template_views

urlpatterns = [
    path("", template_views.dashboard, name="dashboard"),
    path("chat/", template_views.chat, name="chat"),
    path("ideas/", template_views.ideas_list, name="ideas_list"),
    path("ideas/<int:pk>/", template_views.idea_detail, name="idea_detail"),
    path("companies/<int:pk>/", template_views.company_detail, name="company_detail"),
    path("investors/<int:pk>/", template_views.investor_detail, name="investor_detail"),
    path("compare/", template_views.compare, name="compare"),
    path("trends/", template_views.trends, name="trends"),
    path("monitoring/", template_views.monitoring_page, name="monitoring"),
    path("agents/", template_views.agents, name="agents"),
    path("system/", template_views.system, name="system"),
]

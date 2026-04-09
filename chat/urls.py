from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ChatMessageViewSet, ChatSessionViewSet

router = DefaultRouter()
router.register(r"sessions", ChatSessionViewSet, basename="chatsession")
router.register(r"messages", ChatMessageViewSet, basename="chatmessage")

urlpatterns = [
    path("", include(router.urls)),
]

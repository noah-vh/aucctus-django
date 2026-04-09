from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter

from .views import ChatMessageViewSet, ChatResearchStreamView, ChatSessionViewSet

router = DefaultRouter()
router.register(r"sessions", ChatSessionViewSet, basename="chatsession")
router.register(r"messages", ChatMessageViewSet, basename="chatmessage")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "research-stream/",
        csrf_exempt(ChatResearchStreamView.as_view()),
        name="chat-research-stream",
    ),
]

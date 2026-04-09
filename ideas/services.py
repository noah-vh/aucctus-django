"""
BrainService: Python equivalent of the Convex brain.ts mutations.

Encapsulates write-side business logic so views stay thin. All methods
operate inside a transaction where it matters (get_or_create, update).
"""

import logging
from datetime import datetime, timezone

from django.db import transaction
from django.utils import timezone as dj_timezone

from monitoring.models import ActivityLog

logger = logging.getLogger(__name__)


def _now():
    return dj_timezone.now()


class BrainService:
    # ------------------------------------------------------------------
    # Company
    # ------------------------------------------------------------------

    @staticmethod
    @transaction.atomic
    def upsert_company(idea_id: int, data: dict) -> "ideas.models.Company":
        """
        Match on (name, idea). Update last_seen and non-null fields if found;
        create with first_seen = last_seen = now if new.
        Mirrors Convex brain:upsertCompany.
        """
        from ideas.models import Company

        name = data["name"]
        now = _now()

        try:
            company = Company.objects.select_for_update().get(name=name, idea_id=idea_id)
            logger.info(
                "upsert_company: updating existing company",
                extra={"company_id": company.pk, "idea_id": idea_id, "name": name},
            )
            # Only overwrite optional fields when incoming value is not None
            for field in (
                "url",
                "description",
                "pricing_model",
                "target_segment",
                "differentiator",
                "weakness",
                "employee_estimate",
                "founded_year",
                "headquarters",
            ):
                incoming = data.get(field)
                if incoming is not None:
                    setattr(company, field, incoming)

            # Always overwrite these list/confidence fields
            for field in ("product_names", "features", "data_confidence", "source_urls"):
                if field in data:
                    setattr(company, field, data[field])

            company.last_seen = now
            company.save()
            return company

        except Company.DoesNotExist:
            logger.info(
                "upsert_company: creating new company",
                extra={"idea_id": idea_id, "name": name},
            )
            company = Company.objects.create(
                idea_id=idea_id,
                name=name,
                url=data.get("url"),
                description=data.get("description"),
                product_names=data.get("product_names", []),
                features=data.get("features", []),
                pricing_model=data.get("pricing_model"),
                target_segment=data.get("target_segment"),
                differentiator=data.get("differentiator"),
                weakness=data.get("weakness"),
                employee_estimate=data.get("employee_estimate"),
                founded_year=data.get("founded_year"),
                headquarters=data.get("headquarters"),
                data_confidence=data.get("data_confidence", "medium"),
                source_urls=data.get("source_urls", []),
                first_seen=now,
                last_seen=now,
            )
            return company

    # ------------------------------------------------------------------
    # Funding
    # ------------------------------------------------------------------

    @staticmethod
    @transaction.atomic
    def insert_funding(idea_id: int, data: dict):
        """
        Insert a funding event, deduplicating on (company_name, round, date, idea).
        Returns the FundingEvent or None if a duplicate was detected.
        Mirrors Convex brain:insertFunding.
        """
        from ideas.models import FundingEvent

        company_name = data["company_name"]
        round_ = data["round"]
        date = data["date"]

        existing = FundingEvent.objects.filter(
            idea_id=idea_id,
            company_name=company_name,
            round=round_,
            date=date,
        ).first()

        if existing:
            logger.info(
                "insert_funding: duplicate detected, skipping",
                extra={
                    "idea_id": idea_id,
                    "company_name": company_name,
                    "round": round_,
                    "date": date,
                },
            )
            return None

        event = FundingEvent.objects.create(
            idea_id=idea_id,
            company_id=data.get("company_id"),
            company_name=company_name,
            round=round_,
            amount_usd=data.get("amount_usd"),
            date=date,
            lead_investor=data.get("lead_investor"),
            co_investors=data.get("co_investors", []),
            source_url=data["source_url"],
            data_confidence=data.get("data_confidence", "medium"),
            valuation_estimate=data.get("valuation_estimate"),
            use_of_funds=data.get("use_of_funds"),
            first_seen=_now(),
        )
        logger.info(
            "insert_funding: created funding event",
            extra={"funding_id": event.pk, "idea_id": idea_id, "company_name": company_name},
        )
        return event

    # ------------------------------------------------------------------
    # Market signal
    # ------------------------------------------------------------------

    @staticmethod
    def insert_signal(idea_id: int, data: dict):
        """
        Insert a market signal with no deduplication.
        Each data point is recorded as-is.
        Mirrors Convex brain:insertSignal.
        """
        from ideas.models import MarketSignal

        signal = MarketSignal.objects.create(
            idea_id=idea_id,
            signal_type=data["signal_type"],
            value=data["value"],
            unit=data.get("unit"),
            source_url=data["source_url"],
            source_credibility=data.get("source_credibility", "medium"),
            date=data.get("date"),
            captured_at=_now(),
        )
        logger.info(
            "insert_signal: created market signal",
            extra={"signal_id": signal.pk, "idea_id": idea_id, "signal_type": data["signal_type"]},
        )
        return signal

    # ------------------------------------------------------------------
    # Verdict
    # ------------------------------------------------------------------

    @staticmethod
    @transaction.atomic
    def update_idea_verdict(idea_id: int, recommendation: str, confidence: float):
        """
        Update current_verdict on the idea and append a score_history entry.
        Mirrors Convex brain:updateIdeaVerdict.
        """
        from ideas.models import Idea

        try:
            idea = Idea.objects.select_for_update().get(pk=idea_id)
        except Idea.DoesNotExist:
            logger.error(
                "update_idea_verdict: idea not found",
                extra={"idea_id": idea_id},
            )
            raise ValueError(f"Idea not found: {idea_id}")

        history = list(idea.score_history or [])
        history.append({
            "date": _now().isoformat(),
            "recommendation": recommendation,
            "confidence": confidence,
        })

        idea.current_verdict = recommendation
        idea.last_researched_at = _now()
        idea.score_history = history
        idea.save(update_fields=["current_verdict", "last_researched_at", "score_history"])

        logger.info(
            "update_idea_verdict: verdict updated",
            extra={"idea_id": idea_id, "recommendation": recommendation, "confidence": confidence},
        )
        return idea

    # ------------------------------------------------------------------
    # Activity log
    # ------------------------------------------------------------------

    @staticmethod
    def log_activity(
        entity_type: str,
        entity_id: str,
        activity_type: str,
        description: str,
        source: str,
        details: str | None = None,
    ) -> ActivityLog:
        """
        Log an activity event for any entity.
        Mirrors Convex brain:logActivity.
        """
        entry = ActivityLog.objects.create(
            entity_type=entity_type,
            entity_id=entity_id,
            activity_type=activity_type,
            description=description,
            source=source,
            details=details,
        )
        logger.info(
            "log_activity: activity logged",
            extra={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "activity_type": activity_type,
                "source": source,
            },
        )
        return entry

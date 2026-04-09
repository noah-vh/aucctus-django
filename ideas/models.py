from django.db import models


class Idea(models.Model):
    description = models.TextField()
    status = models.CharField(max_length=20, default="active")
    current_verdict = models.CharField(max_length=20, null=True, blank=True)
    tags = models.JSONField(default=list, blank=True)
    related_ideas = models.JSONField(default=list, blank=True)
    research_quality_score = models.FloatField(null=True, blank=True)
    score_history = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_researched_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.description[:60]


class Company(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="companies")
    name = models.CharField(max_length=255)
    url = models.URLField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    product_names = models.JSONField(default=list, blank=True)
    features = models.JSONField(default=list, blank=True)
    pricing_model = models.CharField(max_length=100, null=True, blank=True)
    target_segment = models.CharField(max_length=255, null=True, blank=True)
    differentiator = models.TextField(null=True, blank=True)
    weakness = models.TextField(null=True, blank=True)
    employee_estimate = models.IntegerField(null=True, blank=True)
    founded_year = models.IntegerField(null=True, blank=True)
    headquarters = models.CharField(max_length=255, null=True, blank=True)
    data_confidence = models.CharField(max_length=10, default="medium")
    source_urls = models.JSONField(default=list, blank=True)
    technology_stack = models.JSONField(default=list, blank=True)
    integrations = models.JSONField(default=list, blank=True)
    customer_segments = models.JSONField(default=list, blank=True)
    key_people = models.JSONField(default=list, blank=True)
    change_history = models.JSONField(default=list, blank=True)
    total_funding_raised = models.FloatField(null=True, blank=True)
    first_seen = models.DateTimeField()
    last_seen = models.DateTimeField()

    class Meta:
        ordering = ["name"]
        unique_together = [["name", "idea"]]

    def __str__(self):
        return f"{self.name} ({self.idea_id})"


class FundingEvent(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="funding_events")
    company = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True, related_name="funding_events"
    )
    company_name = models.CharField(max_length=255)
    round = models.CharField(max_length=50)
    amount_usd = models.FloatField(null=True, blank=True)
    date = models.CharField(max_length=20)  # ISO date string e.g. "2024-01-15"
    lead_investor = models.CharField(max_length=255, null=True, blank=True)
    co_investors = models.JSONField(default=list, blank=True)
    source_url = models.URLField(max_length=2048)
    data_confidence = models.CharField(max_length=10, default="medium")
    valuation_estimate = models.FloatField(null=True, blank=True)
    use_of_funds = models.TextField(null=True, blank=True)
    first_seen = models.DateTimeField()

    class Meta:
        ordering = ["-first_seen"]

    def __str__(self):
        return f"{self.company_name} {self.round} ({self.date})"


class MarketSignal(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="market_signals")
    signal_type = models.CharField(max_length=50)
    value = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, null=True, blank=True)
    source_url = models.URLField(max_length=2048)
    source_credibility = models.CharField(max_length=10, default="medium")
    date = models.CharField(max_length=20, null=True, blank=True)
    captured_at = models.DateTimeField()

    class Meta:
        ordering = ["-captured_at"]

    def __str__(self):
        return f"{self.signal_type}: {self.value} {self.unit or ''}".strip()


class ResearchRun(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="research_runs")
    status = models.CharField(max_length=20, default="pending")
    triggered_by = models.CharField(max_length=20, default="user")
    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    agents_completed = models.JSONField(default=list, blank=True)
    token_usage = models.IntegerField(null=True, blank=True)
    cost_estimate = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Run {self.pk} - {self.status} ({self.idea_id})"


class Verdict(models.Model):
    run = models.OneToOneField(ResearchRun, on_delete=models.CASCADE, related_name="verdict")
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="verdicts")
    recommendation = models.CharField(max_length=20)
    previous_recommendation = models.CharField(max_length=20, null=True, blank=True)
    recommendation_changed = models.BooleanField(default=False)
    confidence = models.FloatField()
    summary = models.TextField()
    delta_narrative = models.TextField(null=True, blank=True)
    opportunity_score = models.FloatField()
    opportunity_factors = models.JSONField(default=list, blank=True)
    risk_score = models.FloatField()
    risk_factors = models.JSONField(default=list, blank=True)
    timing = models.CharField(max_length=20)
    competitive_density = models.CharField(max_length=20)
    funding_signal = models.CharField(max_length=20)
    growth_signal = models.CharField(max_length=20)
    key_question = models.TextField()
    evidence_gaps = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-run__started_at"]

    def __str__(self):
        return f"Verdict {self.recommendation} (run {self.run_id})"


class IntelSignal(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="intel_signals")
    run = models.ForeignKey(
        ResearchRun, on_delete=models.SET_NULL, null=True, blank=True, related_name="intel_signals"
    )
    signal_type = models.CharField(max_length=50)
    description = models.TextField()
    severity = models.CharField(max_length=20, default="medium")
    detected_at = models.DateTimeField()

    class Meta:
        ordering = ["-detected_at"]

    def __str__(self):
        return f"{self.signal_type} [{self.severity}]"


class Investor(models.Model):
    name = models.CharField(max_length=255, unique=True)
    type = models.CharField(max_length=20)
    thesis = models.TextField(null=True, blank=True)
    check_size_min = models.FloatField(null=True, blank=True)
    check_size_max = models.FloatField(null=True, blank=True)
    focus_areas = models.JSONField(default=list, blank=True)
    portfolio_count = models.IntegerField(null=True, blank=True)
    notable_portfolio = models.JSONField(default=list, blank=True)
    source_urls = models.JSONField(default=list, blank=True)
    data_confidence = models.CharField(max_length=10, default="medium")
    first_seen = models.DateTimeField()
    last_seen = models.DateTimeField()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.type})"


class InvestorCompanyLink(models.Model):
    investor = models.ForeignKey(Investor, on_delete=models.CASCADE, related_name="company_links")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="investor_links")
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="investor_company_links")
    round = models.CharField(max_length=50, null=True, blank=True)
    role = models.CharField(max_length=20, default="unknown")
    amount_contributed = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["investor__name"]

    def __str__(self):
        return f"{self.investor.name} -> {self.company.name} ({self.role})"


class CompanyMetric(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="metrics")
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="company_metrics")
    metric_type = models.CharField(max_length=50)
    value = models.FloatField()
    unit = models.CharField(max_length=50, null=True, blank=True)
    date = models.CharField(max_length=20)
    source_url = models.URLField(max_length=2048, null=True, blank=True)
    captured_at = models.DateTimeField()

    class Meta:
        ordering = ["-captured_at"]

    def __str__(self):
        return f"{self.company.name} - {self.metric_type}: {self.value}"


class FeatureComparison(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="feature_comparisons")
    features = models.JSONField(default=dict, blank=True)
    companies_compared = models.JSONField(default=list, blank=True)
    shared_features = models.JSONField(default=list, blank=True)
    gap_features = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        count = len(self.companies_compared) if self.companies_compared else 0
        return f"FeatureComparison ({count} companies) - idea {self.idea_id}"


class MarketTrend(models.Model):
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="market_trends")
    trend_type = models.CharField(max_length=50)
    direction = models.CharField(max_length=20)
    data_points = models.IntegerField()
    confidence = models.FloatField()
    period = models.CharField(max_length=50, null=True, blank=True)
    description = models.TextField()
    computed_at = models.DateTimeField()

    class Meta:
        ordering = ["-computed_at"]
        unique_together = [["idea", "trend_type"]]

    def __str__(self):
        return f"{self.trend_type} [{self.direction}] - idea {self.idea_id}"


class ResearchQuality(models.Model):
    run = models.ForeignKey(
        ResearchRun, on_delete=models.SET_NULL, null=True, blank=True, related_name="quality_scores"
    )
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="quality_scores")
    overall_score = models.FloatField()
    coverage_score = models.FloatField()
    recency_score = models.FloatField()
    diversity_score = models.FloatField()
    confidence_score = models.FloatField()
    gaps = models.JSONField(default=list, blank=True)
    recommendations = models.JSONField(default=list, blank=True)
    stale_items = models.IntegerField(default=0)
    computed_at = models.DateTimeField()

    class Meta:
        ordering = ["-computed_at"]

    def __str__(self):
        return f"Quality {self.overall_score:.2f} - idea {self.idea_id}"


class AgentSkill(models.Model):
    agent_name = models.CharField(max_length=100)
    skill_name = models.CharField(max_length=100)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(null=True, blank=True)
    use_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default="active")

    class Meta:
        ordering = ["agent_name", "skill_name"]

    def __str__(self):
        return f"{self.agent_name} / {self.skill_name} [{self.status}]"

class ApiError(Exception):
    def __init__(self, message, status=400, code="bad_request", details=None):
        super().__init__(message)
        self.message, self.status, self.code, self.details = message, status, code, details

    def to_dict(self):
        body = {"code": self.code, "message": self.message}
        if self.details:
            body["details"] = self.details
        return {"error": body}


class NotFound(ApiError):
    def __init__(self, what="Resource"):
        super().__init__(f"{what} not found.", 404, "not_found")


class AIUnavailable(ApiError):
    def __init__(self):
        super().__init__(
            "AI features are not configured. Add GEMINI_API_KEY to your .env file and restart LexAI.",
            503, "ai_not_configured")


class AIError(ApiError):
    def __init__(self, message="The AI provider request failed. Please try again."):
        super().__init__(message, 502, "ai_error")


class ExtractionError(Exception):
    """Raised when a document cannot be read."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import engine, Base
from app.models.envelope import Envelope  # imported so SQLAlchemy creates the table on startup
from app.routers import auth, budget, expenses, assessment, insights, upload, reports, envelopes

# Load environment variables from .env before anything else
load_dotenv()

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Wealth Compass API",
    description="Financial anxiety management API for students",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(budget.router, prefix="/api/budget", tags=["budget"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(assessment.router, prefix="/api/assessment", tags=["assessment"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
app.include_router(upload.router,   prefix="/api/upload",   tags=["upload"])
app.include_router(reports.router,   prefix="/api/reports",   tags=["reports"])
app.include_router(envelopes.router, prefix="/api/envelopes", tags=["envelopes"])


@app.get("/health")
def health_check():
    return {"status": "ok"}

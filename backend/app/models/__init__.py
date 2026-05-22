# Import all models here so SQLAlchemy registers them with Base before
# create_all() is called in main.py.
from app.models.user import User
from app.models.assessment import Assessment
from app.models.budget import Budget
from app.models.expense import Expense
from app.models.insight import Insight

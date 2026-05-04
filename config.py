from pydantic_settings import BaseSettings
from typing import Optional
from urllib.parse import quote

class Settings(BaseSettings):
    """Application configuration settings."""
    
    # Database Configuration - SQL Server
    # Format: mssql+pyodbc://username:password@server/database?driver=driver_name
    DB_SERVER: str = "."
    DB_NAME: str = "prashanthiSchools"
    DB_USER: str = "prashanthiSchools_user"
    DB_PASSWORD: str = "StrongPass@123"
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"
    
    DB_TRUSTED_CONNECTION: bool = False

    @property
    def DATABASE_URL(self) -> str:
        if self.DB_TRUSTED_CONNECTION:
            odbc_connect = (
                f"DRIVER={{{self.DB_DRIVER}}};SERVER={self.DB_SERVER};"
                f"DATABASE={self.DB_NAME};Trusted_Connection=yes;"
            )
        else:
            odbc_connect = (
                f"DRIVER={{{self.DB_DRIVER}}};SERVER={self.DB_SERVER};"
                f"DATABASE={self.DB_NAME};UID={self.DB_USER};PWD={self.DB_PASSWORD}"
            )
        return f"mssql+pyodbc:///?odbc_connect={quote(odbc_connect, safe='')}"
    
    # JWT Configuration
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    
    # App Configuration
    APP_NAME: str = "School Management ERP"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # EasyTimePro (ZKTeco) Server Configuration
    EASYTIMEPRO_BASE_URL: str = "https://178.156.251.34:8443"
    EASYTIMEPRO_USERNAME: str = "admin"
    EASYTIMEPRO_PASSWORD: str = "DareDevil@071520"
    EASYTIMEPRO_POLL_INTERVAL: int = 30  # seconds between transaction polls
    EASYTIMEPRO_VERIFY_SSL: bool = False  # self-signed certificate

    # SMTP / Email Configuration (for Help Desk tickets)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "ram.sirapurapu@gmail.com"
    SMTP_PASSWORD: str = "agqn dkob humu srfv"
    SMTP_FROM_EMAIL: str = "ram.sirapurapu@gmail.com"
    HELPDESK_RECIPIENT_EMAIL: str = "ramakrishnasirapurapu55@gmail.com"

    class Config:
        env_file = ".env"

settings = Settings()
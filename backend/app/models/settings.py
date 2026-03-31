from sqlmodel import Field, SQLModel


class AppSettings(SQLModel, table=True):
    __tablename__: str = "app_settings"

    id: int = Field(default=1, primary_key=True)
    signups_enabled: bool = Field(default=True)
